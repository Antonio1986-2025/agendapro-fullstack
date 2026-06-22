import OpenAI from 'openai';
import { query } from '../config/database.js';

let _openai = null;

/**
 * Inicializa e retorna instância do cliente OpenAI
 */
function getOpenAI() {
  if (_openai) return _openai;
  
  const key = process.env.OPENAI_API_KEY;
  
  if (!key) {
    console.error('❌ OPENAI_API_KEY não encontrada! Configure no .env');
    return null;
  }
  
  try {
    _openai = new OpenAI({ 
      apiKey: key,
      timeout: 30000,
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
 * ============================================================
 * FERRAMENTAS (TOOLS) DO AGENTE
 * Cada ferramenta consulta a base de dados real do sistema.
 * ============================================================
 */
const tools = [
  {
    type: 'function',
    function: {
      name: 'listarServicos',
      description: 'Lista TODOS os serviços disponíveis na barbearia. Use quando o cliente perguntar sobre serviços, preços, ou para mostrar opções disponíveis para agendamento.',
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
      name: 'buscarServicoPorNome',
      description: 'Busca serviços que correspondem a uma palavra-chave/termo. Use quando o cliente mencionar um serviço de forma genérica (ex: "corte", "barba"). Retorna lista de serviços compatíveis para o cliente escolher o exato.',
      parameters: {
        type: 'object',
        properties: {
          termo: {
            type: 'string',
            description: 'Termo ou palavra-chave do serviço (ex: "corte", "barba", "platinado"). Pode ser parte do nome.',
          },
        },
        required: ['termo'],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listarProfissionais',
      description: 'Lista TODOS os profissionais (barbeiros) ativos. Use quando o cliente perguntar quem são os barbeiros ou para escolher um profissional.',
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
      description: 'Verifica horários OCUPADOS e DISPONÍVEIS para uma data específica. SEMPRE use antes de sugerir horários. NUNCA invente horários disponíveis sem consultar.',
      parameters: {
        type: 'object',
        properties: {
          data: { 
            type: 'string', 
            description: 'Data no formato YYYY-MM-DD (ex: 2026-06-25). Calcule baseado na data atual se cliente disser "amanhã", "hoje", "sexta", etc.',
          },
          profissional_id: { 
            type: 'string', 
            description: 'ID do profissional (opcional). Se informado, mostra disponibilidade apenas dele.',
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
      description: 'Busca um cliente pelo telefone. SEMPRE use no início do atendimento para verificar se quem está mandando mensagem já é cliente cadastrado.',
      parameters: {
        type: 'object',
        properties: {
          telefone: { 
            type: 'string', 
            description: 'Telefone (apenas números). Use o telefone do cliente que está conversando (informado no contexto).',
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
      description: 'Cadastra um novo cliente. Use quando: (1) buscarCliente retornar null, OU (2) o agendamento é para outra pessoa (ex: filho, amigo) que não está cadastrada.',
      parameters: {
        type: 'object',
        properties: {
          nome: { 
            type: 'string', 
            description: 'Nome COMPLETO do cliente (mínimo nome + sobrenome).',
          },
          telefone: { 
            type: 'string', 
            description: 'Telefone com DDD (apenas números). Para terceiros, pode ser o mesmo de quem está agendando.',
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
      description: `Cria um agendamento CONFIRMADO. SÓ USE APÓS coletar e validar TODOS os dados:
1. cliente_id (de buscarCliente ou cadastrarCliente)
2. servico_id (de listarServicos ou buscarServicoPorNome - SERVIÇO VÁLIDO)
3. profissional_id (de listarProfissionais)
4. data_hora (após verificarDisponibilidade confirmar livre)
5. Cliente confirmou TODOS os detalhes no chat
NUNCA invente IDs. SEMPRE use IDs reais retornados pelas outras ferramentas.`,
      parameters: {
        type: 'object',
        properties: {
          cliente_id: { 
            type: 'string', 
            description: 'ID do cliente que vai RECEBER o serviço (não necessariamente quem está conversando).',
          },
          servico_id: { 
            type: 'string', 
            description: 'ID do serviço escolhido.',
          },
          profissional_id: { 
            type: 'string', 
            description: 'ID do profissional escolhido.',
          },
          data_hora: { 
            type: 'string', 
            description: 'Data e hora ISO: YYYY-MM-DDTHH:mm (ex: 2026-06-25T14:30).',
          },
          observacoes: {
            type: 'string',
            description: 'Observações opcionais (ex: "Agendamento feito por João para o filho Pedro").',
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
      description: 'Lista agendamentos futuros de um cliente. Use quando o cliente perguntar sobre seus horários, ou para identificar qual agendamento cancelar/reagendar.',
      parameters: {
        type: 'object',
        properties: {
          telefone: { 
            type: 'string', 
            description: 'Telefone do cliente (apenas números).',
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
      description: 'Cancela um agendamento. SEMPRE confirme com o cliente qual agendamento cancelar antes (mostre detalhes via listarAgendamentosCliente).',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: { 
            type: 'string', 
            description: 'ID do agendamento (de listarAgendamentosCliente).',
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
      description: 'Altera data/hora de agendamento. SEMPRE verificarDisponibilidade da nova data antes. Confirme com cliente.',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: { 
            type: 'string', 
            description: 'ID do agendamento.',
          },
          nova_data_hora: { 
            type: 'string', 
            description: 'Nova data ISO: YYYY-MM-DDTHH:mm.',
          },
        },
        required: ['agendamento_id', 'nova_data_hora'],
        additionalProperties: false
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultarInformacoesBarbearia',
      description: 'Retorna informações da barbearia (nome, endereço, telefone, horário de funcionamento). Use quando cliente perguntar sobre localização, horário de abertura, contato, etc.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      },
    },
  },
];

/**
 * ============================================================
 * EXECUÇÃO DAS FERRAMENTAS
 * ============================================================
 */
async function executarTool(barbeariaId, toolName, args) {
  console.log(`🔧 Executando: ${toolName}`, JSON.stringify(args));
  
  try {
    switch (toolName) {
      case 'listarServicos': {
        const { rows } = await query(
          `SELECT id, nome, duracao_minutos, preco, categoria
             FROM servicos 
            WHERE barbearia_id = $1 AND ativo = true 
            ORDER BY categoria, nome`,
          [barbeariaId]
        );
        console.log(`   ✅ ${rows.length} serviços`);
        return { servicos: rows };
      }

      case 'buscarServicoPorNome': {
        const termo = (args.termo || '').toLowerCase().trim();
        if (!termo) return { erro: 'Termo de busca vazio' };
        
        const { rows } = await query(
          `SELECT id, nome, duracao_minutos, preco, categoria
             FROM servicos 
            WHERE barbearia_id = $1 AND ativo = true 
              AND (LOWER(nome) LIKE $2 OR LOWER(categoria) LIKE $2)
            ORDER BY 
              CASE WHEN LOWER(nome) = $3 THEN 0
                   WHEN LOWER(nome) LIKE $4 THEN 1
                   ELSE 2 END,
              nome`,
          [barbeariaId, `%${termo}%`, termo, `${termo}%`]
        );
        
        console.log(`   ✅ ${rows.length} serviços encontrados para "${termo}"`);
        
        return { 
          termo_buscado: termo,
          encontrados: rows.length,
          servicos: rows,
          unico_match: rows.length === 1,
        };
      }

      case 'listarProfissionais': {
        const { rows } = await query(
          `SELECT id, nome, especialidade
             FROM profissionais 
            WHERE barbearia_id = $1 AND ativo = true 
            ORDER BY ordem, nome`,
          [barbeariaId]
        );
        console.log(`   ✅ ${rows.length} profissionais`);
        return { profissionais: rows };
      }

      case 'verificarDisponibilidade': {
        const { data, profissional_id } = args;
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
          return { erro: 'Formato de data inválido. Use YYYY-MM-DD' };
        }
        
        const dataObj = new Date(data + 'T12:00:00');
        const agora = new Date();
        const ehHoje = dataObj.toDateString() === agora.toDateString();
        
        // Busca config de horários da barbearia
        const { rows: barbRows } = await query(
          `SELECT horario_config FROM barbearias WHERE id = $1`,
          [barbeariaId]
        );
        const horarioConfig = barbRows[0]?.horario_config || {
          manha: { inicio: '08:00', fim: '12:00' },
          tarde: { inicio: '13:00', fim: '19:00' },
          intervalo_minutos: 30,
        };
        
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
              ${profissional_id ? 'AND id = $2' : ''}
            ORDER BY ordem, nome`,
          profissional_id ? [barbeariaId, profissional_id] : [barbeariaId]
        );
        
        // Gera slots de horários
        const intervaloMin = horarioConfig.intervalo_minutos || 30;
        const slots = [];
        
        const adicionarSlots = (inicio, fim) => {
          if (!inicio || !fim) return;
          const [hi, mi] = inicio.split(':').map(Number);
          const [hf, mf] = fim.split(':').map(Number);
          let totalMin = hi * 60 + mi;
          const fimMin = hf * 60 + mf;
          while (totalMin < fimMin) {
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            totalMin += intervaloMin;
          }
        };
        
        if (horarioConfig.manha) adicionarSlots(horarioConfig.manha.inicio, horarioConfig.manha.fim);
        if (horarioConfig.tarde) adicionarSlots(horarioConfig.tarde.inicio, horarioConfig.tarde.fim);
        
        // Marca slots ocupados (por profissional)
        const ocupadosPorProf = {};
        ocupados.forEach(o => {
          const hora = new Date(o.data_hora).toTimeString().substring(0, 5);
          if (!ocupadosPorProf[o.profissional_id]) ocupadosPorProf[o.profissional_id] = new Set();
          ocupadosPorProf[o.profissional_id].add(hora);
        });
        
        // Calcula disponibilidade por profissional
        const disponibilidadePorProf = profissionais.map(p => {
          const ocupadosDeles = ocupadosPorProf[p.id] || new Set();
          let livres = slots.filter(s => !ocupadosDeles.has(s));
          
          // Se for hoje, remove horários já passados
          if (ehHoje) {
            const horaAtual = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
            livres = livres.filter(s => s > horaAtual);
          }
          
          return {
            profissional_id: p.id,
            profissional_nome: p.nome,
            especialidade: p.especialidade,
            horarios_livres: livres,
            horarios_ocupados: Array.from(ocupadosDeles),
            total_livres: livres.length,
          };
        });
        
        const dataFmt = dataObj.toLocaleDateString('pt-BR', { 
          weekday: 'long', day: 'numeric', month: 'long' 
        });
        
        console.log(`   ✅ Disponibilidade ${data}: ${disponibilidadePorProf.length} profissionais`);
        
        return {
          data,
          data_formatada: dataFmt,
          eh_hoje: ehHoje,
          disponibilidade: disponibilidadePorProf,
        };
      }

      case 'buscarCliente': {
        const tel = String(args.telefone || '').replace(/\D/g, '');
        if (tel.length < 10) {
          return { erro: 'Telefone inválido', encontrado: false };
        }
        
        const { rows } = await query(
          `SELECT id, nome, telefone, email, total_visitas, created_at
             FROM clientes 
            WHERE barbearia_id = $1 
              AND telefone LIKE $2
            ORDER BY total_visitas DESC
            LIMIT 1`,
          [barbeariaId, `%${tel.slice(-11)}%`]
        );
        
        if (rows[0]) {
          console.log(`   ✅ Cliente: ${rows[0].nome}`);
          return { encontrado: true, cliente: rows[0] };
        }
        
        console.log(`   ℹ️  Cliente não encontrado (tel: ${tel})`);
        return { encontrado: false, cliente: null };
      }

      case 'cadastrarCliente': {
        const tel = String(args.telefone || '').replace(/\D/g, '');
        const nome = String(args.nome || '').trim();
        
        if (nome.length < 2) {
          return { erro: 'Nome inválido. Forneça nome completo.' };
        }
        if (tel.length < 10) {
          return { erro: 'Telefone inválido.' };
        }
        
        try {
          // Verifica se já existe
          const { rows: existentes } = await query(
            `SELECT id, nome FROM clientes 
              WHERE barbearia_id = $1 AND telefone = $2 LIMIT 1`,
            [barbeariaId, tel]
          );
          
          if (existentes[0]) {
            console.log(`   ℹ️  Cliente já existe: ${existentes[0].nome}`);
            return { 
              ja_existia: true,
              cliente: existentes[0],
            };
          }
          
          const { rows } = await query(
            `INSERT INTO clientes (barbearia_id, nome, telefone, total_visitas) 
             VALUES ($1, $2, $3, 0) 
             RETURNING id, nome, telefone`,
            [barbeariaId, nome, tel]
          );
          
          console.log(`   ✅ Cliente cadastrado: ${rows[0].nome}`);
          return { ja_existia: false, cliente: rows[0] };
        } catch (err) {
          console.error('   ❌ Erro:', err.message);
          return { erro: 'Erro ao cadastrar: ' + err.message };
        }
      }

      case 'criarAgendamento': {
        console.log(`   📝 Tentando criar agendamento:`);
        console.log(`      cliente_id: ${args.cliente_id}`);
        console.log(`      servico_id: ${args.servico_id}`);
        console.log(`      profissional_id: ${args.profissional_id}`);
        console.log(`      data_hora: ${args.data_hora}`);
        
        const dh = new Date(args.data_hora);
        if (isNaN(dh.getTime())) {
          console.log(`   ❌ Data inválida`);
          return { erro: 'Data/hora inválida. Use YYYY-MM-DDTHH:mm' };
        }
        
        if (dh < new Date()) {
          console.log(`   ❌ Data no passado`);
          return { erro: 'Não é possível agendar no passado.' };
        }
        
        // Valida serviço
        const { rows: servico } = await query(
          `SELECT id, duracao_minutos, preco, nome 
             FROM servicos 
            WHERE id = $1 AND barbearia_id = $2 AND ativo = true`,
          [args.servico_id, barbeariaId]
        );
        
        if (!servico[0]) {
          console.log(`   ❌ SERVIÇO INVÁLIDO! ID ${args.servico_id} não existe ou não está ativo nesta barbearia`);
          return { erro: `Serviço com ID "${args.servico_id}" não foi encontrado. Use listarServicos para obter IDs válidos da barbearia.` };
        }
        console.log(`   ✓ Serviço válido: ${servico[0].nome} - R$ ${servico[0].preco}`);
        
        // Valida profissional
        const { rows: prof } = await query(
          `SELECT id, nome FROM profissionais 
            WHERE id = $1 AND barbearia_id = $2 AND ativo = true`,
          [args.profissional_id, barbeariaId]
        );
        
        if (!prof[0]) {
          console.log(`   ❌ PROFISSIONAL INVÁLIDO! ID ${args.profissional_id} não existe nesta barbearia`);
          return { erro: `Profissional com ID "${args.profissional_id}" não foi encontrado. Use listarProfissionais para obter IDs válidos.` };
        }
        console.log(`   ✓ Profissional válido: ${prof[0].nome}`);
        
        // Valida cliente
        const { rows: cli } = await query(
          `SELECT id, nome, telefone FROM clientes 
            WHERE id = $1 AND barbearia_id = $2`,
          [args.cliente_id, barbeariaId]
        );
        
        if (!cli[0]) {
          console.log(`   ❌ CLIENTE INVÁLIDO! ID ${args.cliente_id} não existe nesta barbearia`);
          return { erro: `Cliente com ID "${args.cliente_id}" não foi encontrado. Use buscarCliente ou cadastrarCliente primeiro.` };
        }
        console.log(`   ✓ Cliente válido: ${cli[0].nome}`);
        
        // Verifica conflito
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
          console.log(`   ❌ CONFLITO! Horário já ocupado`);
          return { erro: 'Horário já ocupado. Use verificarDisponibilidade para ver opções livres.' };
        }
        
        // Cria agendamento
        const { rows } = await query(
          `INSERT INTO agendamentos (
             barbearia_id, cliente_id, servico_id, profissional_id, 
             data_hora, duracao_minutos, preco, status, observacoes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'agendado', $8) 
           RETURNING id, data_hora`,
          [
            barbeariaId, args.cliente_id, args.servico_id, args.profissional_id, 
            dh, servico[0].duracao_minutos, servico[0].preco,
            args.observacoes || null,
          ]
        );
        
        console.log(`   ✅ AGENDAMENTO CRIADO COM SUCESSO!`);
        console.log(`      ID: ${rows[0].id}`);
        console.log(`      Cliente: ${cli[0].nome}`);
        console.log(`      Serviço: ${servico[0].nome} - R$ ${servico[0].preco}`);
        console.log(`      Profissional: ${prof[0].nome}`);
        console.log(`      Data/Hora: ${rows[0].data_hora}`);
        
        // Notifica barbeiro (não-bloqueante)
        try {
          const { notificarBarbeiroNovoAgendamento } = await import('./whatsapp.js');
          await notificarBarbeiroNovoAgendamento(barbeariaId, rows[0].id);
        } catch (err) {
          console.warn('   ⚠️  Notificação falhou:', err.message);
        }
        
        return { 
          sucesso: true,
          agendamento: {
            id: rows[0].id,
            data_hora: rows[0].data_hora,
            cliente_nome: cli[0].nome,
            servico_nome: servico[0].nome, 
            profissional_nome: prof[0].nome,
            preco: servico[0].preco,
            duracao_minutos: servico[0].duracao_minutos,
            observacoes: args.observacoes,
          }
        };
      }

      case 'listarAgendamentosCliente': {
        const tel = String(args.telefone || '').replace(/\D/g, '');
        
        const { rows } = await query(
          `SELECT a.id, a.data_hora, a.status, a.preco, a.observacoes,
                  s.nome AS servico_nome, s.duracao_minutos,
                  p.nome AS profissional_nome,
                  c.nome AS cliente_nome
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
        
        console.log(`   ✅ ${rows.length} agendamentos`);
        return { total: rows.length, agendamentos: rows };
      }

      case 'cancelarAgendamento': {
        const { rowCount, rows } = await query(
          `UPDATE agendamentos 
              SET status = 'cancelado' 
            WHERE id = $1 AND barbearia_id = $2
              AND status NOT IN ('cancelado', 'concluido')
            RETURNING id`,
          [args.agendamento_id, barbeariaId]
        );
        
        if (rowCount > 0) {
          console.log(`   ✅ Cancelado: ${args.agendamento_id}`);
          return { sucesso: true, agendamento_id: rows[0].id };
        }
        return { erro: 'Agendamento não encontrado ou já finalizado.' };
      }

      case 'reagendarAgendamento': {
        const dh = new Date(args.nova_data_hora);
        if (isNaN(dh.getTime())) return { erro: 'Data/hora inválida.' };
        if (dh < new Date()) return { erro: 'Não pode reagendar para o passado.' };
        
        const { rowCount, rows } = await query(
          `UPDATE agendamentos 
              SET data_hora = $1 
            WHERE id = $2 AND barbearia_id = $3
              AND status NOT IN ('cancelado', 'concluido')
            RETURNING id, data_hora`,
          [dh, args.agendamento_id, barbeariaId]
        );
        
        if (rowCount > 0) {
          console.log(`   ✅ Reagendado: ${args.agendamento_id}`);
          return { 
            sucesso: true, 
            nova_data_hora: rows[0].data_hora,
          };
        }
        return { erro: 'Agendamento não encontrado.' };
      }

      case 'consultarInformacoesBarbearia': {
        const { rows } = await query(
          `SELECT nome, telefone, email, endereco, horario_config
             FROM barbearias WHERE id = $1`,
          [barbeariaId]
        );
        
        if (!rows[0]) return { erro: 'Barbearia não encontrada' };
        
        return {
          nome: rows[0].nome,
          telefone: rows[0].telefone,
          email: rows[0].email,
          endereco: rows[0].endereco,
          horarios: rows[0].horario_config,
        };
      }

      default:
        console.error(`   ❌ Tool desconhecida: ${toolName}`);
        return { erro: `Ferramenta desconhecida: ${toolName}` };
    }
  } catch (err) {
    console.error(`   ❌ Erro em ${toolName}:`, err.message);
    return { erro: `Erro: ${err.message}` };
  }
}

/**
 * ============================================================
 * SYSTEM PROMPT - Orientado a OBJETIVO
 * ============================================================
 */
function montarSystemPrompt(barbeariaNome, telefoneCliente, promptPersonalizado) {
  const dataAgora = new Date();
  const amanha = new Date(Date.now() + 86400000);
  const dataFmt = dataAgora.toLocaleDateString('pt-BR', { 
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' 
  });
  const horaFmt = dataAgora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const amanhaFmt = amanha.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

  const promptBase = `Você é o atendente virtual da barbearia "${barbeariaNome}".
Seu objetivo é agendar serviços. Use SEMPRE as ferramentas para consultar dados reais. NUNCA invente.

━━━━━━━━━━━━━━━━━━━━━━━━
🚨 PROIBIÇÕES ABSOLUTAS (NUNCA FAÇA)
━━━━━━━━━━━━━━━━━━━━━━━━

❌ NUNCA peça o telefone do cliente — JÁ TEMOS: ${telefoneCliente || 'desconhecido'}
❌ NUNCA invente serviços. Use APENAS o que listarServicos retorna
❌ NUNCA invente horários. Use APENAS o que verificarDisponibilidade retorna
❌ NUNCA peça email, endereço ou outros dados desnecessários
❌ NUNCA confirme "agendamento criado" sem ter chamado criarAgendamento e recebido sucesso=true
❌ NUNCA fale de serviços que apareceram em conversas antigas — use SEMPRE a lista atual da base

━━━━━━━━━━━━━━━━━━━━━━━━
✅ FLUXO OBRIGATÓRIO
━━━━━━━━━━━━━━━━━━━━━━━━

ANTES DE TUDO (SEMPRE no início):
→ CHAME buscarCliente("${telefoneCliente || ''}") — você JÁ TEM o telefone
→ Se encontrou: cumprimente pelo nome e siga
→ Se não encontrou: peça apenas o NOME COMPLETO (nada mais)

PASSO 1 — SERVIÇO
→ CHAME listarServicos() para ter a lista REAL
→ OU CHAME buscarServicoPorNome(termo) se cliente mencionar termo específico
→ MOSTRE EXATAMENTE os serviços que a ferramenta retornou (não invente outros)
→ Use os IDs e nomes que vieram da ferramenta
→ Se cliente disser número (ex: "1"), use o item 1 da lista que VOCÊ acabou de mostrar

PASSO 2 — PROFISSIONAL
→ CHAME listarProfissionais()
→ Mostre EXATAMENTE os profissionais retornados
→ Cliente escolhe → guarde o ID

PASSO 3 — PRA QUEM É
→ Pergunte: "É para você mesmo ou para outra pessoa?"
→ Se for outro: peça o NOME COMPLETO da pessoa e cadastre

PASSO 4 — DATA + HORÁRIO
→ Pergunte qual dia
→ CHAME verificarDisponibilidade(data, profissional_id)
→ MOSTRE EXATAMENTE os horários livres retornados (não invente)
→ Se cliente quer horário que não está livre, mostre os disponíveis

PASSO 5 — RESUMO E CONFIRMAÇÃO
Antes de criar, mostre o resumo REAL:

📝 *Confirme:*
👤 Cliente: [nome do cliente da base]
✂️ Serviço: [nome EXATO retornado pela ferramenta] — R$ [preço EXATO]
💈 Profissional: [nome EXATO]
📅 Data: [dia/mês]
🕐 Horário: [HH:mm]

Aguarde SIM antes de criar.

PASSO 6 — CRIAR
→ Cliente disse SIM → CHAME criarAgendamento com IDs corretos
→ Se ferramenta retornar { sucesso: true } → confirme ao cliente
→ Se ferramenta retornar { erro: ... } → informe o erro ao cliente, NÃO finja que deu certo

━━━━━━━━━━━━━━━━━━━━━━━━
🔒 REGRAS DE OURO
━━━━━━━━━━━━━━━━━━━━━━━━

1. SEMPRE chame as ferramentas. Sua memória pode estar contaminada por conversas antigas.
2. Se você "lembra" de um serviço sem ter chamado a ferramenta agora, NÃO USE.
3. Listas que você criou em conversas anteriores podem estar erradas. Sempre busque novamente.
4. Confie SEMPRE no que a ferramenta retorna AGORA, não no histórico.
5. O telefone JÁ TEMOS automaticamente: ${telefoneCliente || 'desconhecido'}

━━━━━━━━━━━━━━━━━━━━━━━━
ESTILO DE RESPOSTA
━━━━━━━━━━━━━━━━━━━━━━━━

- Português brasileiro, simples e direto
- Mensagens curtas (WhatsApp, não email)
- 1-2 emojis por mensagem
- Se cliente sai do contexto, responda e volte ao agendamento

━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO ATUAL
━━━━━━━━━━━━━━━━━━━━━━━━

Hoje: ${dataFmt} — ${horaFmt}
Amanhã: ${amanhaFmt}
Telefone do cliente (JÁ DISPONÍVEL): ${telefoneCliente || 'desconhecido'}`;

  if (promptPersonalizado && promptPersonalizado.trim()) {
    return promptBase + `\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nINSTRUÇÕES DA BARBEARIA\n━━━━━━━━━━━━━━━━━━━━━━━━\n${promptPersonalizado}`;
  }

  return promptBase;
}

/**
 * ============================================================
 * PROCESSA MENSAGEM DO CLIENTE
 * ============================================================
 */
export async function processarMensagem(barbeariaId, barbeariaNome, mensagemCliente, historico, promptPersonalizado, telefoneCliente) {
  console.log(`\n🤖 ====== PROCESSANDO MENSAGEM ======`);
  console.log(`📍 Barbearia: ${barbeariaNome} (${barbeariaId})`);
  console.log(`📞 Cliente: ${telefoneCliente || 'sem telefone'}`);
  console.log(`💬 Mensagem: ${mensagemCliente}`);
  console.log(`📚 Histórico: ${historico?.length || 0} mensagens`);
  
  const ai = getOpenAI();
  if (!ai) {
    return { 
      resposta: 'Desculpe, o sistema está temporariamente indisponível. Tente novamente em instantes.',
      toolsExecutados: []
    };
  }

  const systemPrompt = montarSystemPrompt(barbeariaNome, telefoneCliente, promptPersonalizado);

  // Limita histórico para evitar alucinação por contexto antigo
  const historicoLimitado = (historico || []).slice(-10);
  
  console.log(`📚 Histórico limitado: ${historicoLimitado.length} mensagens (de ${historico?.length || 0})`);
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...historicoLimitado,
    { role: 'user', content: mensagemCliente },
  ];

  try {
    console.log('📤 Enviando para OpenAI...');
    
    let iteracoes = 0;
    const MAX_ITERACOES = 5; // Permite múltiplas chamadas de tools em sequência
    let messagesAtual = messages;
    let toolsExecutadosAcumulado = [];
    
    while (iteracoes < MAX_ITERACOES) {
      iteracoes++;
      console.log(`🔄 Iteração ${iteracoes}/${MAX_ITERACOES}`);
      
      const response = await ai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messagesAtual,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,  // Baixo para evitar alucinação
        max_tokens: 1500,
      });

      const choice = response.choices[0];
      const msg = choice.message;
      
      console.log(`   finish_reason: ${choice.finish_reason}`);

      // Se não chamou ferramentas, retorna resposta final
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const resposta = msg.content || 'Desculpe, não entendi. Pode reformular?';
        console.log(`✅ Resposta final: ${resposta.substring(0, 80)}...`);
        console.log(`====================================\n`);
        return { 
          resposta, 
          toolsExecutados: toolsExecutadosAcumulado,
        };
      }

      // Executa todas as ferramentas chamadas
      console.log(`   🔧 ${msg.tool_calls.length} tool(s)`);
      const toolResults = [];
      
      for (const tc of msg.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {}
        
        const resultado = await executarTool(barbeariaId, tc.function.name, args);
        
        toolResults.push({
          tool_call_id: tc.id,
          name: tc.function.name,
          args,
          resultado,
        });
        
        toolsExecutadosAcumulado.push({
          name: tc.function.name,
          args,
          resultado,
        });
      }

      // Adiciona ao contexto para próxima iteração
      messagesAtual = [
        ...messagesAtual,
        msg,
        ...toolResults.map(tr => ({
          role: 'tool',
          tool_call_id: tr.tool_call_id,
          content: JSON.stringify(tr.resultado),
        })),
      ];
    }
    
    // Atingiu limite de iterações - força resposta final
    console.warn('⚠️  Limite de iterações atingido');
    const respostaFinal = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        ...messagesAtual,
        { role: 'system', content: 'Por favor, finalize sua resposta para o cliente agora, sem chamar mais ferramentas.' },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    });
    
    return {
      resposta: respostaFinal.choices[0].message.content || 'Desculpe, houve um erro. Pode reformular?',
      toolsExecutados: toolsExecutadosAcumulado,
    };
    
  } catch (err) {
    console.error('❌ ERRO:', err.message);
    console.log(`====================================\n`);
    
    if (err.status === 401) {
      return {
        resposta: 'Desculpe, configuração da IA com problema. Avise o atendente.',
        toolsExecutados: [],
      };
    }
    if (err.status === 429) {
      return {
        resposta: 'Estou com muitas mensagens agora. Tente em alguns segundos. 😊',
        toolsExecutados: [],
      };
    }
    
    return {
      resposta: 'Desculpe, tive um problema técnico. Pode tentar novamente?',
      toolsExecutados: [],
    };
  }
}

/**
 * ============================================================
 * PERSISTÊNCIA DE CONVERSAS
 * ============================================================
 */
export async function getConversa(barbeariaId, telefone) {
  const tel = String(telefone || '').replace(/\D/g, '');
  const { rows } = await query(
    `SELECT historico, contexto FROM ai_conversas 
      WHERE barbearia_id = $1 AND cliente_telefone = $2`,
    [barbeariaId, tel]
  );
  return rows[0] || null;
}

export async function salvarConversa(barbeariaId, telefone, historico, contexto = {}) {
  const tel = String(telefone || '').replace(/\D/g, '');
  
  // Mantém apenas últimas 40 mensagens (20 trocas)
  const historicoLimitado = historico.slice(-40);
  
  await query(
    `INSERT INTO ai_conversas (barbearia_id, cliente_telefone, historico, contexto, ultima_interacao)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (barbearia_id, cliente_telefone) DO UPDATE SET
        historico = $3,
        contexto = $4,
        ultima_interacao = now()`,
    [barbeariaId, tel, JSON.stringify(historicoLimitado), JSON.stringify(contexto)]
  );
  
  console.log(`💾 Conversa salva: ${historicoLimitado.length} mensagens`);
}
