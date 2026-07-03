import { query } from '../config/database.js';
import { enviarMensagemBaileys } from './baileys-provider.js';
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
  if (config.provider === 'evolution') {
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

  // Baileys (WhatsApp nativo) - padrão
  try {
    await enviarMensagemBaileys(barbeariaId, tel, mensagem);
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone: tel, mensagem, tipo, status: 'enviada',
    });
    return { ok: true, provider: 'baileys', status: 'enviada' };
  } catch (err) {
    console.error('❌ Erro WhatsApp Baileys:', err.message);
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone: tel, mensagem, tipo, status: 'erro',
    });
    return { ok: false, provider: 'baileys', status: 'erro', erro: err.message };
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

/**
 * Notifica o barbeiro sobre UM NOVO AGENDAMENTO confirmado
 * Delega para o scheduler para evitar duplicações
 */
export async function notificarBarbeiroNovoAgendamento(barbeariaId, agendamentoId) {
  const { notificarBarbeiroNovoAgendamento: notificar } = await import('./scheduler.js');
  return notificar(barbeariaId, agendamentoId);
}

/**
 * Solicita CONFIRMAÇÃO do barbeiro para horário especial (pendente_barbeiro)
 * Envia mensagem diferente pedindo aprovação
 */
export async function solicitarConfirmacaoBarbeiro(barbeariaId, agendamentoId) {
  try {
    const { rows } = await query(
      `SELECT 
          p.nome AS profissional_nome, 
          p.telefone AS profissional_telefone,
          p.notificar_whatsapp,
          c.nome AS cliente_nome, 
          c.telefone AS cliente_telefone,
          s.nome AS servico_nome,
          a.data_hora
         FROM agendamentos a
         JOIN profissionais p ON p.id = a.profissional_id
         LEFT JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN servicos s ON s.id = a.servico_id
        WHERE a.id = $1 AND a.barbearia_id = $2`,
      [agendamentoId, barbeariaId]
    );

    const d = rows[0];
    if (!d) {
      console.log(`⚠️  Agendamento ${agendamentoId} não encontrado para confirmacao`);
      return { ok: false, motivo: 'agendamento_nao_encontrado' };
    }

    if (d.notificar_whatsapp === false) {
      console.log(`ℹ️  Notificação desativada para ${d.profissional_nome}`);
      return { ok: false, motivo: 'notificacao_desativada' };
    }

    if (!d.profissional_telefone) {
      console.log(`⚠️  Profissional sem telefone para confirmacao`);
      return { ok: false, motivo: 'sem_telefone' };
    }

    const dataFmt = formatarDataHoraBR(d.data_hora);
    const mensagem =
      `🌙 *Pedido de horario especial!*\n\n` +
      `Ola, ${d.profissional_nome}! Um cliente solicitou horario especial:\n\n` +
      `👤 Cliente: ${d.cliente_nome || 'Cliente'}\n` +
      `📱 Contato: ${d.cliente_telefone || 'nao informado'}\n` +
      `✂️ Servico: ${d.servico_nome || 'Atendimento'}\n` +
      `📅 Data: ${dataFmt}\n\n` +
      `⚠️ *Este horario esta PENDENTE de sua confirmacao.*\n` +
      `Acesse o painel para aprovar ou recusar.`;

    await enviarMensagem(barbeariaId, { telefone: d.profissional_telefone, mensagem, tipo: 'solicitacao_confirmacao' });

    await query(
      `INSERT INTO whatsapp_mensagens (barbearia_id, agendamento_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, $4, 'solicitacao_confirmacao', 'enviada')`,
      [barbeariaId, agendamentoId, d.profissional_telefone, mensagem]
    );

    await query(
      `UPDATE agendamentos SET notificacao_barbeiro_enviada_em = now() WHERE id = $1`,
      [agendamentoId]
    );

    console.log(`✅ Solicitacao de confirmacao enviada para ${d.profissional_nome} (agendamento ${agendamentoId})`);
    return { ok: true };
  } catch (err) {
    console.error(`❌ Erro ao solicitar confirmacao do barbeiro:`, err.message);
    return { ok: false, erro: err.message };
  }
}
