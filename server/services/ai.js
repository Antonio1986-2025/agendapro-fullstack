import OpenAI from 'openai';
import { query } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'wa_auth', '.env');

let _openai = null;

/**
 * Inicializa e retorna instância do cliente OpenAI
 * Busca a chave em process.env ou arquivo de configuração
 */
function getOpenAI() {
  if (_openai) return _openai;
  
  let key = process.env.OPENAI_API_KEY;
  
  // Fallback: tenta ler do arquivo de config
  if (!key && fs.existsSync(CONFIG_PATH)) {
    try {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
      if (match) key = match[1].trim();
    } catch (err) {
      console.error('⚠️  Erro ao ler CONFIG_PATH:', err.message);
    }
  }
  
  if (!key) {
    console.error('❌ OPENAI_API_KEY não encontrada! Configure no .env');
    return null;
  }
  
  try {
    _openai = new OpenAI({ 
      apiKey: key,
      timeout: 30000, // 30 segundos timeout
      maxRetries: 2,
    });
    console.log('✅ OpenAI cliente inicializado com sucesso');
  } catch (err) {
    console.error('❌ Erro ao inicializar OpenAI:', err.message);
    return null;
  }
  
  return _openai;
}

/**
 * Definição das ferramentas (tools) disponíveis para o agente IA
 * Seguindo as melhores práticas da OpenAI Function Calling
 */
const tools = [
  {
    type: 'function',
    function: {
      name: 'listarServicos',
      description: 'Lista todos os serviços disponíveis na barbearia com preços e duração. Use quando o cliente perguntar sobre serviços, preços ou o que a barbearia oferece.',
      parameters: { 
        type: 'object', 
        properties: {},
        required: [],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listarProfissionais',
      description: 'Lista todos os profissionais (barbeiros) disponíveis na barbearia. Use quando o cliente perguntar sobre quem são os barbeiros ou suas especialidades.',
      parameters: { 
        type: 'object', 
        properties: {},
        required: [],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verificarDisponibilidade',
      description: 'Verifica horários ocupados e disponíveis para uma data específica. Use quando o cliente quiser saber quais horários estão livres para agendamento.',
      parameters: {
        type: 'object',
        properties: {
          data: { 
            type: 'string', 
            description: 'Data no formato YYYY-MM-DD (exemplo: 2026-06-20). Se o cliente disser "amanhã" ou "hoje", calcule a data correta.',
          },
          profissional_id: { 
            type: 'string', 
            description: 'ID do profissional específico (opcional). Se não informado, mostra disponibilidade de todos.',
          },
        },
        required: ['data'],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscarCliente',
      description: 'Busca um cliente existente pelo número de telefone na base de dados. SEMPRE use esta função ANTES de criar um agendamento para verificar se o cliente já existe.',
      parameters: {
        type: 'object',
        properties: {
          telefone: { 
            type: 'string', 
            description: 'Número de telefone do cliente (apenas números, sem formatação). Exemplo: 11999887766',
          },
        },
        required: ['telefone'],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrarCliente',
      description: 'Cadastra um novo cliente na barbearia. Use APENAS quando buscarCliente retornar null (cliente não existe). Sempre confirme o nome antes de cadastrar.',
      parameters: {
        type: 'object',
        properties: {
          nome: { 
            type: 'string', 
            description: 'Nome completo do cliente',
          },
          telefone: { 
            type: 'string', 
            description: 'Telefone com DDD (apenas números). Exemplo: 11999887766',
          },
        },
        required: ['nome', 'telefone'],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criarAgendamento',
      description: 'Cria um novo agendamento confirmado. Use APENAS após: 1) buscar/cadastrar cliente, 2) cliente escolher serviço e profissional, 3) confirmar data e horário disponível. SEMPRE confirme TODOS os detalhes com o cliente antes de criar.',
      parameters: {
        type: 'object',
        properties: {
          cliente_id: { 
            type: 'string', 
            description: 'ID do cliente (obtido de buscarCliente ou cadastrarCliente)',
          },
          servico_id: { 
            type: 'string', 
            description: 'ID do serviço escolhido (obtido de listarServicos)',
          },
          profissional_id: { 
            type: 'string', 
            description: 'ID do profissional escolhido (obtido de listarProfissionais)',
          },
          data_hora: { 
            type: 'string', 
            description: 'Data e hora no formato ISO completo (YYYY-MM-DDTHH:mm). Exemplo: 2026-06-20T14:30',
          },
        },
        required: ['cliente_id', 'servico_id', 'profissional_id', 'data_hora'],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listarAgendamentosCliente',
      description: 'Lista todos os agendamentos futuros e pendentes de um cliente específico. Use quando o cliente perguntar sobre seus horários marcados.',
      parameters: {
        type: 'object',
        properties: {
          telefone: { 
            type: 'string', 
            description: 'Telefone do cliente (apenas números)',
          },
        },
        required: ['telefone'],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelarAgendamento',
      description: 'Cancela um agendamento existente. Use quando o cliente pedir para cancelar. SEMPRE confirme qual agendamento cancelar antes de executar.',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: { 
            type: 'string', 
            description: 'ID do agendamento a ser cancelado (obtido de listarAgendamentosCliente)',
          },
        },
        required: ['agendamento_id'],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reagendarAgendamento',
      description: 'Altera a data e horário de um agendamento existente. Use quando o cliente quiser mudar a data/hora. SEMPRE confirme a nova data antes de executar.',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: { 
            type: 'string', 
            description: 'ID do agendamento a ser reagendado',
          },
          nova_data_hora: { 
            type: 'string', 
            description: 'Nova data e hora no formato ISO (YYYY-MM-DDTHH:mm). Exemplo: 2026-06-21T10:00',
          },
        },
        required: ['agendamento_id', 'nova_data_hora'],
        additionalProperties: false
      },
    },
  },
];

/**
 * Executa uma ferramenta (tool) específica
 * @param {string} barbeariaId - ID da barbearia
 * @param {string} toolName - Nome da ferramenta
 * @param {object} args - Argumentos da ferramenta
 * @returns {Promise<object>} - Resultado da execução
 */
async function executarTool(barbeariaId, toolName, args) {
  console.log(`🔧 Executando tool: ${toolName}`, JSON.stringify(args, null, 2));
  
  try {
    switch (toolName) {
      case 'listarServicos': {
        const { rows } = await query(
          `SELECT id, nome, duracao_minutos, preco, categoria
             FROM servicos 
            WHERE barbearia_id = $1 AND ativo = true 
            ORDER BY nome`,
          [barbeariaId]
        );
        console.log(`✅ ${rows.length} serviços encontrados`);
        return rows;
      }

      case 'listarProfissionais': {
        const { rows } = await query(
          `SELECT id, nome, especialidade, telefone
             FROM profissionais 
            WHERE barbearia_id = $1 AND ativo = true 
            ORDER BY nome`,
          [barbeariaId]
        );
        console.log(`✅ ${rows.length} profissionais encontrados`);
        return rows;
      }

      case 'verificarDisponibilidade': {
        const { data, profissional_id } = args;
        
        // Valida formato da data
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
          return { erro: 'Formato de data inválido. Use YYYY-MM-DD' };
        }
        
        const params = [barbeariaId, data];
        let profFilter = '';
        if (profissional_id) {
          params.push(profissional_id);
          profFilter = ` AND a.profissional_id = $${params.length}`;
        }
        
        // Busca horários ocupados
        const { rows: ocupados } = await query(
          `SELECT a.data_hora, a.profissional_id, a.duracao_minutos,
                  p.nome AS profissional_nome, s.nome AS servico_nome
             FROM agendamentos a
             JOIN profissionais p ON p.id = a.profissional_id
             LEFT JOIN servicos s ON s.id = a.servico_id
            WHERE a.barbearia_id = $1
              AND a.data_hora::date = $2::date
              AND a.status NOT IN ('cancelado')${profFilter}
            ORDER BY a.data_hora`,
          params
        );
        
        // Busca profissionais ativos
        const { rows: profissionais } = await query(
          `SELECT id, nome, especialidade 
             FROM profissionais 
            WHERE barbearia_id = $1 AND ativo = true
            ORDER BY ordem, nome`,
          [barbeariaId]
        );
        
        console.log(`✅ Disponibilidade: ${ocupados.length} horários ocupados, ${profissionais.length} profissionais`);
        
        return {
          data,
          dia_semana: new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' }),
          ocupados: ocupados.map(o => ({
            hora: new Date(o.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            profissional: o.profissional_nome,
            servico: o.servico_nome || 'Atendimento',
            duracao: o.duracao_minutos,
          })),
          profissionais: profissionais.map(p => ({ 
            id: p.id, 
            nome: p.nome,
            especialidade: p.especialidade,
          })),
        };
      }

      case 'buscarCliente': {
        const tel = args.telefone.replace(/\D/g, '');
        if (tel.length < 10) {
          return { erro: 'Telefone inválido. Precisa ter pelo menos 10 dígitos (DDD + número)' };
        }
        
        const { rows } = await query(
          `SELECT id, nome, telefone, email, total_visitas, created_at
             FROM clientes 
            WHERE barbearia_id = $1 
              AND telefone LIKE $2
            LIMIT 1`,
          [barbeariaId, `%${tel.slice(-11)}%`]
        );
        
        if (rows[0]) {
          console.log(`✅ Cliente encontrado: ${rows[0].nome}`);
        } else {
          console.log(`ℹ️  Cliente não encontrado para telefone: ${tel}`);
        }
        
        return rows[0] || null;
      }

      case 'cadastrarCliente': {
        const tel = args.telefone.replace(/\D/g, '');
        
        if (!args.nome || args.nome.trim().length < 2) {
          return { erro: 'Nome inválido. Precisa ter pelo menos 2 caracteres' };
        }
        
        if (tel.length < 10) {
          return { erro: 'Telefone inválido' };
        }
        
        try {
          const { rows } = await query(
            `INSERT INTO clientes (barbearia_id, nome, telefone, total_visitas) 
             VALUES ($1, $2, $3, 0) 
             ON CONFLICT (barbearia_id, telefone) DO NOTHING 
             RETURNING id, nome, telefone`,
            [barbeariaId, args.nome.trim(), tel]
          );
          
          if (rows[0]) {
            console.log(`✅ Cliente cadastrado: ${rows[0].nome}`);
            return rows[0];
          } else {
            return { erro: 'Cliente já existe com este telefone' };
          }
        } catch (err) {
          console.error('❌ Erro ao cadastrar cliente:', err);
          return { erro: 'Erro ao cadastrar cliente: ' + err.message };
        }
      }

      case 'criarAgendamento': {
        // Valida data/hora
        const dh = new Date(args.data_hora);
        if (isNaN(dh.getTime())) {
          return { erro: 'Data/hora inválida. Use formato YYYY-MM-DDTHH:mm' };
        }
        
        // Verifica se a data não é no passado
        const agora = new Date();
        if (dh < agora) {
          return { erro: 'Não é possível agendar em uma data/hora que já passou' };
        }
        
        // Busca informações do serviço
        const { rows: servico } = await query(
          `SELECT duracao_minutos, preco, nome 
             FROM servicos 
            WHERE id = $1 AND barbearia_id = $2 AND ativo = true`,
          [args.servico_id, barbeariaId]
        );
        
        if (!servico[0]) {
          return { erro: 'Serviço não encontrado ou inativo' };
        }
        
        // Verifica se profissional existe
        const { rows: prof } = await query(
          `SELECT nome FROM profissionais 
            WHERE id = $1 AND barbearia_id = $2 AND ativo = true`,
          [args.profissional_id, barbeariaId]
        );
        
        if (!prof[0]) {
          return { erro: 'Profissional não encontrado ou inativo' };
        }
        
        // Verifica conflito de horário
        const { rows: conflito } = await query(
          `SELECT id FROM agendamentos 
            WHERE barbearia_id = $1 
              AND profissional_id = $2
              AND data_hora = $3
              AND status NOT IN ('cancelado')
            LIMIT 1`,
          [barbeariaId, args.profissional_id, dh]
        );
        
        if (conflito[0]) {
          return { erro: 'Este horário já está ocupado. Escolha outro horário.' };
        }
        
        // Cria o agendamento
        const { rows } = await query(
          `INSERT INTO agendamentos (
             barbearia_id, cliente_id, servico_id, profissional_id, 
             data_hora, duracao_minutos, preco, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'agendado') 
           RETURNING id, data_hora`,
          [
            barbeariaId, 
            args.cliente_id, 
            args.servico_id, 
            args.profissional_id, 
            dh,
            servico[0].duracao_minutos, 
            servico[0].preco
          ]
        );
        
        console.log(`✅ Agendamento criado: ID ${rows[0].id}`);
        
        // Tenta notificar o barbeiro (não-bloqueante)
        try {
          const { notificarBarbeiroNovoAgendamento } = await import('./whatsapp.js');
          await notificarBarbeiroNovoAgendamento(barbeariaId, rows[0].id);
        } catch (err) {
          console.warn('⚠️  Notificação do barbeiro falhou:', err.message);
        }
        
        return { 
          id: rows[0].id,
          data_hora: rows[0].data_hora,
          servico_nome: servico[0].nome, 
          profissional_nome: prof[0].nome,
          preco: servico[0].preco,
          duracao: servico[0].duracao_minutos,
        };
      }

      case 'listarAgendamentosCliente': {
        const tel = args.telefone.replace(/\D/g, '');
        
        const { rows } = await query(
          `SELECT a.id, a.data_hora, a.status, a.preco,
                  s.nome AS servico_nome, s.duracao_minutos,
                  p.nome AS profissional_nome
             FROM agendamentos a
             JOIN clientes c ON c.id = a.cliente_id
             LEFT JOIN servicos s ON s.id = a.servico_id
             LEFT JOIN profissionais p ON p.id = a.profissional_id
            WHERE a.barbearia_id = $1 
              AND c.telefone LIKE $2 
              AND a.status NOT IN ('cancelado', 'concluido')
              AND a.data_hora >= NOW()
            ORDER BY a.data_hora`,
          [barbeariaId, `%${tel.slice(-11)}%`]
        );
        
        console.log(`✅ ${rows.length} agendamentos futuros encontrados`);
        return rows;
      }

      case 'cancelarAgendamento': {
        const { rowCount } = await query(
          `UPDATE agendamentos 
              SET status = 'cancelado' 
            WHERE id = $1 
              AND barbearia_id = $2
              AND status NOT IN ('cancelado', 'concluido')`,
          [args.agendamento_id, barbeariaId]
        );
        
        if (rowCount > 0) {
          console.log(`✅ Agendamento ${args.agendamento_id} cancelado`);
          return { ok: true, mensagem: 'Agendamento cancelado com sucesso' };
        } else {
          return { erro: 'Agendamento não encontrado ou já foi concluído/cancelado' };
        }
      }

      case 'reagendarAgendamento': {
        const dh = new Date(args.nova_data_hora);
        
        if (isNaN(dh.getTime())) {
          return { erro: 'Data/hora inválida' };
        }
        
        if (dh < new Date()) {
          return { erro: 'Não é possível reagendar para uma data/hora que já passou' };
        }
        
        const { rowCount } = await query(
          `UPDATE agendamentos 
              SET data_hora = $1 
            WHERE id = $2 
              AND barbearia_id = $3
              AND status NOT IN ('cancelado', 'concluido')`,
          [dh, args.agendamento_id, barbeariaId]
        );
        
        if (rowCount > 0) {
          console.log(`✅ Agendamento ${args.agendamento_id} reagendado`);
          return { 
            ok: true, 
            nova_data_hora: dh.toISOString(),
            mensagem: 'Agendamento reagendado com sucesso'
          };
        } else {
          return { erro: 'Agendamento não encontrado ou já foi concluído/cancelado' };
        }
      }

      default:
        console.error(`❌ Ferramenta desconhecida: ${toolName}`);
        return { erro: `Ferramenta desconhecida: ${toolName}` };
    }
  } catch (err) {
    console.error(`❌ Erro ao executar ${toolName}:`, err);
    return { erro: `Erro ao executar ${toolName}: ${err.message}` };
  }
}

/**
 * Formata o resultado de uma ferramenta em texto amigável para o usuário
 * @param {string} toolName - Nome da ferramenta
 * @param {object} resultado - Resultado da execução
 * @returns {string} - Texto formatado
 */
function formatarRespostaTool(toolName, resultado) {
  if (resultado?.erro) {
    return `❌ ${resultado.erro}`;
  }

  try {
    switch (toolName) {
      case 'listarServicos':
        if (!resultado || resultado.length === 0) {
          return 'Nenhum serviço cadastrado no momento.';
        }
        return resultado.map(s => {
          const preco = parseFloat(s.preco).toFixed(2);
          const categoria = s.categoria ? ` (${s.categoria})` : '';
          return `✂️ *${s.nome}*${categoria}\n   💰 R$ ${preco} • ⏱️ ${s.duracao_minutos} min`;
        }).join('\n\n');

      case 'listarProfissionais':
        if (!resultado || resultado.length === 0) {
          return 'Nenhum profissional disponível no momento.';
        }
        return resultado.map(p => {
          const esp = p.especialidade ? ` - ${p.especialidade}` : '';
          return `👤 *${p.nome}*${esp}`;
        }).join('\n');

      case 'verificarDisponibilidade': {
        const dataFmt = new Date(resultado.data + 'T12:00:00').toLocaleDateString('pt-BR', { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long' 
        });
        
        let txt = `📅 *Disponibilidade para ${dataFmt}*\n\n`;
        
        if (!resultado.ocupados || resultado.ocupados.length === 0) {
          txt += '✅ Nenhum horário ocupado! Todos os horários estão disponíveis.\n\n';
        } else {
          txt += `🔴 *Horários ocupados:*\n`;
          txt += resultado.ocupados.map(o => 
            `   ${o.hora} - ${o.profissional} (${o.servico})`
          ).join('\n');
          txt += '\n\n';
        }
        
        if (resultado.profissionais && resultado.profissionais.length > 0) {
          txt += `👥 *Profissionais disponíveis:*\n`;
          txt += resultado.profissionais.map(p => {
            const esp = p.especialidade ? ` (${p.especialidade})` : '';
            return `   • ${p.nome}${esp}`;
          }).join('\n');
        }
        
        return txt;
      }

      case 'buscarCliente':
        if (!resultado) {
          return null; // Cliente não encontrado - não retorna mensagem
        }
        const visitas = resultado.total_visitas > 0 ? ` • ${resultado.total_visitas} visitas` : ' • Novo cliente';
        return `✅ Cliente encontrado: *${resultado.nome}*\n   📱 ${resultado.telefone}${visitas}`;

      case 'cadastrarCliente':
        if (!resultado || resultado.erro) {
          return null; // Erro já foi retornado acima
        }
        return `✅ Cliente *${resultado.nome}* cadastrado com sucesso!\n   📱 ${resultado.telefone}`;

      case 'criarAgendamento': {
        if (!resultado || resultado.erro) {
          return null;
        }
        const dataHora = new Date(resultado.data_hora);
        const dataFmt = dataHora.toLocaleDateString('pt-BR', { 
          weekday: 'long', 
          day: '2-digit', 
          month: 'long' 
        });
        const horaFmt = dataHora.toLocaleTimeString('pt-BR', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        const preco = parseFloat(resultado.preco).toFixed(2);
        
        return (
          `✅ *Agendamento confirmado!*\n\n` +
          `✂️ Serviço: ${resultado.servico_nome}\n` +
          `👤 Profissional: ${resultado.profissional_nome}\n` +
          `📅 Data: ${dataFmt}\n` +
          `🕐 Horário: ${horaFmt}\n` +
          `⏱️ Duração: ${resultado.duracao} minutos\n` +
          `💰 Valor: R$ ${preco}\n\n` +
          `Qualquer dúvida, é só me chamar! 😊`
        );
      }

      case 'listarAgendamentosCliente':
        if (!resultado || resultado.length === 0) {
          return '📅 Você não tem agendamentos futuros no momento.';
        }
        return (
          `📅 *Seus agendamentos:*\n\n` +
          resultado.map((a, i) => {
            const dataHora = new Date(a.data_hora);
            const dataFmt = dataHora.toLocaleDateString('pt-BR', { 
              day: '2-digit', 
              month: '2-digit',
              year: 'numeric'
            });
            const horaFmt = dataHora.toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit' 
            });
            const preco = a.preco ? ` • R$ ${parseFloat(a.preco).toFixed(2)}` : '';
            const status = a.status === 'agendado' ? '🟡' : a.status === 'confirmado' ? '🟢' : '🔵';
            
            return (
              `${i + 1}. ${status} *${a.servico_nome || 'Atendimento'}*\n` +
              `   📅 ${dataFmt} às ${horaFmt}\n` +
              `   👤 ${a.profissional_nome || 'Profissional'}${preco}\n` +
              `   🆔 ID: ${a.id}`
            );
          }).join('\n\n')
        );

      case 'cancelarAgendamento':
        return resultado.ok 
          ? '✅ Agendamento cancelado com sucesso! Você pode agendar novamente quando quiser.' 
          : null;

      case 'reagendarAgendamento':
        if (!resultado.ok) return null;
        const novaData = new Date(resultado.nova_data_hora);
        const dataFmt = novaData.toLocaleDateString('pt-BR', { 
          weekday: 'long',
          day: '2-digit', 
          month: 'long' 
        });
        const horaFmt = novaData.toLocaleTimeString('pt-BR', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        return `✅ Agendamento reagendado com sucesso!\n\n📅 Nova data: ${dataFmt}\n🕐 Novo horário: ${horaFmt}`;

      default:
        return JSON.stringify(resultado, null, 2);
    }
  } catch (err) {
    console.error('❌ Erro ao formatar resposta:', err);
    return JSON.stringify(resultado);
  }
}

/**
 * Processa uma mensagem do cliente usando o agente IA
 * @param {string} barbeariaId - ID da barbearia
 * @param {string} barbeariaNome - Nome da barbearia
 * @param {string} mensagemCliente - Mensagem do cliente
 * @param {Array} historico - Histórico de conversas anteriores
 * @param {string} promptPersonalizado - Prompt customizado (opcional)
 * @returns {Promise<object>} - { resposta, toolsExecutados }
 */
export async function processarMensagem(barbeariaId, barbeariaNome, mensagemCliente, historico, promptPersonalizado) {
  console.log(`\n🤖 ====== PROCESSANDO MENSAGEM ======`);
  console.log(`📍 Barbearia: ${barbeariaNome} (${barbeariaId})`);
  console.log(`💬 Mensagem: ${mensagemCliente}`);
  console.log(`📚 Histórico: ${historico?.length || 0} mensagens`);
  
  const ai = getOpenAI();
  if (!ai) {
    console.error('❌ Cliente OpenAI não disponível');
    return { 
      resposta: 'Desculpe, o agente IA não está configurado no momento. Entre em contato com o suporte da barbearia.',
      toolsExecutados: []
    };
  }

  // Prompt do sistema com instruções claras
  const systemPrompt = promptPersonalizado || 
    `Você é o assistente virtual da barbearia "${barbeariaNome}". 🤖

**Seu papel:**
- Ajudar clientes a agendar, cancelar e remarcar horários
- Consultar serviços disponíveis e seus preços
- Fornecer informações sobre os profissionais
- Responder dúvidas sobre a barbearia

**Como você deve agir:**
1. Seja sempre educado, simpático e profissional
2. Use emojis de forma moderada para parecer mais amigável
3. Responda SEMPRE em português brasileiro
4. SEMPRE confirme TODOS os detalhes com o cliente antes de criar/modificar agendamentos
5. Se o cliente pedir para agendar, siga este fluxo:
   a) Busque ou cadastre o cliente
   b) Liste os serviços disponíveis
   c) Liste os profissionais
   d) Verifique disponibilidade na data desejada
   e) Confirme TODOS os detalhes antes de criar o agendamento
6. Se não puder fazer algo, seja honesto e sugira alternativas

**Importante:**
- NUNCA crie agendamentos sem confirmar com o cliente
- NUNCA cancele ou reagende sem ter certeza de qual agendamento
- Se tiver dúvidas, PERGUNTE antes de executar

**Data atual:** ${new Date().toLocaleDateString('pt-BR', { 
  weekday: 'long', 
  day: '2-digit', 
  month: 'long', 
  year: 'numeric' 
})}
**Hora atual:** ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  // Prepara as mensagens
  const messages = [
    { role: 'system', content: systemPrompt },
    ...(historico || []).slice(-20), // Mantém últimas 20 mensagens
    { role: 'user', content: mensagemCliente },
  ];

  try {
    console.log('📤 Enviando para OpenAI...');
    
    // Primeira chamada: permite o modelo decidir se usa tools
    const response = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto', // Deixa o modelo decidir quando usar ferramentas
      temperature: 0.7,
      max_tokens: 1000,
    });

    const choice = response.choices[0];
    const msg = choice.message;
    
    console.log(`📥 Resposta recebida (finish_reason: ${choice.finish_reason})`);

    // Verifica se o modelo quer usar ferramentas
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      console.log(`🔧 ${msg.tool_calls.length} ferramenta(s) solicitada(s):`);
      
      const toolResults = [];
      
      // Executa cada ferramenta solicitada
      for (const tc of msg.tool_calls) {
        const fn = tc.function;
        console.log(`   - ${fn.name}`);
        
        let args = {};
        try {
          args = JSON.parse(fn.arguments || '{}');
        } catch (err) {
          console.error(`❌ Erro ao parsear argumentos de ${fn.name}:`, err);
          toolResults.push({
            tool_call_id: tc.id,
            name: fn.name,
            args: {},
            resultado: { erro: 'Argumentos inválidos' }
          });
          continue;
        }
        
        // Executa a ferramenta
        const resultado = await executarTool(barbeariaId, fn.name, args);
        toolResults.push({
          tool_call_id: tc.id,
          name: fn.name,
          args,
          resultado
        });
      }

      // Segunda chamada: envia os resultados das ferramentas de volta
      console.log('📤 Enviando resultados das ferramentas de volta para OpenAI...');
      
      const toolMessages = [
        ...messages,
        msg, // Inclui a mensagem com tool_calls
        ...toolResults.map(tr => ({
          role: 'tool',
          tool_call_id: tr.tool_call_id,
          content: JSON.stringify(tr.resultado),
        }))
      ];

      const finalResponse = await ai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: toolMessages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const respostaFinal = finalResponse.choices[0].message.content || 'Ok!';
      
      console.log(`✅ Resposta final gerada (${respostaFinal.length} chars)`);
      console.log(`🔧 Tools executados: ${toolResults.map(t => t.name).join(', ')}`);
      console.log(`====================================\n`);
      
      return { 
        resposta: respostaFinal, 
        toolsExecutados: toolResults.map(t => ({
          name: t.name,
          args: t.args,
          resultado: t.resultado
        }))
      };
    }

    // Resposta simples sem uso de ferramentas
    const respostaSimples = msg.content || 'Desculpe, não entendi. Pode reformular?';
    
    console.log(`✅ Resposta simples (sem tools): ${respostaSimples.substring(0, 50)}...`);
    console.log(`====================================\n`);
    
    return { 
      resposta: respostaSimples, 
      toolsExecutados: [] 
    };

  } catch (err) {
    console.error('❌ ERRO no processarMensagem:', err);
    console.error('Stack:', err.stack);
    console.log(`====================================\n`);
    
    // Tratamento de erros específicos da OpenAI
    if (err.code === 'invalid_api_key' || err.status === 401) {
      return {
        resposta: 'Desculpe, há um problema com a configuração da IA. Entre em contato com o suporte.',
        toolsExecutados: [],
        erro: 'API Key inválida'
      };
    }
    
    if (err.code === 'rate_limit_exceeded' || err.status === 429) {
      return {
        resposta: 'Desculpe, estamos com muitas requisições no momento. Tente novamente em alguns segundos.',
        toolsExecutados: [],
        erro: 'Rate limit'
      };
    }
    
    if (err.code === 'context_length_exceeded') {
      return {
        resposta: 'Desculpe, nossa conversa ficou muito longa. Vamos recomeçar do início!',
        toolsExecutados: [],
        erro: 'Contexto muito grande'
      };
    }
    
    return {
      resposta: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente ou entre em contato com a barbearia.',
      toolsExecutados: [],
      erro: err.message
    };
  }
}

/**
 * Busca uma conversa existente no banco
 * @param {string} barbeariaId - ID da barbearia
 * @param {string} telefone - Telefone do cliente
 * @returns {Promise<object|null>} - Conversa ou null
 */
export async function getConversa(barbeariaId, telefone) {
  try {
    const tel = telefone.replace(/\D/g, '');
    const { rows } = await query(
      `SELECT id, barbearia_id, cliente_telefone, historico, contexto, ultima_interacao, created_at
         FROM ai_conversas 
        WHERE barbearia_id = $1 AND cliente_telefone = $2
        LIMIT 1`,
      [barbeariaId, tel]
    );
    
    if (rows[0]) {
      console.log(`📖 Conversa encontrada: ${rows[0].historico?.length || 0} mensagens`);
    }
    
    return rows[0] || null;
  } catch (err) {
    console.error('❌ Erro ao buscar conversa:', err);
    return null;
  }
}

/**
 * Salva ou atualiza uma conversa no banco
 * @param {string} barbeariaId - ID da barbearia
 * @param {string} telefone - Telefone do cliente
 * @param {Array} mensagens - Array de mensagens (role, content)
 * @param {object} contexto - Contexto adicional (opcional)
 * @returns {Promise<boolean>} - Sucesso ou falha
 */
export async function salvarConversa(barbeariaId, telefone, mensagens, contexto = {}) {
  try {
    const tel = telefone.replace(/\D/g, '');
    
    // Limita histórico a 50 mensagens (25 interações)
    const historicoLimitado = mensagens.slice(-50);
    
    await query(
      `INSERT INTO ai_conversas (barbearia_id, cliente_telefone, historico, contexto, ultima_interacao)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
       ON CONFLICT (barbearia_id, cliente_telefone)
       DO UPDATE SET 
         historico = $3::jsonb, 
         contexto = $4::jsonb, 
         ultima_interacao = NOW()`,
      [barbeariaId, tel, JSON.stringify(historicoLimitado), JSON.stringify(contexto)]
    );
    
    console.log(`💾 Conversa salva: ${historicoLimitado.length} mensagens`);
    return true;
  } catch (err) {
    console.error('❌ Erro ao salvar conversa:', err);
    return false;
  }
}

/**
 * Limpa conversas antigas (opcional - pode ser executado periodicamente)
 * @param {number} diasAntigos - Número de dias para considerar antiga
 * @returns {Promise<number>} - Número de conversas removidas
 */
export async function limparConversasAntigas(diasAntigos = 30) {
  try {
    const { rowCount } = await query(
      `DELETE FROM ai_conversas 
        WHERE ultima_interacao < NOW() - INTERVAL '${diasAntigos} days'`
    );
    
    console.log(`🧹 ${rowCount} conversas antigas removidas`);
    return rowCount;
  } catch (err) {
    console.error('❌ Erro ao limpar conversas antigas:', err);
    return 0;
  }
}