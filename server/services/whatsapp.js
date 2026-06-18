import axios from 'axios';
import { query } from '../config/database.js';

const OPENWA_DEFAULT_URL = process.env.OPENWA_URL || 'http://localhost:2785';
const OPENWA_DEFAULT_KEY = process.env.OPENWA_API_KEY || '';

async function getConfig(barbeariaId) {
  const { rows } = await query(
    `SELECT * FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  return rows[0] || { provider: 'log', enabled: false, session_status: 'disconnected' };
}

function normalizarTelefone(tel) {
  let n = (tel || '').replace(/\D/g, '');
  if (n.length <= 11) n = '55' + n;
  return n + '@s.whatsapp.net';
}

async function registrarMensagem(barbeariaId, { agendamentoId, telefone, mensagem, tipo, status }) {
  await query(
    `INSERT INTO whatsapp_mensagens (barbearia_id, agendamento_id, telefone, mensagem, tipo, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [barbeariaId, agendamentoId || null, telefone, mensagem, tipo || 'manual', status || 'enviada']
  );
}

async function enviarViaOpenWA(config, telefone, mensagem) {
  const baseUrl = config.openwa_url || OPENWA_DEFAULT_URL;
  const apiKey = config.openwa_api_key || OPENWA_DEFAULT_KEY;
  const session = config.openwa_session_name;
  if (!session) throw new Error('Sessão OpenWA não configurada');

  const remoteJid = normalizarTelefone(telefone);
  const { data } = await axios.post(
    `${baseUrl}/api/sessions/${session}/messages/send-text`,
    { chatId: remoteJid, text: mensagem },
    {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  return data;
}

function getOpenWABaseUrl(config) {
  return config.openwa_url || OPENWA_DEFAULT_URL;
}

function getOpenWAApiKey(config) {
  return config.openwa_api_key || OPENWA_DEFAULT_KEY;
}

export async function enviarMensagem(barbeariaId, { telefone, mensagem, tipo, agendamentoId }) {
  const config = await getConfig(barbeariaId);

  if (!config.enabled || config.provider === 'log') {
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone, mensagem, tipo, status: 'enviada',
    });
    console.log(`📱 [WhatsApp:log] -> ${telefone}: ${mensagem}`);
    return { ok: true, provider: 'log', status: 'enviada' };
  }

  try {
    await enviarViaOpenWA(config, telefone, mensagem);
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone, mensagem, tipo, status: 'enviada',
    });
    return { ok: true, provider: 'openwa', status: 'enviada' };
  } catch (err) {
    console.error('❌ Erro WhatsApp OpenWA:', err.response?.data || err.message);
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone, mensagem, tipo, status: 'erro',
    });
    return { ok: false, provider: 'openwa', status: 'erro', erro: err.message };
  }
}

export function textoConfirmacao({ clienteNome, barbeariaNome, servicoNome, profissionalNome, dataHora }) {
  const data = new Date(dataHora);
  const dataFmt = data.toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
  return (
    `Ola, ${clienteNome}! ✅\n\n` +
    `Seu agendamento na *${barbeariaNome}* foi confirmado:\n\n` +
    `✂️ Servico: ${servicoNome}\n` +
    `👤 Profissional: ${profissionalNome}\n` +
    `📅 Data: ${dataFmt}\n\n` +
    `Qualquer mudanca, e so responder esta mensagem. Ate breve!`
  );
}

export function textoNotificacaoBarbeiro({ profissionalNome, clienteNome, clienteTelefone, servicoNome, dataHora, isEspecial }) {
  const data = new Date(dataHora);
  const dataFmt = data.toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
  return (
    `🔔 *Novo agendamento!*\n\n` +
    `Ola, ${profissionalNome}! Voce tem um novo cliente:\n\n` +
    `👤 Cliente: ${clienteNome}\n` +
    `📱 Contato: ${clienteTelefone || 'nao informado'}\n` +
    `✂️ Servico: ${servicoNome}\n` +
    `📅 Data: ${dataFmt}\n` +
    (isEspecial ? `🌙 *Horario especial (+50%)*\n` : '') +
    `\nAcesse o painel para ver os detalhes.`
  );
}

export async function notificarBarbeiroNovoAgendamento(barbeariaId, agendamentoId) {
  try {
    const { rows } = await query(
      `SELECT p.nome AS profissional_nome, p.telefone AS profissional_telefone,
              p.notificar_whatsapp,
              c.nome AS cliente_nome, c.telefone AS cliente_telefone,
              s.nome AS servico_nome,
              a.data_hora, a.is_especial
         FROM agendamentos a
         JOIN profissionais p ON p.id = a.profissional_id
         LEFT JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN servicos s ON s.id = a.servico_id
        WHERE a.id = $1 AND a.barbearia_id = $2`,
      [agendamentoId, barbeariaId]
    );
    const d = rows[0];
    if (!d) return { ok: false, motivo: 'agendamento_nao_encontrado' };
    if (d.notificar_whatsapp === false) return { ok: false, motivo: 'notificacao_desativada' };
    if (!d.profissional_telefone) return { ok: false, motivo: 'profissional_sem_telefone' };

    const mensagem = textoNotificacaoBarbeiro({
      profissionalNome: d.profissional_nome,
      clienteNome: d.cliente_nome || 'Cliente',
      clienteTelefone: d.cliente_telefone,
      servicoNome: d.servico_nome || 'Atendimento',
      dataHora: d.data_hora,
      isEspecial: d.is_especial,
    });

    return await enviarMensagem(barbeariaId, {
      telefone: d.profissional_telefone,
      mensagem,
      tipo: 'novo_agendamento_barbeiro',
      agendamentoId,
    });
  } catch (err) {
    console.error('Falha ao notificar barbeiro:', err.message);
    return { ok: false, motivo: err.message };
  }
}

export async function criarSessaoOpenWA(barbeariaId, nome, config) {
  const baseUrl = getOpenWABaseUrl(config);
  const apiKey = getOpenWAApiKey(config);
  const sessionName = nome || `barb_${barbeariaId.replace(/-/g, '').slice(0, 12)}`;

  const { data } = await axios.post(
    `${baseUrl}/api/sessions`,
    { name: sessionName },
    {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 10000,
    }
  );

  return { sessionId: data.id || data._id, sessionName };
}

export async function iniciarSessaoOpenWA(barbeariaId, config) {
  const baseUrl = getOpenWABaseUrl(config);
  const apiKey = getOpenWAApiKey(config);
  const session = config.openwa_session_name;
  if (!session) throw new Error('Sessão não configurada');

  await axios.post(
    `${baseUrl}/api/sessions/${session}/start`,
    {},
    {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 10000,
    }
  );
}

export async function obterQRSessaoOpenWA(barbeariaId, config) {
  const baseUrl = getOpenWABaseUrl(config);
  const apiKey = getOpenWAApiKey(config);
  const session = config.openwa_session_name;
  if (!session) throw new Error('Sessão não configurada');

  const { data } = await axios.get(
    `${baseUrl}/api/sessions/${session}/qr`,
    {
      headers: { 'X-API-Key': apiKey },
      timeout: 15000,
    }
  );
  return data;
}

export async function statusSessaoOpenWA(barbeariaId, config) {
  const baseUrl = getOpenWABaseUrl(config);
  const apiKey = getOpenWAApiKey(config);
  const session = config.openwa_session_name;
  if (!session) return 'disconnected';

  try {
    const { data } = await axios.get(
      `${baseUrl}/api/sessions/${session}/status`,
      {
        headers: { 'X-API-Key': apiKey },
        timeout: 10000,
      }
    );
    return data.status || data.state || 'unknown';
  } catch {
    return 'disconnected';
  }
}

export async function desconectarSessaoOpenWA(barbeariaId, config) {
  const baseUrl = getOpenWABaseUrl(config);
  const apiKey = getOpenWAApiKey(config);
  const session = config.openwa_session_name;
  if (!session) throw new Error('Sessão não configurada');

  await axios.delete(
    `${baseUrl}/api/sessions/${session}`,
    {
      headers: { 'X-API-Key': apiKey },
      timeout: 10000,
    }
  );
}