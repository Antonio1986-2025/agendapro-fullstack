import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { enviarMensagem } from '../services/whatsapp.js';

const router = Router();

// ----- Webhook (publico) - verificacao da Meta -----
// GET /api/whatsapp/webhook
router.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token) {
    // Verifica se o verify_token bate com alguma barbearia
    const { rows } = await query(
      `SELECT 1 FROM whatsapp_config WHERE verify_token = $1 AND enabled = true`,
      [token]
    );
    if (rows.length > 0) return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST /api/whatsapp/webhook -> recebe mensagens dos clientes
router.post('/webhook', async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const msg = change?.value?.messages?.[0];
    const phoneNumberId = change?.value?.metadata?.phone_number_id;

    if (msg && phoneNumberId) {
      const cfg = await query(
        `SELECT barbearia_id FROM whatsapp_config WHERE phone_number_id = $1`,
        [phoneNumberId]
      );
      const barbeariaId = cfg.rows[0]?.barbearia_id;
      if (barbeariaId) {
        await query(
          `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
           VALUES ($1, $2, $3, 'recebida', 'recebida')`,
          [barbeariaId, msg.from, msg.text?.body || '(midia)']
        );
      }
    }
  } catch (err) {
    console.error('Erro no webhook WhatsApp:', err.message);
  }
  // A Meta exige 200 sempre
  res.sendStatus(200);
});

// ----- Rotas autenticadas -----
router.use(autenticar);

// GET /api/whatsapp/config
router.get('/config', async (req, res) => {
  const { rows } = await query(
    `SELECT provider, phone_number_id, verify_token, enabled,
            (access_token IS NOT NULL) AS tem_token
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [req.barbeariaId]
  );
  res.json(rows[0] || { provider: 'log', enabled: false });
});

// PUT /api/whatsapp/config
router.put('/config', async (req, res) => {
  const { provider, phone_number_id, access_token, verify_token, enabled } = req.body;
  const { rows } = await query(
    `INSERT INTO whatsapp_config (barbearia_id, provider, phone_number_id, access_token, verify_token, enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (barbearia_id) DO UPDATE SET
        provider = EXCLUDED.provider,
        phone_number_id = EXCLUDED.phone_number_id,
        access_token = COALESCE(EXCLUDED.access_token, whatsapp_config.access_token),
        verify_token = EXCLUDED.verify_token,
        enabled = EXCLUDED.enabled,
        updated_at = now()
     RETURNING provider, phone_number_id, verify_token, enabled`,
    [req.barbeariaId, provider || 'log', phone_number_id || null,
     access_token || null, verify_token || null, !!enabled]
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

export default router;
