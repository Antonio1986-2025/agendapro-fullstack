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

/**
 * Formata data/hora vinda do banco como "wall clock" (sem conversão de TZ)
 * data_hora vem como string "2026-06-23 15:00:00" (TIMESTAMP sem TZ)
 */
function formatarDataHoraBR(dataHora) {
  if (!dataHora) return '';
  const s = String(dataHora);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return s;
  const [, ano, mes, dia, hh, mm] = m;
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const diasSemana = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const d = new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
  const ds = diasSemana[d.getUTCDay()];
  return `${ds}, ${parseInt(dia)} de ${meses[parseInt(mes) - 1]}, ${hh}:${mm}`;
}

export function textoConfirmacao({ clienteNome, barbeariaNome, servicoNome, profissionalNome, dataHora }) {
  const dataFmt = formatarDataHoraBR(dataHora);
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
  const dataFmt = formatarDataHoraBR(dataHora);
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
