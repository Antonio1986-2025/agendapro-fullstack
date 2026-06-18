/**
 * Script de teste para o Agente IA
 * Execute: node test-ai.js
 */

import 'dotenv/config';
import { processarMensagem, getConversa, salvarConversa } from './server/services/ai.js';
import { query } from './server/config/database.js';

const TELEFONE_TESTE = '11999887766';

console.log('🧪 ====== TESTE DO AGENTE IA ======\n');
console.log(`🔑 API Key: ${process.env.OPENAI_API_KEY ? 'Configurada ✅' : 'NÃO configurada ❌'}\n`);

async function testar() {
  try {
    // Busca uma barbearia real do banco
    console.log('🔍 Buscando barbearia no banco...');
    const { rows } = await query(
      `SELECT id, nome FROM barbearias WHERE ativo = true LIMIT 1`
    );
    
    if (!rows[0]) {
      console.error('❌ Nenhuma barbearia encontrada no banco!');
      console.log('💡 Dica: Execute primeiro o seed: npm run seed');
      process.exit(1);
    }
    
    const BARBEARIA_ID = rows[0].id;
    const BARBEARIA_NOME = rows[0].nome;
    
    console.log(`✅ Barbearia encontrada: ${BARBEARIA_NOME} (${BARBEARIA_ID})\n`);
    console.log(`📱 Telefone teste: ${TELEFONE_TESTE}\n`);
    
    // Teste 1: Mensagem simples
    console.log('\n📝 TESTE 1: Mensagem simples de saudação\n');
    console.log('Usuário: Olá, bom dia!');
    
    const teste1 = await processarMensagem(
      BARBEARIA_ID,
      BARBEARIA_NOME,
      'Olá, bom dia!',
      [],
      null
    );
    
    console.log('\n🤖 Resposta:', teste1.resposta);
    console.log('🔧 Tools usados:', teste1.toolsExecutados?.length || 0);
    
    // Teste 2: Listar serviços (requer tool)
    console.log('\n\n📝 TESTE 2: Pergunta que requer listar serviços\n');
    console.log('Usuário: Quais serviços vocês oferecem?');
    
    const teste2 = await processarMensagem(
      BARBEARIA_ID,
      BARBEARIA_NOME,
      'Quais serviços vocês oferecem?',
      [
        { role: 'user', content: 'Olá, bom dia!' },
        { role: 'assistant', content: teste1.resposta }
      ],
      null
    );
    
    console.log('\n🤖 Resposta:', teste2.resposta);
    console.log('🔧 Tools usados:', teste2.toolsExecutados?.map(t => t.name).join(', ') || 'nenhum');
    
    // Teste 3: Verificar disponibilidade
    console.log('\n\n📝 TESTE 3: Verificar disponibilidade para uma data\n');
    console.log('Usuário: Quais horários estão disponíveis amanhã?');
    
    const teste3 = await processarMensagem(
      BARBEARIA_ID,
      BARBEARIA_NOME,
      'Quais horários estão disponíveis amanhã?',
      [],
      null
    );
    
    console.log('\n🤖 Resposta:', teste3.resposta);
    console.log('🔧 Tools usados:', teste3.toolsExecutados?.map(t => t.name).join(', ') || 'nenhum');
    
    // Teste 4: Salvar e recuperar conversa
    console.log('\n\n📝 TESTE 4: Salvar e recuperar conversa\n');
    
    const historico = [
      { role: 'user', content: 'Olá' },
      { role: 'assistant', content: 'Olá! Como posso ajudar?' },
      { role: 'user', content: 'Quero agendar' },
      { role: 'assistant', content: 'Claro! Qual data você prefere?' }
    ];
    
    await salvarConversa(BARBEARIA_ID, TELEFONE_TESTE, historico);
    console.log('✅ Conversa salva no banco');
    
    const conversaRecuperada = await getConversa(BARBEARIA_ID, TELEFONE_TESTE);
    console.log('✅ Conversa recuperada:', conversaRecuperada ? 'Sucesso' : 'Falhou');
    console.log('   Mensagens no histórico:', conversaRecuperada?.historico?.length || 0);
    
    console.log('\n\n✅ ====== TODOS OS TESTES CONCLUÍDOS ======\n');
    
  } catch (err) {
    console.error('\n❌ ERRO durante os testes:', err.message);
    console.error('Stack:', err.stack);
  }
  
  process.exit(0);
}

// Executa os testes
testar();
