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
 * Use a variável ADMIN_KEY no Railway para configurar
 */
function autenticarAdmin(req, res, next) {
  const chave = req.headers['x-admin-key'] || req.body?.adminKey || req.query?.adminKey;
  const chaveEsperada = process.env.ADMIN_KEY;
  
  if (!chave || chave !== chaveEsperada) {
    return res.status(401).json({ 
      erro: 'Chave admin inválida',
      dica: 'Forneça x-admin-key no header com ADMIN_KEY configurado no Railway'
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
      provider: 'baileys',
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
    tabelas_limpas: {},
  };
  
  console.log(`\n🔥 ====== RESET COMPLETO INICIADO ======`);
  
  // 1. Limpar tabelas do banco (na ordem correta de dependências)
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

export default router;
