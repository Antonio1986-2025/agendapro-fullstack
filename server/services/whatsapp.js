import axios from 'axios';
import { query } from '../config/database.js';

/**
 * Servico de WhatsApp com suporte a multiplos providers.
 *
 * - "log"        : nao envia de verdade, apenas registra no banco (modo demonstracao/dev)
 * - "meta_cloud" : envia via WhatsApp Cloud API oficial da Meta
 *
 * A config fica por barbearia na tabela whatsapp_config.
 */

async function getConfig(barbeariaId) {
  const { rows } = await query(
    'SELECT * FROM whatsapp_config WHERE barbearia_id = $1',
    [barbeariaId]
  );
  return rows[0] || { provider: 'log', enabled: false };
}

function normalizarTelefone(tel) {
  // Remove tudo que nao for digito
  let n = (tel || '').replace(/\D/g, '');
  // Garante DDI Brasil (55) se vier so com DDD + numero
  if (n.length <= 11) n = '55' + n;
  return n;
}

async function registrarMensagem(barbeariaId, { agendamentoId, telefone, mensagem, tipo, status }) {
  await query(
    `INSERT INTO whatsapp_mensagens (barbearia_id, agendamento_id, telefone, mensagem, tipo, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [barbeariaId, agendamentoId || null, telefone, mensagem, tipo || 'manual', status || 'enviada']
  );
}

async function enviarViaMetaCloud(config, telefone, mensagem) {
  const url = `https://graph.facebook.com/v18.0/${config.phone_number_id}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: normalizarTelefone(telefone),
    type: 'text',
    text: { body: mensagem },
  };
  const { data } = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  return data;
}

/**
 * Envia uma mensagem de WhatsApp para o cliente.
 * Retorna { ok, provider, status }.
 */
export async function enviarMensagem(barbeariaId, { telefone, mensagem, tipo, agendamentoId }) {
  const config = await getConfig(barbeariaId);

  // Modo log (padrao): nao envia, apenas registra
  if (!config.enabled || config.provider === 'log') {
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone, mensagem, tipo, status: 'enviada',
    });
    console.log(`📱 [WhatsApp:log] -> ${telefone}: ${mensagem}`);
    return { ok: true, provider: 'log', status: 'enviada' };
  }

  // Provider real: Meta Cloud API
  try {
    await enviarViaMetaCloud(config, telefone, mensagem);
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone, mensagem, tipo, status: 'enviada',
    });
    return { ok: true, provider: 'meta_cloud', status: 'enviada' };
  } catch (err) {
    console.error('❌ Erro WhatsApp Meta Cloud:', err.response?.data || err.message);
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone, mensagem, tipo, status: 'erro',
    });
    return { ok: false, provider: 'meta_cloud', status: 'erro', erro: err.message };
  }
}

/** Monta texto de confirmacao de agendamento */
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

/** Monta texto de aviso de NOVO agendamento para o barbeiro responsavel */
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

/**
 * Notifica o barbeiro responsavel sobre um novo agendamento.
 * Busca o telefone do profissional e dispara a mensagem (se habilitado).
 * Nao lanca erro: apenas registra falha no console.
 */
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
