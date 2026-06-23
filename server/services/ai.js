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

import OpenAI from 'openai';
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
  
  try {
    _openai = new OpenAI({ apiKey: key, timeout: 30000, maxRetries: 2 });
    console.log('✅ OpenAI cliente inicializado');
  } catch (err) {
    console.error('❌ Erro ao inicializar OpenAI:', err.message);
    return null;
  }
  
  return _openai;
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
  const hoje = new Date();
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
  
  // Nome (match exato, depois parcial)
  const valorLower = valorStr.toLowerCase();
  
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
      description: 'Consulta horários disponíveis em uma data específica (sem precisar definir nada). Útil quando cliente pergunta "tem horário disponível?".',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data em formato natural ou ISO' },
          profissional: { type: 'string', description: 'Profissional opcional (UUID, nome ou posição)' },
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
      description: 'Lista os agendamentos futuros do cliente que está conversando. Útil para cancelamento/reagendamento.',
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
  
  try {
    switch (toolName) {
      // ───── INICIAR ─────
      case 'iniciarAgendamento': {
        // Busca ou identifica o cliente automaticamente
        const tel = String(telefone || '').replace(/\D/g, '');
        const { rows: clienteRows } = await query(
          `SELECT id, nome, telefone FROM clientes
            WHERE barbearia_id = $1 AND telefone LIKE $2 LIMIT 1`,
          [barbeariaId, `%${tel.slice(-11)}%`]
        );
        
        const clienteData = clienteRows[0] || null;
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
        
        // Verifica se já existe
        const { rows: existentes } = await query(
          `SELECT id, nome FROM clientes 
            WHERE barbearia_id = $1 AND telefone = $2 LIMIT 1`,
          [barbeariaId, tel]
        );
        
        let clienteId, clienteNome;
        if (existentes[0]) {
          clienteId = existentes[0].id;
          clienteNome = existentes[0].nome;
          console.log(`   ℹ️  Cliente já existia: ${clienteNome}`);
        } else {
          const { rows: novo } = await query(
            `INSERT INTO clientes (barbearia_id, nome, telefone, total_visitas)
             VALUES ($1, $2, $3, 0) RETURNING id, nome`,
            [barbeariaId, nome, tel]
          );
          clienteId = novo[0].id;
          clienteNome = novo[0].nome;
          console.log(`   ✅ Cliente cadastrado: ${clienteNome}`);
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
          // Verifica se o cliente está identificado
          if (!estado.slots.cliente.preenchido) {
            // Tenta identificar agora
            const tel = String(telefone || '').replace(/\D/g, '');
            const { rows } = await query(
              `SELECT id, nome FROM clientes WHERE barbearia_id = $1 AND telefone LIKE $2 LIMIT 1`,
              [barbeariaId, `%${tel.slice(-11)}%`]
            );
            if (!rows[0]) {
              return {
                resultado: {
                  erro: 'Cliente principal ainda não foi identificado/cadastrado. Cadastre o cliente primeiro com cadastrarClientePrincipal.',
                },
              };
            }
            // Atualiza slot cliente também
            const estadoComCliente = ws.definirSlot(estado, 'cliente', { id: rows[0].id, nome: rows[0].nome });
            valor = { tipo: 'proprio_cliente', cliente_alvo_id: rows[0].id };
            const novoEstado = ws.definirSlot(estadoComCliente, 'para_quem', valor);
            return {
              resultado: { sucesso: true, mensagem: 'Agendamento será para o próprio cliente.' },
              novoEstado,
            };
          }
          valor = { tipo: 'proprio_cliente', cliente_alvo_id: estado.slots.cliente.valor.id };
        } else {
          // Terceiro - precisa do nome
          if (!args.nome_pessoa || args.nome_pessoa.trim().length < 2) {
            return {
              resultado: { erro: 'Para agendamento de terceiro, forneça nome_pessoa (nome completo da pessoa).' },
            };
          }
          
          // Cadastra o terceiro como cliente
          const tel = String(telefone || '').replace(/\D/g, '');
          const nomeTerceiro = args.nome_pessoa.trim();
          
          // Verifica se já existe cliente com nome similar e mesmo telefone
          const { rows: existentes } = await query(
            `SELECT id, nome FROM clientes 
              WHERE barbearia_id = $1 AND telefone = $2 AND LOWER(nome) = LOWER($3) LIMIT 1`,
            [barbeariaId, tel, nomeTerceiro]
          );
          
          let clienteAlvoId;
          if (existentes[0]) {
            clienteAlvoId = existentes[0].id;
          } else {
            // Cadastra novo cliente (mesmo telefone, mas pode dar conflito de unique)
            // Como a tabela tem UNIQUE (barbearia_id, telefone), vamos usar telefone vazio para terceiros
            const telTerceiro = `${tel}-${Date.now().toString().slice(-4)}`;
            const { rows: novo } = await query(
              `INSERT INTO clientes (barbearia_id, nome, telefone, total_visitas)
               VALUES ($1, $2, $3, 0) RETURNING id`,
              [barbeariaId, nomeTerceiro, telTerceiro]
            );
            clienteAlvoId = novo[0].id;
          }
          
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
        const hoje = new Date();
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
        
        const disponiveis = await calcularHorariosDisponiveis(barbeariaId, data, profId);
        
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
        // Idempotência: já foi criado recentemente?
        if (ws.temAgendamentoRecente(estado, 5)) {
          const { rows } = await query(
            `SELECT a.id, a.data_hora, c.nome AS cliente_nome,
                    s.nome AS servico_nome, p.nome AS profissional_nome, a.preco
               FROM agendamentos a
               LEFT JOIN clientes c ON c.id = a.cliente_id
               LEFT JOIN servicos s ON s.id = a.servico_id
               LEFT JOIN profissionais p ON p.id = a.profissional_id
              WHERE a.id = $1`,
            [estado.agendamento_criado_id]
          );
          if (rows[0]) {
            return {
              resultado: {
                ja_criado: true,
                agendamento: rows[0],
                mensagem: 'Este agendamento JÁ FOI CRIADO há poucos minutos. Não criar duplicado. Avise o cliente que o agendamento está confirmado.',
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
        
        // Determina cliente_id (próprio ou terceiro)
        const clienteAlvoId = slots.para_quem.valor.cliente_alvo_id || slots.cliente.valor.id;
        
        // Observações para terceiro
        let observacoes = null;
        if (slots.para_quem.valor.tipo === 'terceiro') {
          observacoes = `Agendado por ${slots.cliente.valor.nome} para ${slots.para_quem.valor.nome_pessoa}`;
        }
        
        // CRIA O AGENDAMENTO (envia STRING para data_hora — sem conversão de TZ)
        const { rows } = await query(
          `INSERT INTO agendamentos
            (barbearia_id, cliente_id, servico_id, profissional_id, data_hora,
             duracao_minutos, preco, status, observacoes)
           VALUES ($1, $2, $3, $4, $5::timestamp, $6, $7, 'agendado', $8)
           RETURNING id, data_hora`,
          [
            barbeariaId, clienteAlvoId, slots.servico.valor.id, slots.profissional.valor.id,
            dataHoraStr, slots.servico.valor.duracao, slots.servico.valor.preco, observacoes,
          ]
        );
        
        const agendamentoId = rows[0].id;
        console.log(`   ✅ AGENDAMENTO CRIADO: ${agendamentoId}`);
        
        // Cria comanda automaticamente
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
        } catch {}
        
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
          `SELECT id, nome, especialidade FROM profissionais
            WHERE barbearia_id = $1 AND ativo = true ORDER BY ordem, nome`,
          [barbeariaId]
        );
        return {
          resultado: {
            total: rows.length,
            profissionais: rows.map((p, i) => ({
              posicao: i + 1,
              id: p.id,
              nome: p.nome,
              especialidade: p.especialidade,
            })),
          },
        };
      }
      
      case 'consultarHorariosLivres': {
        const dataYMD = parsearData(args.data);
        if (!dataYMD) {
          return { resultado: { erro: `Data "${args.data}" não reconhecida.` } };
        }
        
        let profId = null;
        if (args.profissional) {
          const p = await resolverProfissional(barbeariaId, args.profissional);
          if (!p) return { resultado: { erro: `Profissional "${args.profissional}" não encontrado.` } };
          profId = p.id;
        }
        
        const livres = await calcularHorariosDisponiveis(barbeariaId, dataYMD, profId);
        
        return {
          resultado: {
            data: dataYMD,
            data_formatada: formatarDataLegivel(dataYMD),
            horarios_livres: livres,
            total: livres.length,
          },
        };
      }
      
      case 'consultarInfoBarbearia': {
        const { rows } = await query(
          `SELECT nome, telefone, email, endereco, horario_config FROM barbearias WHERE id = $1`,
          [barbeariaId]
        );
        if (!rows[0]) return { resultado: { erro: 'Barbearia não encontrada' } };
        return {
          resultado: {
            nome: rows[0].nome,
            telefone: rows[0].telefone,
            email: rows[0].email,
            endereco: rows[0].endereco,
            horarios: rows[0].horario_config,
          },
        };
      }
      
      case 'listarMeusAgendamentos': {
        const tel = String(telefone || '').replace(/\D/g, '');
        const { rows } = await query(
          `SELECT a.id, a.data_hora, a.status, a.preco,
                  s.nome AS servico_nome, p.nome AS profissional_nome
             FROM agendamentos a
             JOIN clientes c ON c.id = a.cliente_id
             LEFT JOIN servicos s ON s.id = a.servico_id
             LEFT JOIN profissionais p ON p.id = a.profissional_id
            WHERE a.barbearia_id = $1 AND c.telefone LIKE $2
              AND a.status NOT IN ('cancelado', 'concluido')
              AND a.data_hora >= NOW()
            ORDER BY a.data_hora`,
          [barbeariaId, `%${tel.slice(-11)}%`]
        );
        return { resultado: { total: rows.length, agendamentos: rows } };
      }
      
      case 'cancelarAgendamentoExistente': {
        console.log(`   🚫 CANCELAMENTO solicitado: ${args.agendamento_id} (confirmacao_explicita=${args.confirmacao_explicita})`);
        
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
          `UPDATE agendamentos SET status = 'cancelado', updated_at = NOW()
            WHERE id = $1 AND barbearia_id = $2 AND status NOT IN ('cancelado', 'concluido')`,
          [args.agendamento_id, barbeariaId]
        );
        
        if (rowCount === 0) {
          console.log(`   ❌ UPDATE não afetou nenhuma linha`);
          return { resultado: { erro: 'Não foi possível cancelar (agendamento pode ter mudado de status).' } };
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
        
        // Atualiza
        const { rowCount } = await query(
          `UPDATE agendamentos 
              SET data_hora = $1::timestamp,
                  status = 'agendado',
                  lembrete_enviado_em = NULL,
                  updated_at = NOW()
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
      
      default:
        return { resultado: { erro: `Tool desconhecida: ${toolName}` } };
    }
  } catch (err) {
    console.error(`   ❌ Erro em ${toolName}:`, err.message);
    return { resultado: { erro: `Erro interno: ${err.message}` } };
  }
}

// ============================================================
// HORÁRIOS DISPONÍVEIS
// ============================================================

async function calcularHorariosDisponiveis(barbeariaId, dataYMD, profissionalId) {
  // Config de horários da barbearia
  const { rows: barbRows } = await query(
    `SELECT horario_config FROM barbearias WHERE id = $1`,
    [barbeariaId]
  );
  const cfg = barbRows[0]?.horario_config || {
    manha: { inicio: '08:00', fim: '12:00' },
    tarde: { inicio: '13:00', fim: '19:00' },
    intervalo_minutos: 30,
  };
  
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
  
  // Ocupados
  const params = [barbeariaId, dataYMD];
  let profFilter = '';
  if (profissionalId) {
    params.push(profissionalId);
    profFilter = ` AND profissional_id = $${params.length}`;
  }
  
  const { rows: ocupados } = await query(
    `SELECT data_hora FROM agendamentos
      WHERE barbearia_id = $1 AND data_hora::date = $2::date
        AND status NOT IN ('cancelado')${profFilter}`,
    params
  );
  
  const setOcupados = new Set(ocupados.map(o => {
    // data_hora vem como string "2026-06-23 15:00:00" (TIMESTAMP sem TZ)
    // Extrai HH:MM direto da string para evitar conversão de fuso
    const s = String(o.data_hora);
    const m = s.match(/(\d{2}):(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
    // Fallback se vier como Date
    const d = new Date(o.data_hora);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }));
  
  let livres = slots.filter(s => !setOcupados.has(s));
  
  // Se for hoje, remove horários passados
  const hoje = new Date();
  if (dataYMD === formatarDataYMD(hoje)) {
    const horaAtual = `${String(hoje.getHours()).padStart(2, '0')}:${String(hoje.getMinutes()).padStart(2, '0')}`;
    livres = livres.filter(s => s > horaAtual);
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

function montarSystemPrompt(barbeariaNome, telefoneCliente, estado, promptPersonalizado) {
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
  
  const prompt = `[SLOT-FILLING v4.0] Você é o atendente virtual da barbearia "${barbeariaNome}".

━━━━━━━━━━━━━━━━━━━━━━━━
📞 CLIENTE ATUAL
━━━━━━━━━━━━━━━━━━━━━━━━
Telefone: ${telefoneCliente || 'desconhecido'}
(use SEMPRE este telefone, nunca pergunte ou aceite outro)

━━━━━━━━━━━━━━━━━━━━━━━━
${estadoTexto}
━━━━━━━━━━━━━━━━━━━━━━━━

🛠️ COMO TRABALHAR:

O sistema possui um CHECKLIST INTERNO que controla o fluxo. Você usa TOOLS para preenchê-lo.

REGRAS DE OURO:
1. Cliente quer agendar? → Chame iniciarAgendamento PRIMEIRO.
2. Se cliente é NOVO (não cadastrado): peça nome COMPLETO e use cadastrarClientePrincipal.
3. Use as tools "definir*" para registrar cada decisão. O sistema mantém o estado.
4. NÃO pergunte sobre slots já preenchidos (✅) — eles estão no checklist acima.
5. Para FINALIZAR, todos os slots devem estar ✅ — use finalizarAgendamento.
6. Se cliente quiser MUDAR algo já preenchido, use a tool "definir*" novamente (sobrescreve).
7. Se cliente desistir, use cancelarFluxoAtual.
8. NÃO chame a mesma tool múltiplas vezes em sequência - se uma tool falhou, leia o erro e ajuste.

ORDEM DOS SLOTS (preencha um de cada vez):
1️⃣ cliente (use iniciarAgendamento + cadastrarClientePrincipal se novo)
2️⃣ servico (definirServico)
3️⃣ profissional (definirProfissional)
4️⃣ para_quem (definirParaQuem)
5️⃣ data (definirData)
6️⃣ horario (definirHorario)

🎯 ESTILO DE COMUNICAÇÃO:

Você é uma pessoa atendendo no WhatsApp. NEM ROBÔ FRIO, NEM ENCHEDOR DE LINGUIÇA.
Seja natural, simpático e direto — como um atendente experiente que valoriza o tempo do cliente.

REGRAS:
- Use 1 emoji por mensagem (no máximo 2). Sem exageros.
- Sem markdown (sem **bold**, sem títulos, sem listas com -)
- Listas numeradas: "1. Nome - R$preço" (uma por linha)
- Acolhedor sem ser empolgado em excesso
- Ofereça contexto útil (preço, duração) sem encher
- Quando cliente menciona algo genérico, vá direto para a lista (não pergunte de novo)

📌 EXEMPLOS DO ESTILO CERTO:

Cliente: Boa tarde
✅ "Boa tarde! Como posso te ajudar?"
❌ "Boa tarde! Como posso ajudar?" (muito seco)
❌ "Boa tarde! ☀️ Que prazer falar com você! Como posso te ajudar hoje? 😊" (enrolação)

Cliente: Quero cortar o cabelo
✅ Liste DIRETAMENTE os serviços de corte (sem perguntar "qual serviço?")
"Temos esses cortes:
1. Corte Masculino - R$45
2. Corte Feminino - R$70
3. Corte e Barba - R$90
4. Corte Meia Barba - R$70
Qual você quer?"

Cliente: Quero cortar o cabelo (cliente novo)
✅ "Claro! Pra começar, qual seu nome completo?"
❌ "Qual seu nome completo?" (frio)

Cliente: Antonio
✅ "Prazer, Antonio! Vou te ajudar a agendar. Temos esses cortes:..." (já lista direto)
❌ "Qual serviço?" (perdeu a pessoalidade)

Cliente: 3 (escolheu corte masculino)
✅ "Corte Masculino, anotado. Com qual barbeiro você prefere?
1. JOAO
2. LUIZ  
3. MARCOS"

Cliente: 2
✅ "Beleza, com o LUIZ. É pra você mesmo ou outra pessoa?"

Cliente: Pra mim
✅ "Show. Pra qual dia? Hoje, amanhã ou outro dia?"

Cliente: Amanhã
✅ "Amanhã então. Tem preferência de horário?"

Cliente: 15h
✅ "Perfeito, 15h tá livre.

Confere:
Corte Masculino - R$45
Com LUIZ
Amanhã (23/06) às 15:00

Posso confirmar?"

Cliente: Sim
✅ "Pronto, Antonio! ✅
Agendado pra amanhã (23/06) às 15:00 com o LUIZ.
Te esperamos!"

📌 IMPORTANTE:
- Quando cliente diz "quero corte" → JÁ LISTE os cortes direto, não pergunte "qual serviço?"
- Quando cliente diz "quero barba" → JÁ LISTE os serviços de barba
- Quando cliente diz "quero algo" genérico → liste TUDO disponível
- Use buscarServicoPorNome quando cliente mencionar uma palavra-chave específica
- Use listarServicos quando cliente disser algo bem genérico

📌 TOQUES DE NATURALIDADE PERMITIDOS (use moderadamente):
- "Anotado", "Beleza", "Show", "Perfeito", "Tranquilo", "Combinado"
- "Pra mim", "Pra você"
- Use o NOME do cliente nas confirmações importantes (não em toda mensagem)
- Pequenas variações para não soar repetitivo

QUANDO O CHECKLIST ESTÁ COMPLETO (todos ✅):
- Mostre resumo CURTO e direto:
  "Confere:
  [Serviço] - R$[preço]
  Com [Profissional]
  [Data] às [Hora]
  Confirma?"
- Após cliente dizer "sim", chame finalizarAgendamento
- Após criar, mensagem de confirmação CURTA: "✅ Agendado! [Data] às [Hora] com [Profissional]. Te esperamos!"

PERGUNTAS FORA DO CONTEXTO:
- Cliente pode perguntar sobre preço, endereço, horário a qualquer momento
- Use as tools de query (consultarInfoBarbearia, listarServicos) para responder
- Depois retome o fluxo no slot pendente

DATA E HORA ATUAIS:
Hoje: ${dataFmt} — ${horaFmt}
Amanhã: ${amanhaFmt}

━━━━━━━━━━━━━━━━━━━━━━━━
🔄 CANCELAMENTO E REAGENDAMENTO (LEIA COM ATENÇÃO)
━━━━━━━━━━━━━━━━━━━━━━━━

REGRA DE OURO: Quando cliente pedir para CANCELAR, NUNCA cancele de cara.
Sempre TENTE REMARCAR primeiro — talvez ele só queira mudar o horário.

FLUXO CORRETO:

1. Cliente diz "quero cancelar" ou similar:
   → Use listarMeusAgendamentos pra ver o agendamento
   → Se tem mais de 1, pergunte qual ele quer cancelar
   → Se tem só 1, identifique e pergunte:
     "Vi seu agendamento de [serviço] [data] às [hora] com [profissional].
      Antes de cancelar, prefere remarcar pra outro dia/horário?"

2. Se cliente disser "quero remarcar" / "pode mudar pra outro dia":
   → Pergunte nova data e novo horário
   → Use reagendarAgendamento com novos dados
   → Confirme: "Pronto! Reagendei pra [nova data] às [nova hora]."

3. Se cliente insistir em cancelar (disser "não, quero cancelar mesmo" / "pode cancelar"):
   → Aí sim use cancelarAgendamentoExistente com confirmacao_explicita=true
   → Confirme: "Cancelado. Quando quiser remarcar, é só me chamar."

EXEMPLOS:

Cliente: "quero cancelar"
✅ Bom: "Vi seu agendamento de Corte Masculino, amanhã às 15h com o LUIZ.
        Antes de cancelar, prefere remarcar pra outro horário?"
❌ Errado: "Cancelado!" (cancelou sem oferecer remarcar)

Cliente: "pode remarcar?"
✅ Bom: "Claro! Pra qual dia e horário?"

Cliente: "amanhã 18h"
✅ Use reagendarAgendamento com nova_data=amanhã e novo_horario=18:00

Cliente: "não, prefiro cancelar mesmo"
✅ Use cancelarAgendamentoExistente com confirmacao_explicita=true
   Resposta: "Cancelado. Quando quiser remarcar, me chama."

ATENÇÃO:
- NUNCA chame cancelarAgendamentoExistente sem confirmacao_explicita=true
- A trava do sistema vai bloquear e devolver erro
- Sempre ofereça remarcar primeiro — é uma chance de manter o cliente`;

  if (promptPersonalizado && promptPersonalizado.trim()) {
    return prompt + `\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nINSTRUÇÕES DA BARBEARIA\n━━━━━━━━━━━━━━━━━━━━━━━━\n${promptPersonalizado}`;
  }
  
  return prompt;
}

// ============================================================
// PROCESSAR MENSAGEM (entry point principal)
// ============================================================

export async function processarMensagem(barbeariaId, barbeariaNome, mensagemCliente, historico, promptPersonalizado, telefoneCliente) {
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
  
  const systemPrompt = montarSystemPrompt(barbeariaNome, telefoneCliente, estado, promptPersonalizado);
  
  // Histórico curto (estado já tem o contexto, não precisamos de muito histórico)
  const historicoLimitado = (historico || []).slice(-8);
  
  let messages = [
    { role: 'system', content: systemPrompt },
    ...historicoLimitado,
    { role: 'user', content: mensagemCliente },
  ];
  
  const ctx = { barbeariaId, telefone: telefoneCliente, estado };
  const toolsExecutados = [];
  const ultimasTools = [];  // Detecta loops
  
  try {
    let iteracao = 0;
    const MAX_ITERACOES = 6;
    
    while (iteracao < MAX_ITERACOES) {
      iteracao++;
      
      const resp = await ai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.4,  // Um pouco mais de naturalidade
        max_tokens: 600,   // Continua forçando concisão
      });
      
      const choice = resp.choices[0];
      const msg = choice.message;
      
      // Sem tools = resposta final
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        // Salva estado final
        await ws.salvarEstado(barbeariaId, telefoneCliente, ctx.estado);
        
        const resposta = msg.content || 'Desculpe, não consegui processar. Pode reformular?';
        console.log(`✅ Resposta: ${resposta.substring(0, 80)}...`);
        return { resposta, toolsExecutados };
      }
      
      // Detecta loop: mesma tool 3x seguidas
      const nomesTools = msg.tool_calls.map(tc => tc.function.name).join(',');
      ultimasTools.push(nomesTools);
      if (ultimasTools.length >= 2 && ultimasTools[ultimasTools.length - 1] === ultimasTools[ultimasTools.length - 2]) {
        console.warn(`⚠️  Loop detectado: ${nomesTools} chamado repetidamente. Forçando resposta.`);
        await ws.salvarEstado(barbeariaId, telefoneCliente, ctx.estado);
        return {
          resposta: 'Desculpe, tive uma confusão. Pode me dizer novamente o que precisa?',
          toolsExecutados,
        };
      }
      
      // Executa tools
      const toolResults = [];
      for (const tc of msg.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {}
        
        const { resultado, novoEstado } = await executarTool(ctx, tc.function.name, args);
        
        // Atualiza estado se a tool modificou
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
      
      // Reconstrói prompt com novo estado (importante!)
      const novoSystemPrompt = montarSystemPrompt(barbeariaNome, telefoneCliente, ctx.estado, promptPersonalizado);
      
      // Adiciona ao contexto
      messages = [
        { role: 'system', content: novoSystemPrompt },
        ...historicoLimitado,
        { role: 'user', content: mensagemCliente },
        msg,
        ...toolResults.map(tr => ({
          role: 'tool',
          tool_call_id: tr.tool_call_id,
          content: JSON.stringify(tr.resultado),
        })),
      ];
    }
    
    // Limite de iterações - força resposta sem tools
    console.warn('⚠️  Limite de iterações atingido, forçando resposta final');
    
    const respostaFinal = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        ...messages,
        { 
          role: 'system', 
          content: 'IMPORTANTE: Não chame mais tools. Responda ao cliente diretamente baseado no que já foi coletado. Se faltarem dados, peça ao cliente.' 
        },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });
    
    await ws.salvarEstado(barbeariaId, telefoneCliente, ctx.estado);
    
    return {
      resposta: respostaFinal.choices[0].message.content || 'Pode me dizer novamente o que precisa?',
      toolsExecutados,
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
