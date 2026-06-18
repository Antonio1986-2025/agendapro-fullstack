import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { enviarMensagem } from '../services/whatsapp.js';
import {
  criarSessaoOpenWA, iniciarSessaoOpenWA, obterQRSessaoOpenWA,
  statusSessaoOpenWA, desconectarSessaoOpenWA
} from '../services/whatsapp.js';
import { processarMensagem, getConversa, salvarConversa } from '../services/ai.js';

const router = Router();

// POST /api/whatsapp/webhook -> recebe mensagens do OpenWA
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (!body) return res.sendStatus(200);

    // OpenWA: { event, session, data: { key: { remoteJid }, message: { conversation } } }
    const event = body.event || body.eventType;
    const sessionName = body.session || body.instance;

    // Só processa mensagens recebidas
    if (event !== 'message.received' && event !== 'messages.upsert') {
      return res.sendStatus(200);
    }

    const data = body.data || body;
    const msgObj = data.message || data;
    const key = data.key || {};
    const remoteJid = key.remoteJid || data.from || '';
    const isGroup = remoteJid.includes('@g.us');
    const isStatus = remoteJid.includes('@broadcast');
    const fromMe = key.fromMe || data.fromMe || false;

    // Ignora mensagens de grupo, status, e mensagens enviadas pelo próprio
    if (isGroup || isStatus || fromMe) return res.sendStatus(200);

    const texto = msgObj.conversation || msgObj.text || '';
    const telefone = remoteJid.split('@')[0];

    if (!texto || !telefone) return res.sendStatus(200);

    // Descobre barbearia pela sessão
    let barbeariaId = null;
    if (sessionName) {
      const cfg = await query(
        `SELECT barbearia_id, ai_enabled, ai_prompt FROM whatsapp_config WHERE openwa_session_name = $1`,
        [sessionName]
      );
      barbeariaId = cfg.rows[0]?.barbearia_id;
      if (barbeariaId) {
        // Registra mensagem recebida
        await query(
          `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
           VALUES ($1, $2, $3, 'recebida', 'recebida')`,
          [barbeariaId, telefone, texto]
        );

        // Se agente IA estiver ativo, processa
        if (cfg.rows[0].ai_enabled) {
          const { rows: barb } = await query(
            `SELECT nome FROM barbearias WHERE id = $1`, [barbeariaId]
          );
          const barbeariaNome = barb[0]?.nome || 'Barbearia';

          // Pega histórico da conversa
          const conversa = await getConversa(barbeariaId, telefone);
          const historico = conversa?.historico || [];

          // Processa com IA
          const { resposta } = await processarMensagem(
            barbeariaId, barbeariaNome, texto, historico, cfg.rows[0].ai_prompt
          );

          if (resposta) {
            // Envia resposta via WhatsApp
            await enviarMensagem(barbeariaId, {
              telefone, mensagem: resposta, tipo: 'ia_resposta'
            });
          }

          // Salva na conversa
          const novoHistorico = [
            ...historico,
            { role: 'user', content: texto },
            { role: 'assistant', content: resposta },
          ];
          await salvarConversa(barbeariaId, telefone, novoHistorico);
        }
      }
    }
  } catch (err) {
    console.error('Erro no webhook OpenWA:', err.message);
  }
  res.sendStatus(200);
});

// ----- Rotas autenticadas -----
router.use(autenticar);

// GET /api/whatsapp/config
router.get('/config', async (req, res) => {
  const { rows } = await query(
    `SELECT provider, phone_number_id, verify_token, enabled,
            openwa_session_name, openwa_url, session_status,
            ai_enabled, ai_prompt,
            (openwa_api_key IS NOT NULL) AS tem_api_key
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [req.barbeariaId]
  );
  res.json(rows[0] || { provider: 'log', enabled: false, session_status: 'disconnected', ai_enabled: false });
});

// PUT /api/whatsapp/config
router.put('/config', async (req, res) => {
  const { provider, enabled, openwa_url, openwa_api_key, ai_enabled, ai_prompt } = req.body;
  const { rows } = await query(
    `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, openwa_url, openwa_api_key, ai_enabled, ai_prompt, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (barbearia_id) DO UPDATE SET
        provider = COALESCE(NULLIF(EXCLUDED.provider, NULL), whatsapp_config.provider),
        enabled = $3,
        openwa_url = COALESCE(NULLIF(EXCLUDED.openwa_url, NULL), whatsapp_config.openwa_url),
        openwa_api_key = COALESCE(NULLIF(EXCLUDED.openwa_api_key, NULL), whatsapp_config.openwa_api_key),
        ai_enabled = $6,
        ai_prompt = COALESCE(NULLIF(EXCLUDED.ai_prompt, NULL), whatsapp_config.ai_prompt),
        updated_at = now()
     RETURNING provider, enabled, openwa_url, session_status, ai_enabled, ai_prompt`,
    [req.barbeariaId, provider || 'log', !!enabled, openwa_url || null,
     openwa_api_key || null, !!ai_enabled, ai_prompt || null]
  );
  res.json(rows[0]);
});

// POST /api/whatsapp/enviar -> envio manual
router.post('/enviar', async (req, res) => {
  const { telefone, mensagem } = req.body;
  if (!telefone || !mensagem) return res.status(400).json({ erro: 'telefone e mensagem obrigatorios' });
  const r = await enviarMensagem(req.barbeariaId, { telefone, mensagem, tipo: 'manual' });
  res.json(r);
});

// GET /api/whatsapp/mensagens -> historico
router.get('/mensagens', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM whatsapp_mensagens WHERE barbearia_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.barbeariaId]
  );
  res.json(rows);
});

// POST /api/whatsapp/conectar -> cria sessão OpenWA e retorna QR Code
router.post('/conectar', async (req, res) => {
  try {
    let config = await query(
      `SELECT * FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    config = config.rows[0] || {};

    // Se não tem sessão, cria
    if (!config.openwa_session_name) {
      const { sessionName } = await criarSessaoOpenWA(req.barbeariaId, null, config);
      await query(
        `UPDATE whatsapp_config SET openwa_session_name = $1, session_status = 'connecting' WHERE barbearia_id = $2`,
        [sessionName, req.barbeariaId]
      );
      config.openwa_session_name = sessionName;
    }

    // Verifica se precisa configurar webhook
    const baseUrl = config.openwa_url || process.env.OPENWA_URL || 'http://localhost:2785';
    const apiKey = config.openwa_api_key || process.env.OPENWA_API_KEY || '';
    const webhookUrl = process.env.OPENWA_WEBHOOK_URL || 'http://localhost:3000/api/whatsapp/webhook';

    try {
      const axios = (await import('axios')).default;
      await axios.post(
        `${baseUrl}/api/sessions/${config.openwa_session_name}/webhooks`,
        { url: webhookUrl, events: ['message.received', 'session.status'], secret: 'openwa-hmac-secret' },
        { headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' }, timeout: 10000 }
      );
    } catch {}

    // Inicia sessão
    await iniciarSessaoOpenWA(req.barbeariaId, config);

    // Pega QR Code
    const qrData = await obterQRSessaoOpenWA(req.barbeariaId, config);
    const qrCode = qrData.qr || qrData.qrcode || qrData.base64 || '';

    res.json({ ok: true, session_name: config.openwa_session_name, qr: qrCode, status: 'connecting' });
  } catch (err) {
    console.error('Erro ao conectar WhatsApp:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/whatsapp/status -> status da sessão
router.get('/status', async (req, res) => {
  try {
    const config = await query(
      `SELECT * FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    const cfg = config.rows[0];
    if (!cfg || !cfg.openwa_session_name) {
      return res.json({ status: 'disconnected', session: null });
    }
    const st = await statusSessaoOpenWA(req.barbeariaId, cfg);
    await query(
      `UPDATE whatsapp_config SET session_status = $1 WHERE barbearia_id = $2`,
      [st, req.barbeariaId]
    );
    res.json({ status: st, session: cfg.openwa_session_name });
  } catch (err) {
    res.json({ status: 'disconnected', erro: err.message });
  }
});

// POST /api/whatsapp/desconectar
router.post('/desconectar', async (req, res) => {
  try {
    const config = await query(
      `SELECT * FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    const cfg = config.rows[0];
    if (cfg?.openwa_session_name) {
      await desconectarSessaoOpenWA(req.barbeariaId, cfg);
    }
    await query(
      `UPDATE whatsapp_config SET openwa_session_name = NULL, session_status = 'disconnected' WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;