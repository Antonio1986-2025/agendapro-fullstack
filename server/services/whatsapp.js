import { query } from '../config/database.js';
import { enviarMensagemBaileys } from './baileys-provider.js';

async function getConfig(barbeariaId) {
  const { rows } = await query(
    `SELECT * FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  return rows[0] || { provider: 'log', enabled: false, session_status: 'disconnected' };
}

/**
 * Normaliza número de telefone removendo caracteres especiais
 * e tratando formatos diferentes
 */
function normalizarTelefone(tel) {
  if (!tel) return '';
  
  // Remove tudo que não é número
  let numero = tel.replace(/\D/g, '');
  
  console.log(`🔧 Normalizando telefone: "${tel}" → "${numero}"`);
  
  // Se tem menos de 10 dígitos, retorna vazio (inválido)
  if (numero.length < 10) {
    console.log(`⚠️  Telefone muito curto: ${numero.length} dígitos`);
    return '';
  }
  
  // Se começa com código de país diferente de 55 (Brasil), pode ser spam/internacional
  // Mas vamos aceitar números brasileiros
  if (numero.length >= 12 && numero.startsWith('55')) {
    // Já tem código do país (55)
    return numero;
  }
  
  // Se tem 11 dígitos (DDD + 9 + número), adiciona 55
  if (numero.length === 11) {
    return '55' + numero;
  }
  
  // Se tem 10 dígitos (DDD + número), adiciona 55
  if (numero.length === 10) {
    return '55' + numero;
  }
  
  // Retorna como está se tiver mais de 12 dígitos
  return numero;
}

async function registrarMensagem(barbeariaId, { agendamentoId, telefone, mensagem, tipo, status }) {
  await query(
    `INSERT INTO whatsapp_mensagens (barbearia_id, agendamento_id, telefone, mensagem, tipo, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [barbeariaId, agendamentoId || null, telefone, mensagem, tipo || 'manual', status || 'enviada']
  );
}

export async function enviarMensagem(barbeariaId, { telefone, mensagem, tipo, agendamentoId }) {
  const config = await getConfig(barbeariaId);
  const tel = normalizarTelefone(telefone);

  if (!config.enabled || config.provider === 'log') {
    await registrarMensagem(barbeariaId, {
      agendamentoId, telefone: tel, mensagem, tipo, status: 'enviada',
    });
    console.log(`📱 [WhatsApp:log] -> ${tel}: ${mensagem}`);
    return { ok: true, provider: 'log', status: 'enviada' };
  }

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