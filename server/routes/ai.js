import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { getConversa } from '../services/ai.js';

const router = Router();
router.use(autenticar);

// GET /api/ai/conversas -> lista conversas recentes do agente
router.get('/conversas', async (req, res) => {
  const { rows } = await query(
    `SELECT c.cliente_telefone, c.ultima_interacao,
            (SELECT nome FROM clientes WHERE barbearia_id = $1 AND telefone LIKE '%' || RIGHT(c.cliente_telefone, 11)) AS cliente_nome,
            (SELECT mensagem FROM whatsapp_mensagens WHERE barbearia_id = $1 AND telefone LIKE '%' || RIGHT(c.cliente_telefone, 11) ORDER BY created_at DESC LIMIT 1) AS ultima_mensagem
       FROM ai_conversas c
      WHERE c.barbearia_id = $1
      ORDER BY c.ultima_interacao DESC
      LIMIT 50`,
    [req.barbeariaId]
  );
  res.json(rows);
});

// GET /api/ai/conversas/:telefone -> detalhe de uma conversa
router.get('/conversas/:telefone', async (req, res) => {
  const conversa = await getConversa(req.barbeariaId, req.params.telefone);
  if (!conversa) return res.status(404).json({ erro: 'Conversa nao encontrada' });
  res.json(conversa);
});

// POST /api/ai/responder -> envia mensagem manual via IA
router.post('/responder', async (req, res) => {
  const { telefone, mensagem } = req.body;
  if (!telefone || !mensagem) return res.status(400).json({ erro: 'telefone e mensagem obrigatorios' });

  const { processarMensagem } = await import('../services/ai.js');
  const { enviarMensagem } = await import('../services/whatsapp.js');

  try {
    const { rows: [barb] } = await query(
      `SELECT nome, (SELECT ai_enabled FROM whatsapp_config WHERE barbearia_id = $1) AS ai_enabled,
              (SELECT ai_prompt FROM whatsapp_config WHERE barbearia_id = $1) AS ai_prompt`,
      [req.barbeariaId]
    );
    if (!barb?.ai_enabled) return res.status(400).json({ erro: 'Agente IA nao esta ativo' });

    const conversa = await getConversa(req.barbeariaId, telefone);
    const historico = conversa?.historico || [];

    const { resposta } = await processarMensagem(
      req.barbeariaId, barb.nome, mensagem, historico, barb.ai_prompt
    );

    if (resposta) {
      await enviarMensagem(req.barbeariaId, {
        telefone, mensagem: resposta, tipo: 'ia_resposta'
      });
    }

    const novoHistorico = [...historico, { role: 'user', content: mensagem }, { role: 'assistant', content: resposta }];
    const { salvarConversa } = await import('../services/ai.js');
    await salvarConversa(req.barbeariaId, telefone, novoHistorico);

    res.json({ ok: true, resposta });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;