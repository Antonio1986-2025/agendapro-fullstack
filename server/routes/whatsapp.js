import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { requerPermissao } from '../middleware/permissoes.js';
import { enviarMensagem } from '../services/whatsapp.js';
import {
  conectarBaileys,
  getStatusBaileys,
  desconectarBaileys,
  getQRCodeBaileys,
  enviarMensagemBaileys,
} from '../services/baileys-provider.js';
import {
  criarInstancia,
  conectarInstancia,
  getStatusInstancia,
  desconectarInstancia,
  deletarInstancia,
  enviarMensagemEvolution,
  enviarDigitandoEvolution,
} from '../services/evolution-provider.js';
import { processarMensagem, getConversa, salvarConversa } from '../services/ai.js';
import { enfileirar } from '../services/message-queue.js';

const router = Router();

// ============================================================
// WEBHOOK - EVOLUTION API (SEM AUTENTICAÇÃO)
// Recebe mensagens entrantes do WhatsApp via Evolution API
// ============================================================
router.post('/webhook/evolution/:barbeariaId', async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    const { barbeariaId } = req.params;

    // Valida se barbearia existe e tem Evolution configurado
    const { rows: configs } = await query(
      `SELECT 1 FROM whatsapp_config WHERE barbearia_id = $1 AND provider = 'evolution' AND enabled = true`,
      [barbeariaId]
    );
    if (!configs.length) {
      console.warn(`[whatsapp] Webhook ignorado: barbearia ${barbeariaId} sem Evolution ativo`);
      return;
    }
    const payload = req.body;

    if (payload.event !== 'messages.upsert') return;
    if (payload.data?.key?.fromMe) return;
    const remoteJid = payload.data?.key?.remoteJid || '';
    if (remoteJid.endsWith('@g.us')) return;

    const msg = payload.data?.message || {};
    const pushName = payload.data?.pushName || '';

    const texto = msg.conversation || msg.extendedTextMessage?.text || '';
    const temAudio = !!msg.audioMessage;
    const temImagem = !!msg.imageMessage;

    if (!texto && !temAudio && !temImagem) return;
    if (!remoteJid) return;

    const telefone = remoteJid.replace(/[^0-9]/g, '');

    await enfileirar(telefone, () => processarWebhookEvolution(barbeariaId, telefone, remoteJid, texto, pushName, msg, temAudio, temImagem, payload.data));
  } catch (err) {
    console.error(`❌ [Evolution] Erro ao processar webhook:`, err.message);
  }
});

async function processarWebhookEvolution(barbeariaId, telefone, remoteJid, texto, pushName, msg, temAudio, temImagem, payloadData) {
  try {
    console.log(`📩 [Evolution] Mensagem de ${telefone} (${pushName}): ${texto.substring(0, 100) || (temAudio ? '[áudio]' : temImagem ? '[imagem]' : '')}`);

    let mensagemParaProcessar = texto;

    // ─── ÁUDIO: transcreve com Whisper ───
    if (temAudio && msg?.audioMessage) {
      try {
        let base64Audio = msg.audioMessage.base64 || msg.message?.audioMessage?.base64;
        console.log(`🔍 [Áudio] base64 direto: ${base64Audio ? 'encontrado (' + Math.round(base64Audio.length * 0.75 / 1024) + 'KB)' : 'não encontrado'}`);

        if (!base64Audio) {
          console.log(`🔍 [Áudio] Tentando baixar via Evolution API...`);
          const { baixarMediaEvolution } = await import('../services/evolution-provider.js');
          base64Audio = await baixarMediaEvolution(barbeariaId, payloadData || msg);
          console.log(`🔍 [Áudio] Download Evolution: ${base64Audio ? 'sucesso (' + Math.round(base64Audio.length * 0.75 / 1024) + 'KB)' : 'falhou'}`);
        }

        if (base64Audio) {
          const buffer = Buffer.from(base64Audio, 'base64');
          console.log(`🔍 [Áudio] Buffer: ${buffer.length} bytes, mimetype: ${msg.audioMessage.mimetype}`);
          const { transcreverAudio } = await import('../services/ai.js');
          const transcricao = await transcreverAudio(buffer, msg.audioMessage.mimetype);
          mensagemParaProcessar = transcricao || '[áudio sem conteúdo compreensível]';
          console.log(`🎙️ Áudio transcrito: ${transcricao?.substring(0, 100)}`);
        } else {
          console.error('❌ [Áudio] Não foi possível obter base64 (direto + Evolution API)');
          mensagemParaProcessar = '[não consegui processar o áudio, pode digitar?]';
        }
      } catch (err) {
        console.error('❌ Erro ao transcrever áudio:', err.message);
        mensagemParaProcessar = '[não consegui processar o áudio, pode digitar?]';
      }
    }



    await query(
      `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, 'recebida', 'recebida')`,
      [barbeariaId, telefone, mensagemParaProcessar]
    );

    const { rows: wc } = await query(
      `SELECT ai_enabled, ai_prompt, provider FROM whatsapp_config WHERE barbearia_id = $1`,
      [barbeariaId]
    );
    if (!wc[0]?.ai_enabled) return;

    const { rows: barb } = await query(
      `SELECT nome FROM barbearias WHERE id = $1`,
      [barbeariaId]
    );
    const barbeariaNome = barb[0]?.nome || 'Barbearia';

    let historico = [];
    try {
      const { rows: conv } = await query(
        `SELECT historico FROM ai_conversas WHERE barbearia_id = $1 AND cliente_telefone = $2`,
        [barbeariaId, telefone]
      );
      if (conv[0]?.historico) {
        historico = typeof conv[0].historico === 'string'
          ? JSON.parse(conv[0].historico)
          : conv[0].historico;
        historico = historico.filter(m =>
          m.role === 'user' || (m.role === 'assistant' && !m.tool_calls)
        );
      }
    } catch (err) {
      console.warn(`[whatsapp/ai] Erro ao carregar histórico da conversa: ${err?.message}`);
    }

    // Mostra "digitando..." enquanto processa
    enviarDigitandoEvolution(barbeariaId, telefone).catch(() => {});

    const { processarMensagem } = await import('../services/ai.js');
    const { resposta, agendamentoFinalizado } = await processarMensagem(
      barbeariaId, barbeariaNome, mensagemParaProcessar, historico,
      wc[0]?.ai_prompt || null, remoteJid, null, 'image/jpeg', pushName
    );

    if (resposta) {
      await enviarMensagemEvolution(barbeariaId, telefone, resposta);

      // 🧹 Se agendamento foi finalizado, limpa histórico E estado para não afetar o próximo
      if (agendamentoFinalizado) {
        console.log(`   🧹 Agendamento concluído! limpando estado e conversa.`);
        historico = [];
        // Reseta também o estado do workflow para não carregar slots antigos
        await query(
          `UPDATE ai_conversas SET contexto = NULL WHERE barbearia_id = $1 AND cliente_telefone = $2`,
          [barbeariaId, telefone]
        ).catch(e => console.warn('   ⚠️ Erro ao limpar contexto:', e.message));
      }

      historico.push({ role: 'user', content: mensagemParaProcessar }, { role: 'assistant', content: resposta });
      const limitado = historico.slice(-30);

      await query(
        `INSERT INTO ai_conversas (barbearia_id, cliente_telefone, historico, ultima_interacao)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (barbearia_id, cliente_telefone) DO UPDATE SET
            historico = $3, ultima_interacao = now()`,
        [barbeariaId, telefone, JSON.stringify(limitado)]
      );

      console.log(`🤖 [Evolution] Resposta enviada para ${telefone}`);
    }
  } catch (err) {
    console.error(`❌ [Evolution] Erro ao processar webhook:`, err.message);
  }
}

// ============================================================
// ROTAS AUTENTICADAS
// ============================================================
router.use(autenticar, requerPermissao('configuracoes'));

// GET /api/whatsapp/config
router.get('/config', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT provider, enabled, session_status, ai_enabled, ai_prompt
         FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    const cfg = rows[0] || { provider: 'baileys', enabled: false, ai_enabled: false };
    const provider = cfg.provider || 'baileys';

    // Atualiza status real baseado no provider
    try {
      let stat;
      if (provider === 'evolution') {
        stat = await getStatusInstancia(req.barbeariaId);
      } else {
        stat = await getStatusBaileys(req.barbeariaId);
      }
      cfg.session_status = stat.status;
      if (stat.telefone) cfg.telefone = stat.telefone;
      if (stat.qrCode) cfg.qr_code = stat.qrCode;
    } catch (err) {
      console.warn(`[whatsapp/config] Erro ao buscar status da instância: ${err?.message}`);
    }

    try {
      await query(
        `UPDATE whatsapp_config SET session_status = $1 WHERE barbearia_id = $2`,
        [cfg.session_status, req.barbeariaId]
      );
    } catch (err) {
      console.warn(`[whatsapp/config] Erro ao atualizar session_status: ${err?.message}`);
    }

    res.json(cfg);
  } catch (e) {
    console.error('Erro ao buscar config:', e.message);
    res.json({ provider: 'baileys', enabled: false });
  }
});

// PUT /api/whatsapp/config
router.put('/config', async (req, res) => {
  const { enabled, ai_enabled, ai_prompt } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, ai_enabled, ai_prompt, updated_at)
       VALUES ($1, COALESCE((SELECT provider FROM whatsapp_config WHERE barbearia_id = $1), 'baileys'), $2, $3, $4, now())
       ON CONFLICT (barbearia_id) DO UPDATE SET
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

// POST /api/whatsapp/conectar -> conecta via Baileys ou Evolution API
router.post('/conectar', async (req, res) => {
  try {
    const { rows: existing } = await query(
      `SELECT provider FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    
    const provider = existing[0]?.provider || 'baileys';
    const useEvolution = provider === 'evolution' || process.env.EVOLUTION_API_URL;
    
    if (useEvolution) {
      await query(
        `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, updated_at)
         VALUES ($1, 'evolution', true, now())
         ON CONFLICT (barbearia_id) DO UPDATE SET 
            provider = 'evolution', 
            enabled = true, 
            updated_at = now()`,
        [req.barbeariaId]
      );
      
      // conectarInstancia já cria a instância se não existir
      const result = await conectarInstancia(req.barbeariaId);
      
      res.json({
        ok: true,
        provider: 'evolution',
        qr: result.qr || null,
        qrBase64: result.qr || null,
        status: result.status,
      });
    } else {
      await query(
        `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, updated_at)
         VALUES ($1, 'baileys', true, now())
         ON CONFLICT (barbearia_id) DO UPDATE SET 
            provider = 'baileys', 
            enabled = true, 
            updated_at = now()`,
        [req.barbeariaId]
      );
      
      const result = await conectarBaileys(req.barbeariaId);
      
      res.json({
        ok: true,
        provider: 'baileys',
        qr: result.qrCode || null,
        qrBase64: result.qrCodeBase64 || null,
        status: result.status,
      });
    }
  } catch (err) {
    console.error('Erro ao conectar WhatsApp:', err.message);
    res.status(500).json({
      erro: err.message,
      dica: 'Verifique os logs do servidor para mais detalhes',
    });
  }
});

// GET /api/whatsapp/qrcode -> obtém QR Code atual
router.get('/qrcode', async (req, res) => {
  try {
    const qrData = await getQRCodeBaileys(req.barbeariaId);
    if (!qrData || !qrData.qrCode) {
      return res.json({ ok: false, mensagem: 'Nenhum QR Code disponível' });
    }
    res.json({ ok: true, qr: qrData.qrCode, qrBase64: qrData.qrCodeBase64 });
  } catch (err) {
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
    const provider = rows[0]?.provider || 'baileys';
    
    let stat;
    if (provider === 'evolution') {
      stat = await getStatusInstancia(req.barbeariaId);
    } else {
      stat = await getStatusBaileys(req.barbeariaId);
    }
    
    try {
      await query(
        `UPDATE whatsapp_config SET session_status = $1 WHERE barbearia_id = $2`,
        [stat.status, req.barbeariaId]
      );
    } catch (err) {
      console.warn(`[whatsapp/status] Erro ao persistir status: ${err?.message}`);
    }
    res.json({ status: stat.status, telefone: stat.telefone, provider });
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
    const provider = rows[0]?.provider || 'baileys';
    
    if (provider === 'evolution') {
      await desconectarInstancia(req.barbeariaId);
    } else {
      await desconectarBaileys(req.barbeariaId);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/deletar -> desconecta (Baileys não precisa de delete separado)
router.post('/deletar', async (req, res) => {
  try {
    await desconectarBaileys(req.barbeariaId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/whatsapp/diagnostico -> diagnostica configuração atual
router.get('/diagnostico', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT provider, enabled, session_status, ai_enabled
         FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );

    const cfg = rows[0] || {};

    const stat = await getStatusBaileys(req.barbeariaId);

    let schedulerStatus = null;
    try {
      const { getStatusScheduler } = await import('../services/scheduler.js');
      schedulerStatus = getStatusScheduler();
    } catch (err) {
      console.warn(`[whatsapp/diagnostico] Erro ao obter status do scheduler: ${err?.message}`);
    }

    res.json({
      barbearia_id: req.barbeariaId,
      provider: cfg.provider || 'não configurado',
      enabled: cfg.enabled || false,
      session_status: stat.status || 'desconhecido',
      ia_ativada: cfg.ai_enabled || false,
      baileys: {
        status: stat.status,
        telefone: stat.telefone || null,
        tem_qr: !!stat.qrCode,
      },
      scheduler: schedulerStatus,
      acao_recomendada: stat.status !== 'connected'
        ? 'Conectar para escanear QR Code: POST /api/whatsapp/conectar'
        : '✅ WhatsApp conectado',
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/whatsapp/scheduler/executar -> roda scheduler manualmente
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

    const { rows: barbearia } = await query(
      `SELECT id, nome, slug, telefone, email, endereco, plano, horario_config, ativo
         FROM barbearias WHERE id = $1`,
      [barbeariaId]
    );

    const { rows: servicos } = await query(
      `SELECT id, nome, categoria, duracao_minutos, preco, ativo
         FROM servicos WHERE barbearia_id = $1 
         ORDER BY ativo DESC, categoria, nome`,
      [barbeariaId]
    );

    const { rows: profissionais } = await query(
      `SELECT id, nome, especialidade, telefone, ativo, ordem, notificar_whatsapp
         FROM profissionais WHERE barbearia_id = $1
         ORDER BY ativo DESC, ordem, nome`,
      [barbeariaId]
    );

    const { rows: resumo } = await query(
      `SELECT 
        (SELECT COUNT(*) FROM clientes WHERE barbearia_id = $1) AS total_clientes,
        (SELECT COUNT(*) FROM agendamentos WHERE barbearia_id = $1) AS total_agendamentos,
        (SELECT COUNT(*) FROM agendamentos WHERE barbearia_id = $1 AND status = 'agendado' AND data_hora >= NOW()) AS agendamentos_futuros,
        (SELECT COUNT(*) FROM servicos WHERE barbearia_id = $1 AND ativo = true) AS servicos_ativos,
        (SELECT COUNT(*) FROM profissionais WHERE barbearia_id = $1 AND ativo = true) AS profissionais_ativos`,
      [barbeariaId]
    );

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

    const { rows: conversas } = await query(
      `SELECT cliente_telefone, 
              jsonb_array_length(historico) AS msgs_count,
              ultima_interacao
         FROM ai_conversas WHERE barbearia_id = $1
         ORDER BY ultima_interacao DESC
         LIMIT 10`,
      [barbeariaId]
    );

    let dbInfo = 'Não identificado';
    if (process.env.DATABASE_URL) {
      const url = process.env.DATABASE_URL;
      const match = url.match(/postgresql:\/\/([^:]+):[^@]+@([^:\/]+)/);
      if (match) {
        dbInfo = `PostgreSQL ${match[2]} (user: ${match[1]})`;
      }
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

// POST /api/whatsapp/limpar-conversas -> apaga histórico de conversas IA
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

// POST /api/whatsapp/limpar-cliente -> apaga todos dados de um cliente (testes)
router.post('/limpar-cliente', async (req, res) => {
  try {
    const { telefone } = req.body;
    if (!telefone) {
      return res.status(400).json({ erro: 'Forneça o telefone do cliente' });
    }

    const tel = telefone.replace(/\D/g, '');

    const { rows: clientes } = await query(
      `SELECT id FROM clientes 
        WHERE barbearia_id = $1 AND telefone LIKE $2`,
      [req.barbeariaId, `%${tel.slice(-11)}%`]
    );

    if (clientes.length === 0) {
      return res.json({ ok: true, mensagem: 'Cliente não encontrado' });
    }

    const clienteIds = clientes.map(c => c.id);

    const result = {};

    const { rows: comandas } = await query(
      `SELECT id FROM comandas WHERE cliente_id = ANY($1)`,
      [clienteIds]
    );
    if (comandas.length > 0) {
      const comandaIds = comandas.map(c => c.id);
      const r1 = await query(`DELETE FROM comanda_itens WHERE comanda_id = ANY($1)`, [comandaIds]);
      const r2 = await query(`DELETE FROM comandas WHERE id = ANY($1)`, [comandaIds]);
      result.comanda_itens = r1.rowCount;
      result.comandas = r2.rowCount;
    }

    const r3 = await query(
      `DELETE FROM agendamentos WHERE cliente_id = ANY($1)`,
      [clienteIds]
    );
    result.agendamentos = r3.rowCount;

    const r4 = await query(
      `DELETE FROM whatsapp_mensagens 
        WHERE barbearia_id = $1 AND telefone LIKE $2`,
      [req.barbeariaId, `%${tel.slice(-11)}%`]
    );
    result.mensagens = r4.rowCount;

    const r5 = await query(
      `DELETE FROM ai_conversas 
        WHERE barbearia_id = $1 AND cliente_telefone LIKE $2`,
      [req.barbeariaId, `%${tel.slice(-11)}%`]
    );
    result.conversas = r5.rowCount;

    const r6 = await query(`DELETE FROM clientes WHERE id = ANY($1)`, [clienteIds]);
    result.clientes = r6.rowCount;

    res.json({
      ok: true,
      telefone: tel,
      apagado: result,
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
    const { rows } = await query(
      `SELECT provider FROM whatsapp_config WHERE barbearia_id = $1`,
      [req.barbeariaId]
    );
    const provider = rows[0]?.provider || 'baileys';
    
    if (provider === 'evolution') {
      await enviarMensagemEvolution(req.barbeariaId, telefone, mensagem);
    } else {
      await enviarMensagemBaileys(req.barbeariaId, telefone, mensagem);
    }
    
    await query(
      `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, 'manual', 'enviada')`,
      [req.barbeariaId, telefone, mensagem]
    );
    res.json({ ok: true, provider, status: 'enviada' });
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
