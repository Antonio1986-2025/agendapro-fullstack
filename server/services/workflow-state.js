/**
 * ============================================================
 * WORKFLOW STATE - Slot Filling Pattern
 * ============================================================
 * 
 * Gerencia o estado dos fluxos conversacionais (agendamento, cancelamento, etc.)
 * usando o padrão Slot Filling. Cada fluxo tem slots que devem ser preenchidos
 * em ordem, com validação rigorosa antes de cada operação final.
 * 
 * Estado é persistido em postgres (campo `contexto` da tabela `ai_conversas`)
 * para sobreviver a restarts, deploys e múltiplas conversas paralelas.
 * 
 * Princípios (baseado em pesquisa de produção):
 * - Workflow state ≠ Session state (separados)
 * - Validação estrita em cada slot
 * - Idempotência (não duplica agendamentos)
 * - Reset automático após sucesso
 * - À prova de alucinação (estado é JSON, não memória do LLM)
 */

import { query } from '../config/database.js';

// ============================================================
// ESTRUTURA DO ESTADO
// ============================================================

/**
 * Estado inicial vazio (template para novos fluxos)
 */
function criarEstadoInicial() {
  return {
    versao: 2,
    fluxo_ativo: null,
    iniciado_em: null,

    goal: {
      tipo: 'criar_agendamento',
      descricao: 'Coletar dados e criar um agendamento completo',
    },

    slots: {
      cliente: { preenchido: false, valor: null },
      servico: { preenchido: false, valor: null },
      profissional: { preenchido: false, valor: null },
      para_quem: { preenchido: false, valor: null },
      data: { preenchido: false, valor: null },
      horario: { preenchido: false, valor: null },
    },

    ultimo_slot_preenchido: null,

    agendamento_criado_id: null,
    agendamento_criado_em: null,

    ultima_atualizacao: null,
  };
}

export function calcularProgresso(estado) {
  if (estado.fluxo_ativo !== 'agendamento') return { concluido: false, percentual: 0, preenchidos: 0, total: ORDEM_SLOTS_AGENDAMENTO.length };
  const preenchidos = ORDEM_SLOTS_AGENDAMENTO.filter(s => estado.slots[s]?.preenchido).length;
  const total = ORDEM_SLOTS_AGENDAMENTO.length;
  return {
    concluido: preenchidos === total,
    percentual: Math.round((preenchidos / total) * 100),
    preenchidos,
    total,
  };
}

/**
 * Ordem dos slots para o fluxo de AGENDAMENTO
 */
const ORDEM_SLOTS_AGENDAMENTO = [
  'cliente',
  'servico',
  'profissional',
  'para_quem',
  'data',
  'horario',
];

// ============================================================
// PERSISTÊNCIA
// ============================================================

/**
 * Carrega o estado do banco. Se não existir, retorna estado vazio.
 */
export async function carregarEstado(barbeariaId, telefone) {
  const tel = String(telefone || '').replace(/\D/g, '');
  
  try {
    const { rows } = await query(
      `SELECT contexto FROM ai_conversas 
        WHERE barbearia_id = $1 AND cliente_telefone = $2`,
      [barbeariaId, tel]
    );
    
    if (!rows[0]?.contexto) {
      return criarEstadoInicial();
    }
    
    // Mescla com inicial para garantir que todos os slots existam
    const salvo = typeof rows[0].contexto === 'string' 
      ? JSON.parse(rows[0].contexto) 
      : rows[0].contexto;
    
    const inicial = criarEstadoInicial();
    return {
      ...inicial,
      ...salvo,
      slots: { ...inicial.slots, ...(salvo.slots || {}) },
    };
  } catch (err) {
    console.error('❌ Erro ao carregar estado:', err.message);
    return criarEstadoInicial();
  }
}

/**
 * Salva o estado no banco
 */
export async function salvarEstado(barbeariaId, telefone, estado) {
  const tel = String(telefone || '').replace(/\D/g, '');
  
  const estadoFinal = {
    ...estado,
    ultima_atualizacao: new Date().toISOString(),
  };
  
  try {
    await query(
      `INSERT INTO ai_conversas (barbearia_id, cliente_telefone, contexto, ultima_interacao)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (barbearia_id, cliente_telefone) DO UPDATE SET
          contexto = $3,
          ultima_interacao = now()`,
      [barbeariaId, tel, JSON.stringify(estadoFinal)]
    );
  } catch (err) {
    console.error('❌ Erro ao salvar estado:', err.message);
    throw err;
  }
}

// ============================================================
// MANIPULAÇÃO DE FLUXO
// ============================================================

/**
 * Inicia um fluxo (agendamento, cancelamento, etc.)
 * Reseta os slots e mantém apenas o cliente identificado.
 */
export function iniciarFluxo(estadoAtual, fluxo, clienteData = null) {
  const novo = criarEstadoInicial();
  novo.fluxo_ativo = fluxo;
  novo.iniciado_em = new Date().toISOString();

  if (fluxo === 'agendamento') {
    novo.goal = {
      tipo: 'criar_agendamento',
      descricao: 'Coletar TODOS os dados (cliente, serviço, profissional, para quem, data, horário) e finalizar criando o agendamento no banco.',
    };
  }

  if (clienteData) {
    novo.slots.cliente = {
      preenchido: true,
      valor: clienteData,
    };
  }

  return novo;
}

/**
 * Reseta o fluxo (após sucesso ou cancelamento)
 * Mantém o ID do agendamento criado para detectar duplicação
 */
export function resetarFluxo(estadoAtual, agendamentoId = null) {
  const novo = criarEstadoInicial();
  
  if (agendamentoId) {
    novo.agendamento_criado_id = agendamentoId;
    novo.agendamento_criado_em = new Date().toISOString();
  }
  
  return novo;
}

/**
 * Define o valor de um slot
 */
export function definirSlot(estado, slotName, valor) {
  if (!estado.slots[slotName]) {
    console.warn(`⚠️  Slot desconhecido: ${slotName}`);
    return estado;
  }
  
  return {
    ...estado,
    ultimo_slot_preenchido: slotName,
    slots: {
      ...estado.slots,
      [slotName]: {
        preenchido: true,
        valor,
      },
    },
  };
}

/**
 * Limpa um slot (caso cliente queira mudar de ideia)
 */
export function limparSlot(estado, slotName) {
  if (!estado.slots[slotName]) return estado;
  
  return {
    ...estado,
    slots: {
      ...estado.slots,
      [slotName]: {
        preenchido: false,
        valor: null,
      },
    },
  };
}

// ============================================================
// CONSULTAS
// ============================================================

/**
 * Verifica se o checklist do fluxo de agendamento está 100% completo
 */
export function checklistCompleto(estado) {
  if (estado.fluxo_ativo !== 'agendamento') return false;
  
  return ORDEM_SLOTS_AGENDAMENTO.every(slot => 
    estado.slots[slot]?.preenchido === true
  );
}

/**
 * Retorna o próximo slot a ser coletado.
 * Retorna 'completo' se todos os slots já foram preenchidos.
 */
export function proximoSlot(estado) {
  if (estado.fluxo_ativo !== 'agendamento') return null;
  
  for (const slot of ORDEM_SLOTS_AGENDAMENTO) {
    if (!estado.slots[slot]?.preenchido) {
      return slot;
    }
  }
  return 'completo';
}

/**
 * Verifica se há agendamento criado recentemente (proteção contra duplicação)
 */
export function temAgendamentoRecente(estado, minutosLimite = 5) {
  if (!estado.agendamento_criado_id || !estado.agendamento_criado_em) {
    return false;
  }
  
  try {
    const criadoEm = new Date(estado.agendamento_criado_em).getTime();
    const agora = Date.now();
    return (agora - criadoEm) < (minutosLimite * 60 * 1000);
  } catch {
    return false;
  }
}

/**
 * Verifica se há fluxo ativo "estagnado" (mais de X minutos sem atividade)
 * Útil para retomar conversas
 */
export function fluxoEstagnado(estado, minutosLimite = 30) {
  if (!estado.fluxo_ativo || !estado.ultima_atualizacao) return false;
  
  try {
    const ultima = new Date(estado.ultima_atualizacao).getTime();
    const agora = Date.now();
    return (agora - ultima) > (minutosLimite * 60 * 1000);
  } catch {
    return false;
  }
}

// ============================================================
// FORMATAÇÃO PARA PROMPT
// ============================================================

/**
 * Formata o estado atual como texto legível para o LLM (system prompt)
 */
export function formatarEstadoParaPrompt(estado) {
  if (!estado.fluxo_ativo) {
    if (temAgendamentoRecente(estado, 5)) {
      const minutos = Math.round((Date.now() - new Date(estado.agendamento_criado_em).getTime()) / 60000);
      return `🔔 ATENÇÃO: Cliente acabou de criar um agendamento (há ${minutos} min).
Se cliente disser "sim" ou repetir: avise que já está confirmado.
Caso contrário: escute o que ele quer e comece um novo fluxo.`;
    }
    return `📋 NENHUM FLUXO ATIVO.

Aguardando o cliente falar o que precisa.
- Se ele quiser AGENDAR → iniciarAgendamento()
- Se ele quiser CANCELAR → listarMeusAgendamentos()
- Se for PERGUNTA → consultarInfoBarbearia() ou listarServicos()
- Se for SAUDAÇÃO → cumprimente de volta e pergunte como ajudar`;
  }
  
  if (estado.fluxo_ativo === 'agendamento') {
    const slots = estado.slots;
    const progresso = calcularProgresso(estado);
    const linhas = [];

    // Nome do cliente em destaque no topo
    if (slots.cliente.preenchido && slots.cliente.valor.nome) {
      linhas.push(`👤 Cliente: ${slots.cliente.valor.nome} ← CHAME PELO NOME`);
    }
    linhas.push(`🎯 OBJETIVO: ${estado.goal?.descricao || 'Criar um agendamento'}`);
    linhas.push(`📊 PROGRESSO: ${progresso.preenchidos}/${progresso.total} (${progresso.percentual}%)`);
    linhas.push('');

    if (progresso.concluido) {
      linhas.push('✅ TODOS OS DADOS COLETADOS!');
    } else if (estado.ultimo_slot_preenchido) {
      linhas.push(`📌 Último slot preenchido: ${estado.ultimo_slot_preenchido}`);
    }
    linhas.push('');
    linhas.push('📋 CHECKLIST:');
    
    if (slots.cliente.preenchido) {
      linhas.push(`✅ Cliente: ${slots.cliente.valor.nome} (id: ${slots.cliente.valor.id})`);
    } else {
      linhas.push(`❌ Cliente: ainda não identificado`);
    }
    
    if (slots.servico.preenchido) {
      linhas.push(`✅ Serviço: ${slots.servico.valor.nome} - R$${slots.servico.valor.preco} (${slots.servico.valor.duracao}min)`);
    } else {
      linhas.push(`❌ Serviço: ainda não escolhido`);
    }
    
    if (slots.profissional.preenchido) {
      linhas.push(`✅ Profissional: ${slots.profissional.valor.nome}`);
    } else {
      linhas.push(`❌ Profissional: ainda não escolhido`);
    }
    
    if (slots.para_quem.preenchido) {
      const v = slots.para_quem.valor;
      if (v.tipo === 'proprio_cliente') {
        linhas.push(`✅ Para: o próprio cliente`);
      } else {
        linhas.push(`✅ Para: ${v.nome_pessoa} (terceiro - id: ${v.cliente_alvo_id || 'novo'})`);
      }
    } else {
      linhas.push(`❌ Para quem: ainda não definido`);
    }
    
    if (slots.data.preenchido) {
      linhas.push(`✅ Data: ${slots.data.valor.data_formatada} (${slots.data.valor.data})`);
    } else {
      linhas.push(`❌ Data: ainda não escolhida`);
    }
    
    if (slots.horario.preenchido) {
      linhas.push(`✅ Horário: ${slots.horario.valor.hora}`);
    } else {
      linhas.push(`❌ Horário: ainda não escolhido`);
    }
    
    linhas.push('');
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const prox = proximoSlot(estado);
    const proximoTexto = textoProximoPasso(prox, slots);
    linhas.push(`⬇️ PRÓXIMO PASSO:`);
    linhas.push(`${proximoTexto}`);
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return linhas.join('\n');
  }
  
  return `Fluxo: ${estado.fluxo_ativo}`;
}

/**
 * FLUXO COMPLETO E PERGUNTAS ALVO
 * 
 * Cada passo tem:
 * - PERGUNTA ALVO: o texto EXATO que deve ser usado (pode adaptar)
 * - REGRA: como se comportar
 * - PRÓXIMO: o que fazer com a resposta
 */
function textoProximoPasso(slot, slots) {
  const instrucoes = {

    cliente: `[PERGUNTA ALVO] "Pra começar, qual seu nome completo?"
[REGRA] Cliente não está cadastrado. Seja simpático e peça o nome completo (nome + sobrenome).
[PRÓXIMO] Após cliente responder, chame cadastrarClientePrincipal(nome).`,

    servico: `[PERGUNTA ALVO] "O que você vai querer fazer hoje? Temos [lista de serviços]."
[REGRA 1] Se cliente já disse o tipo (ex: "quero corte", "barba", "cabelo"), NÃO pergunte "qual serviço?".
           Já filtre: Use buscarServicoPorNome com o termo que ele disse e mostre só os relacionados.
[REGRA 2] Se cliente falou algo genérico ou não disse nada, use listarServicos e mostre TUDO.
[FORMATO] Mostre numerado:
  1. Corte Masculino - R$45 (30min)
  2. Corte e Barba - R$90 (50min)
[PRÓXIMO] Após cliente escolher (número ou nome), chame definirServico(valor).`,

    profissional: `[PERGUNTA ALVO] "Com qual profissional você prefere?"
[REGRA] Liste (listarProfissionais) numerado com especialidade:
  1. Carlos - Cortes clássicos
  2. Pedro - Degradê e barba
[PRÓXIMO] Após escolha, chame definirProfissional(valor).`,

    para_quem: `[PERGUNTA ALVO] "É pra você mesmo ou para outra pessoa?"
[REGRA] Aguarde a resposta do cliente.
[PRÓXIMO] Se for pra ele: definirParaQuem("proprio_cliente")
          Se for pra outro: definirParaQuem("terceiro", nome_da_pessoa)`,

    data: `[PERGUNTA ALVO] "Pra qual dia você gostaria de agendar?"
[REGRA] Aceite respostas naturais: "hoje", "amanhã", "sexta", "dia 15".
[PRÓXIMO] Após resposta, chame definirData(data).
          Se não entender: "Não consegui entender a data. Pode falar de outro jeito? Ex: amanhã, sexta, 15/06"`,

    horario: `[PERGUNTA ALVO] "Qual horário fica melhor pra você?"
[REGRA] Se tiver horários livres, já liste: "Tenho disponível: 9h, 9h30, 10h, 14h..."
        Se cliente pedir horário ocupado, o sistema já sugere alternativos automaticamente.
[PRÓXIMO] Após resposta, chame definirHorario(horario).`,

    completo: `[CHECKLIST COMPLETO] Todos os dados coletados!
[PERGUNTA ALVO] Mostre o resumo e pergunte:
"Tudo certo? Posso confirmar?"
[FORMATO]
  Corte Masculino - R$45
  Com Carlos
  Amanhã às 14h
  Confirma?
[PRÓXIMO] Se cliente disser "sim" → finalizarAgendamento()
          Se cliente disser "não" → pergunte o que quer mudar e use a tool "definir*" correspondente.`,
  };
  
  return instrucoes[slot] || 'Continue o fluxo normalmente.';
}

// ============================================================
// EXPORTS
// ============================================================

export {
  ORDEM_SLOTS_AGENDAMENTO,
  criarEstadoInicial,
};
