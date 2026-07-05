/**
 * Teste de regressão para o detector de loop do Agente IA (server/services/ai.js)
 *
 * Cenários:
 * 1. Fluxo normal sem repetição → não deve detectar loop
 * 2. Loop consecutivo (A,A) → deve detectar
 * 3. Loop alternado (A,B,A,B) → deve detectar
 * 4. Correção legítima (mesma tool, args diferentes) → não deve detectar
 */

let passou = 0;
let falhou = 0;

function assert(cond, msg) {
  if (cond) {
    passou++;
    console.log(`  ✅ ${msg}`);
  } else {
    falhou++;
    console.error(`  ❌ ${msg}`);
  }
}

// Simula o detector de loop (mesma lógica que agora está em ai.js)
function simularConversa(rodadas) {
  const toolSignatures = [];

  for (let i = 0; i < rodadas.length; i++) {
    const toolResults = rodadas[i];

    for (const tr of toolResults) {
      const sig = `${tr.name}|${JSON.stringify(tr.args)}|${JSON.stringify(tr.resultado)}`;
      if (toolSignatures.includes(sig)) {
        return { loop: true, iteracao: i, tool: tr.name };
      }
      toolSignatures.push(sig);
    }
  }

  return { loop: false };
}

// ───── CENÁRIO 1: Fluxo normal (sem repetição) ─────
console.log('\n📋 Cenário 1: Fluxo normal sem repetição');
{
  const rodadas = [
    [{ name: 'listarServicos', args: {}, resultado: { servicos: ['corte', 'barba'] } }],
    [{ name: 'definirServico', args: { servico: 'corte' }, resultado: { sucesso: true } }],
    [{ name: 'listarProfissionais', args: {}, resultado: { profissionais: ['Carlos'] } }],
  ];
  const res = simularConversa(rodadas);
  assert(!res.loop, 'Não deve detectar loop em fluxo normal');
}

// ───── CENÁRIO 2: Loop consecutivo (A,A) ─────
console.log('\n📋 Cenário 2: Loop consecutivo (mesma tool, mesmos args/resultado)');
{
  const rodadas = [
    [{ name: 'listarServicos', args: {}, resultado: { servicos: ['corte', 'barba'] } }],
    [{ name: 'listarServicos', args: {}, resultado: { servicos: ['corte', 'barba'] } }],
  ];
  const res = simularConversa(rodadas);
  assert(res.loop, 'Deve detectar loop consecutivo');
  assert(res.tool === 'listarServicos', 'Tool do loop deve ser listarServicos');
}

// ───── CENÁRIO 3: Loop alternado (A,B,A,B) ─────
console.log('\n📋 Cenário 3: Loop alternado (A,B,A,B)');
{
  const rodadas = [
    [{ name: 'listarServicos', args: {}, resultado: { servicos: ['corte', 'barba'] } }],
    [{ name: 'listarProfissionais', args: {}, resultado: { profissionais: ['Carlos'] } }],
    [{ name: 'listarServicos', args: {}, resultado: { servicos: ['corte', 'barba'] } }],
  ];
  const res = simularConversa(rodadas);
  assert(res.loop, 'Deve detectar loop alternado (A,B,A)');
}

// ───── CENÁRIO 4: Correção legítima (mesma tool, args diferentes) ─────
console.log('\n📋 Cenário 4: Correção legítima (mesma tool, args diferentes)');
{
  const rodadas = [
    [{ name: 'definirData', args: { data: '2026-07-10' }, resultado: { sucesso: false, erro: 'data passada' } }],
    [{ name: 'definirData', args: { data: '2026-07-11' }, resultado: { sucesso: true, data: '2026-07-11' } }],
  ];
  const res = simularConversa(rodadas);
  assert(!res.loop, 'Não deve detectar loop em correção legítima (args diferentes)');
}

// ───── RESUMO ─────
console.log('\n' + '='.repeat(40));
console.log(`Resultados: ${passou} passaram, ${falhou} falharam`);
console.log('='.repeat(40));

if (falhou > 0) {
  console.error('\n❌ ALGUNS TESTES FALHARAM — não commitar sem revisar');
  process.exit(1);
} else {
  console.log('\n✅ TODOS OS TESTES PASSARAM');
}
