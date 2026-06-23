/**
 * ============================================================
 * TESTES DO SISTEMA DE CONTROLE DE ACESSO
 * ============================================================
 * 
 * Testa permissões e validações implementadas
 */

import { query } from './server/config/database.js';
import {
  filtroAgendaPorRole,
  validarCriacaoAgendamento,
  validarModificacaoAgendamento,
  validarConclusaoManual,
} from './server/middleware/permissoes.js';

async function testarPermissoes() {
  console.log('\n🧪 ====== TESTES DE PERMISSÕES ======\n');
  
  let sucessos = 0;
  let falhas = 0;
  
  function testar(descricao, condicao) {
    if (condicao) {
      console.log(`✅ ${descricao}`);
      sucessos++;
    } else {
      console.log(`❌ FALHOU: ${descricao}`);
      falhas++;
    }
  }
  
  try {
    // =========================================================
    // TESTE 1: Filtro de Agenda
    // =========================================================
    console.log('📋 TESTE 1: Filtro de Agenda\n');
    
    const contextoOwner = {
      role: 'owner',
      profissional_id: null,
      permissoes: { gerenciar_agenda: true },
    };
    
    const contextoStaffComPermissao = {
      role: 'staff',
      profissional_id: '123e4567-e89b-12d3-a456-426614174000',
      permissoes: { gerenciar_agenda: true },
    };
    
    const contextoStaffSemPermissao = {
      role: 'staff',
      profissional_id: '123e4567-e89b-12d3-a456-426614174000',
      permissoes: { gerenciar_agenda: false },
    };
    
    const filtroOwner = filtroAgendaPorRole(contextoOwner);
    testar('Owner vê toda agenda (sem filtro)', filtroOwner.sql === '');
    
    const filtroStaffComPerm = filtroAgendaPorRole(contextoStaffComPermissao);
    testar('Staff com permissão vê toda agenda', filtroStaffComPerm.sql === '');
    
    const filtroStaffSemPerm = filtroAgendaPorRole(contextoStaffSemPermissao);
    testar('Staff sem permissão vê apenas sua agenda', filtroStaffSemPerm.sql.includes('profissional_id'));
    testar('Filtro usa profissional_id correto', filtroStaffSemPerm.params[0] === '123e4567-e89b-12d3-a456-426614174000');
    
    // =========================================================
    // TESTE 2: Validação de Criação de Agendamento
    // =========================================================
    console.log('\n📋 TESTE 2: Criação de Agendamento\n');
    
    const profId = '123e4567-e89b-12d3-a456-426614174000';
    const outroProfId = '987fcdeb-51a2-43d7-9876-543210fedcba';
    
    const criacaoOwner = validarCriacaoAgendamento(contextoOwner, outroProfId);
    testar('Owner pode criar para qualquer profissional', criacaoOwner.ok);
    
    const criacaoStaffProprio = validarCriacaoAgendamento(contextoStaffSemPermissao, profId);
    testar('Staff pode criar para si mesmo', criacaoStaffProprio.ok);
    
    const criacaoStaffOutro = validarCriacaoAgendamento(contextoStaffSemPermissao, outroProfId);
    testar('Staff NÃO pode criar para outro', !criacaoStaffOutro.ok);
    testar('Mensagem de erro apropriada', criacaoStaffOutro.erro?.includes('você mesmo'));
    
    // =========================================================
    // TESTE 3: Validação de Modificação
    // =========================================================
    console.log('\n📋 TESTE 3: Modificação de Agendamento\n');
    
    const modOwner = validarModificacaoAgendamento(contextoOwner, outroProfId);
    testar('Owner pode modificar qualquer agendamento', modOwner.ok);
    
    const modStaffProprio = validarModificacaoAgendamento(contextoStaffSemPermissao, profId);
    testar('Staff pode modificar seu próprio agendamento', modStaffProprio.ok);
    
    const modStaffOutro = validarModificacaoAgendamento(contextoStaffSemPermissao, outroProfId);
    testar('Staff NÃO pode modificar agendamento de outro', !modStaffOutro.ok);
    
    // =========================================================
    // TESTE 4: Validação de Conclusão Manual
    // =========================================================
    console.log('\n📋 TESTE 4: Conclusão Manual de Agendamento\n');
    
    const concOwner = validarConclusaoManual(contextoOwner);
    testar('Owner pode concluir manualmente', concOwner.ok);
    
    const concAdmin = validarConclusaoManual({ role: 'admin' });
    testar('Admin pode concluir manualmente', concAdmin.ok);
    
    const concStaff = validarConclusaoManual(contextoStaffSemPermissao);
    testar('Staff NÃO pode concluir manualmente', !concStaff.ok);
    testar('Mensagem explica que conclusão é automática ao fechar comanda', concStaff.erro?.includes('comanda'));
    
    // =========================================================
    // TESTE 5: Verificar Estrutura do Banco
    // =========================================================
    console.log('\n📋 TESTE 5: Estrutura do Banco de Dados\n');
    
    // Verificar coluna profissional_id em usuarios
    const { rows: colProfId } = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'usuarios' AND column_name = 'profissional_id'`
    );
    testar('Coluna profissional_id existe em usuarios', colProfId.length > 0);
    
    // Verificar coluna permissoes em profissionais
    const { rows: colPermissoes } = await query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'profissionais' AND column_name = 'permissoes'`
    );
    testar('Coluna permissoes existe em profissionais', colPermissoes.length > 0);
    testar('Coluna permissoes é tipo JSONB', colPermissoes[0]?.data_type === 'jsonb');
    
    // Verificar coluna role em usuarios
    const { rows: colRole } = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'usuarios' AND column_name = 'role'`
    );
    testar('Coluna role existe em usuarios', colRole.length > 0);
    
    // =========================================================
    // TESTE 6: Dados de Exemplo
    // =========================================================
    console.log('\n📋 TESTE 6: Verificar Dados de Exemplo\n');
    
    // Verificar se existe usuário staff
    const { rows: staffs } = await query(
      `SELECT COUNT(*)::int as total FROM usuarios WHERE role = 'staff'`
    );
    console.log(`ℹ️  Usuários staff no banco: ${staffs[0].total}`);
    
    // Verificar profissionais com permissões
    const { rows: profsComPerm } = await query(
      `SELECT id, nome, permissoes FROM profissionais 
       WHERE permissoes IS NOT NULL LIMIT 3`
    );
    if (profsComPerm.length > 0) {
      console.log(`ℹ️  Profissionais com permissões configuradas: ${profsComPerm.length}`);
      profsComPerm.forEach(p => {
        console.log(`   - ${p.nome}: ${JSON.stringify(p.permissoes)}`);
      });
    } else {
      console.log(`⚠️  Nenhum profissional com permissões configuradas ainda`);
    }
    
    // =========================================================
    // RESUMO
    // =========================================================
    console.log('\n═══════════════════════════════════════════════════');
    console.log(`\n✅ Testes passaram: ${sucessos}`);
    console.log(`❌ Testes falharam: ${falhas}`);
    console.log(`📊 Total: ${sucessos + falhas}`);
    
    if (falhas === 0) {
      console.log('\n🎉 ====== TODOS OS TESTES PASSARAM ======\n');
      console.log('✨ Sistema de controle de acesso funcionando perfeitamente!');
      console.log('\n📝 Próximos passos:');
      console.log('   1. Criar usuário staff de teste');
      console.log('   2. Vincular ao profissional');
      console.log('   3. Configurar permissões no profissional');
      console.log('   4. Testar login e acesso restrito');
    } else {
      console.log('\n⚠️  Alguns testes falharam. Revise o código.');
    }
    
    console.log('');
    process.exit(falhas > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n❌ ERRO:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testarPermissoes();
