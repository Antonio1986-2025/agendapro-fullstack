import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { enviarMensagem } from '../services/whatsapp.js';
import {
  conectarWhatsApp, getStatus, getTelefone,
  desconectarWhatsApp, enviarMensagemBaileys
} from '../services/baileys-provider.js';
import { processarMensagem, getConversa, salvarConversa } from '../services/ai.js';

const router = Router();

// POST /api/whatsapp/webhook -> recebe mensagens do Baileys
router.post('/webhook', async (req, res) => {
  try {
    const { barbearia_id, telefone, mensagem } = req.body;
    if (!barbearia_id || !telefone || !mensagem) return res.sendStatus(200);

    const cfg = await query(
      `SELECT ai_enabled, ai_prompt, (SELECT nome FROM barbearias WHERE id = $1) AS barbearia_nome
         FROM whatsapp_config WHERE barbearia_id = $1`,
      [barbearia_id]
    );
    const config = cfg.rows[0];
    if (!config?.ai_enabled) return res.sendStatus(200);

    // Registra mensagem recebida
    await query(
      `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, 'recebida', 'recebida')`,
      [barbearia_id, telefone, mensagem]
    );

    // Processa com IA
    const conversa = await getConversa(barbearia_id, telefone);
    const historico = conversa?.historico || [];

    const { resposta } = await processarMensagem(
      barbearia_id, config.barbearia_nome, mensagem, historico, config.ai_prompt
    );

    if (resposta) {
      await enviarMensagem(barbearia_id, { telefone, mensagem: resposta, tipo: 'ia_resposta' });
    }

    const novoHistorico = [
      ...historico,
      { role: 'user', content: mensagem },
      { role: 'assistant', content: resposta },
    ];
    await salvarConversa(barbearia_id, telefone, novoHistorico);
  } catch (err) {
    console.error('Erro webhook WhatsApp:', err.message);
  }
  res.sendStatus(200);
});

// ----- Rotas autenticadas -----
router.use(autenticar);

// GET /api/whatsapp/config
router.get('/config', async (req, res) => {
  const { rows } = await query(
    `SELECT provider, enabled, session_status, ai_enabled, ai_prompt,
            openwa_session_name, openwa_url, openwa_api_key
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [req.barbeariaId]
  );
  const cfg = rows[0] || { provider: 'log', enabled: false, session_status: 'disconnected', ai_enabled: false };

  // Atualiza status real do Baileys
  if (cfg.provider === 'baileys') {
    cfg.session_status = getStatus(req.barbeariaId);
    const tel = getTelefone(req.barbeariaId);
    if (tel) cfg.phone_number_id = tel;
    await query(`UPDATE whatsapp_config SET session_status = $1 WHERE barbearia_id = $2`,
      [cfg.session_status, req.barbeariaId]);
  }

  res.json(cfg);
});

// PUT /api/whatsapp/config
router.put('/config', async (req, res) => {
  const { provider, enabled, ai_enabled, ai_prompt } = req.body;
  const { rows } = await query(
    `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, ai_enabled, ai_prompt, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (barbearia_id) DO UPDATE SET
        provider = COALESCE(NULLIF(EXCLUDED.provider, NULL), whatsapp_config.provider),
        enabled = COALESCE(NULLIF(EXCLUDED.enabled, NULL), whatsapp_config.enabled),
        ai_enabled = COALESCE(NULLIF(EXCLUDED.ai_enabled, NULL), whatsapp_config.ai_enabled),
        ai_prompt = COALESCE(NULLIF(EXCLUDED.ai_prompt, NULL), whatsapp_config.ai_prompt),
        updated_at = now()
     RETURNING provider, enabled, session_status, ai_enabled, ai_prompt`,
    [req.barbeariaId, provider || 'baileys', enabled !== false, !!ai_enabled, ai_prompt || null]
  );
  res.json(rows[0]);
});

// POST /api/whatsapp/conectar -> conecta via Baileys
router.post('/conectar', async (req, res) => {
  try {
    // Define provider como baileys
    await query(
      `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, updated_at)
       VALUES ($1, 'baileys', true, now())
       ON CONFLICT (barbearia_id) DO UPDATE SET provider = 'baileys', enabled = true, updated_at = now()`,
      [req.barbeariaId]
    );

    await query(`UPDATE whatsapp_config SET session_status = 'connecting' WHERE barbearia_id = $1`,
      [req.barbeariaId]);

    let qrCodeResolvido = null;

    const resultado = await conectarWhatsApp(
      req.barbeariaId,
      (qr) => { qrCodeResolvido = qr; },
      async (userId) => {
        await query(`UPDATE whatsapp_config SET session_status = 'connected' WHERE barbearia_id = $1`,
          [req.barbeariaId]);
        console.log(`WhatsApp conectado para barbearia ${req.barbeariaId}: ${userId}`);
      },
      async (telefone, mensagem) => {
        try {
          const cfg = await query(
            `SELECT ai_enabled, ai_prompt, (SELECT nome FROM barbearias WHERE id = $1) AS barbearia_nome
               FROM whatsapp_config WHERE barbearia_id = $1`,
            [req.barbeariaId]
          );
          const config = cfg.rows[0];
          if (!config?.ai_enabled) return;

          await query(
            `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
             VALUES ($1, $2, $3, 'recebida', 'recebida')`,
            [req.barbeariaId, telefone, mensagem]
          );

          const conversa = await getConversa(req.barbeariaId, telefone);
          const historico = conversa?.historico || [];

          const { resposta } = await processarMensagem(
            req.barbeariaId, config.barbearia_nome, mensagem, historico, config.ai_prompt
          );

          if (resposta) {
            await enviarMensagemBaileys(req.barbeariaId, telefone, resposta);
            await query(
              `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
               VALUES ($1, $2, $3, 'ia_resposta', 'enviada')`,
              [req.barbeariaId, telefone, resposta]
            );
          }

          const novoHistorico = [
            ...historico,
            { role: 'user', content: mensagem },
            { role: 'assistant', content: resposta },
          ];
          await salvarConversa(req.barbeariaId, telefone, novoHistorico);
        } catch (err) {
          console.error('Erro ao processar mensagem IA:', err.message);
        }
      }
    );

    // Espera um pouco para o QR ser gerado
    await new Promise(r => setTimeout(r, 2000));

    if (qrCodeResolvido) {
      res.json({ ok: true, qr: qrCodeResolvido, status: 'connecting' });
    } else if (resultado.status === 'connected') {
      res.json({ ok: true, status: 'connected' });
    } else {
      res.json({ ok: true, qr: null, status: 'timeout', mensagem: 'Tempo limite. Tente novamente.' });
    }
  } catch (err) {
    console.error('Erro ao conectar WhatsApp:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/whatsapp/status
router.get('/status', async (req, res) => {
  const st = getStatus(req.barbeariaId);
  const tel = getTelefone(req.barbeariaId);
  await query(`UPDATE whatsapp_config SET session_status = $1 WHERE barbearia_id = $2`,
    [st, req.barbeariaId]);
  res.json({ status: st, telefone: tel });
});

// POST /api/whatsapp/desconectar
router.post('/desconectar', async (req, res) => {
  try {
    await desconectarWhatsApp(req.barbeariaId);
    await query(`UPDATE whatsapp_config SET session_status = 'disconnected' WHERE barbearia_id = $1`,
      [req.barbeariaId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
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

export default router;