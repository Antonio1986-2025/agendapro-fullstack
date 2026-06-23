/**
 * Script de teste do fix de duplicata
 * Verifica se a migração foi aplicada corretamente
 */

import { query } from './server/config/database.js';

async function testarFix() {
  console.log('\n🧪 ====== TESTE DO FIX DE DUPLICATA ======\n');
  
  try {
    // 1. Verificar se coluna existe
    console.log('1️⃣  Verificando coluna confirmacao_enviada_em...');
    const { rows: colunas } = await query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'agendamentos'
         AND column_name = 'confirmacao_enviada_em'`
    );
    
    if (colunas.length === 0) {
      console.log('❌ FALHA: Coluna confirmacao_enviada_em não existe!');
      process.exit(1);
    }
    
    console.log('✅ Coluna existe:', colunas[0]);
    
    // 2. Verificar se outras colunas de controle existem
    console.log('\n2️⃣  Verificando colunas de controle de notificações...');
    const { rows: controle } = await query(
      `SELECT column_name 
       FROM information_schema.columns
       WHERE table_name = 'agendamentos'
         AND column_name IN ('lembrete_enviado_em', 'notificacao_barbeiro_enviada_em', 'confirmacao_enviada_em')
       ORDER BY column_name`
    );
    
    console.log('✅ Colunas de controle:', controle.map(c => c.column_name).join(', '));
    
    if (controle.length < 3) {
      console.log('⚠️  Faltam colunas de controle!');
    }
    
    // 3. Contar agendamentos existentes
    console.log('\n3️⃣  Verificando agendamentos existentes...');
    const { rows: stats } = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'confirmado' THEN 1 END) as confirmados,
         COUNT(CASE WHEN confirmacao_enviada_em IS NOT NULL THEN 1 END) as com_confirmacao_enviada
       FROM agendamentos`
    );
    
    console.log('📊 Estatísticas:');
    console.log(`   Total de agendamentos: ${stats[0].total}`);
    console.log(`   Confirmados: ${stats[0].confirmados}`);
    console.log(`   Com confirmação enviada: ${stats[0].com_confirmacao_enviada}`);
    
    // 4. Verificar últimas mensagens de confirmação
    console.log('\n4️⃣  Verificando últimas mensagens de confirmação...');
    const { rows: msgs } = await query(
      `SELECT telefone, COUNT(*) as total, MAX(created_at) as ultima
       FROM whatsapp_mensagens
       WHERE tipo = 'confirmacao'
       GROUP BY telefone
       HAVING COUNT(*) > 1
       ORDER BY MAX(created_at) DESC
       LIMIT 5`
    );
    
    if (msgs.length > 0) {
      console.log('⚠️  Telefones com confirmações duplicadas (histórico):');
      msgs.forEach(m => {
        console.log(`   ${m.telefone}: ${m.total} mensagens (última: ${m.ultima})`);
      });
    } else {
      console.log('✅ Nenhuma duplicata encontrada no histórico recente');
    }
    
    console.log('\n✅ ====== FIX APLICADO COM SUCESSO ======\n');
    console.log('📝 Próximos passos:');
    console.log('   1. Reiniciar o servidor: npm run dev');
    console.log('   2. Testar cancelamento de agendamento');
    console.log('   3. Verificar logs para [ANTI-DUPLICATA]');
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERRO:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testarFix();
