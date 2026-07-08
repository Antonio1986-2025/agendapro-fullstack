/**
 * ============================================================
 * AGENTE IA - SLOT FILLING PATTERN
 * ============================================================
 * 
 * Sistema de agente conversacional usando padrão Slot Filling.
 * Cada conversa tem um ESTADO (workflow state) persistido em postgres.
 * O LLM cuida da linguagem natural; o sistema cuida da lógica determinística.
 * 
 * Arquitetura inspirada em: Google Dialogflow CX, LangGraph, OpenAI Cookbook.
 */

import OpenAI, { toFile } from 'openai';
import { query } from '../config/database.js';
import * as ws from './workflow-state.js';

let _openai = null;

function getOpenAI() {
  if (_openai) return _openai;
  
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('❌ OPENAI_API_KEY não encontrada!');
    return null;
  }
  
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  const nomeProvedor = baseURL ? new URL(baseURL).hostname : 'OpenAI';
  
  try {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: baseURL, timeout: 30000, maxRetries: 2 });
    console.log(`✅ ${nomeProvedor} cliente inicializado`);
  } catch (err) {
    console.error(`❌ Erro ao inicializar ${nomeProvedor}:`, err.message);
    return null;
  }
  
  return _openai;
}

/**
 * Transcreve áudio (Buffer) para texto usando OpenAI Whisper
 */
export async function transcreverAudio(buffer, mimetype = 'audio/mp4') {
  const ai = getOpenAI();
  if (!ai) throw new Error('OpenAI não configurado');

  const ext = mimetype.includes('ogg') ? 'ogg' : mimetype.includes('webm') ? 'webm' : 'mp4';
  console.log(`🎙️ [Whisper] Transcrevendo: ${buffer.length} bytes, mimetype: ${mimetype}, ext: ${ext}`);
  
  const file = await toFile(buffer, `audio.${ext}`, { type: mimetype });

  const transcription = await ai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
  });

  console.log(`🎙️ [Whisper] Resultado: ${transcription.text ? transcription.text.substring(0, 80) + '...' : 'vazio'}`);
  return transcription.text || '';
}

// ============================================================
// HELPERS DE PARSING / VALIDAÇÃO
// ============================================================

/**
 * Parse de data natural: "hoje", "amanhã", "23/06", "2026-06-23"
 */
function parsearData(input) {
  if (!input) return null;
  const str = String(input).toLowerCase().trim();
  const hoje = agoraSP();
  hoje.setHours(0, 0, 0, 0);

  // Hoje
  if (str === 'hoje') {
    return formatarDataYMD(hoje);
  }

  // Amanhã
  if (str === 'amanha' || str === 'amanhã') {
    const d = new Date(hoje);
    d.setDate(d.getDate() + 1);
    return formatarDataYMD(d);
  }

  // Depois de amanhã
  if (str.includes('depois de amanha') || str.includes('depois de amanhã')) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + 2);
    return formatarDataYMD(d);
  }

  // "daqui a X dias/semanas"
  const daquiMatch = str.match(/daqui\s+a\s+(\d+)\s+(dia|semana|mes)/);
  if (daquiMatch) {
    const qtd = parseInt(daquiMatch[1], 10);
    const unidade = daquiMatch[2];
    const d = new Date(hoje);
    if (unidade === 'dia') d.setDate(d.getDate() + qtd);
    else if (unidade === 'semana') d.setDate(d.getDate() + (qtd * 7));
    else if (unidade === 'mes') d.setMonth(d.getMonth() + qtd);
    return formatarDataYMD(d);
  }

  // "próxima semana", "semana que vem"
  if (str.includes('próxima semana') || str.includes('proxima semana') || str.includes('semana que vem')) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + 7);
    // Pega segunda-feira da próxima semana
    const diffSegunda = (1 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diffSegunda);
    return formatarDataYMD(d);
  }

  // "final de semana", "fim de semana"
  if (str.includes('final de semana') || str.includes('fim de semana')) {
    const d = new Date(hoje);
    // Próximo sábado
    const diffSabado = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diffSabado);
    return formatarDataYMD(d);
  }

  // "mês que vem", "mes que vem"
  if (str.includes('mês que vem') || str.includes('mes que vem')) {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return formatarDataYMD(d);
  }

  // Dias da semana
  const diasSemana = {
    'domingo': 0, 'segunda': 1, 'terca': 2, 'terça': 2,
    'quarta': 3, 'quinta': 4, 'sexta': 5, 'sabado': 6, 'sábado': 6,
  };
  for (const [nome, num] of Object.entries(diasSemana)) {
    if (str.includes(nome)) {
      const d = new Date(hoje);
      const diff = (num - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return formatarDataYMD(d);
    }
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // DD/MM/YYYY ou DD/MM
  const matchBr = str.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (matchBr) {
    const dia = parseInt(matchBr[1], 10);
    const mes = parseInt(matchBr[2], 10);
    let ano = matchBr[3] ? parseInt(matchBr[3], 10) : hoje.getFullYear();
    if (ano < 100) ano += 2000;

    const d = new Date(ano, mes - 1, dia);
    if (d.getDate() === dia && d.getMonth() === mes - 1) {
      return formatarDataYMD(d);
    }
  }

  return null;
}

function formatarDataYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatarDataLegivel(ymd) {
  if (!ymd) return '';
  const d = new Date(ymd + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { 
    weekday: 'long', day: '2-digit', month: 'long' 
  });
}

// Retorna Date ajustada para America/Sao_Paulo (evita mismatch de timezone)
function agoraSP() {
  const now = new Date();
  const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return sp;
}

/**
 * Parse de horário: "14h", "14:00", "14h30", "14:30", "9 da manhã"
 */
function parsearHorario(input) {
  if (!input) return null;
  const str = String(input).toLowerCase().trim().replace(/\s+/g, '');

  // "14:00", "9:30"
  let m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }

  // "14h30", "9h00"
  m = str.match(/^(\d{1,2})h(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }

  // "14h", "9h"
  m = str.match(/^(\d{1,2})h$/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  // "14", "9" (apenas hora)
  m = str.match(/^(\d{1,2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (h >= 6 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  // "meio-dia" / "meiodia"
  if (str === 'meio-dia' || str === 'meiodia' || str === 'meiop' || str === '12h') return '12:00';

  // "da manhã" / "manha" (9h como padrão)
  if (str.includes('manha') || str.includes('manhã') || str.includes('de_manha')) return '09:00';

  // "da tarde" / "tarde" (14h como padrão)
  if (str.includes('tarde') || str.includes('de_tarde')) return '14:00';

  // "da noite" / "noite" (19h como padrão)
  if (str.includes('noite') || str.includes('de_noite')) return '19:00';

  return null;
}

/**
 * Resolve serviço: aceita UUID, nome ou número de posição
 */
async function resolverServico(barbeariaId, valor) {
  if (!valor) return null;
  const valorStr = String(valor).trim();

  // UUID válido?
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valorStr)) {
    const { rows } = await query(
      `SELECT id, nome, duracao_minutos, preco, categoria FROM servicos
        WHERE id = $1 AND barbearia_id = $2 AND ativo = true`,
      [valorStr, barbeariaId]
    );
    return rows[0] || null;
  }

  // Lista de serviços ativos
  const { rows: lista } = await query(
    `SELECT id, nome, duracao_minutos, preco, categoria FROM servicos
      WHERE barbearia_id = $1 AND ativo = true ORDER BY categoria, nome`,
    [barbeariaId]
  );

  if (lista.length === 0) return null;

  // Número de posição
  if (/^\d+$/.test(valorStr)) {
    const idx = parseInt(valorStr, 10) - 1;
    if (idx >= 0 && idx < lista.length) {
      return lista[idx];
    }
  }

  const valorLower = valorStr.toLowerCase();

  // Sinônimos comuns para barbearias
  const sinonimos = {
    'corte': ['corte masculino', 'corte'],
    'cabelo': ['corte masculino', 'corte'],
    'barba': ['barba'],
    'corte e barba': ['corte e barba'],
    'combo': ['corte e barba'],
    'sobrancelha': ['sobrancelha'],
    'luzes': ['luzes'],
    'hidratacao': ['hidratação', 'hidratacao'],
    'hidratação': ['hidratação', 'hidratacao'],
    'progressiva': ['progressiva'],
    'alisamento': ['alisamento', 'progressiva'],
    'pintura': ['pintura', 'coloração', 'coloracao'],
    'coloracao': ['coloração', 'coloracao', 'pintura'],
    'meia barba': ['meia barba', 'corte meia barba'],
    'infantil': ['infantil', 'corte infantil'],
    'tesoura': ['corte na tesoura', 'tesoura'],
    'maquina': ['corte na máquina', 'corte na maquina', 'máquina'],
  };

  // Tenta sinônimo primeiro
  const chavesSinonimo = Object.keys(sinonimos);
  for (const chave of chavesSinonimo) {
    if (valorLower.includes(chave)) {
      const alvos = sinonimos[chave];
      for (const alvo of alvos) {
        const match = lista.find(s => s.nome.toLowerCase().includes(alvo));
        if (match) return match;
      }
    }
  }

  // Match exato
  const exato = lista.find(s => s.nome.toLowerCase() === valorLower);
  if (exato) return exato;

  // Match parcial (nome contém valor)
  const parcial = lista.find(s => s.nome.toLowerCase().includes(valorLower));
  if (parcial) return parcial;

  // Busca por palavra-chave (qualquer palavra do nome)
  const palavras = valorLower.split(/\s+/).filter(p => p.length > 2);
  for (const p of palavras) {
    const m = lista.find(s => s.nome.toLowerCase().includes(p));
    if (m) return m;
  }

  return null;
}

/**
 * Resolve profissional: aceita UUID, nome ou número de posição
 */
async function resolverProfissional(barbeariaId, valor) {
  if (!valor) return null;
  const valorStr = String(valor).trim();
  
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valorStr)) {
    const { rows } = await query(
      `SELECT id, nome, especialidade, telefone FROM profissionais
        WHERE id = $1 AND barbearia_id = $2 AND ativo = true`,
      [valorStr, barbeariaId]
    );
    return rows[0] || null;
  }
  
  const { rows: lista } = await query(
    `SELECT id, nome, especialidade, telefone FROM profissionais
      WHERE barbearia_id = $1 AND ativo = true ORDER BY ordem, nome`,
    [barbeariaId]
  );
  
  if (lista.length === 0) return null;
  
  if (/^\d+$/.test(valorStr)) {
    const idx = parseInt(valorStr, 10) - 1;
    if (idx >= 0 && idx < lista.length) return lista[idx];
  }
  
  const valorLower = valorStr.toLowerCase();
  const exato = lista.find(p => p.nome.toLowerCase() === valorLower);
  if (exato) return exato;
  
  const parcial = lista.find(p => p.nome.toLowerCase().includes(valorLower));
  if (parcial) return parcial;
  
  return null;
}

/**
 * Busca cliente por telefone de forma consistente.
 * Usa apenas dígitos e busca pelos últimos 11 dígitos para
 * lidar com variações de formato (c/ ou s/ código do país).
 */
async function buscarClientePorTelefone(barbeariaId, telefone) {
  if (!telefone) return null;
  const tel = String(telefone).replace(/\D/g, '');
  const ultimos11 = tel.slice(-11);
  if (ultimos11.length < 10) return null;

  const { rows } = await query(
    `SELECT id, nome, telefone FROM clientes
      WHERE barbearia_id = $1
        AND REPLACE(telefone, '-', '') LIKE $2
      LIMIT 1`,
    [barbeariaId, `%${ultimos11}`]
  );
  return rows[0] || null;
}

// ============================================================
// DEFINIÇÃO DAS TOOLS
// ============================================================

const tools = [
  // ───── FLUXO DE AGENDAMENTO ─────
  {
    type: 'function',
    function: {
      name: 'iniciarAgendamento',
      description: 'Inicia um novo fluxo de agendamento. Use quando cliente expressar intenção de agendar (ex: "quero agendar", "marcar horário", "quero corte"). Reseta qualquer estado anterior e identifica o cliente automaticamente pelo telefone.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrarClientePrincipal',
      description: 'Cadastra o CLIENTE QUE ESTÁ CONVERSANDO (telefone do WhatsApp atual). Use quando cliente é novo e forneceu o nome. Não use para cadastrar terceiros (usar definirParaQuem com tipo=terceiro para isso).',
      parameters: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            description: 'Nome completo do cliente que está conversando agora',
          },
        },
        required: ['nome'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirServico',
      description: 'Define o serviço escolhido para o agendamento em andamento. Aceita: UUID, nome do serviço (ou parte dele), ou número da posição na lista (ex: "1"). Sistema valida na base e atualiza o checklist.',
      parameters: {
        type: 'object',
        properties: {
          servico: { type: 'string', description: 'Identificador do serviço: UUID, nome ou número de posição' },
        },
        required: ['servico'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirProfissional',
      description: 'Define o profissional escolhido para o agendamento em andamento. Aceita UUID, nome ou número da posição na lista.',
      parameters: {
        type: 'object',
        properties: {
          profissional: { type: 'string', description: 'Identificador do profissional: UUID, nome ou número de posição' },
        },
        required: ['profissional'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirParaQuem',
      description: 'Define para quem é o agendamento. Use após perguntar "É para você ou outra pessoa?".',
      parameters: {
        type: 'object',
        properties: {
          tipo: {
            type: 'string',
            enum: ['proprio_cliente', 'terceiro'],
            description: '"proprio_cliente" se for para o próprio cliente que está conversando. "terceiro" se for para outra pessoa.',
          },
          nome_pessoa: {
            type: 'string',
            description: 'Nome COMPLETO da pessoa (obrigatório se tipo="terceiro"). Será cadastrado como cliente.',
          },
        },
        required: ['tipo'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirData',
      description: 'Define a data do agendamento. Aceita formatos: "hoje", "amanhã", "sexta", "23/06", "2026-06-23".',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data em formato natural ou ISO' },
        },
        required: ['data'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'definirHorario',
      description: 'Define o horário do agendamento. Sistema VERIFICA disponibilidade real automaticamente. Se ocupado, retorna horários alternativos próximos. Aceita: "14h", "14:00", "14h30".',
      parameters: {
        type: 'object',
        properties: {
          horario: { type: 'string', description: 'Horário em formato natural ou HH:MM' },
        },
        required: ['horario'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalizarAgendamento',
      description: 'Finaliza e CRIA o agendamento na base de dados. SÓ FUNCIONA se o checklist estiver 100% completo. Use APENAS após cliente confirmar todos os dados com "sim".',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelarFluxoAtual',
      description: 'Cancela o fluxo de agendamento em andamento. Use se cliente desistir explicitamente ou quiser começar do zero.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  
  // ───── QUERIES (não modificam estado) ─────
  {
    type: 'function',
    function: {
      name: 'listarServicos',
      description: 'Lista todos os serviços disponíveis. Use para mostrar opções ao cliente.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listarProfissionais',
      description: 'Lista todos os profissionais ativos.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultarHorariosLivres',
      description: 'Consulta horários disponíveis em uma data específica. IMPORTANTE: passe a duração do serviço escolhido para resultados precisos. Sempre passe duracao_minutos quando o cliente já tiver escolhido um serviço.',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data em formato natural ou ISO' },
          profissional: { type: 'string', description: 'Profissional opcional (UUID, nome ou posição)' },
          duracao_minutos: { type: 'number', description: 'Duração do serviço em minutos (ex: 30, 60). Use o valor do serviço já escolhido.' },
        },
        required: ['data'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultarInfoBarbearia',
      description: 'Retorna informações da barbearia (endereço, horário de funcionamento, contato). Use para perguntas tipo "onde fica?", "que horas abrem?".',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  
  // ───── OUTROS FLUXOS ─────
  {
    type: 'function',
    function: {
      name: 'listarMeusAgendamentos',
      description: 'Lista os agendamentos futuros do cliente que está conversando. Retorna array com id (UUID), data_hora, servico_nome, profissional_nome. IMPORTANTE: Extraia o campo "id" de cada agendamento para usar em cancelarAgendamentoExistente ou reagendarAgendamento.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelarAgendamentoExistente',
      description: 'CANCELA DEFINITIVAMENTE um agendamento existente. ATENÇÃO: SÓ use APÓS o cliente recusar explicitamente a opção de remarcar. SEMPRE ofereça remarcar primeiro chamando reagendarAgendamento. Se o cliente apenas disse "quero cancelar", NÃO chame esta tool ainda — primeiro pergunte se ele prefere remarcar.',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: { type: 'string', description: 'UUID do agendamento a cancelar' },
          confirmacao_explicita: {
            type: 'boolean',
            description: 'Cliente confirmou EXPLICITAMENTE que quer cancelar e NÃO quer remarcar? (deve ser true)',
          },
        },
        required: ['agendamento_id', 'confirmacao_explicita'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reagendarAgendamento',
      description: 'Altera a data e/ou horário de um agendamento existente (mantém serviço, profissional e cliente). Use quando cliente quer remarcar (mudar data/hora) ao invés de cancelar.',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: { type: 'string', description: 'UUID do agendamento a reagendar' },
          nova_data: { type: 'string', description: 'Nova data (YYYY-MM-DD ou "hoje", "amanhã", "sexta")' },
          novo_horario: { type: 'string', description: 'Novo horário (HH:MM, "14h", "14:00")' },
        },
        required: ['agendamento_id', 'nova_data', 'novo_horario'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrarSolicitacaoEspecial',
      description: 'Registra uma solicitação de serviço NÃO CATALOGADO (ex: hidratação, luzes, progressiva) e notifica o RESPONSÁVEL para entrar em contato. Use quando buscarServicoPorNome não encontrar o serviço mesmo após tentar sinônimos.',
      parameters: {
        type: 'object',
        properties: {
          servico_solicitado: { type: 'string', description: 'Nome do serviço que o cliente pediu' },
          observacoes: { type: 'string', description: 'Detalhes adicionais sobre o que o cliente quer' },
        },
        required: ['servico_solicitado'],
        additionalProperties: false,
      },
    },
  },
  // ───── RECUPERAÇÃO / DIAGNÓSTICO ─────
  {
    type: 'function',
    function: {
      name: 'verificarEstadoAtual',
      description: 'CONSULTA O ESTADO ATUAL no banco de dados e retorna o checklist completo, o progresso do goal e qual o próximo passo. Use SEMPRE que estiver em dúvida sobre o que já foi preenchido ou quando achar que o estado pode estar inconsistente. Esta tool lê direto do banco, ignorando qualquer "memória" que você tenha.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  // ───── HISTÓRICO DO CLIENTE ─────
  {
    type: 'function',
    function: {
      name: 'buscarHistoricoCliente',
      description: 'Busca o histórico do cliente: total de visitas, último serviço, último profissional, agendamento próximo. Use para personalizar a conversa (ex: "Vi que você já cortou com o Luiz antes!"). Chame quando o cliente for identificado.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  // ───── FALLBACK PARA HUMANO ─────
  {
    type: 'function',
    function: {
      name: 'transferirParaHumano',
      description: 'Transfere a conversa para um atendente humano. Use quando: não consegue resolver, cliente está frustrado, pergunta complexa, ou cliente pede para falar com alguém. Envia notificação ao responsável.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Motivo da transferência (ex: "cliente frustrado", "dúvida complexa")' },
        },
        required: ['motivo'],
        additionalProperties: false,
      },
    },
  },
  // ───── RESPOSTA AO CLIENTE (tool de saída obrigatória) ─────
  {
    type: 'function',
    function: {
      name: 'responderCliente',
      description: 'Envia uma mensagem de texto para o cliente. SEMPRE use esta tool para dar a resposta final depois de coletar os dados necessários nas outras tools. NUNCA responda ao cliente sem antes consultar os dados do banco com as tools apropriadas.',
      parameters: {
        type: 'object',
        properties: {
          mensagem: { type: 'string', description: 'A mensagem completa a ser enviada ao cliente. Seja natural, direto e inclua apenas informações verificadas nas tools.' },
        },
        required: ['mensagem'],
        additionalProperties: false,
      },
    },
  },
];

// Tools que consultam a base de dados (fonte da verdade)
const DATA_TOOLS = [
  'listarServicos', 'listarProfissionais', 'consultarHorariosLivres',
  'consultarInfoBarbearia', 'buscarHistoricoCliente', 'listarMeusAgendamentos',
  'verificarEstadoAtual',
];

// ============================================================
// EXECUÇÃO DAS TOOLS
// ============================================================

/**
 * Executa uma tool. Recebe o estado atual (que pode ser modificado).
 * Retorna { resultado, novoEstado }.
 */
async function executarTool(ctx, toolName, args) {
  const { barbeariaId, telefone, estado } = ctx;
  console.log(`🔧 ${toolName}`, JSON.stringify(args));
  
  // Marca que uma data tool foi consultada (usado pela validação do responderCliente)
  if (DATA_TOOLS.includes(toolName)) {
    ctx.consultouBase = true;
  }
  
  try {
    switch (toolName) {
      // ───── INICIAR ─────
      case 'iniciarAgendamento': {
        const clienteData = await buscarClientePorTelefone(barbeariaId, telefone);
        const novoEstado = ws.iniciarFluxo(estado, 'agendamento', clienteData);
        
        console.log(`   ✅ Fluxo iniciado. Cliente: ${clienteData ? clienteData.nome : 'não cadastrado ainda'}`);
        
        return {
          resultado: {
            sucesso: true,
            cliente_identificado: !!clienteData,
            cliente: clienteData,
            mensagem: clienteData 
              ? `Fluxo iniciado. Cliente identificado: ${clienteData.nome}` 
              : 'Fluxo iniciado. Cliente NOVO - peça o nome COMPLETO e use cadastrarClientePrincipal.',
          },
          novoEstado,
        };
      }
      
      // ───── CADASTRAR CLIENTE PRINCIPAL (quem está conversando) ─────
      case 'cadastrarClientePrincipal': {
        if (estado.fluxo_ativo !== 'agendamento') {
          return { resultado: { erro: 'Inicie o fluxo de agendamento primeiro com iniciarAgendamento.' } };
        }
        
        const nome = String(args.nome || '').trim();
        if (nome.length < 2) {
          return { resultado: { erro: 'Nome inválido. Peça o nome COMPLETO.' } };
        }
        
        const tel = String(telefone || '').replace(/\D/g, '');
        
        // UPSERT atômico: tenta insert, se conflito (23505), faz update do nome + incrementa visitas
        let clienteId, clienteNome;
        const { rows: upsertado } = await query(
          `INSERT INTO clientes (barbearia_id, nome, telefone, total_visitas)
           VALUES ($1, $2, $3, 1)
           ON CONFLICT (barbearia_id, telefone) DO UPDATE SET
              nome = CASE WHEN clientes.nome = $2 THEN clientes.nome ELSE $2 END,
              total_visitas = clientes.total_visitas + 1
           RETURNING id, nome, total_visitas`,
          [barbeariaId, nome, tel]
        );
        
        if (upsertado[0]) {
          clienteId = upsertado[0].id;
          clienteNome = upsertado[0].nome;
          const isNovo = upsertado[0].total_visitas === 1;
          console.log(`   ${isNovo ? '✅ Cliente cadastrado' : 'ℹ️  Cliente já existia'}: ${clienteNome} (visitas: ${upsertado[0].total_visitas})`);
        }
        
        const novoEstado = ws.definirSlot(estado, 'cliente', {
          id: clienteId,
          nome: clienteNome,
        });
        
        return {
          resultado: {
            sucesso: true,
            cliente: { id: clienteId, nome: clienteNome },
            mensagem: `Cliente ${clienteNome} cadastrado/identificado. Continue para o próximo passo.`,
          },
          novoEstado,
        };
      }
      
      // ───── SLOT: SERVIÇO ─────
      case 'definirServico': {
        if (estado.fluxo_ativo !== 'agendamento') {
          return { resultado: { erro: 'Nenhum fluxo de agendamento ativo. Use iniciarAgendamento primeiro.' } };
        }
        
        const servico = await resolverServico(barbeariaId, args.servico);
        if (!servico) {
          return {
            resultado: {
              erro: `Serviço "${args.servico}" não encontrado.`,
              dica: 'Use listarServicos para ver opções disponíveis.',
            },
          };
        }
        
        const novoEstado = ws.definirSlot(estado, 'servico', {
          id: servico.id,
          nome: servico.nome,
          preco: parseFloat(servico.preco),
          duracao: servico.duracao_minutos,
        });
        
        console.log(`   ✅ Serviço definido: ${servico.nome}`);
        
        return {
          resultado: {
            sucesso: true,
            servico: { nome: servico.nome, preco: parseFloat(servico.preco) },
            mensagem: `Serviço "${servico.nome}" registrado no checklist.`,
          },
          novoEstado,
        };
      }
      
      // ───── SLOT: PROFISSIONAL ─────
      case 'definirProfissional': {
        if (estado.fluxo_ativo !== 'agendamento') {
          return { resultado: { erro: 'Nenhum fluxo ativo. Use iniciarAgendamento primeiro.' } };
        }
        
        const prof = await resolverProfissional(barbeariaId, args.profissional);
        if (!prof) {
          return {
            resultado: {
              erro: `Profissional "${args.profissional}" não encontrado.`,
              dica: 'Use listarProfissionais para ver opções.',
            },
          };
        }
        
        const novoEstado = ws.definirSlot(estado, 'profissional', {
          id: prof.id,
          nome: prof.nome,
          especialidade: prof.especialidade,
        });
        
        console.log(`   ✅ Profissional definido: ${prof.nome}`);
        
        return {
          resultado: {
            sucesso: true,
            profissional: { nome: prof.nome, especialidade: prof.especialidade },
            mensagem: `Profissional ${prof.nome} registrado no checklist.`,
          },
          novoEstado,
        };
      }
      
      // ───── SLOT: PARA QUEM ─────
      case 'definirParaQuem': {
        if (estado.fluxo_ativo !== 'agendamento') {
          return { resultado: { erro: 'Nenhum fluxo ativo.' } };
        }
        
        const tipo = args.tipo;
        if (!['proprio_cliente', 'terceiro'].includes(tipo)) {
          return { resultado: { erro: 'tipo deve ser "proprio_cliente" ou "terceiro"' } };
        }
        
        let valor;
        
        if (tipo === 'proprio_cliente') {
          if (!estado.slots.cliente.preenchido) {
            const clienteData = await buscarClientePorTelefone(barbeariaId, telefone);
            if (!clienteData) {
              return {
                resultado: {
                  erro: 'Cliente principal ainda não foi identificado/cadastrado. Cadastre o cliente primeiro com cadastrarClientePrincipal.',
                },
              };
            }
            const estadoComCliente = ws.definirSlot(estado, 'cliente', { id: clienteData.id, nome: clienteData.nome });
            valor = { tipo: 'proprio_cliente', cliente_alvo_id: clienteData.id };
            const novoEstado = ws.definirSlot(estadoComCliente, 'para_quem', valor);
            return {
              resultado: { sucesso: true, mensagem: 'Agendamento será para o próprio cliente.' },
              novoEstado,
            };
          }
          valor = { tipo: 'proprio_cliente', cliente_alvo_id: estado.slots.cliente.valor.id };
        } else {
          if (!args.nome_pessoa || args.nome_pessoa.trim().length < 2) {
            return {
              resultado: { erro: 'Para agendamento de terceiro, forneça nome_pessoa (nome completo da pessoa).' },
            };
          }

          const nomeTerceiro = args.nome_pessoa.trim();
          const nomeNormalizado = nomeTerceiro.toLowerCase().replace(/\s+/g, '_');

          // UPSERT: busca por nome + barbearia; se existir, incrementa visitas; senão, cria
          const tel = String(telefone || '').replace(/\D/g, '');
          const telTerceiro = tel ? `${tel}-t` : `terceiro-${nomeNormalizado}`;

          const { rows: upsertado } = await query(
            `INSERT INTO clientes (barbearia_id, nome, telefone, total_visitas)
             VALUES ($1, $2, $3, 1)
             ON CONFLICT (barbearia_id, telefone) DO UPDATE SET
                total_visitas = clientes.total_visitas + 1
             RETURNING id`,
            [barbeariaId, nomeTerceiro, telTerceiro]
          );

          const clienteAlvoId = upsertado[0].id;

          valor = {
            tipo: 'terceiro',
            cliente_alvo_id: clienteAlvoId,
            nome_pessoa: nomeTerceiro,
          };
        }
        
        const novoEstado = ws.definirSlot(estado, 'para_quem', valor);
        console.log(`   ✅ Para quem: ${tipo}${args.nome_pessoa ? ' (' + args.nome_pessoa + ')' : ''}`);
        
        return {
          resultado: { sucesso: true, valor, mensagem: 'Para quem é o agendamento foi registrado.' },
          novoEstado,
        };
      }
      
      // ───── SLOT: DATA ─────
      case 'definirData': {
        if (estado.fluxo_ativo !== 'agendamento') {
          return { resultado: { erro: 'Nenhum fluxo ativo.' } };
        }
        
        const dataYMD = parsearData(args.data);
        if (!dataYMD) {
          return {
            resultado: { erro: `Não consegui entender a data "${args.data}". Use formatos como "hoje", "amanhã", "sexta", "23/06".` },
          };
        }
        
        // Não pode ser no passado
        const hoje = agoraSP();
        hoje.setHours(0, 0, 0, 0);
        const dataObj = new Date(dataYMD + 'T12:00:00');
        if (dataObj < hoje) {
          return { resultado: { erro: 'Não é possível agendar em data passada.' } };
        }
        
        const novoEstado = ws.definirSlot(estado, 'data', {
          data: dataYMD,
          data_formatada: formatarDataLegivel(dataYMD),
        });
        
        // Quando data muda, limpa horário (precisa revalidar)
        const estadoFinal = ws.limparSlot(novoEstado, 'horario');
        
        console.log(`   ✅ Data: ${dataYMD}`);
        
        return {
          resultado: {
            sucesso: true,
            data: dataYMD,
            data_formatada: formatarDataLegivel(dataYMD),
            mensagem: `Data ${formatarDataLegivel(dataYMD)} registrada.`,
          },
          novoEstado: estadoFinal,
        };
      }
      
      // ───── SLOT: HORÁRIO ─────
      case 'definirHorario': {
        if (estado.fluxo_ativo !== 'agendamento') {
          return { resultado: { erro: 'Nenhum fluxo ativo.' } };
        }
        
        if (!estado.slots.profissional.preenchido) {
          return { resultado: { erro: 'Defina o profissional antes do horário.' } };
        }
        if (!estado.slots.data.preenchido) {
          return { resultado: { erro: 'Defina a data antes do horário.' } };
        }
        
        const hora = parsearHorario(args.horario);
        if (!hora) {
          return {
            resultado: { erro: `Não consegui entender o horário "${args.horario}". Use formatos como "14h", "14:00", "14h30".` },
          };
        }
        
        // Verifica disponibilidade real
        const data = estado.slots.data.valor.data;
        const profId = estado.slots.profissional.valor.id;
        const duracao = estado.slots.servico.valor.duracao || 30;
        
        const disponiveis = await calcularHorariosDisponiveis(barbeariaId, data, profId, duracao);
        
        if (!disponiveis.includes(hora)) {
          // Sugere horários próximos
          const proximos = sugerirHorariosProximos(disponiveis, hora);
          return {
            resultado: {
              erro: `Horário ${hora} não está disponível para ${estado.slots.profissional.valor.nome} em ${formatarDataLegivel(data)}.`,
              horarios_alternativos: proximos,
              dica: `Sugira ao cliente um destes horários próximos: ${proximos.join(', ')}`,
            },
          };
        }
        
        const novoEstado = ws.definirSlot(estado, 'horario', { hora });
        console.log(`   ✅ Horário: ${hora} (disponível)`);
        
        return {
          resultado: {
            sucesso: true,
            hora,
            mensagem: `Horário ${hora} confirmado como disponível.`,
          },
          novoEstado,
        };
      }
      
      // ───── FINALIZAR (CRIAR AGENDAMENTO) ─────
      case 'finalizarAgendamento': {
        // Idempotência: já foi criado? (verifica no banco, sem janela de tempo)
        if (estado.agendamento_criado_id) {
          const { rows } = await query(
            `SELECT a.id, a.data_hora, c.nome AS cliente_nome,
                    s.nome AS servico_nome, p.nome AS profissional_nome, a.preco
               FROM agendamentos a
               LEFT JOIN clientes c ON c.id = a.cliente_id
               LEFT JOIN servicos s ON s.id = a.servico_id
               LEFT JOIN profissionais p ON p.id = a.profissional_id
              WHERE a.id = $1 AND a.status NOT IN ('cancelado')`,
            [estado.agendamento_criado_id]
          );
          if (rows[0]) {
            return {
              resultado: {
                ja_criado: true,
                agendamento: rows[0],
                mensagem: 'Este agendamento JÁ FOI CRIADO. Não criar duplicado. Avise o cliente que o agendamento está confirmado.',
              },
            };
          }
        }
        
        // Verifica checklist 100%
        if (!ws.checklistCompleto(estado)) {
          const faltam = [];
          for (const slot of ws.ORDEM_SLOTS_AGENDAMENTO) {
            if (!estado.slots[slot]?.preenchido) faltam.push(slot);
          }
          return {
            resultado: {
              erro: 'Checklist incompleto. Faltam dados.',
              slots_faltantes: faltam,
              dica: 'Colete os dados faltantes antes de finalizar.',
            },
          };
        }
        
        const slots = estado.slots;
        // dataHoraStr = "2026-06-23 15:00:00" — relógio de parede, sem conversão de TZ
        const dataHoraStr = `${slots.data.valor.data} ${slots.horario.valor.hora}:00`;
        const dh = new Date(dataHoraStr.replace(' ', 'T'));
        
        if (isNaN(dh.getTime())) {
          return { resultado: { erro: 'Data/hora inválida.' } };
        }
        if (dh < new Date()) {
          return { resultado: { erro: 'Não é possível agendar no passado.' } };
        }
        
        // VALIDAÇÃO: dia da semana
        const { rows: cfgRows } = await query(
          `SELECT horario_config FROM barbearias WHERE id = $1`,
          [barbeariaId]
        );
        const cfgDias = cfgRows[0]?.horario_config?.dias_funcionamento || [1,2,3,4,5,6];
        const diaSemanaFinal = new Date(slots.data.valor.data + 'T12:00:00').getDay();
        const nomesDias = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
        if (!cfgDias.includes(diaSemanaFinal)) {
          return {
            resultado: {
              erro: `A barbearia não abre aos ${nomesDias[diaSemanaFinal]}. Dias de funcionamento: ${cfgDias.sort().map(d => nomesDias[d]).join(', ')}. Peça ao cliente para escolher outro dia.`,
            },
          };
        }

        // REVALIDAÇÃO DE SLOTS CONSECUTIVOS (serviços longos)
        const duracao = slots.servico.valor.duracao || 30;
        if (duracao > 30) {
          const disponiveis = await calcularHorariosDisponiveis(
            barbeariaId, 
            slots.data.valor.data, 
            slots.profissional.valor.id, 
            duracao
          );
          
          if (!disponiveis.includes(slots.horario.valor.hora)) {
            return {
              resultado: {
                erro: `Esse serviço precisa de ${duracao} minutos consecutivos. O horário ${slots.horario.valor.hora} não tem todos os slots livres. Sugira outro horário.`,
                horarios_alternativos: disponiveis.slice(0, 3),
              },
            };
          }
        }
        
        // Determina cliente_id (próprio ou terceiro)
        const clienteAlvoId = slots.para_quem.valor.cliente_alvo_id || slots.cliente.valor.id;

        // Verifica se cliente já tem agendamento no mesmo dia
        const { rows: mesmoDia } = await query(
          `SELECT a.id, a.data_hora, s.nome AS servico_nome, p.nome AS profissional_nome
             FROM agendamentos a
             LEFT JOIN servicos s ON s.id = a.servico_id
             LEFT JOIN profissionais p ON p.id = a.profissional_id
            WHERE a.barbearia_id = $1 AND a.cliente_id = $2
              AND a.data_hora::date = $3::date
              AND a.status NOT IN ('cancelado')`,
          [barbeariaId, clienteAlvoId, dataHoraStr]
        );
        if (mesmoDia[0] && mesmoDia[0].id !== estado.agendamento_criado_id) {
          return {
            resultado: {
              erro: `O cliente já tem agendamento no mesmo dia: ${mesmoDia[0].servico_nome} com ${mesmoDia[0].profissional_nome} às ${mesmoDia[0].data_hora}. Se quiser reagendar, cancele o existente primeiro.`,
              agendamento_existente: mesmoDia[0],
            },
          };
        }
        
        // Verifica conflito (passa STRING, não Date — evita conversão de TZ)
        const { rows: conflito } = await query(
          `SELECT id FROM agendamentos
            WHERE barbearia_id = $1 AND profissional_id = $2 AND data_hora = $3::timestamp
              AND status NOT IN ('cancelado') LIMIT 1`,
          [barbeariaId, slots.profissional.valor.id, dataHoraStr]
        );
        if (conflito[0]) {
          return {
            resultado: {
              erro: 'Horário ficou ocupado nesse meio tempo. Peça desculpas e ofereça outro horário.',
            },
          };
        }
        
        // Observações para terceiro
        let observacoes = null;
        if (slots.para_quem.valor.tipo === 'terceiro') {
          observacoes = `Agendado por ${slots.cliente.valor.nome} para ${slots.para_quem.valor.nome_pessoa}`;
        }
        
        // Detecta horário especial (>= 19h)
        const horaNum = parseInt(slots.horario.valor.hora.split(':')[0], 10);
        const isEspecial = horaNum >= 19;
        const statusInicial = isEspecial ? 'pendente_barbeiro' : 'agendado';

        // CRIA O AGENDAMENTO (envia STRING para data_hora — sem conversão de TZ)
        console.log(`   🔨 CRIANDO AGENDAMENTO: ${slots.servico.valor.nome} | ${dataHoraStr} | Cliente: ${clienteAlvoId} | Status: ${statusInicial}`);
        const { rows } = await query(
          `INSERT INTO agendamentos
            (barbearia_id, cliente_id, servico_id, profissional_id, data_hora,
             duracao_minutos, preco, status, observacoes)
           VALUES ($1, $2, $3, $4, $5::timestamp, $6, $7, $8, $9)
           RETURNING id, data_hora`,
          [
            barbeariaId, clienteAlvoId, slots.servico.valor.id, slots.profissional.valor.id,
            dataHoraStr, slots.servico.valor.duracao, slots.servico.valor.preco, statusInicial, observacoes,
          ]
        );
        
        const agendamentoId = rows[0].id;
        console.log(`   ✅ AGENDAMENTO CRIADO: ${agendamentoId} | Data/Hora: ${rows[0].data_hora} | Status: ${statusInicial}`);

        if (isEspecial) {
          // Horário especial: não cria comanda, envia pedido de confirmação ao barbeiro
          try {
            const { solicitarConfirmacaoBarbeiro } = await import('./whatsapp.js');
            solicitarConfirmacaoBarbeiro(barbeariaId, agendamentoId)
              .catch(e => console.warn('Confirmacao barbeiro:', e.message));
          } catch (e) { console.warn('Erro ao solicitar confirmacao:', e.message); }

          // Avisa cliente que está pendente
          const clienteTel = slots.cliente?.valor?.telefone || estado.clienteTel;
          if (clienteTel) {
            try {
              const { enviarMensagem } = await import('./whatsapp.js');
              enviarMensagem(barbeariaId, {
                telefone: clienteTel,
                mensagem: `⏳ *Seu horario especial (apos 19h) foi solicitado!*\n\nA barbearia vai confirmar em breve. Assim que aprovarmos, avisamos voce.`,
                tipo: 'pendente_barbeiro',
                agendamentoId,
              }).catch(() => {});
            } catch (err) {
              console.warn(`[ai] Erro ao notificar cliente sobre horário especial: ${err?.message}`);
            }
          }

          const novoEstado = ws.resetarFluxo(estado, agendamentoId);
          return {
            resultado: {
              sucesso: true,
              agendamento_id: agendamentoId,
              data_hora: rows[0].data_hora,
              cliente_nome: slots.para_quem.valor.tipo === 'terceiro'
                ? slots.para_quem.valor.nome_pessoa
                : slots.cliente.valor.nome,
              servico_nome: slots.servico.valor.nome,
              profissional_nome: slots.profissional.valor.nome,
              preco: slots.servico.valor.preco,
              pendente_confirmacao: true,
              mensagem: `Horário especial solicitado! Avise o cliente que o barbeiro vai confirmar em breve.`,
            },
            novoEstado,
          };
        }
        
        // Horário normal (< 19h): cria comanda, notifica normalmente
        try {
          const { rows: prox } = await query(
            `SELECT COALESCE(MAX(numero),0) + 1 AS prox FROM comandas WHERE barbearia_id = $1`,
            [barbeariaId]
          );
          const { rows: cmd } = await query(
            `INSERT INTO comandas (barbearia_id, agendamento_id, numero, cliente_id, cliente_nome, valor)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [barbeariaId, agendamentoId, prox[0].prox, clienteAlvoId,
             slots.para_quem.valor.tipo === 'terceiro' ? slots.para_quem.valor.nome_pessoa : slots.cliente.valor.nome,
             slots.servico.valor.preco]
          );
          if (cmd[0]) {
            await query(
              `INSERT INTO comanda_itens (comanda_id, descricao, valor, tipo, profissional_id)
               VALUES ($1, $2, $3, 'servico', $4)`,
              [cmd[0].id, slots.servico.valor.nome, slots.servico.valor.preco, slots.profissional.valor.id]
            );
            console.log(`   ✅ Comanda criada: #${prox[0].prox}`);
          }
        } catch (err) {
          console.error('   ⚠️  Falha ao criar comanda:', err.message);
        }
        
        // Notifica barbeiro (não-bloqueante)
        try {
          const { notificarBarbeiroNovoAgendamento } = await import('./whatsapp.js');
          notificarBarbeiroNovoAgendamento(barbeariaId, agendamentoId)
            .catch(e => console.warn('Notificação:', e.message));
        } catch (err) {
          console.warn(`[ai] Erro ao importar notificação: ${err?.message}`);
        }
        
        // RESETA o fluxo (mantém apenas o ID criado para idempotência)
        const novoEstado = ws.resetarFluxo(estado, agendamentoId);
        
        return {
          resultado: {
            sucesso: true,
            agendamento_id: agendamentoId,
            data_hora: rows[0].data_hora,
            cliente_nome: slots.para_quem.valor.tipo === 'terceiro' 
              ? slots.para_quem.valor.nome_pessoa 
              : slots.cliente.valor.nome,
            servico_nome: slots.servico.valor.nome,
            profissional_nome: slots.profissional.valor.nome,
            preco: slots.servico.valor.preco,
            mensagem: 'Agendamento criado com sucesso! Confirme ao cliente com os detalhes.',
          },
          novoEstado,
        };
      }
      
      // ───── CANCELAR FLUXO ATUAL ─────
      case 'cancelarFluxoAtual': {
        const novoEstado = ws.resetarFluxo(estado);
        console.log(`   ✅ Fluxo cancelado`);
        return {
          resultado: { sucesso: true, mensagem: 'Fluxo cancelado. Posso ajudar com mais algo?' },
          novoEstado,
        };
      }
      
      // ───── QUERIES ─────
      case 'listarServicos': {
        const { rows } = await query(
          `SELECT id, nome, duracao_minutos, preco, categoria FROM servicos
            WHERE barbearia_id = $1 AND ativo = true ORDER BY categoria, nome`,
          [barbeariaId]
        );
        return {
          resultado: {
            total: rows.length,
            servicos: rows.map((s, i) => ({
              posicao: i + 1,
              id: s.id,
              nome: s.nome,
              preco: parseFloat(s.preco),
              duracao_minutos: s.duracao_minutos,
            })),
          },
        };
      }
      
      case 'listarProfissionais': {
        const { rows } = await query(
          `SELECT id, nome, especialidade, ativo, telefone, notificar_whatsapp FROM profissionais
            WHERE barbearia_id = $1 AND ativo = true ORDER BY ordem, nome`,
          [barbeariaId]
        );
        console.log(`   👥 Profissionais ativos: ${rows.length}`, rows.map(p => p.nome).join(', '));

        const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
        const linhasProf = rows.map((p, i) => {
          const emoji = emojis[i] || `${i + 1}.`;
          const esp = p.especialidade ? ` — ${p.especialidade}` : '';
          return `${emoji} *${p.nome}*${esp}`;
        });
        const formatadoProf = `👇 *Escolha seu barbeiro:*\n\n${linhasProf.join('\n')}`;

        return {
          resultado: {
            total: rows.length,
            profissionais: rows.map((p, i) => ({
              posicao: i + 1,
              id: p.id,
              nome: p.nome,
              especialidade: p.especialidade,
            })),
            formatado: formatadoProf,
          },
        };
      }
      
      case 'consultarHorariosLivres': {
        const dataYMD = parsearData(args.data);
        if (!dataYMD) {
          return { resultado: { erro: `Data "${args.data}" não reconhecida.` } };
        }

        // Verifica dia de funcionamento antes
        const { rows: hCfg } = await query(
          `SELECT horario_config FROM barbearias WHERE id = $1`,
          [barbeariaId]
        );
        const cfgHorarios = hCfg[0]?.horario_config || {};
        const diasFunc = cfgHorarios.dias_funcionamento || [1,2,3,4,5,6];
        const diaSem = new Date(dataYMD + 'T12:00:00').getDay();
        const nomesD = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
        
        if (!diasFunc.includes(diaSem)) {
          const diasAbertos = diasFunc.sort().map(d => nomesD[d]);
          return {
            resultado: {
              data: dataYMD,
              data_formatada: formatarDataLegivel(dataYMD),
              horarios_livres: [],
              total: 0,
              fechado: true,
              motivo: `A barbearia não abre aos ${nomesD[diaSem]}. Dias de funcionamento: ${diasAbertos.join(', ')}.`,
              formatado: `😕 *${formatarDataLegivel(dataYMD)}* — A barbearia não abre neste dia.\n\n📅 Funcionamos de *${diasAbertos.join(' a ')}*.\nQue tal escolher outra data? 😊`,
            },
          };
        }
        
        let profId = null;
        if (args.profissional) {
          const p = await resolverProfissional(barbeariaId, args.profissional);
          if (!p) return { resultado: { erro: `Profissional "${args.profissional}" não encontrado.` } };
          profId = p.id;
        }
        
        const duracao = args.duracao_minutos || 30;
        const livres = await calcularHorariosDisponiveis(barbeariaId, dataYMD, profId, duracao);
        
        // Formata horários agrupados por período
        let formatado = '';
        if (livres.length === 0) {
          formatado = `😕 *${formatarDataLegivel(dataYMD)}* — Não há horários disponíveis neste dia.\nQue tal escolher outra data? 😊`;
        } else {
          const periodos = [
            { chave: 'manha', label: '🌅 Manhã', cfg: cfgHorarios.manha },
            { chave: 'tarde', label: '☀️ Tarde', cfg: cfgHorarios.tarde },
            { chave: 'especial', label: '🌙 Especial', cfg: cfgHorarios.especial },
          ];
          const linhas = [`🗓️ *${formatarDataLegivel(dataYMD)}*`];
          for (const p of periodos) {
            if (!p.cfg?.inicio || !p.cfg?.fim) continue;
            const [hi, mi] = p.cfg.inicio.split(':').map(Number);
            const [hf, mf] = p.cfg.fim.split(':').map(Number);
            const inicioMin = hi * 60 + mi;
            const fimMin = hf * 60 + mf;
            const doPeriodo = livres.filter(h => {
              const [hh, mm] = h.split(':').map(Number);
              const totalMin = hh * 60 + mm;
              return totalMin >= inicioMin && totalMin < fimMin;
            });
            if (doPeriodo.length > 0) {
              const horariosStr = doPeriodo.map(h => {
                const [hh, mm] = h.split(':');
                return `${parseInt(hh)}h${mm === '00' ? '' : mm}`;
              }).join(', ');
              linhas.push(`${p.label}: ${horariosStr}`);
            }
          }
          formatado = linhas.join('\n');
        }
        
        return {
          resultado: {
            data: dataYMD,
            data_formatada: formatarDataLegivel(dataYMD),
            horarios_livres: livres,
            total: livres.length,
            formatado,
          },
        };
      }
      
      case 'consultarInfoBarbearia': {
        const { rows } = await query(
          `SELECT nome, telefone, email, endereco, horario_config FROM barbearias WHERE id = $1`,
          [barbeariaId]
        );
        if (!rows[0]) return { resultado: { erro: 'Barbearia não encontrada' } };
        const hc = rows[0].horario_config || {};
        
        // Formata horários em texto legível
        const periodosLabels = {
          manha: '🌅 Manhã',
          tarde: '☀️ Tarde',
          especial: '🌙 Especial',
        };
        const partesHorario = [];
        for (const [key, label] of Object.entries(periodosLabels)) {
          if (hc[key]?.inicio && hc[key]?.fim) {
            const fmt = (t) => { const [h,m]=t.split(':'); return `${parseInt(h)}h${m==='00'?'':m}`; };
            partesHorario.push(`${label}: ${fmt(hc[key].inicio)} às ${fmt(hc[key].fim)}`);
          }
        }
        
        const nomesDias = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
        const diasFunc = hc.dias_funcionamento || [1,2,3,4,5,6];
        const diasStr = diasFunc.sort().map(d => nomesDias[d]).join(', ');
        
        let formatadoInfo = `📍 *${rows[0].nome}*\n`;
        if (rows[0].endereco) formatadoInfo += `📌 ${rows[0].endereco}\n`;
        if (rows[0].telefone) formatadoInfo += `📞 ${rows[0].telefone}\n`;
        formatadoInfo += `\n🕐 *Horários:*\n${partesHorario.join('\n')}\n`;
        formatadoInfo += `📅 *Funcionamos:* ${diasStr}`;
        
        return {
          resultado: {
            nome: rows[0].nome,
            telefone: rows[0].telefone,
            email: rows[0].email,
            endereco: rows[0].endereco,
            horarios: rows[0].horario_config,
            formatado: formatadoInfo,
          },
        };
      }
      
      case 'listarMeusAgendamentos': {
        const tel = String(telefone || '').replace(/\D/g, '');
        const ultimos11 = tel.slice(-11);
        const { rows } = await query(
          `SELECT a.id, a.data_hora, a.status, a.preco,
                  s.nome AS servico_nome, p.nome AS profissional_nome
             FROM agendamentos a
             JOIN clientes c ON c.id = a.cliente_id
             LEFT JOIN servicos s ON s.id = a.servico_id
             LEFT JOIN profissionais p ON p.id = a.profissional_id
            WHERE a.barbearia_id = $1 AND REPLACE(c.telefone, '-', '') LIKE $2
              AND a.status NOT IN ('cancelado', 'concluido')
              AND a.data_hora >= NOW()
            ORDER BY a.data_hora`,
          [barbeariaId, `%${ultimos11}`]
        );
        
        if (rows.length === 0) {
          return { resultado: { total: 0, mensagem: 'Você não tem agendamentos futuros.' } };
        }
        
        // Formata para facilitar extração pela IA
        const lista = rows.map(r => ({
          id: r.id,  // UUID — use este ID em cancelarAgendamentoExistente ou reagendarAgendamento
          data_hora: r.data_hora,
          servico: r.servico_nome || 'Atendimento',
          profissional: r.profissional_nome || 'Profissional',
          preco: parseFloat(r.preco || 0).toFixed(2),
          status: r.status,
        }));
        
        return { 
          resultado: { 
            total: rows.length, 
            agendamentos: lista,
            instrucao: 'Para cancelar ou reagendar, use o campo "id" de cada agendamento.',
          } 
        };
      }
      
      case 'cancelarAgendamentoExistente': {
        console.log(`   🚫 CANCELAMENTO solicitado: ${args.agendamento_id} (confirmacao_explicita=${args.confirmacao_explicita})`);
        
        // Validação: ID válido
        if (!args.agendamento_id || args.agendamento_id === 'undefined' || args.agendamento_id === 'null') {
          console.log(`   ❌ ID inválido: ${args.agendamento_id}`);
          return {
            resultado: {
              erro: 'ID_INVALIDO',
              mensagem: 'Use listarMeusAgendamentos para pegar o ID (campo "id") do agendamento que o cliente quer cancelar. Não invente IDs.',
            },
          };
        }
        
        // Trava de segurança: só cancela com confirmação explícita
        if (args.confirmacao_explicita !== true) {
          console.log(`   ⚠️  Cancelamento BLOQUEADO: cliente não confirmou explicitamente`);
          return {
            resultado: {
              erro: 'PRECISA_CONFIRMACAO_EXPLICITA',
              mensagem: 'Antes de cancelar, ofereça remarcar (mudar data/horário). Só cancele se o cliente recusar remarcar e confirmar que quer cancelar.',
            },
          };
        }
        
        // Busca o agendamento antes de cancelar (pra confirmar e logar)
        const { rows: existe } = await query(
          `SELECT a.id, a.data_hora, a.status, c.nome AS cliente_nome, 
                  s.nome AS servico_nome, p.nome AS profissional_nome
             FROM agendamentos a
             JOIN clientes c ON c.id = a.cliente_id
             LEFT JOIN servicos s ON s.id = a.servico_id
             LEFT JOIN profissionais p ON p.id = a.profissional_id
            WHERE a.id = $1 AND a.barbearia_id = $2`,
          [args.agendamento_id, barbeariaId]
        );
        
        if (existe.length === 0) {
          console.log(`   ❌ Agendamento NÃO encontrado: ${args.agendamento_id}`);
          return { resultado: { erro: 'Agendamento não encontrado.' } };
        }
        
        const ag = existe[0];
        if (ag.status === 'cancelado') {
          console.log(`   ⚠️  Agendamento JÁ estava cancelado`);
          return { 
            resultado: { 
              sucesso: true, 
              ja_cancelado: true,
              agendamento_id: ag.id,
              info: `${ag.servico_nome || 'Atendimento'} de ${ag.cliente_nome} já estava cancelado.`,
            } 
          };
        }
        if (ag.status === 'concluido') {
          console.log(`   ❌ Agendamento já CONCLUÍDO, não pode cancelar`);
          return { resultado: { erro: 'Esse agendamento já foi concluído, não pode cancelar.' } };
        }
        
        // Cancela
        const { rowCount } = await query(
          `UPDATE agendamentos SET status = 'cancelado'
            WHERE id = $1 AND barbearia_id = $2 AND status NOT IN ('cancelado', 'concluido')`,
          [args.agendamento_id, barbeariaId]
        );
        
        if (rowCount === 0) {
          console.log(`   ❌ UPDATE não afetou nenhuma linha`);
          return { resultado: { erro: 'Não foi possível cancelar (agendamento pode ter mudado de status).' } };
        }
        
        // Exclui comanda associada (para não ficar bagunçado)
        const { rowCount: comandasDeletadas } = await query(
          `DELETE FROM comandas WHERE agendamento_id = $1`,
          [args.agendamento_id]
        );
        if (comandasDeletadas > 0) {
          console.log(`   🗑️  Comanda excluída (${comandasDeletadas})`);
        }
        
        // Notifica barbeiro sobre cancelamento
        try {
          const { notificarBarberCancelamento } = await import('./scheduler.js');
          await notificarBarberCancelamento(barbeariaId, args.agendamento_id);
        } catch (errNotif) {
          console.error(`   ⚠️  Falha ao notificar barbeiro:`, errNotif.message);
          // Não bloqueia o cancelamento se notificação falhar
        }
        
        console.log(`   ✅ CANCELADO com sucesso: ${ag.servico_nome} - ${ag.cliente_nome} (${ag.data_hora})`);
        return { 
          resultado: { 
            sucesso: true, 
            agendamento_id: ag.id,
            info: `${ag.servico_nome || 'Atendimento'} com ${ag.profissional_nome || ''} cancelado.`,
          } 
        };
      }
      
      case 'reagendarAgendamento': {
        console.log(`   🔄 REAGENDAR: ${args.agendamento_id} → ${args.nova_data} ${args.novo_horario}`);
        
        // Validação: ID válido
        if (!args.agendamento_id || args.agendamento_id === 'undefined' || args.agendamento_id === 'null') {
          console.log(`   ❌ ID inválido: ${args.agendamento_id}`);
          return {
            resultado: {
              erro: 'ID_INVALIDO',
              mensagem: 'Use listarMeusAgendamentos para pegar o ID (campo "id") do agendamento. Não invente IDs.',
            },
          };
        }
        
        // Busca agendamento existente
        const { rows: existe } = await query(
          `SELECT a.id, a.profissional_id, a.cliente_id, a.duracao_minutos, a.status,
                  c.nome AS cliente_nome, s.nome AS servico_nome, p.nome AS profissional_nome
             FROM agendamentos a
             JOIN clientes c ON c.id = a.cliente_id
             LEFT JOIN servicos s ON s.id = a.servico_id
             LEFT JOIN profissionais p ON p.id = a.profissional_id
            WHERE a.id = $1 AND a.barbearia_id = $2`,
          [args.agendamento_id, barbeariaId]
        );
        
        if (existe.length === 0) {
          return { resultado: { erro: 'Agendamento não encontrado.' } };
        }
        
        const ag = existe[0];
        if (ag.status === 'cancelado') {
          return { resultado: { erro: 'Esse agendamento já foi cancelado. Faça um agendamento novo.' } };
        }
        if (ag.status === 'concluido') {
          return { resultado: { erro: 'Esse agendamento já foi concluído.' } };
        }
        
        // Normaliza data e hora
        const novaDataYMD = parsearData(args.nova_data);
        if (!novaDataYMD) {
          return { resultado: { erro: 'Data inválida. Use formato YYYY-MM-DD ou "hoje/amanhã".' } };
        }
        
        const novaHora = parsearHorario(args.novo_horario);
        if (!novaHora) {
          return { resultado: { erro: 'Horário inválido. Use formato HH:MM ou "14h".' } };
        }
        
        // Monta string wall-clock
        const novaDataHoraStr = `${novaDataYMD} ${novaHora}:00`;
        const dh = new Date(novaDataHoraStr.replace(' ', 'T'));
        
        if (isNaN(dh.getTime())) {
          return { resultado: { erro: 'Data/hora inválida.' } };
        }
        if (dh < new Date()) {
          return { resultado: { erro: 'Não é possível reagendar para o passado.' } };
        }
        
        // Verifica conflito (excluindo o próprio agendamento)
        const { rows: conflito } = await query(
          `SELECT id FROM agendamentos
            WHERE barbearia_id = $1 AND profissional_id = $2 
              AND data_hora = $3::timestamp
              AND status NOT IN ('cancelado')
              AND id <> $4
            LIMIT 1`,
          [barbeariaId, ag.profissional_id, novaDataHoraStr, args.agendamento_id]
        );
        if (conflito[0]) {
          return {
            resultado: {
              erro: 'Esse novo horário já está ocupado. Sugira outro.',
            },
          };
        }
        
        // Atualiza — preserva status se já for pendente_barbeiro
        const { rowCount } = await query(
          `UPDATE agendamentos 
              SET data_hora = $1::timestamp,
                  status = CASE WHEN status = 'pendente_barbeiro' THEN 'pendente_barbeiro' ELSE 'agendado' END,
                  lembrete_enviado_em = NULL
            WHERE id = $2 AND barbearia_id = $3`,
          [novaDataHoraStr, args.agendamento_id, barbeariaId]
        );
        
        if (rowCount === 0) {
          return { resultado: { erro: 'Não foi possível reagendar.' } };
        }
        
        console.log(`   ✅ REAGENDADO: ${ag.servico_nome} - ${ag.cliente_nome} → ${novaDataHoraStr}`);
        return {
          resultado: {
            sucesso: true,
            agendamento_id: ag.id,
            servico_nome: ag.servico_nome,
            profissional_nome: ag.profissional_nome,
            nova_data: novaDataYMD,
            novo_horario: novaHora,
          },
        };
      }
      
      case 'registrarSolicitacaoEspecial': {
        console.log(`   📝 SOLICITAÇÃO ESPECIAL: ${args.servico_solicitado}`);
        
        if (!args.servico_solicitado || args.servico_solicitado.trim().length < 2) {
          return { resultado: { erro: 'Nome do serviço obrigatório.' } };
        }
        
        const clienteData = await buscarClientePorTelefone(barbeariaId, telefone);
        const clienteNome = clienteData?.nome || 'Cliente';
        const clienteTelefone = clienteData?.telefone || String(telefone || '').replace(/\D/g, '');
        
        // Registra solicitação
        const { rows: solicitacao } = await query(
          `INSERT INTO solicitacoes_especiais 
            (barbearia_id, cliente_nome, cliente_telefone, servico_solicitado, observacoes)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [barbeariaId, clienteNome, clienteTelefone, args.servico_solicitado, args.observacoes || null]
        );
        
        console.log(`   ✅ Solicitação registrada: ${solicitacao[0].id}`);
        
        // Busca profissionais responsáveis
        const { rows: responsaveis } = await query(
          `SELECT id, nome, telefone FROM profissionais
            WHERE barbearia_id = $1 AND eh_responsavel = true AND ativo = true AND telefone IS NOT NULL`,
          [barbeariaId]
        );
        
        if (responsaveis.length === 0) {
          console.log(`   ⚠️  Nenhum profissional responsável com telefone configurado`);
          return {
            resultado: {
              sucesso: true,
              mensagem_cliente: 'Vou avisar o responsável para entrar em contato com você e organizar esse atendimento especial.',
              alerta: 'Nenhum profissional responsável configurado para receber notificações.',
            },
          };
        }
        
        // Notifica cada responsável
        const { enviarMensagemBaileys } = await import('./baileys-provider.js');
        let notificacoesEnviadas = 0;
        
        for (const resp of responsaveis) {
          try {
            const mensagem = 
              `🔔 *Nova Solicitação Especial*\n\n` +
              `Olá ${resp.nome}! Um cliente solicitou um serviço que não está no catálogo:\n\n` +
              `👤 Cliente: ${clienteNome}\n` +
              `📱 Contato: ${clienteTelefone}\n` +
              `✨ Serviço solicitado: *${args.servico_solicitado}*\n` +
              (args.observacoes ? `📝 Obs: ${args.observacoes}\n` : '') +
              `\n💡 Entre em contato com o cliente para organizar o agendamento.`;
            
            await enviarMensagemBaileys(barbeariaId, resp.telefone, mensagem);
            
            await query(
              `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
               VALUES ($1, $2, $3, 'solicitacao_especial', 'enviada')`,
              [barbeariaId, resp.telefone, mensagem]
            );
            
            notificacoesEnviadas++;
            console.log(`   ✅ Responsável ${resp.nome} notificado`);
          } catch (err) {
            console.error(`   ❌ Falha ao notificar ${resp.nome}:`, err.message);
          }
        }
        
        return {
          resultado: {
            sucesso: true,
            mensagem_cliente: 'Vou avisar o responsável para entrar em contato com você e organizar esse atendimento especial.',
            responsaveis_notificados: notificacoesEnviadas,
          },
        };
      }
      
      // ───── HISTÓRICO DO CLIENTE ─────
      case 'buscarHistoricoCliente': {
        const tel = String(telefone || '').replace(/\D/g, '');
        const ultimos11 = tel.slice(-11);
        if (ultimos11.length < 10) {
          return { resultado: { sucesso: false, mensagem: 'Telefone não identificado.' } };
        }

        // Busca dados do cliente
        const { rows: clienteRows } = await query(
          `SELECT id, nome, total_visitas FROM clientes
            WHERE barbearia_id = $1 AND REPLACE(telefone, '-', '') LIKE $2 LIMIT 1`,
          [barbeariaId, `%${ultimos11}`]
        );

        if (!clienteRows[0]) {
          return { resultado: { sucesso: true, novo: true, mensagem: 'Cliente novo, sem histórico.' } };
        }

        const cli = clienteRows[0];

        // Último agendamento (serviço + profissional)
        const { rows: ultimoAg } = await query(
          `SELECT s.nome AS servico_nome, p.nome AS profissional_nome, a.data_hora
             FROM agendamentos a
             LEFT JOIN servicos s ON s.id = a.servico_id
             LEFT JOIN profissionais p ON p.id = a.profissional_id
            WHERE a.barbearia_id = $1 AND a.cliente_id = $2
            ORDER BY a.data_hora DESC LIMIT 1`,
          [barbeariaId, cli.id]
        );

        // Próximo agendamento futuro
        const { rows: proxAg } = await query(
          `SELECT s.nome AS servico_nome, p.nome AS profissional_nome, a.data_hora
             FROM agendamentos a
             LEFT JOIN servicos s ON s.id = a.servico_id
             LEFT JOIN profissionais p ON p.id = a.profissional_id
            WHERE a.barbearia_id = $1 AND a.cliente_id = $2
              AND a.status NOT IN ('cancelado', 'concluido')
              AND a.data_hora >= NOW()
            ORDER BY a.data_hora LIMIT 1`,
          [barbeariaId, cli.id]
        );

        const resultado = {
          sucesso: true,
          nome: cli.nome,
          total_visitas: cli.total_visitas,
          ultimo_servico: ultimoAg[0]?.servico_nome || null,
          ultimo_profissional: ultimoAg[0]?.profissional_nome || null,
          agendamento_proximo: proxAg[0]
            ? `${proxAg[0].servico_nome} com ${proxAg[0].profissional_nome} em ${new Date(proxAg[0].data_hora).toLocaleDateString('pt-BR')} às ${new Date(proxAg[0].data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : null,
        };

        console.log(`   📋 Histórico: ${cli.nome} | ${cli.total_visitas} visitas | Último: ${resultado.ultimo_servico || 'N/A'}`);
        return { resultado };
      }

      // ───── FALLBACK PARA HUMANO ─────
      case 'transferirParaHumano': {
        console.log(`   🤝 TRANSFERÊNCIA PARA HUMANO: ${args.motivo}`);

        // Busca responsável
        const { rows: responsaveis } = await query(
          `SELECT id, nome, telefone FROM profissionais
            WHERE barbearia_id = $1 AND eh_responsavel = true AND ativo = true AND telefone IS NOT NULL`,
          [barbeariaId]
        );

        const clienteData = await buscarClientePorTelefone(barbeariaId, telefone);
        const clienteNome = clienteData?.nome || 'Cliente';
        const clienteTelefone = String(telefone || '').replace(/\D/g, '');

        let notificados = 0;
        for (const resp of responsaveis) {
          try {
            const msg = `🤝 *Transferência de atendimento\n\n` +
              `Cliente: ${clienteNome}\n` +
              `📱 Contato: ${clienteTelefone}\n` +
              `📝 Motivo: ${args.motivo}\n\n` +
              `Por favor, entre em contato com o cliente.`;

            const { enviarMensagemBaileys } = await import('./baileys-provider.js');
            await enviarMensagemBaileys(barbeariaId, resp.telefone, msg);

            await query(
              `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
               VALUES ($1, $2, $3, 'transferencia_humano', 'enviada')`,
              [barbeariaId, resp.telefone, msg]
            );

            notificados++;
            console.log(`   ✅ Responsável ${resp.nome} notificado`);
          } catch (err) {
            console.error(`   ❌ Falha ao notificar ${resp.nome}:`, err.message);
          }
        }

        return {
          resultado: {
            sucesso: true,
            responsaveis_notificados: notificados,
            mensagem_cliente: 'Vou chamar o responsável para te atender melhor! Ele vai entrar em contato em breve. 😊',
          },
        };
      }

      // ───── RESPOSTA AO CLIENTE ─────
      case 'responderCliente': {
        // 🛡️ VALIDAÇÃO: Nunca deixar responder sem consultar a base
        const ehPrimeiraInteracao = !ctx.toolInteractionMessages || ctx.toolInteractionMessages.length === 0;
        if (!ctx.consultouBase && !ehPrimeiraInteracao) {
          console.warn(`   🛑 BLOQUEADO: LLM tentou responder sem consultar a base`);
          return {
            resultado: {
              erro: 'BLOQUEADO: Você precisa consultar a base de dados antes de responder. Chame a tool de consulta primeiro (listarServicos, consultarInfoBarbearia, etc) e DEPOIS use responderCliente.',
            },
          };
        }
        return {
          resultado: {
            sucesso: true,
            mensagem: args.mensagem || '',
          },
        };
      }

      case 'verificarEstadoAtual': {
        const estadoBanco = await ws.carregarEstado(barbeariaId, telefone);
        const progresso = ws.calcularProgresso(estadoBanco);
        const proxSlot = ws.proximoSlot(estadoBanco);
        const completo = ws.checklistCompleto(estadoBanco);

        let resumoSlots = {};
        for (const s of ws.ORDEM_SLOTS_AGENDAMENTO) {
          const slot = estadoBanco.slots[s];
          resumoSlots[s] = slot?.preenchido ? {
            preenchido: true,
            valor: typeof slot.valor === 'object' ? slot.valor.nome || slot.valor.hora || JSON.stringify(slot.valor) : slot.valor,
          } : { preenchido: false };
        }

        return {
          resultado: {
            sucesso: true,
            fluxo_ativo: estadoBanco.fluxo_ativo,
            goal: estadoBanco.goal,
            progresso: `${progresso.preenchidos}/${progresso.total} (${progresso.percentual}%)`,
            checklist_completo: completo,
            proximo_slot: proxSlot,
            slots: resumoSlots,
            ultimo_slot_preenchido: estadoBanco.ultimo_slot_preenchido,
            mensagem: completo
              ? 'Checklist COMPLETO. Mostre o resumo e confirme com o cliente, depois chame finalizarAgendamento.'
              : `Faltam preencher: ${ws.ORDEM_SLOTS_AGENDAMENTO.filter(s => !estadoBanco.slots[s]?.preenchido).join(', ')}`,
          },
          novoEstado: estadoBanco,
        };
      }

      default:
        return { resultado: { erro: `Tool desconhecida: ${toolName}` } };
    }
  } catch (err) {
    console.error(`   ❌ Erro em ${toolName}:`, err.message);
    return { resultado: { erro: `Erro interno: ${err.message}` } };
  }
}

// ============================================================
// HORÁRIOS DISPONÍVEIS (com validação de slots consecutivos)
// ============================================================

/**
 * Verifica se N slots consecutivos estão todos livres
 * Ex: servico de 60min precisa de 2 slots (9:00 E 9:30)
 */
function verificarSlotsConsecutivos(horaInicio, duracaoMinutos, slotsLivres, intervaloMinutos = 30) {
  const slotsNecessarios = Math.ceil(duracaoMinutos / intervaloMinutos);
  if (slotsNecessarios === 1) return true; // 30min = 1 slot apenas
  
  const [h, m] = horaInicio.split(':').map(Number);
  let totalMin = h * 60 + m;
  
  for (let i = 0; i < slotsNecessarios; i++) {
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    const slotAtual = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    
    if (!slotsLivres.includes(slotAtual)) {
      return false; // Um dos slots está ocupado
    }
    
    totalMin += intervaloMinutos;
  }
  
  return true; // Todos os slots consecutivos estão livres
}

async function calcularHorariosDisponiveis(barbeariaId, dataYMD, profissionalId, duracaoMinutos = 30) {
  // Config de horários da barbearia
  const { rows: barbRows } = await query(
    `SELECT horario_config FROM barbearias WHERE id = $1`,
    [barbeariaId]
  );
  const cfg = barbRows[0]?.horario_config || {
    manha: { inicio: '07:30', fim: '11:00' },
    tarde: { inicio: '13:00', fim: '19:00' },
    especial: { inicio: '19:00', fim: '21:00' },
    intervalo_minutos: 30,
  };

  // VALIDAÇÃO: dia da semana
  const diasFuncionamento = cfg.dias_funcionamento || [1,2,3,4,5,6]; // 0=domingo, 1=segunda...
  const diaSemana = new Date(dataYMD + 'T12:00:00').getDay();
  if (!diasFuncionamento.includes(diaSemana)) {
    return []; // Fechado neste dia
  }
  
  const intervaloMin = cfg.intervalo_minutos || 30;
  const slots = [];
  
  const adicionarSlots = (inicio, fim) => {
    if (!inicio || !fim) return;
    const [hi, mi] = inicio.split(':').map(Number);
    const [hf, mf] = fim.split(':').map(Number);
    let total = hi * 60 + mi;
    const fimMin = hf * 60 + mf;
    while (total < fimMin) {
      const h = Math.floor(total / 60);
      const m = total % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      total += intervaloMin;
    }
  };
  
  if (cfg.manha) adicionarSlots(cfg.manha.inicio, cfg.manha.fim);
  if (cfg.tarde) adicionarSlots(cfg.tarde.inicio, cfg.tarde.fim);
  if (cfg.especial) adicionarSlots(cfg.especial.inicio, cfg.especial.fim);
  
  // Ocupados (incluindo slots bloqueados por serviços longos)
  const params = [barbeariaId, dataYMD];
  let profFilter = '';
  if (profissionalId) {
    params.push(profissionalId);
    profFilter = ` AND profissional_id = $${params.length}`;
  }
  
  const { rows: ocupados } = await query(
    `SELECT data_hora, duracao_minutos FROM agendamentos
      WHERE barbearia_id = $1 AND data_hora::date = $2::date
        AND status NOT IN ('cancelado')${profFilter}`,
    params
  );
  
  // Marca todos os slots ocupados (incluindo os bloqueados por serviços longos)
  const setOcupados = new Set();
  ocupados.forEach(o => {
    const s = String(o.data_hora);
    const m = s.match(/(\d{2}):(\d{2})/);
    if (!m) return;
    
    const horaInicio = `${m[1]}:${m[2]}`;
    const duracao = o.duracao_minutos || 30;
    const slotsOcupados = Math.ceil(duracao / intervaloMin);
    
    // Marca todos os slots que esse agendamento ocupa
    const [h, min] = horaInicio.split(':').map(Number);
    let totalMin = h * 60 + min;
    
    for (let i = 0; i < slotsOcupados; i++) {
      const hh = Math.floor(totalMin / 60);
      const mm = totalMin % 60;
      setOcupados.add(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
      totalMin += intervaloMin;
    }
  });
  
  let livres = slots.filter(s => !setOcupados.has(s));
  
  // Se for hoje, remove horários passados (usando timezone America/Sao_Paulo)
  const hoje = agoraSP();
  if (dataYMD === formatarDataYMD(hoje)) {
    const horaAtual = `${String(hoje.getHours()).padStart(2, '0')}:${String(hoje.getMinutes()).padStart(2, '0')}`;
    livres = livres.filter(s => s > horaAtual);
  }
  
  // VALIDAÇÃO DE SLOTS CONSECUTIVOS
  // Se serviço precisa de múltiplos slots, só retorna horários que tenham todos consecutivos livres
  if (duracaoMinutos > intervaloMin) {
    livres = livres.filter(hora => verificarSlotsConsecutivos(hora, duracaoMinutos, livres, intervaloMin));
  }
  
  return livres;
}

function sugerirHorariosProximos(disponiveis, alvo) {
  if (!alvo || disponiveis.length === 0) return disponiveis.slice(0, 3);
  
  const [h, m] = alvo.split(':').map(Number);
  const alvoMin = h * 60 + m;
  
  // Ordena por proximidade
  const ordenado = [...disponiveis].sort((a, b) => {
    const [ha, ma] = a.split(':').map(Number);
    const [hb, mb] = b.split(':').map(Number);
    return Math.abs((ha * 60 + ma) - alvoMin) - Math.abs((hb * 60 + mb) - alvoMin);
  });
  
  return ordenado.slice(0, 3).sort();
}

// ============================================================
// SYSTEM PROMPT DINÂMICO
// ============================================================

function montarSystemPrompt(barbeariaNome, telefoneCliente, estado, promptPersonalizado, dadosCliente = null, pushName = null) {
  const dataAgora = new Date();
  const amanha = new Date(Date.now() + 86400000);
  const dataFmt = dataAgora.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
  const horaFmt = dataAgora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const amanhaFmt = amanha.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit'
  });

  const estadoTexto = ws.formatarEstadoParaPrompt(estado);

  // Monta seção de dados do cliente (se disponível)
  let secaoCliente = '';
  if (dadosCliente) {
    const partes = [];
    if (dadosCliente.nome) partes.push(`Nome: ${dadosCliente.nome}`);
    if (dadosCliente.total_visitas) partes.push(`Visitas: ${dadosCliente.total_visitas}`);
    if (dadosCliente.ultimo_servico) partes.push(`Último serviço: ${dadosCliente.ultimo_servico}`);
    if (dadosCliente.ultimo_profissional) partes.push(`Último profissional: ${dadosCliente.ultimo_profissional}`);
    if (dadosCliente.agendamento_proximo) partes.push(`Próximo agendamento: ${dadosCliente.agendamento_proximo}`);
    if (partes.length > 0) {
      secaoCliente = `\n📋 DADOS DO CLIENTE:\n${partes.join('\n')}\nUse essas informações para personalizar a conversa (ex: "Vi que você já cortou com o Luiz antes!").\n`;
    }
  }

  const prompt = `Você é o atendente virtual da barbearia "${barbeariaNome}". Seu trabalho é ajudar clientes a agendar horários pelo WhatsApp.

📌 DATA E HORA ATUAIS
Hoje: ${dataFmt} — ${horaFmt}
Amanhã: ${amanhaFmt}

━━━━━━━━━━━━━━━━━━━━━━━━
🔴 REGRAS ABSOLUTAS (NUNCA VIOLAR)
━━━━━━━━━━━━━━━━━━━━━━━━

🚫 REGRA #1 — ZERO ALUCINAÇÃO
Você NUNCA sabe informações sobre a barbearia. TUDO deve ser consultado no banco.
Sistema BLOQUEIA se você responder sem consultar. Chamar tools NÃO é opcional.

🚫 REGRA #2 — SEMPRE USE O NOME DO CLIENTE
Quando souber o nome do cliente (👤 acima), use SEMPRE.
❌ "Temos corte por R$45."
✅ "João, temos corte por R$45."
❌ "Seu horário foi confirmado!"
✅ "João, seu horário foi confirmado!"

🚫 REGRA #3 — CHECKLIST É A VERDADE
Olhe o 📋. Só ele diz o que já foi preenchido. Ignore sua memória.

REGRA #4 — USE O CAMPO "formatado" QUANDO DISPONÍVEL
Quando um tool retornar um campo "formatado", use EXATAMENTE aquele texto na sua resposta.
Não reescreva, não resuma, não embeleze. Apenas insira no meio da sua mensagem.
Isso garante que a formatação fique bonita e padronizada.

🚫 REGRA #5 — FOCO NO OBJETIVO PRINCIPAL (NUNCA PERDER O FOCO)
Seu TRABALHO é ajudar clientes a gerenciar horários na barbearia. PONTO FINAL.

Se o cliente fizer uma pergunta FORA do escopo (ex: "que horas são?", "qual a capital do Brasil?", "quem ganhou o jogo?"):
1. Responda de forma RÁPIDA e SIMPLES (1 frase no máximo)
2. IMEDIATAMENTE VOLTE ao objetivo principal:
   "Fora isso, como posso ajudar na barbearia? Quer agendar um horário?"

Se o cliente responder algo ALEATÓRIO durante o fluxo de agendamento:
1. Anote a pergunta aleatória se necessário, responda em 1 frase
2. VOLTE IMEDIATAMENTE para o SLOT PENDENTE que estava sendo preenchido
   "Sobre sua pergunta: [resposta rápida]. Voltando aqui, você ia me dizer [próximo passo pendente]..."

🚫 REGRA #6 — NUNCA PERGUNTE O QUE JÁ FOI RESPONDIDO
Se o cliente já disse o nome, JÁ chame cadastrarClientePrincipal.
Se o cliente já disse o serviço, JÁ chame definirServico.
NUNCA finja que não ouviu. NUNCA repita a mesma pergunta.

🚫 REGRA #7 — FIM DA CONVERSA = PERGUNTE SE PRECISA DE + ALGO
Depois de finalizar agendamento, cancelar, ou resolver um pedido,
SEMPRE pergunte "Precisa de mais alguma coisa?" antes de encerrar.
Não dê ghosting no cliente.

━━━━━━━━━━━━━━━━━━━━━━━━
🎯 SAUDAÇÃO PERSONALIZADA
━━━━━━━━━━━━━━━━━━━━━━━━
Use conforme o PERFIL do cliente (veja nos 📋 DADOS DO CLIENTE):

🆕 CLIENTE NOVO (sem histórico / primeira visita):
"Olá! Seja bem-vindo à barbearia! 💈 Como posso te ajudar?"

🔁 CLIENTE FREQUENTE (total_visitas > 1):
"[Nome], que bom te ver de novo! Vi que da última vez você fez [servico]. O que vai querer hoje?"
SEMPRE use o nome do cliente.

📅 CLIENTE COM AGENDAMENTO PRÓXIMO:
"[Nome], você já tem [servico] com [prof] em breve. Quer marcar mais um ou precisa de outra coisa?"

👋 SAUDAÇÃO PADRÃO (sem dados do cliente):
"Boa tarde! Como posso te ajudar?"

━━━━━━━━━━━━━━━━━━━━━━━━
📞 CLIENTE ATUAL
━━━━━━━━━━━━━━━━━━━━━━━━
Telefone: ${telefoneCliente || 'desconhecido'}
${pushName ? `\n👤 Nome do WhatsApp: ${pushName}\n` : ''}${secaoCliente}
━━━━━━━━━━━━━━━━━━━━━━━━
${estadoTexto}
━━━━━━━━━━━━━━━━━━━━━━━━

⬇️ FLUXO: siga exatamente os passos abaixo ⬇️

ORDEM: cliente → servico → profissional → para_quem → data → horario → confirmar

⚠️ REGRA DE OURO: iniciarAgendamento() ANTES de qualquer definir*
❌ NUNCA chame definirServico, definirProfissional, definirData etc ANTES de iniciarAgendamento.
✅ Primeiro: iniciarAgendamento(), DEPOIS: definir* tools.

━━━━━━━━━━━━━━━━━━━━━━━━
⚡ ATALHO "O DE SEMPRE"
━━━━━━━━━━━━━━━━━━━━━━━━
Se o cliente disser FRASE QUE SUGIRA REPETIR o último serviço:
"o de sempre", "a mesma coisa", "faz o de sempre", "o mesmo de antes"

PASSO A PASSO:
1. Chame buscarHistoricoCliente() para ver o ÚLTIMO serviço e profissional
2. Chame iniciarAgendamento()
3. Se o histórico tiver serviço E profissional:
   Chame definirServico + definirProfissional JUNTOS com os valores do histórico
4. Depois pergunte APENAS data e horário:
   "[Nome], pra repetir aquele [servico] com [prof]? Só me dizer o dia e horário que você quer."
5. Aceite resposta natural: "hoje 14h", "amanhã 10h", "sexta"
   Chame definirData + definirHorario

⚠️ NUNCA pergunte serviço e profissional de novo se o histórico já mostrar.
O cliente falou "o de sempre" porque QUER o mesmo de antes.

━━━━━━━━━━━━━━━━━━━━━━━━
INÍCIO:
- Antes de qualquer coisa, chame buscarHistoricoCliente() para saber se o cliente já tem histórico
- Se for cliente NOVO (sem cadastro): peça "Pra começar, qual seu nome completo?" → cadastrarClientePrincipal
- Se for cliente frequente E falou "quero agendar": primeiro veja o histórico para personalizar
- Se cliente disse "quero agendar" MAS o histórico mostrar serviço e profissional: use o atalho "o de sempre" acima

CADA PASSO:
- Veja o PRÓXIMO SLOT pendente (❌) e faça a PERGUNTA ALVO dele
- Após resposta do cliente, use a tool "definir*" daquele slot
- NUNCA pule um passo. NUNCA pergunte de novo sobre o que já está ✅
- Se cliente já disse o nome MAS o slot cliente ainda não está preenchido: chame cadastrarClientePrincipal IMEDIATAMENTE

EXTRAÇÃO MÚLTIPLA (obrigatório):
Cliente deu VÁRIAS info de uma vez? Chame VÁRIAS tools juntas.
"quero corte amanhã com Luiz às 15h" → definirServico + definirProfissional + definirData + definirHorario
NÃO pergunte um por um.

📅 REPETIÇÃO SEMANAL (agenda recorrente):
Se cliente pedir para repetir toda semana:
"quero toda sexta 14h" ou "toda semana" ou "repetir"
1. Avise que por enquanto só pode agendar UM de cada vez
2. Faça o primeiro agendamento normalmente
3. No resumo, diga: "Por enquanto marquei só [data]. Se quiser, depois que esse passar, é só me chamar que agendo o próximo!"

PERGUNTAS ALVO (use exatamente estas):

1️⃣ SERVIÇO pendente:
   "O que você vai querer fazer hoje?"
   Se cliente já disse o tipo, filtre e mostre só os relacionados.
   Mostre: "1. Corte Masculino - R$45 (30min)"
   → definirServico(valor)

2️⃣ PROFISSIONAL pendente:
   "Com qual profissional você prefere?"
   Se o tool retornar "formatado", use EXATAMENTE aquele texto (já vem numerado com especialidades).
   → definirProfissional(valor)

3️⃣ PARA QUEM pendente:
   "É pra você mesmo ou para outra pessoa?"
   Se for pra outro, peça o nome completo da pessoa.
   Após resposta: definirParaQuem(tipo, nome?)

4️⃣ DATA pendente:
   Pergunte: "Pra qual dia você gostaria de agendar?"
   Aceite respostas naturais (hoje, amanhã, sexta, 15/06).
   Se não entender: "Pode falar de outro jeito? Ex: amanhã, sexta, 15/06"
   Após resposta: definirData(data)

5️⃣ HORÁRIO pendente:
   Pergunte: "Qual horário fica melhor pra você?"
   Se o tool retornar "formatado", use EXATAMENTE aquele texto (já vem bonito e agrupado por período).
   Se não vier formatado, agrupe por período: manhã, tarde, especial.
   Após resposta: definirHorario(horario)

6️⃣ TODOS PREENCHIDOS (✅✅✅✅✅✅):
   Mostre resumo começando com o nome: "João, confere: Corte R$45 com Carlos amanhã às 14h. Tudo certo?"
   Se "sim" → finalizarAgendamento()
   Se "não" → pergunte o que mudar e use a tool "definir*" certa

Exemplo de confirmação:
   "João, confere?
   Corte Masculino - R$45
   Com Carlos
   Amanhã às 14h
   Posso confirmar?"

━━━━━━━━━━━━━━━━━━━━━━━━
🎭 RECLAMAÇÕES E OBJEÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━
1. ACOLHA pelo nome: "João, entendo sua frustração."
2. RESOLVA ou chame humano se necessário.

━━━━━━━━━━━━━━━━━━━━━━━━
🔄 CANCELAR / REMARCAR
━━━━━━━━━━━━━━━━━━━━━━━━
NUNCA cancele de cara. PRIMEIRO ofereça remarcar.
1. listarMeusAgendamentos → "João, você tem [X] agendado pra [data]. Prefere remarcar?"
2. Se quiser remarcar → pergunte nova data/hora → reagendarAgendamento
3. Só cancele se cliente disser "não, quero cancelar mesmo" (confirmacao_explicita=true)

━━━━━━━━━━━━━━━━━━━━━━━━
🆕 PÓS-AGENDAMENTO (após finalizar)
━━━━━━━━━━━━━━━━━━━━━━━━
Depois que o agendamento for criado com sucesso, SEMPRE:
1. Confirme os detalhes finais com entusiasmo:
   "Perfeito, [nome]! ✅ Seu agendamento foi confirmado!"
2. Mostre um resumo SIMPLES: data, horário, profissional, serviço
3. Pergunte: "Precisa de mais alguma coisa?"
4. Se for cliente novo: "Foi um prazer te atender, [nome]! Se precisar de algo, é só chamar aqui pelo WhatsApp! 😊"
5. Ofereça: "Quer que eu te mande um lembrete próximo do dia?"

━━━━━━━━━━━━━━━━━━━━━━━━
🎙️ ÁUDIO / IMAGEM / SERVIÇO NOVO
━━━━━━━━━━━━━━━━━━━━━━━━
Áudio: já transcrito. Responda normal. Não mencione transcrição.
Imagem: descreva e use como contexto.
Serviço não encontrado: use registrarSolicitacaoEspecial. Seja acolhedor.

━━━━━━━━━━━━━━━━━━━━━━━━
🤝 TRANSFERIR PARA HUMANO
━━━━━━━━━━━━━━━━━━━━━━━━
- Frustração clara ou cliente pediu falar com alguém
- Não resolveu em 2 tentativas
Use transferirParaHumano(motivo).`;

  if (promptPersonalizado && promptPersonalizado.trim()) {
    return prompt + `\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nINSTRUÇÕES PERSONALIZADAS DA BARBEARIA\n━━━━━━━━━━━━━━━━━━━━━━━━\n${promptPersonalizado}`;
  }

  return prompt;
}

// ============================================================
// DADOS DO CLIENTE PARA PERSONALIZAÇÃO DO PROMPT
// ============================================================

async function buscarDadosClienteParaPrompt(barbeariaId, telefone) {
  const tel = String(telefone || '').replace(/\D/g, '');
  const ultimos11 = tel.slice(-11);
  if (ultimos11.length < 10) return null;

  try {
    const { rows: clienteRows } = await query(
      `SELECT id, nome, total_visitas FROM clientes
        WHERE barbearia_id = $1 AND REPLACE(telefone, '-', '') LIKE $2 LIMIT 1`,
      [barbeariaId, `%${ultimos11}`]
    );

    if (!clienteRows[0]) return null;
    const cli = clienteRows[0];

    // Último agendamento
    const { rows: ultimoAg } = await query(
      `SELECT s.nome AS servico_nome, p.nome AS profissional_nome
         FROM agendamentos a
         LEFT JOIN servicos s ON s.id = a.servico_id
         LEFT JOIN profissionais p ON p.id = a.profissional_id
        WHERE a.barbearia_id = $1 AND a.cliente_id = $2
        ORDER BY a.data_hora DESC LIMIT 1`,
      [barbeariaId, cli.id]
    );

    // Próximo agendamento
    const { rows: proxAg } = await query(
      `SELECT s.nome AS servico_nome, p.nome AS profissional_nome, a.data_hora
         FROM agendamentos a
         LEFT JOIN servicos s ON s.id = a.servico_id
         LEFT JOIN profissionais p ON p.id = a.profissional_id
        WHERE a.barbearia_id = $1 AND a.cliente_id = $2
          AND a.status NOT IN ('cancelado', 'concluido')
          AND a.data_hora >= NOW()
        ORDER BY a.data_hora LIMIT 1`,
      [barbeariaId, cli.id]
    );

    return {
      nome: cli.nome,
      total_visitas: cli.total_visitas,
      ultimo_servico: ultimoAg[0]?.servico_nome || null,
      ultimo_profissional: ultimoAg[0]?.profissional_nome || null,
      agendamento_proximo: proxAg[0]
        ? `${proxAg[0].servico_nome} com ${proxAg[0].profissional_nome} em ${new Date(proxAg[0].data_hora).toLocaleDateString('pt-BR')} às ${new Date(proxAg[0].data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : null,
    };
  } catch (err) {
    console.error('⚠️ Erro ao buscar dados do cliente para prompt:', err.message);
    return null;
  }
}

// ============================================================
// PROCESSAR MENSAGEM (entry point principal)
// ============================================================

export async function processarMensagem(barbeariaId, barbeariaNome, mensagemCliente, historico, promptPersonalizado, telefoneCliente, imagemBase64 = null, imagemMimetype = 'image/jpeg', pushName = null) {
  console.log(`\n🤖 ====== PROCESSAR MENSAGEM ======`);
  console.log(`📍 ${barbeariaNome} (${barbeariaId})`);
  console.log(`📞 ${telefoneCliente}`);
  console.log(`💬 ${mensagemCliente}`);
  
  const ai = getOpenAI();
  if (!ai) {
    return { resposta: 'Desculpe, sistema temporariamente indisponível.', toolsExecutados: [] };
  }
  
  // Carrega estado
  let estado = await ws.carregarEstado(barbeariaId, telefoneCliente);
  console.log(`📋 Fluxo: ${estado.fluxo_ativo || 'nenhum'}`);
  if (estado.fluxo_ativo === 'agendamento') {
    const prox = ws.proximoSlot(estado);
    console.log(`📋 Próximo slot: ${prox}`);
  }

  // Busca dados do cliente para personalização do prompt
  const dadosCliente = await buscarDadosClienteParaPrompt(barbeariaId, telefoneCliente);

  // Enriquece com pushName do WhatsApp (nome que o cliente usa no perfil)
  if (pushName && dadosCliente && !dadosCliente.nome) {
    dadosCliente.nome = pushName;
  } else if (pushName && !dadosCliente) {
    // Cliente novo mas temos o pushName
    // Não cria dadosCliente aqui (cliente ainda não existe no banco)
    // mas passa o nome para o prompt
  }

  // Sessão: se passou mais de 30 min sem interação, começa do zero
  let historicoLimitado = (historico || []).slice(-30);
  try {
    const telLimpoParaConv = String(telefoneCliente || '').replace(/[^0-9]/g, '');
    const { rows: convCheck } = await query(
      `SELECT ultima_interacao FROM ai_conversas WHERE barbearia_id = $1 AND cliente_telefone = $2`,
      [barbeariaId, telLimpoParaConv || telefoneCliente]
    );
    if (convCheck[0]?.ultima_interacao) {
      const diffMs = Date.now() - new Date(convCheck[0].ultima_interacao).getTime();
      if (diffMs > 30 * 60 * 1000) {
        console.log(`   🕐 Sessão expirada (${Math.round(diffMs/60000)}min). Histórico zerado.`);
        historicoLimitado = [];
      }
    }
  } catch (e) {
    console.warn('   ⚠️ Erro ao verificar sessão:', e.message);
  }
  
  const ctx = { barbeariaId, telefone: telefoneCliente, estado, consultouBase: false, toolInteractionMessages: null };
  const toolsExecutados = [];
  const toolInteractionMessages = [];
  ctx.toolInteractionMessages = toolInteractionMessages;
  
  try {
    let iteracao = 0;
    const MAX_ITERACOES = 12;
    
    // Base do messages: system + historico + user message
    // Se há imagem, monta content como array [text, image_url] (Vision)
    let userContent;
    if (imagemBase64) {
      userContent = [
        { type: 'text', text: mensagemCliente || 'O cliente enviou uma imagem.' },
        { type: 'image_url', image_url: { url: `data:${imagemMimetype};base64,${imagemBase64}` } },
      ];
    } else {
      userContent = mensagemCliente;
    }
    
    const systemMsg = { role: 'system', content: montarSystemPrompt(barbeariaNome, telefoneCliente, ctx.estado, promptPersonalizado, dadosCliente, pushName) };
    const baseMessages = [
      systemMsg,
      ...historicoLimitado,
      { role: 'user', content: userContent },
    ];
    
    while (iteracao < MAX_ITERACOES) {
      iteracao++;
      
      const MODEL_NAME = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      
      // Monta messages completas: base + interações anteriores das tools
      let messages = [
        ...baseMessages,
        ...toolInteractionMessages,
      ];
      
      const resp = await ai.chat.completions.create({
        model: MODEL_NAME,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens: 1200,
      });
      
      const choice = resp.choices[0];
      const msg = choice.message;
      
      // Sem tools = resposta final
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        await ws.salvarEstado(barbeariaId, telefoneCliente, ctx.estado);
        
        const resposta = msg.content || 'Desculpe, não consegui processar. Pode reformular?';
        console.log(`✅ Resposta: ${resposta.substring(0, 80)}...`);
        return { resposta, toolsExecutados, toolInteractionMessages };
      }
      
      // Executa tools
      const toolResults = [];
      for (const tc of msg.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch (err) {
          console.warn(`[ai] JSON inválido nos argumentos da tool "${tc.function.name}": ${err?.message}`);
        }
        
        const { resultado, novoEstado } = await executarTool(ctx, tc.function.name, args);
        
        if (novoEstado) {
          ctx.estado = novoEstado;
        }
        
        toolResults.push({
          tool_call_id: tc.id,
          name: tc.function.name,
          args,
          resultado,
        });
        
        toolsExecutados.push({ name: tc.function.name, args, resultado });
      }
      
      // Detecta loop sem progresso: mesma combinação (tool + args + resultado) repetida
      if (!ctx.toolSignatures) ctx.toolSignatures = [];
      for (const tr of toolResults) {
        const sig = `${tr.name}|${JSON.stringify(tr.args)}|${JSON.stringify(tr.resultado)}`;
        if (ctx.toolSignatures.includes(sig)) {
          console.warn(`⚠️ Loop sem progresso detectado: ${tr.name} com mesmos args/resultado. Forçando resposta.`);
          await ws.salvarEstado(barbeariaId, telefoneCliente, ctx.estado);
          return {
            resposta: 'Desculpe, tive uma confusão. Pode me dizer novamente o que precisa?',
            toolsExecutados,
            toolInteractionMessages,
          };
        }
        ctx.toolSignatures.push(sig);
      }
      
      // ===== PROTEÇÃO ANTI-PERDA DE CONTEXTO =====
      // Detecta se a IA está perdendo tempo com tools de consulta sem avançar o checklist
      if (!ctx.ferramentaModificadoraChamada) ctx.ferramentaModificadoraChamada = false;
      if (!ctx.iteracoesSemProgresso) ctx.iteracoesSemProgresso = 0;
      
      const STATE_TOOLS = [
        'iniciarAgendamento', 'cadastrarClientePrincipal', 'definirServico',
        'definirProfissional', 'definirParaQuem', 'definirData',
        'definirHorario', 'finalizarAgendamento', 'cancelarFluxoAtual',
        'cancelarAgendamentoExistente', 'reagendarAgendamento',
        'registrarSolicitacaoEspecial', 'responderCliente',
      ];
      
      const chamouStateTool = toolResults.some(tr => STATE_TOOLS.includes(tr.name));
      const chamouResponder = toolResults.some(tr => tr.name === 'responderCliente');
      
      if (chamouStateTool && !chamouResponder) {
        // Avançou o estado (chamou definir*, finalizar*, etc) — progresso real
        ctx.ferramentaModificadoraChamada = true;
        ctx.iteracoesSemProgresso = 0;
      } else if (!chamouStateTool && iteracao >= 2) {
        // Só chamou consultas (listar*, consultar*) sem modificar estado
        ctx.iteracoesSemProgresso++;
        
        if (ctx.iteracoesSemProgresso >= 2 && !chamouResponder) {
          console.warn(`⚠️ Re-rail: ${ctx.iteracoesSemProgresso} iterações só com consultas. Injetando redirecionamento.`);
          
          // Injeta mensagem do sistema para reorientar a IA
          const estadoAtual = ws.formatarEstadoParaPrompt(ctx.estado);
          toolInteractionMessages.push({
            role: 'system',
            content: `⚠️ RE-RAIL: Você está perdendo tempo com consultas sem avançar o agendamento.
📋 CHECKLIST ATUAL:
${estadoAtual}
🎯 OBJETIVO: Preencha os slots pendentes (❌) ou finalize se completo.
❌ Não consulte mais informações a menos que ESSENCIAL.
✅ Chame a tool certa para o próximo slot pendente AGORA.`,
          });
          ctx.iteracoesSemProgresso = 0;
        }
      }

      // Detecta ferramenta chamada mas erro bloqueou — força re-rail na próxima
      const algumaToolComErro = toolResults.some(tr => tr.resultado?.erro);
      if (algumaToolComErro && iteracao >= 2) {
        console.warn('⚠️ Re-rail: tool retornou erro, reorientando IA.');
        const estadoAtual = ws.formatarEstadoParaPrompt(ctx.estado);
        // Injeta mensagem do sistema para corrigir o rumo
        toolInteractionMessages.push({
          role: 'system',
          content: `⚠️ CORREÇÃO DE ROTA: Uma tool retornou erro. Revise o 📋 checklist e o erro acima.
🎯 OBJETIVO: Preencha os slots pendentes (❌) ou peça ao cliente o que está faltando.
✅ Chame a tool certa com os parâmetros CORRETOS.`,
        });
      }
      toolInteractionMessages.push(
        msg,
        ...toolResults.map(tr => ({
          role: 'tool',
          tool_call_id: tr.tool_call_id,
          content: JSON.stringify(tr.resultado),
        }))
      );
      
      // SHORT-CIRCUIT: Se finalizarAgendamento retornou pendente_confirmacao,
      // NÃO deixa a IA gerar resposta (ela diria "✅ Agendado!" incorretamente)
      const temPendente = toolResults.some(tr => tr.resultado?.pendente_confirmacao === true);
      if (temPendente) {
        await ws.salvarEstado(barbeariaId, telefoneCliente, ctx.estado);
        const msgPendente = '⏳ Seu horário especial foi solicitado! A barbearia vai confirmar em breve e avisamos você assim que aprovarem. Te esperamos! 💈';
        console.log(`✅ Resposta (pendente): ${msgPendente.substring(0, 80)}...`);
        return { resposta: msgPendente, toolsExecutados, toolInteractionMessages };
      }

      // Atualiza system prompt com novo estado para próxima iteração
      systemMsg.content = montarSystemPrompt(barbeariaNome, telefoneCliente, ctx.estado, promptPersonalizado, dadosCliente, pushName);

      // SHORT-CIRCUIT: Se responderCliente foi chamada, usa a mensagem como resposta final
      const temResponder = toolResults.find(tr => tr.name === 'responderCliente');
      if (temResponder) {
        // Se foi BLOQUEADO (erro), não encerra — deixa a IA ver o erro e tentar de novo
        if (temResponder.resultado?.erro) {
          console.warn(`   🛑 responderCliente bloqueado. IA vai tentar novamente.`);
          continue;
        }
        await ws.salvarEstado(barbeariaId, telefoneCliente, ctx.estado);
        const resposta = temResponder.args.mensagem || 'Desculpe, não consegui processar. Pode reformular?';
        console.log(`✅ Resposta (responderCliente): ${resposta.substring(0, 80)}...`);
        return { resposta, toolsExecutados, toolInteractionMessages };
      }
    }
    
    // Limite de iterações - força resposta sem tools
    console.warn('⚠️  Limite de iterações atingido, forçando resposta final');
    
    const respostaFinal = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        ...baseMessages,
        ...toolInteractionMessages,
        { 
          role: 'system', 
          content: `Você atingiu o limite de chamadas de ferramenta.
NÃO chame mais ferramentas. Responda DIRETAMENTE ao cliente em texto natural.
Se ainda faltarem dados, PEÇA educadamente. Se estiver tudo ok, CONFIRME.
🎯 Foco: complete o que falta ou confirme o que já tem.` 
        },
      ],
      tools: [],
      tool_choice: 'none',
      temperature: 0.3,
      max_tokens: 800,
    });
    
    await ws.salvarEstado(barbeariaId, telefoneCliente, ctx.estado);
    
    let respostaTexto = respostaFinal.choices[0].message.content || 'Pode me dizer novamente o que precisa?';
    // Sanitiza: remove tags XML de tool_calls que o modelo pode gerar acidentalmente
    respostaTexto = respostaTexto.replace(/<tool_calls>[\s\S]*?(?:<\/tool_calls>|$)/gi, '');
    respostaTexto = respostaTexto.replace(/<invoke[\s\S]*?(?:<\/invoke>|$)/gi, '');
    respostaTexto = respostaTexto.replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, '');
    respostaTexto = respostaTexto.replace(/<\/?tool_calls?>/gi, '');
    respostaTexto = respostaTexto.replace(/<\/?invoke[^>]*>/gi, '');
    respostaTexto = respostaTexto.replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/gi, '');
    respostaTexto = respostaTexto.trim();
    if (!respostaTexto) respostaTexto = 'Pode me dizer novamente o que precisa?';
    
    return {
      resposta: respostaTexto,
      toolsExecutados,
      toolInteractionMessages,
    };
    
  } catch (err) {
    console.error('❌ ERRO processarMensagem:', err.message);
    if (err.status === 429) {
      return { resposta: 'Muitas mensagens agora. Tente em alguns segundos. 😊', toolsExecutados: [] };
    }
    return { resposta: 'Desculpe, problema técnico. Pode tentar de novo?', toolsExecutados: [] };
  }
}

// ============================================================
// PERSISTÊNCIA DE HISTÓRICO (compat)
// ============================================================

export async function getConversa(barbeariaId, telefone) {
  const tel = String(telefone || '').replace(/\D/g, '');
  const { rows } = await query(
    `SELECT historico FROM ai_conversas 
      WHERE barbearia_id = $1 AND cliente_telefone = $2`,
    [barbeariaId, tel]
  );
  return rows[0] || null;
}

export async function salvarConversa(barbeariaId, telefone, historico) {
  const tel = String(telefone || '').replace(/\D/g, '');
  const limitado = historico.slice(-30);
  
  await query(
    `INSERT INTO ai_conversas (barbearia_id, cliente_telefone, historico, ultima_interacao)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (barbearia_id, cliente_telefone) DO UPDATE SET
        historico = $3,
        ultima_interacao = now()`,
    [barbeariaId, tel, JSON.stringify(limitado)]
  );
}
