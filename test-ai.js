/**
 * Script de teste para o Agente IA
 * Execute: node test-ai.js
 */

import 'dotenv/config';
import { processarMensagem, getConversa, salvarConversa } from './server/services/ai.js';

// Dados de teste (substitua pelo ID real da sua barbearia)
const BARBEARIA_ID_TESTE = '00000000-0000-0000-0000-000000000001'; // Ajuste conforme necessário
const BARBEARIA_NOME = 'Barbearia Teste';
const TELEFONE_TESTE = '11999887766';

console.log('🧪 ====== TESTE DO AGENTE IA ======\n');
console.log(`📍 Barbearia: ${BARBEARIA_NOME}`);
console.log(`📱 Telefone teste: ${TELEFONE_TESTE}`);
console.log(`🔑 API Key: ${process.env.OPENAI_API_KEY ? 'Configurada ✅' : 'NÃO configurada ❌'}\n`);

async function testar() {
  try {
    // Teste 1: Mensagem simples
    console.log('\n📝 TESTE 1: Mensagem simples de saudação\n');
    console.log('Usuário: Olá, bom dia!');
    
    const teste1 = await processarMensagem(
      BARBEARIA_ID_TESTE,
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
      BARBEARIA_ID_TESTE,
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
    
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const dataAmanha = amanha.toISOString().split('T')[0];
    
    const teste3 = await processarMensagem(
      BARBEARIA_ID_TESTE,
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
    
    await salvarConversa(BARBEARIA_ID_TESTE, TELEFONE_TESTE, historico);
    console.log('✅ Conversa salva no banco');
    
    const conversaRecuperada = await getConversa(BARBEARIA_ID_TESTE, TELEFONE_TESTE);
    console.log('✅ Conversa recuperada:', conversaRecuperada ? 'Sucesso' : 'Falhou');
    console.log('   Mensagens no histórico:', conversaRecuperada?.historico?.length || 0);
    
    console.log('\n\n✅ ====== TODOS OS TESTES CONCLUÍDOS ======\n');
    
  } catch (err) {
    console.error('\n❌ ERRO durante os testes:', err);
    console.error('Stack:', err.stack);
  }
  
  process.exit(0);
}

// Executa os testes
testar();
