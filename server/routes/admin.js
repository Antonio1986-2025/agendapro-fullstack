/**
 * Rotas de ADMINISTRAÇÃO
 * 
 * Protegidas por chave admin (x-admin-key header).
 * USAR COM CUIDADO - operações destrutivas!
 */

import { Router } from 'express';
import axios from 'axios';
import { query } from '../config/database.js';

const router = Router();

/**
 * Middleware: valida chave admin
 * Aceita ou EVOLUTION_API_KEY (já configurada) ou ADMIN_KEY específica
 */
function autenticarAdmin(req, res, next) {
  const chave = req.headers['x-admin-key'] || req.body?.adminKey || req.query?.adminKey;
  const chaveEsperada = process.env.ADMIN_KEY || process.env.EVOLUTION_API_KEY;
  
  if (!chave || chave !== chaveEsperada) {
    return res.status(401).json({ 
      erro: 'Chave admin inválida',
      dica: 'Forneça x-admin-key no header com a chave da Evolution API ou ADMIN_KEY'
    });
  }
  
  next();
}

router.use(autenticarAdmin);

/**
 * GET /api/admin/listar-tudo
 * Lista todas as barbearias, instâncias Evolution e dados gerais
 */
router.get('/listar-tudo', async (req, res) => {
  try {
    // Barbearias no banco
    const { rows: barbearias } = await query(
      `SELECT id, nome, slug, telefone, email, created_at FROM barbearias ORDER BY created_at`
    );
    
    // Instâncias na Evolution
    let instancias = [];
    try {
      const evolutionUrl = process.env.EVOLUTION_API_URL;
      const evolutionKey = process.env.EVOLUTION_API_KEY;
      
      const response = await axios.get(`${evolutionUrl}/instance/fetchInstances`, {
        headers: { 'apikey': evolutionKey },
        timeout: 10000,
      });
      
      instancias = Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      console.error('Erro ao listar instâncias:', err.message);
    }
    
    // Resumo
    const { rows: resumo } = await query(
      `SELECT 
        (SELECT COUNT(*) FROM barbearias) AS total_barbearias,
        (SELECT COUNT(*) FROM usuarios) AS total_usuarios,
        (SELECT COUNT(*) FROM clientes) AS total_clientes,
        (SELECT COUNT(*) FROM servicos) AS total_servicos,
        (SELECT COUNT(*) FROM profissionais) AS total_profissionais,
        (SELECT COUNT(*) FROM agendamentos) AS total_agendamentos,
        (SELECT COUNT(*) FROM ai_conversas) AS total_conversas_ia,
        (SELECT COUNT(*) FROM whatsapp_mensagens) AS total_mensagens`
    );
    
    res.json({
      barbearias,
      instancias_evolution: instancias.map(i => ({
        nome: i.name || i.instance?.instanceName,
        status: i.connectionStatus || i.instance?.state,
        telefone: i.ownerJid?.split('@')[0] || i.number,
      })),
      resumo: resumo[0],
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

/**
 * POST /api/admin/reset-completo
 * APAGA TUDO: barbearias, usuários, clientes, agendamentos, instâncias Evolution
 * Sistema fica zerado, pronto para cadastrar a primeira barbearia
 */
router.post('/reset-completo', async (req, res) => {
  const { confirmar } = req.body;
  
  if (confirmar !== 'SIM_APAGAR_TUDO') {
    return res.status(400).json({
      erro: 'Confirmação obrigatória',
      mensagem: 'Para confirmar, envie body: { "confirmar": "SIM_APAGAR_TUDO" }',
    });
  }
  
  const resultado = {
    instancias_evolution_deletadas: 0,
    instancias_evolution_falhas: [],
    tabelas_limpas: {},
  };
  
  console.log(`\n🔥 ====== RESET COMPLETO INICIADO ======`);
  
  // 1. Deletar todas as instâncias na Evolution API
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;
    
    if (evolutionUrl && evolutionKey) {
      console.log(`📡 Listando instâncias da Evolution...`);
      
      const listResponse = await axios.get(`${evolutionUrl}/instance/fetchInstances`, {
        headers: { 'apikey': evolutionKey },
        timeout: 10000,
      });
      
      const instancias = Array.isArray(listResponse.data) ? listResponse.data : [];
      console.log(`   📋 ${instancias.length} instância(s) encontrada(s)`);
      
      for (const inst of instancias) {
        const nome = inst.name || inst.instance?.instanceName;
        if (!nome) continue;
        
        console.log(`   🗑️  Deletando ${nome}...`);
        try {
          // Logout primeiro (não-bloqueante)
          try {
            await axios.delete(`${evolutionUrl}/instance/logout/${nome}`, {
              headers: { 'apikey': evolutionKey },
              timeout: 5000,
            });
          } catch {}
          
          // Delete instância
          await axios.delete(`${evolutionUrl}/instance/delete/${nome}`, {
            headers: { 'apikey': evolutionKey },
            timeout: 10000,
          });
          
          resultado.instancias_evolution_deletadas++;
          console.log(`   ✅ ${nome} deletada`);
        } catch (err) {
          console.error(`   ❌ Falha em ${nome}:`, err.response?.data?.message || err.message);
          resultado.instancias_evolution_falhas.push({
            instancia: nome,
            erro: err.response?.data?.message || err.message,
          });
        }
      }
    } else {
      console.log(`⚠️  Evolution API não configurada, pulando limpeza de instâncias`);
    }
  } catch (err) {
    console.error(`❌ Erro ao limpar Evolution:`, err.message);
    resultado.evolution_erro = err.message;
  }
  
  // 2. Limpar tabelas do banco (na ordem correta de dependências)
  console.log(`\n🗄️  Limpando banco de dados...`);
  
  const tabelas = [
    'ai_conversas',
    'whatsapp_mensagens',
    'whatsapp_config',
    'caixa_movimentos',
    'caixa_registros',
    'transacoes',
    'comissoes',
    'acertos',
    'comanda_itens',
    'comandas',
    'estoque_movimentos',
    'estoque_itens',
    'horarios_especiais',
    'agendamentos',
    'clientes',
    'servicos',
    'profissionais',
    'usuarios',
    'barbearias',
  ];
  
  for (const tabela of tabelas) {
    try {
      const { rowCount } = await query(`DELETE FROM ${tabela}`);
      resultado.tabelas_limpas[tabela] = rowCount;
      console.log(`   ✅ ${tabela}: ${rowCount} linha(s) apagada(s)`);
    } catch (err) {
      console.error(`   ❌ ${tabela}:`, err.message);
      resultado.tabelas_limpas[tabela] = `ERRO: ${err.message}`;
    }
  }
  
  console.log(`\n✅ ====== RESET COMPLETO CONCLUÍDO ======\n`);
  
  res.json({
    ok: true,
    mensagem: 'Sistema resetado com sucesso. Pode cadastrar a primeira barbearia!',
    resultado,
  });
});

/**
 * POST /api/admin/limpar-evolution-orfas
 * Apaga apenas instâncias Evolution que não correspondem a uma barbearia no banco
 */
router.post('/limpar-evolution-orfas', async (req, res) => {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;
    
    // Pega instâncias na Evolution
    const listResponse = await axios.get(`${evolutionUrl}/instance/fetchInstances`, {
      headers: { 'apikey': evolutionKey },
    });
    const instancias = Array.isArray(listResponse.data) ? listResponse.data : [];
    
    // Pega barbearias no banco
    const { rows: barbearias } = await query(`SELECT id FROM barbearias`);
    const idsValidos = new Set(barbearias.map(b => `barbearia-${b.id.replace(/-/g, '').substring(0, 16)}`));
    
    const orfas = [];
    const deletadas = [];
    
    for (const inst of instancias) {
      const nome = inst.name || inst.instance?.instanceName;
      if (!nome || !nome.startsWith('barbearia-')) continue;
      
      if (!idsValidos.has(nome)) {
        orfas.push(nome);
        try {
          try {
            await axios.delete(`${evolutionUrl}/instance/logout/${nome}`, {
              headers: { 'apikey': evolutionKey },
            });
          } catch {}
          await axios.delete(`${evolutionUrl}/instance/delete/${nome}`, {
            headers: { 'apikey': evolutionKey },
          });
          deletadas.push(nome);
        } catch (err) {
          console.error(`Falha em ${nome}:`, err.message);
        }
      }
    }
    
    res.json({
      ok: true,
      total_instancias: instancias.length,
      barbearias_no_banco: barbearias.length,
      orfas_encontradas: orfas,
      deletadas,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
