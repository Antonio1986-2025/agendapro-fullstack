import { query } from '../config/database.js';
import { enviarMensagemEvolution } from './evolution-provider.js';

async function getConfig(barbeariaId) {
  const { rows } = await query(
    `SELECT * FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  return rows[0] || { provider: 'log', enabled: false, session_status: 'disconnected' };
}

/**
 * Normaliza número de telefone removendo caracteres especiais
 */
function normalizarTelefone(tel) {
  if (!tel) return '';
  
  let numero = tel.replace(/\D/g, '');
  
  if (numero.length < 10) {
    return '';
  }
  
  if (numero.length >= 12 && numero.startsWith('55')) {
    return numero;
  }
  
  if (numero.length === 11 || numero.length === 10) {
    return '55' + numero;
  }
  
  return numero;
}

async function registrarMensagem(barbeariaId, { agendamentoId, telefone, mensagem, tipo, status }) {
  await query(
    `INSERT INTO whatsapp_mensagens (barbearia_id, agendamento_id, telefone, mensagem, tipo, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [barbeariaId, agendamentoId || null, telefone, mensagem, tipo || 'manual', status || 'enviada']
  );
}

/**
 * Envia mensagem WhatsApp
 * Usa Evolution API por padrão
 */
export async function enviarMensagem(barbeariaId, { telefone, mensagem, tipo, agendamentoId }) {
  const config = await getConfig(barbeariaId);
  const tel = normalizarTelefone(telefone);

  // Modo log (sem WhatsApp)
  if (!config.enabled || config.provider === 'log') {
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone: tel, mensagem, tipo, status: 'enviada',
    });
    console.log(`📱 [WhatsApp:log] -> ${tel}: ${mensagem}`);
    return { ok: true, provider: 'log', status: 'enviada' };
  }

  // Evolution API
  try {
    await enviarMensagemEvolution(barbeariaId, tel, mensagem);
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone: tel, mensagem, tipo, status: 'enviada',
    });
    return { ok: true, provider: 'evolution', status: 'enviada' };
  } catch (err) {
    console.error('❌ Erro WhatsApp Evolution:', err.message);
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone: tel, mensagem, tipo, status: 'erro',
    });
    return { ok: false, provider: 'evolution', status: 'erro', erro: err.message };
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
  // Delegado para o scheduler que tem controle de duplicação
  const { notificarBarbeiroNovoAgendamento: notificar } = await import('./scheduler.js');
  return notificar(barbeariaId, agendamentoId);
}
