import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { enviarMensagem } from '../services/whatsapp.js';
import {
  conectarWhatsApp, getStatus, getTelefone,
  desconectarWhatsApp, enviarMensagemBaileys
} from '../services/baileys-provider.js';
import {
  criarInstancia,
  conectarInstancia,
  getStatusInstancia,
  desconectarInstancia,
  deletarInstancia,
  enviarMensagemEvolution,
  testarEvolutionAPI,
} from '../services/evolution-provider.js';
import { processarMensagem, getConversa, salvarConversa } from '../services/ai.js';

const router = Router();

// ============================================================
// WEBHOOK EVOLUTION API (sem autenticação - chamado pela Evolution)
// ============================================================
router.post('/webhook/evolution/:barbeariaId', async (req, res) => {
  // Responde imediatamente para evitar timeout
  res.sendStatus(200);
  
  try {
    const { barbeariaId } = req.params;
    const body = req.body || {};
    const event = body.event || body.eventName;
    
    console.log(`\n📥 ====== WEBHOOK EVOLUTION ======`);
    console.log(`🏪 Barbearia: ${barbeariaId}`);
    console.log(`📡 Evento: ${event}`);
    
    // Atualização de conexão
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = body.data?.state || body.state;
      console.log(`🔌 Estado da conexão: ${state}`);
      
      let dbStatus = 'disconnected';
      if (state === 'open') dbStatus = 'connected';
      else if (state === 'connecting') dbStatus = 'connecting';
      
      try {
        await query(
          `UPDATE whatsapp_config SET session_status = $1, updated_at = now() WHERE barbearia_id = $2`,
          [dbStatus, barbeariaId]
        );
      } catch {}
      return;
    }
    
    // Mensagem recebida
    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      const data = body.data || body;
      const key = data.key || {};
      const message = data.message || {};
      
      console.log(`📨 fromMe: ${key.fromMe}`);
      console.log(`📞 remoteJid: ${key.remoteJid}`);
      
      // Ignora mensagens próprias, grupos e broadcasts
      if (key.fromMe) {
        console.log(`⏭️  Ignorada: mensagem própria`);
        return;
      }
      if (key.remoteJid?.includes('@g.us')) {
        console.log(`⏭️  Ignorada: grupo`);
        return;
      }
      if (key.remoteJid?.includes('@broadcast') || key.remoteJid === 'status@broadcast') {
        console.log(`⏭️  Ignorada: broadcast`);
        return;
      }
      
      // Extrai texto
      const texto = message.conversation 
                 || message.extendedTextMessage?.text 
                 || message.imageMessage?.caption 
                 || '';
      
      if (!texto) {
        console.log(`⚠️  Mensagem sem texto`);
        return;
      }
      
      // Extrai telefone
      const telefone = (key.remoteJid || '').split('@')[0].replace(/\D/g, '');
      
      if (!telefone || telefone.length < 10) {
        console.log(`⚠️  Telefone inválido: ${telefone}`);
        return;
      }
      
      console.log(`📞 Telefone: ${telefone}`);
      console.log(`💬 Texto: ${texto}`);
      
      // Processa mensagem com IA
      await processarMensagemRecebida(barbeariaId, telefone, texto);
    }
  } catch (err) {
    console.error('❌ Erro no webhook Evolution:', err.message);
    console.error(err.stack);
  }
});

/**
 * Processa mensagem recebida (compartilhado entre Baileys e Evolution)
 */
async function processarMensagemRecebida(barbeariaId, telefone, mensagem) {
  try {
    const cfg = await query(
      `SELECT ai_enabled, ai_prompt, provider,
              (SELECT nome FROM barbearias WHERE id = $1) AS barbearia_nome
         FROM whatsapp_config WHERE barbearia_id = $1`,
      [barbeariaId]
    );
    const config = cfg.rows[0];
    
    if (!config?.ai_enabled) {
      console.log(`⏭️  IA desabilitada para esta barbearia`);
      return;
    }
    
    // Salva mensagem recebida
    await query(
      `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, 'recebida', 'recebida')`,
      [barbeariaId, telefone, mensagem]
    );
    
    // Busca histórico
    const conversa = await getConversa(barbeariaId, telefone);
    const historico = conversa?.historico || [];
    console.log(`📚 Histórico: ${historico.length} mensagens`);
    
    // Processa com IA
    const { resposta } = await processarMensagem(
      barbeariaId, config.barbearia_nome, mensagem, historico, config.ai_prompt
    );
    
    if (resposta) {
      console.log(`💬 Resposta IA: ${resposta.substring(0, 100)}...`);
      
      // Envia resposta usando o provider correto
      try {
        if (config.provider === 'evolution') {
          await enviarMensagemEvolution(barbeariaId, telefone, resposta);
        } else if (config.provider === 'baileys') {
          await enviarMensagemBaileys(barbeariaId, telefone, resposta);
        } else {
          console.log(`⚠️  Provider ${config.provider} não suporta envio automático`);
        }
        
        // Salva resposta no banco
        await query(
          `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
           VALUES ($1, $2, $3, 'ia_resposta', 'enviada')`,
          [barbeariaId, telefone, resposta]
        );
      } catch (err) {
        console.error(`❌ Erro ao enviar resposta:`, err.message);
        await query(
          `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
           VALUES ($1, $2, $3, 'ia_resposta', 'erro')`,
          [barbeariaId, telefone, resposta]
        );
      }
    }
    
    // Atualiza histórico
    const novoHistorico = [
      ...historico,
      { role: 'user', content: mensagem },
      { role: 'assistant', content: resposta || '' },
    ];
    await salvarConversa(barbeariaId, telefone, novoHistorico);
  } catch (err) {
    console.error('❌ Erro ao processar mensagem:', err.message);
    console.error(err.stack);
  }
}

// ============================================================
// WEBHOOK BAILEYS (legacy)
// ============================================================
router.post('/webhook', async (req, res) => {
  try {
    const { barbearia_id, telefone, mensagem } = req.body;
    if (!barbearia_id || !telefone || !mensagem) return res.sendStatus(200);
    
    await processarMensagemRecebida(barbearia_id, telefone, mensagem);
  } catch (err) {
    console.error('Erro webhook WhatsApp:', err.message);
  }
  res.sendStatus(200);
});

// GET /api/whatsapp/teste-evolution -> testa se Evolution API está respondendo (PÚBLICO)
router.get('/teste-evolution', async (req, res) => {
  const result = await testarEvolutionAPI();
  res.json({
    ...result,
    config: {
      url: process.env.EVOLUTION_API_URL || 'NÃO CONFIGURADO',
      apiKey: process.env.EVOLUTION_API_KEY ? '✅ Configurada' : '❌ NÃO CONFIGURADO',
      sistemaUrl: process.env.SISTEMA_URL || 'NÃO CONFIGURADO',
    }
  });
});

// ============================================================
// ROTAS AUTENTICADAS
// ============================================================
router.use(autenticar);

// GET /api/whatsapp/config
router.get('/config', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT provider, enabled, session_status, ai_enabled, ai_prompt,
              evolution_instance_name, evolution_phone,
              openwa_session_name
         FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    const cfg = rows[0] || { provider: 'evolution', enabled: false, ai_enabled: false };

    // Atualiza status real conforme o provider
    if (cfg.provider === 'baileys') {
      cfg.session_status = getStatus(req.barbeariaId);
      const tel = getTelefone(req.barbeariaId);
      if (tel) cfg.phone_number_id = tel;
    } else if (cfg.provider === 'evolution' && cfg.evolution_instance_name) {
      try {
        const stat = await getStatusInstancia(req.barbeariaId);
        cfg.session_status = stat.status;
        if (stat.telefone) cfg.evolution_phone = stat.telefone;
      } catch {}
    }
    
    try {
      await query(
        `UPDATE whatsapp_config SET session_status = $1 WHERE barbearia_id = $2`,
        [cfg.session_status, req.barbeariaId]
      );
    } catch {}

    res.json(cfg);
  } catch (e) {
    console.error('Erro ao buscar config:', e.message);
    res.json({ provider: 'evolution', enabled: false });
  }
});

// PUT /api/whatsapp/config
router.put('/config', async (req, res) => {
  const { provider, enabled, ai_enabled, ai_prompt } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, ai_enabled, ai_prompt, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (barbearia_id) DO UPDATE SET
          provider = COALESCE(NULLIF(EXCLUDED.provider, NULL), whatsapp_config.provider),
          enabled = COALESCE(NULLIF(EXCLUDED.enabled, NULL), whatsapp_config.enabled),
          ai_enabled = COALESCE(NULLIF(EXCLUDED.ai_enabled, NULL), whatsapp_config.ai_enabled),
          ai_prompt = COALESCE(NULLIF(EXCLUDED.ai_prompt, NULL), whatsapp_config.ai_prompt),
          updated_at = now()
       RETURNING provider, enabled, ai_enabled, ai_prompt`,
      [req.barbeariaId, provider || 'evolution', enabled !== false, !!ai_enabled, ai_prompt || null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('Erro ao salvar config:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/whatsapp/conectar -> conecta via provider configurado (default: evolution)
router.post('/conectar', async (req, res) => {
  try {
    // FORÇA EVOLUTION se as variáveis estão configuradas (override do banco)
    const evolutionConfigured = !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY);
    
    // Provider pode vir do body (force) ou do banco
    let provider = req.body?.provider;
    
    if (!provider) {
      const cfgRow = await query(
        `SELECT provider FROM whatsapp_config WHERE barbearia_id = $1`,
        [req.barbeariaId]
      );
      provider = cfgRow.rows[0]?.provider;
    }
    
    // Se Evolution está configurado e não tem provider explícito de baileys, usa Evolution
    if (evolutionConfigured && provider !== 'baileys') {
      provider = 'evolution';
    } else if (!provider) {
      provider = evolutionConfigured ? 'evolution' : 'baileys';
    }
    
    console.log(`🔗 Conectando WhatsApp com provider: ${provider}`);
    
    if (provider === 'evolution') {
      // ===== EVOLUTION API =====
      
      // Se estava usando Baileys, desconecta primeiro
      try {
        await desconectarWhatsApp(req.barbeariaId);
      } catch {}
      
      await query(
        `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, updated_at)
         VALUES ($1, 'evolution', true, now())
         ON CONFLICT (barbearia_id) DO UPDATE SET 
            provider = 'evolution', 
            enabled = true, 
            updated_at = now()`,
        [req.barbeariaId]
      );
      
      try {
        const result = await conectarInstancia(req.barbeariaId);
        return res.json({
          ok: true,
          provider: 'evolution',
          qr: result.qr,
          status: result.status,
          instanceName: result.instanceName,
        });
      } catch (err) {
        console.error('Erro ao conectar Evolution:', err.message);
        return res.status(500).json({ 
          erro: err.message,
          dica: 'Verifique se EVOLUTION_API_URL e EVOLUTION_API_KEY estão configurados'
        });
      }
    }
    
    // ===== BAILEYS (legacy) =====
    await query(
      `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, updated_at)
       VALUES ($1, 'baileys', true, now())
       ON CONFLICT (barbearia_id) DO UPDATE SET provider = 'baileys', enabled = true, updated_at = now()`,
      [req.barbeariaId]
    );

    try {
      await query(`UPDATE whatsapp_config SET session_status = 'connecting' WHERE barbearia_id = $1`,
        [req.barbeariaId]);
    } catch {}

    let qrCodeResolvido = null;

    const resultado = await conectarWhatsApp(
      req.barbeariaId,
      (qr) => { qrCodeResolvido = qr; },
      async (userId) => {
        try { await query(`UPDATE whatsapp_config SET session_status = 'connected' WHERE barbearia_id = $1`,
          [req.barbeariaId]); } catch {}
        console.log(`WhatsApp conectado para barbearia ${req.barbeariaId}: ${userId}`);
      },
      async (telefone, mensagem, remoteJid) => {
        await processarMensagemRecebida(req.barbeariaId, telefone, mensagem);
      }
    );

    await new Promise(r => setTimeout(r, 2000));

    if (qrCodeResolvido) {
      res.json({ ok: true, provider: 'baileys', qr: qrCodeResolvido, status: 'connecting' });
    } else if (resultado.status === 'connected') {
      res.json({ ok: true, provider: 'baileys', status: 'connected' });
    } else {
      res.json({ ok: true, provider: 'baileys', qr: null, status: 'timeout' });
    }
  } catch (err) {
    console.error('Erro ao conectar WhatsApp:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/whatsapp/status
router.get('/status', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT provider FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    const provider = rows[0]?.provider || 'evolution';
    
    if (provider === 'evolution') {
      const stat = await getStatusInstancia(req.barbeariaId);
      try {
        await query(
          `UPDATE whatsapp_config SET session_status = $1 WHERE barbearia_id = $2`,
          [stat.status, req.barbeariaId]
        );
      } catch {}
      return res.json({ status: stat.status, telefone: stat.telefone, provider });
    }
    
    // Baileys
    const st = getStatus(req.barbeariaId);
    const tel = getTelefone(req.barbeariaId);
    try { await query(`UPDATE whatsapp_config SET session_status = $1 WHERE barbearia_id = $2`, [st, req.barbeariaId]); } catch {}
    res.json({ status: st, telefone: tel, provider });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/desconectar
router.post('/desconectar', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT provider FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    const provider = rows[0]?.provider || 'evolution';
    
    if (provider === 'evolution') {
      await desconectarInstancia(req.barbeariaId);
    } else {
      await desconectarWhatsApp(req.barbeariaId);
      try { await query(`UPDATE whatsapp_config SET session_status = 'disconnected' WHERE barbearia_id = $1`, [req.barbeariaId]); } catch {}
    }
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/deletar -> deleta instância completamente
router.post('/deletar', async (req, res) => {
  try {
    await deletarInstancia(req.barbeariaId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/migrar-evolution -> força migração para Evolution
router.post('/migrar-evolution', async (req, res) => {
  try {
    console.log(`🔄 Migrando barbearia ${req.barbeariaId} para Evolution API...`);
    
    // Desconecta Baileys se estiver conectado
    try {
      await desconectarWhatsApp(req.barbeariaId);
    } catch {}
    
    // Atualiza banco para Evolution
    await query(
      `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, session_status, updated_at)
       VALUES ($1, 'evolution', true, 'disconnected', now())
       ON CONFLICT (barbearia_id) DO UPDATE SET 
          provider = 'evolution',
          enabled = true,
          session_status = 'disconnected',
          updated_at = now()`,
      [req.barbeariaId]
    );
    
    // Cria instância Evolution
    const instancia = await criarInstancia(req.barbeariaId);
    
    // Já gera o QR Code
    const conexao = await conectarInstancia(req.barbeariaId);
    
    res.json({
      ok: true,
      provider: 'evolution',
      instanceName: instancia.instanceName,
      qr: conexao.qr,
      status: conexao.status,
      mensagem: 'Migrado para Evolution API. Escaneie o QR Code para conectar.',
    });
  } catch (err) {
    console.error('Erro ao migrar:', err.message);
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/whatsapp/diagnostico -> diagnostica configuração atual
router.get('/diagnostico', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT provider, enabled, session_status, ai_enabled,
              evolution_instance_name, evolution_phone
         FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    
    const cfg = rows[0] || {};
    
    // Testa Evolution
    let evolutionStatus = null;
    try {
      const test = await testarEvolutionAPI();
      evolutionStatus = test.ok ? '✅ Online' : `❌ ${test.erro}`;
    } catch (err) {
      evolutionStatus = `❌ ${err.message}`;
    }
    
    res.json({
      barbearia_id: req.barbeariaId,
      provider_atual: cfg.provider || 'não configurado',
      enabled: cfg.enabled || false,
      session_status: cfg.session_status || 'desconhecido',
      ia_ativada: cfg.ai_enabled || false,
      evolution: {
        api_url_configurada: !!process.env.EVOLUTION_API_URL,
        api_key_configurada: !!process.env.EVOLUTION_API_KEY,
        sistema_url_configurada: !!process.env.SISTEMA_URL,
        api_status: evolutionStatus,
        instance_name: cfg.evolution_instance_name || 'sem instância',
        telefone: cfg.evolution_phone || null,
      },
      acao_recomendada: cfg.provider === 'baileys' 
        ? 'Migrar para Evolution: POST /api/whatsapp/migrar-evolution'
        : cfg.provider === 'evolution' && !cfg.evolution_instance_name
          ? 'Conectar para criar instância: POST /api/whatsapp/conectar'
          : '✅ Configuração OK',
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/enviar -> envio manual
router.post('/enviar', async (req, res) => {
  const { telefone, mensagem } = req.body;
  if (!telefone || !mensagem) return res.status(400).json({ erro: 'telefone e mensagem obrigatorios' });
  
  try {
    const { rows } = await query(
      `SELECT provider FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    const provider = rows[0]?.provider || 'evolution';
    
    if (provider === 'evolution') {
      await enviarMensagemEvolution(req.barbeariaId, telefone, mensagem);
      await query(
        `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
         VALUES ($1, $2, $3, 'manual', 'enviada')`,
        [req.barbeariaId, telefone, mensagem]
      );
      return res.json({ ok: true, provider: 'evolution', status: 'enviada' });
    }
    
    const r = await enviarMensagem(req.barbeariaId, { telefone, mensagem, tipo: 'manual' });
    res.json(r);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/whatsapp/mensagens
router.get('/mensagens', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM whatsapp_mensagens WHERE barbearia_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.barbeariaId]
  );
  res.json(rows);
});

export default router;
