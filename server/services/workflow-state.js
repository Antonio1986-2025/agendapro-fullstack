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
    fluxo_ativo: null,            // 'agendamento' | 'cancelamento' | 'reagendamento' | null
    iniciado_em: null,            // ISO timestamp
    
    slots: {
      cliente: { preenchido: false, valor: null },
      servico: { preenchido: false, valor: null },
      profissional: { preenchido: false, valor: null },
      para_quem: { preenchido: false, valor: null },
      data: { preenchido: false, valor: null },
      horario: { preenchido: false, valor: null },
    },
    
    // Idempotência: evita criar mesmo agendamento duas vezes
    agendamento_criado_id: null,
    agendamento_criado_em: null,
    
    ultima_atualizacao: null,
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
  
  // Se temos dados do cliente, já preenche o slot
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
      return `🔔 ATENÇÃO: Cliente acabou de criar um agendamento (há ${minutos} min, ID: ${estado.agendamento_criado_id}).
Se cliente disser "sim" ou repetir confirmação, isso é redundante - já foi criado.
Caso contrário, comece um NOVO atendimento normalmente.`;
    }
    return 'NENHUM FLUXO ATIVO. Aguardando intenção do cliente.';
  }
  
  if (estado.fluxo_ativo === 'agendamento') {
    const slots = estado.slots;
    const linhas = [];
    
    linhas.push(`🔄 FLUXO ATIVO: AGENDAMENTO em andamento`);
    linhas.push('');
    linhas.push('📋 CHECKLIST:');
    
    // Cliente
    if (slots.cliente.preenchido) {
      linhas.push(`✅ Cliente: ${slots.cliente.valor.nome} (id: ${slots.cliente.valor.id})`);
    } else {
      linhas.push(`❌ Cliente: ainda não identificado`);
    }
    
    // Serviço
    if (slots.servico.preenchido) {
      linhas.push(`✅ Serviço: ${slots.servico.valor.nome} - R$${slots.servico.valor.preco} (${slots.servico.valor.duracao}min)`);
    } else {
      linhas.push(`❌ Serviço: ainda não escolhido`);
    }
    
    // Profissional
    if (slots.profissional.preenchido) {
      linhas.push(`✅ Profissional: ${slots.profissional.valor.nome}`);
    } else {
      linhas.push(`❌ Profissional: ainda não escolhido`);
    }
    
    // Para quem
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
    
    // Data
    if (slots.data.preenchido) {
      linhas.push(`✅ Data: ${slots.data.valor.data_formatada} (${slots.data.valor.data})`);
    } else {
      linhas.push(`❌ Data: ainda não escolhida`);
    }
    
    // Horário
    if (slots.horario.preenchido) {
      linhas.push(`✅ Horário: ${slots.horario.valor.hora}`);
    } else {
      linhas.push(`❌ Horário: ainda não escolhido`);
    }
    
    linhas.push('');
    
    // Próximo passo
    const prox = proximoSlot(estado);
    const proximoTexto = textoProximoPasso(prox, slots);
    linhas.push(`🎯 PRÓXIMO PASSO: ${proximoTexto}`);
    
    return linhas.join('\n');
  }
  
  return `Fluxo: ${estado.fluxo_ativo}`;
}

/**
 * Retorna instrução clara do que fazer no próximo passo
 */
function textoProximoPasso(slot, slots) {
  const instrucoes = {
    cliente: 'Cliente NÃO está cadastrado. Peça o NOME COMPLETO de forma simpática (ex: "Pra começar, qual seu nome completo?") e use cadastrarClientePrincipal(nome).',
    
    servico: 'IMPORTANTE: Se o cliente já mencionou tipo de serviço (ex: "quero corte", "quero barba"), JÁ LISTE direto os serviços relacionados sem perguntar "qual serviço?". Use buscarServicoPorNome com o termo. Se a palavra for genérica ou cliente não disse, use listarServicos. Apresente lista numerada e pergunte qual escolhe.',
    
    profissional: 'Liste profissionais (listarProfissionais) e pergunte com qual prefere. Forma natural: "Com qual barbeiro você prefere?". Use definirProfissional após escolha.',
    
    para_quem: 'Pergunte naturalmente: "É pra você mesmo ou outra pessoa?". Use definirParaQuem para registrar.',
    
    data: 'Pergunte data de forma simpática: "Pra qual dia? Hoje, amanhã ou outro dia?". Use definirData.',
    
    horario: 'Pergunte horário: "Tem preferência de horário?". Quando cliente disser, use definirHorario - ele valida disponibilidade. Se ocupado, sugere alternativas próximas.',
    
    completo: 'TODOS OS DADOS COLETADOS! Mostre resumo curto e simpático, peça confirmação. Após "sim", use finalizarAgendamento.',
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
