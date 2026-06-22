import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { enviarMensagem } from '../services/whatsapp.js';
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
 * Processa mensagem recebida via webhook
 */
async function processarMensagemRecebida(barbeariaId, telefone, mensagem) {
  try {
    const cfg = await query(
      `SELECT ai_enabled, ai_prompt,
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
    
    // Processa com IA (PASSANDO O TELEFONE DO CLIENTE)
    const { resposta } = await processarMensagem(
      barbeariaId, 
      config.barbearia_nome, 
      mensagem, 
      historico, 
      config.ai_prompt,
      telefone  // <-- Telefone do cliente para o agente saber automaticamente
    );
    
    if (resposta) {
      console.log(`💬 Resposta IA: ${resposta.substring(0, 100)}...`);
      
      // Envia resposta via Evolution API
      try {
        await enviarMensagemEvolution(barbeariaId, telefone, resposta);
        
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

// GET /api/whatsapp/teste-evolution -> testa Evolution API (PÚBLICO)
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
              evolution_instance_name, evolution_phone
         FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    const cfg = rows[0] || { provider: 'evolution', enabled: false, ai_enabled: false };

    // Atualiza status real da Evolution
    if (cfg.evolution_instance_name) {
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
  const { enabled, ai_enabled, ai_prompt } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, ai_enabled, ai_prompt, updated_at)
       VALUES ($1,'evolution',$2,$3,$4, now())
       ON CONFLICT (barbearia_id) DO UPDATE SET
          provider = 'evolution',
          enabled = COALESCE(NULLIF(EXCLUDED.enabled, NULL), whatsapp_config.enabled),
          ai_enabled = COALESCE(NULLIF(EXCLUDED.ai_enabled, NULL), whatsapp_config.ai_enabled),
          ai_prompt = COALESCE(NULLIF(EXCLUDED.ai_prompt, NULL), whatsapp_config.ai_prompt),
          updated_at = now()
       RETURNING provider, enabled, ai_enabled, ai_prompt`,
      [req.barbeariaId, enabled !== false, !!ai_enabled, ai_prompt || null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('Erro ao salvar config:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/whatsapp/conectar -> conecta via Evolution API
router.post('/conectar', async (req, res) => {
  try {
    await query(
      `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, updated_at)
       VALUES ($1, 'evolution', true, now())
       ON CONFLICT (barbearia_id) DO UPDATE SET 
          provider = 'evolution', 
          enabled = true, 
          updated_at = now()`,
      [req.barbeariaId]
    );
    
    const result = await conectarInstancia(req.barbeariaId);
    
    res.json({
      ok: true,
      provider: 'evolution',
      qr: result.qr,
      status: result.status,
      instanceName: result.instanceName,
    });
  } catch (err) {
    console.error('Erro ao conectar:', err.message);
    res.status(500).json({ 
      erro: err.message,
      dica: 'Verifique se EVOLUTION_API_URL e EVOLUTION_API_KEY estão configurados'
    });
  }
});

// GET /api/whatsapp/status
router.get('/status', async (req, res) => {
  try {
    const stat = await getStatusInstancia(req.barbeariaId);
    try {
      await query(
        `UPDATE whatsapp_config SET session_status = $1 WHERE barbearia_id = $2`,
        [stat.status, req.barbeariaId]
      );
    } catch {}
    res.json({ status: stat.status, telefone: stat.telefone, provider: 'evolution' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/desconectar
router.post('/desconectar', async (req, res) => {
  try {
    await desconectarInstancia(req.barbeariaId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/deletar -> deleta instância completamente (logout + delete)
router.post('/deletar', async (req, res) => {
  try {
    await deletarInstancia(req.barbeariaId);
    res.json({ ok: true });
  } catch (err) {
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
    
    let evolutionStatus = null;
    try {
      const test = await testarEvolutionAPI();
      evolutionStatus = test.ok ? '✅ Online' : `❌ ${test.erro}`;
    } catch (err) {
      evolutionStatus = `❌ ${err.message}`;
    }
    
    // Status do scheduler
    let schedulerStatus = null;
    try {
      const { getStatusScheduler } = await import('../services/scheduler.js');
      schedulerStatus = getStatusScheduler();
    } catch {}
    
    res.json({
      barbearia_id: req.barbeariaId,
      provider: cfg.provider || 'não configurado',
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
      scheduler: schedulerStatus,
      acao_recomendada: !cfg.evolution_instance_name
        ? 'Conectar para criar instância: POST /api/whatsapp/conectar'
        : '✅ Configuração OK',
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/scheduler/executar -> roda scheduler manualmente (testar)
router.post('/scheduler/executar', async (req, res) => {
  try {
    const { executarManualmente } = await import('../services/scheduler.js');
    await executarManualmente();
    res.json({ ok: true, mensagem: 'Scheduler executado. Verifique os logs.' });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/whatsapp/diagnostico-base -> mostra TUDO que o agente vê na base
router.get('/diagnostico-base', async (req, res) => {
  try {
    const barbeariaId = req.barbeariaId;
    
    // Identificação da barbearia
    const { rows: barbearia } = await query(
      `SELECT id, nome, slug, telefone, email, endereco, plano, horario_config, ativo
         FROM barbearias WHERE id = $1`,
      [barbeariaId]
    );
    
    // Serviços (exatamente o que o agente vê)
    const { rows: servicos } = await query(
      `SELECT id, nome, categoria, duracao_minutos, preco, ativo
         FROM servicos WHERE barbearia_id = $1 
         ORDER BY ativo DESC, categoria, nome`,
      [barbeariaId]
    );
    
    // Profissionais (exatamente o que o agente vê)
    const { rows: profissionais } = await query(
      `SELECT id, nome, especialidade, telefone, ativo, ordem, notificar_whatsapp
         FROM profissionais WHERE barbearia_id = $1
         ORDER BY ativo DESC, ordem, nome`,
      [barbeariaId]
    );
    
    // Resumo geral
    const { rows: resumo } = await query(
      `SELECT 
        (SELECT COUNT(*) FROM clientes WHERE barbearia_id = $1) AS total_clientes,
        (SELECT COUNT(*) FROM agendamentos WHERE barbearia_id = $1) AS total_agendamentos,
        (SELECT COUNT(*) FROM agendamentos WHERE barbearia_id = $1 AND status = 'agendado' AND data_hora >= NOW()) AS agendamentos_futuros,
        (SELECT COUNT(*) FROM servicos WHERE barbearia_id = $1 AND ativo = true) AS servicos_ativos,
        (SELECT COUNT(*) FROM profissionais WHERE barbearia_id = $1 AND ativo = true) AS profissionais_ativos`,
      [barbeariaId]
    );
    
    // Próximos agendamentos
    const { rows: proximosAgendamentos } = await query(
      `SELECT a.id, a.data_hora, a.status, a.preco, a.observacoes,
              c.nome AS cliente_nome, c.telefone AS cliente_telefone,
              s.nome AS servico_nome,
              p.nome AS profissional_nome
         FROM agendamentos a
         LEFT JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN servicos s ON s.id = a.servico_id
         LEFT JOIN profissionais p ON p.id = a.profissional_id
        WHERE a.barbearia_id = $1
          AND a.data_hora >= NOW()
        ORDER BY a.data_hora
        LIMIT 10`,
      [barbeariaId]
    );
    
    // Conversas IA salvas (histórico)
    const { rows: conversas } = await query(
      `SELECT cliente_telefone, 
              jsonb_array_length(historico) AS msgs_count,
              ultima_interacao
         FROM ai_conversas WHERE barbearia_id = $1
         ORDER BY ultima_interacao DESC
         LIMIT 10`,
      [barbeariaId]
    );
    
    // Mostra de qual banco está conectando (mascarado)
    let dbInfo = 'Não identificado';
    if (process.env.DATABASE_URL) {
      const url = process.env.DATABASE_URL;
      const match = url.match(/postgresql:\/\/([^:]+):[^@]+@([^:\/]+)/);
      if (match) {
        dbInfo = `PostgreSQL ${match[2]} (user: ${match[1]})`;
      }
    } else if (process.env.SUPABASE_DB_HOST) {
      dbInfo = `Supabase ${process.env.SUPABASE_DB_HOST}`;
    }
    
    res.json({
      conexao: {
        banco: dbInfo,
        ssl: process.env.DB_SSL === 'true',
      },
      barbearia: barbearia[0] || { erro: 'Barbearia não encontrada!' },
      resumo: resumo[0],
      servicos: {
        total: servicos.length,
        ativos: servicos.filter(s => s.ativo).length,
        inativos: servicos.filter(s => !s.ativo).length,
        lista: servicos.map(s => ({
          id: s.id,
          nome: s.nome,
          categoria: s.categoria,
          duracao: s.duracao_minutos,
          preco: parseFloat(s.preco),
          ativo: s.ativo,
          aviso: !s.ativo ? '⚠️  INATIVO - Agente NÃO usa' 
                : parseFloat(s.preco) === 0 ? '⚠️  PREÇO R$0,00 - Verifique!'
                : null
        }))
      },
      profissionais: {
        total: profissionais.length,
        ativos: profissionais.filter(p => p.ativo).length,
        lista: profissionais.map(p => ({
          id: p.id,
          nome: p.nome,
          especialidade: p.especialidade,
          telefone: p.telefone,
          ativo: p.ativo,
          notificar_whatsapp: p.notificar_whatsapp,
          aviso: !p.ativo ? '⚠️  INATIVO - Agente NÃO usa' 
                : !p.telefone ? '⚠️  Sem telefone - não vai receber notificação'
                : null
        }))
      },
      proximos_agendamentos: proximosAgendamentos,
      conversas_ia_salvas: conversas,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message, stack: err.stack });
  }
});

// POST /api/whatsapp/limpar-conversas -> apaga histórico de conversas IA (útil quando agente está confuso)
router.post('/limpar-conversas', async (req, res) => {
  try {
    const { telefone } = req.body;
    
    if (telefone) {
      const tel = telefone.replace(/\D/g, '');
      const { rowCount } = await query(
        `DELETE FROM ai_conversas 
          WHERE barbearia_id = $1 AND cliente_telefone LIKE $2`,
        [req.barbeariaId, `%${tel.slice(-11)}%`]
      );
      return res.json({ ok: true, conversas_apagadas: rowCount, telefone: tel });
    }
    
    // Apaga TODAS as conversas da barbearia
    const { rowCount } = await query(
      `DELETE FROM ai_conversas WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    res.json({ ok: true, conversas_apagadas: rowCount });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/desativar-servico -> desativa um serviço pelo nome ou ID
router.post('/desativar-servico', async (req, res) => {
  try {
    const { nome, id } = req.body;
    
    if (!nome && !id) {
      return res.status(400).json({ erro: 'Forneça nome ou id do serviço' });
    }
    
    let sql, params;
    if (id) {
      sql = `UPDATE servicos SET ativo = false WHERE id = $1 AND barbearia_id = $2 RETURNING id, nome`;
      params = [id, req.barbeariaId];
    } else {
      sql = `UPDATE servicos SET ativo = false WHERE LOWER(nome) LIKE LOWER($1) AND barbearia_id = $2 RETURNING id, nome`;
      params = [`%${nome}%`, req.barbeariaId];
    }
    
    const { rows } = await query(sql, params);
    res.json({ 
      ok: true, 
      desativados: rows.length,
      servicos: rows,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/corrigir-servico -> corrige nome ou preço de um serviço
router.post('/corrigir-servico', async (req, res) => {
  try {
    const { id, nome, novo_nome, novo_preco } = req.body;
    
    if (!id && !nome) {
      return res.status(400).json({ erro: 'Forneça id ou nome do serviço para identificar' });
    }
    
    const updates = [];
    const params = [req.barbeariaId];
    let paramIdx = 2;
    
    if (novo_nome) {
      updates.push(`nome = $${paramIdx++}`);
      params.push(novo_nome);
    }
    if (novo_preco !== undefined) {
      updates.push(`preco = $${paramIdx++}`);
      params.push(novo_preco);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ erro: 'Forneça novo_nome ou novo_preco' });
    }
    
    let whereSql;
    if (id) {
      params.push(id);
      whereSql = `id = $${paramIdx}`;
    } else {
      params.push(`%${nome}%`);
      whereSql = `LOWER(nome) LIKE LOWER($${paramIdx})`;
    }
    
    const sql = `UPDATE servicos SET ${updates.join(', ')} 
                 WHERE barbearia_id = $1 AND ${whereSql}
                 RETURNING id, nome, preco, ativo`;
    
    const { rows } = await query(sql, params);
    res.json({ 
      ok: true, 
      atualizados: rows.length,
      servicos: rows,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/enviar -> envio manual
router.post('/enviar', async (req, res) => {
  const { telefone, mensagem } = req.body;
  if (!telefone || !mensagem) {
    return res.status(400).json({ erro: 'telefone e mensagem obrigatorios' });
  }
  
  try {
    await enviarMensagemEvolution(req.barbeariaId, telefone, mensagem);
    await query(
      `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, 'manual', 'enviada')`,
      [req.barbeariaId, telefone, mensagem]
    );
    res.json({ ok: true, provider: 'evolution', status: 'enviada' });
  } catch (err) {
    await query(
      `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, 'manual', 'erro')`,
      [req.barbeariaId, telefone, mensagem]
    );
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
