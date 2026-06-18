import OpenAI from 'openai';
import { query } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'wa_auth', '.env');

let _openai = null;

function getOpenAI() {
  if (_openai) return _openai;
  let key = process.env.OPENAI_API_KEY;
  if (!key && fs.existsSync(CONFIG_PATH)) {
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
    if (match) key = match[1].trim();
  }
  if (key) {
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'listarServicos',
      description: 'Lista os servicos disponiveis da barbearia',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listarProfissionais',
      description: 'Lista os profissionais (barbeiros) disponiveis da barbearia',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verificarDisponibilidade',
      description: 'Verifica horarios disponiveis para uma data e profissional',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
          profissional_id: { type: 'string', description: 'ID do profissional (opcional)' },
        },
        required: ['data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscarCliente',
      description: 'Busca um cliente pelo telefone na base da barbearia',
      parameters: {
        type: 'object',
        properties: {
          telefone: { type: 'string', description: 'Telefone do cliente (so numeros)' },
        },
        required: ['telefone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cadastrarCliente',
      description: 'Cadastra um novo cliente na barbearia',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome do cliente' },
          telefone: { type: 'string', description: 'Telefone com DDD (so numeros)' },
        },
        required: ['nome', 'telefone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criarAgendamento',
      description: 'Cria um novo agendamento para o cliente',
      parameters: {
        type: 'object',
        properties: {
          cliente_id: { type: 'string', description: 'ID do cliente' },
          servico_id: { type: 'string', description: 'ID do servico' },
          profissional_id: { type: 'string', description: 'ID do profissional' },
          data_hora: { type: 'string', description: 'Data e hora ISO (YYYY-MM-DDTHH:mm)' },
        },
        required: ['cliente_id', 'servico_id', 'profissional_id', 'data_hora'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listarAgendamentosCliente',
      description: 'Lista os agendamentos futuros de um cliente pelo telefone',
      parameters: {
        type: 'object',
        properties: {
          telefone: { type: 'string', description: 'Telefone do cliente (so numeros)' },
        },
        required: ['telefone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelarAgendamento',
      description: 'Cancela um agendamento pelo ID',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: { type: 'string', description: 'ID do agendamento' },
        },
        required: ['agendamento_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reagendarAgendamento',
      description: 'Altera a data/hora de um agendamento',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: { type: 'string', description: 'ID do agendamento' },
          nova_data_hora: { type: 'string', description: 'Nova data e hora ISO (YYYY-MM-DDTHH:mm)' },
        },
        required: ['agendamento_id', 'nova_data_hora'],
      },
    },
  },
];

async function executarTool(barbeariaId, toolName, args) {
  switch (toolName) {
    case 'listarServicos': {
      const { rows } = await query(
        `SELECT id, nome, duracao_minutos, preco FROM servicos WHERE barbearia_id = $1 AND ativo = true ORDER BY nome`,
        [barbeariaId]
      );
      return rows;
    }

    case 'listarProfissionais': {
      const { rows } = await query(
        `SELECT id, nome, especialidade FROM profissionais WHERE barbearia_id = $1 AND ativo = true ORDER BY nome`,
        [barbeariaId]
      );
      return rows;
    }

    case 'verificarDisponibilidade': {
      const { data, profissional_id } = args;
      const params = [barbeariaId, data];
      let profFilter = '';
      if (profissional_id) {
        params.push(profissional_id);
        profFilter = ` AND a.profissional_id = $${params.length}`;
      }
      const { rows: ocupados } = await query(
        `SELECT a.data_hora, a.profissional_id, p.nome AS profissional_nome
           FROM agendamentos a
           JOIN profissionais p ON p.id = a.profissional_id
          WHERE a.barbearia_id = $1
            AND a.data_hora::date = $2::date
            AND a.status NOT IN ('cancelado')${profFilter}
          ORDER BY a.data_hora`,
        params
      );
      const { rows: profissionais } = await query(
        `SELECT id, nome FROM profissionais WHERE barbearia_id = $1 AND ativo = true`,
        [barbeariaId]
      );
      const { rows: servicos } = await query(
        `SELECT id, nome, duracao_minutos FROM servicos WHERE barbearia_id = $1 AND ativo = true LIMIT 1`,
        [barbeariaId]
      );
      return {
        data,
        ocupados: ocupados.map(o => ({
          hora: new Date(o.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          profissional: o.profissional_nome,
        })),
        profissionais: profissionais.map(p => ({ id: p.id, nome: p.nome })),
        duracao_padrao: servicos[0]?.duracao_minutos || 60,
      };
    }

    case 'buscarCliente': {
      const tel = args.telefone.replace(/\D/g, '');
      const { rows } = await query(
        `SELECT id, nome, telefone FROM clientes WHERE barbearia_id = $1 AND telefone LIKE $2`,
        [barbeariaId, `%${tel.slice(-11)}%`]
      );
      return rows[0] || null;
    }

    case 'cadastrarCliente': {
      const tel = args.telefone.replace(/\D/g, '');
      const { rows } = await query(
        `INSERT INTO clientes (barbearia_id, nome, telefone) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id, nome, telefone`,
        [barbeariaId, args.nome, tel]
      );
      return rows[0] || { erro: 'Cliente ja existe' };
    }

    case 'criarAgendamento': {
      const dh = new Date(args.data_hora);
      const { rows: servico } = await query(
        `SELECT duracao_minutos, preco, nome FROM servicos WHERE id = $1 AND barbearia_id = $2`,
        [args.servico_id, barbeariaId]
      );
      if (!servico[0]) return { erro: 'Servico nao encontrado' };
      const { rows } = await query(
        `INSERT INTO agendamentos (barbearia_id, cliente_id, servico_id, profissional_id, data_hora, duracao_minutos, preco, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'agendado') RETURNING id, data_hora`,
        [barbeariaId, args.cliente_id, args.servico_id, args.profissional_id, dh,
         servico[0].duracao_minutos, servico[0].preco]
      );
      try {
        const notif = await import('./whatsapp.js');
        await notif.notificarBarbeiroNovoAgendamento(barbeariaId, rows[0].id);
      } catch {}
      return { ...rows[0], servico_nome: servico[0].nome, preco: servico[0].preco };
    }

    case 'listarAgendamentosCliente': {
      const tel = args.telefone.replace(/\D/g, '');
      const { rows } = await query(
        `SELECT a.id, a.data_hora, a.status, s.nome AS servico_nome, p.nome AS profissional_nome
           FROM agendamentos a
           JOIN clientes c ON c.id = a.cliente_id
           LEFT JOIN servicos s ON s.id = a.servico_id
           LEFT JOIN profissionais p ON p.id = a.profissional_id
          WHERE a.barbearia_id = $1 AND c.telefone LIKE $2 AND a.status NOT IN ('cancelado','concluido')
          ORDER BY a.data_hora`,
        [barbeariaId, `%${tel.slice(-11)}%`]
      );
      return rows;
    }

    case 'cancelarAgendamento': {
      await query(
        `UPDATE agendamentos SET status = 'cancelado' WHERE id = $1 AND barbearia_id = $2`,
        [args.agendamento_id, barbeariaId]
      );
      return { ok: true };
    }

    case 'reagendarAgendamento': {
      const dh = new Date(args.nova_data_hora);
      await query(
        `UPDATE agendamentos SET data_hora = $1 WHERE id = $2 AND barbearia_id = $3`,
        [dh, args.agendamento_id, barbeariaId]
      );
      return { ok: true, nova_data_hora: dh.toISOString() };
    }

    default:
      return { erro: `Ferramenta desconhecida: ${toolName}` };
  }
}

function formatarRespostaTool(toolName, resultado) {
  if (resultado?.erro) return `Ops, ocorreu um erro: ${resultado.erro}`;

  switch (toolName) {
    case 'listarServicos':
      if (!resultado.length) return 'Nenhum servico cadastrado.';
      return resultado.map(s => `• ${s.nome} - R$ ${parseFloat(s.preco).toFixed(2)} (${s.duracao_minutos}min)`).join('\n');

    case 'listarProfissionais':
      if (!resultado.length) return 'Nenhum profissional disponivel.';
      return resultado.map(p => `• ${p.nome}${p.especialidade ? ` - ${p.especialidade}` : ''}`).join('\n');

    case 'verificarDisponibilidade': {
      const dataFmt = new Date(resultado.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      let txt = `Horarios para ${dataFmt}:\n`;
      if (!resultado.ocupados.length) {
        txt += 'Nenhum horario ocupado encontrado.';
      } else {
        txt += resultado.ocupados.map(o => `  ${o.hora} - ${o.profissional}`).join('\n');
      }
      txt += `\n\nProfissionais: ${resultado.profissionais.map(p => p.nome).join(', ')}`;
      return txt;
    }

    case 'buscarCliente':
      return resultado ? `Cliente encontrado: ${resultado.nome} (${resultado.telefone})` : null;

    case 'cadastrarCliente':
      return resultado?.erro ? null : `Cliente ${resultado.nome} cadastrado com sucesso!`;

    case 'criarAgendamento':
      return `Agendamento criado! ${resultado.servico_nome} em ${new Date(resultado.data_hora).toLocaleString('pt-BR')} - R$ ${parseFloat(resultado.preco).toFixed(2)}`;

    case 'listarAgendamentosCliente':
      if (!resultado.length) return 'Nenhum agendamento futuro encontrado.';
      return resultado.map(a =>
        `• ${new Date(a.data_hora).toLocaleString('pt-BR')} - ${a.servico_nome} com ${a.profissional_nome} (${a.status})`
      ).join('\n');

    case 'cancelarAgendamento':
      return resultado.ok ? 'Agendamento cancelado com sucesso!' : 'Nao foi possivel cancelar.';

    case 'reagendarAgendamento':
      return resultado.ok
        ? `Agendamento reagendado para ${new Date(resultado.nova_data_hora).toLocaleString('pt-BR')}`
        : 'Nao foi possivel reagendar.';

    default:
      return JSON.stringify(resultado);
  }
}

export async function processarMensagem(barbeariaId, barbeariaNome, mensagemCliente, historico, promptPersonalizado) {
  const ai = getOpenAI();
  if (!ai) return { resposta: 'Agente IA nao configurado. Configure a chave OPENAI_API_KEY no servidor.' };

  const systemPrompt = promptPersonalizado ||
    `Voce e o assistente virtual da barbearia "${barbeariaNome}". ` +
    `Seu papel e ajudar clientes a agendar, cancelar, remarcar horarios, consultar servicos e profissionais. ` +
    `Seja educado, simpatico e responda em portugues. ` +
    `Sempre confirme as informacoes com o cliente antes de executar acoes. ` +
    `Se precisar de algo que nao pode fazer, peca desculpas e sugira falar com a barbearia.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(historico || []).slice(-20),
    { role: 'user', content: mensagemCliente },
  ];

  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools,
    tool_choice: 'auto',
    temperature: 0.7,
  });

  const choice = response.choices[0];
  const msg = choice.message;

  if (msg.tool_calls && msg.tool_calls.length > 0) {
    let toolResults = [];
    for (const tc of msg.tool_calls) {
      const fn = tc.function;
      const args = JSON.parse(fn.arguments || '{}');
      const resultado = await executarTool(barbeariaId, fn.name, args);
      toolResults.push({ name: fn.name, args, resultado });
    }

    const toolMessages = [...messages, msg];
    for (const tr of toolResults) {
      toolMessages.push({
        role: 'tool',
        tool_call_id: msg.tool_calls.find(tc => tc.function.name === tr.name)?.id || '',
        content: JSON.stringify(tr.resultado),
      });
    }

    const finalResponse = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: toolMessages,
      temperature: 0.7,
    });

    return { resposta: finalResponse.choices[0].message.content, toolsExecutados: toolResults };
  }

  return { resposta: msg.content || 'Ok!', toolsExecutados: [] };
}

export async function getConversa(barbeariaId, telefone) {
  const tel = telefone.replace(/\D/g, '');
  const { rows } = await query(
    `SELECT * FROM ai_conversas WHERE barbearia_id = $1 AND cliente_telefone = $2`,
    [barbeariaId, tel]
  );
  return rows[0] || null;
}

export async function salvarConversa(barbeariaId, telefone, mensagens) {
  const tel = telefone.replace(/\D/g, '');
  await query(
    `INSERT INTO ai_conversas (barbearia_id, cliente_telefone, historico, ultima_interacao)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (barbearia_id, cliente_telefone)
     DO UPDATE SET historico = $3::jsonb, ultima_interacao = now()`,
    [barbeariaId, tel, JSON.stringify(mensagens)]
  );
}