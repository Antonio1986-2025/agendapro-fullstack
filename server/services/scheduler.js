/**
 * Scheduler de Notificações Automáticas
 * 
 * Gerencia 3 tipos de notificações:
 * 1. 🔔 Notificação para o barbeiro quando novo agendamento é criado (imediato)
 * 2. ⏰ Lembrete para o cliente 30 minutos antes do serviço
 * 3. 📅 Mensagem de retorno 20 dias após o último serviço
 * 
 * Roda automaticamente a cada 5 minutos.
 */

import { query } from '../config/database.js';
import { enviarMensagem } from './whatsapp.js';

// Intervalos em milissegundos
const INTERVALO_VERIFICACAO = 5 * 60 * 1000; // 5 minutos
const JANELA_LEMBRETE_30MIN_MIN = 25; // minutos antes
const JANELA_LEMBRETE_30MIN_MAX = 35; // minutos antes
const DIAS_RETORNO = 20;

let schedulerAtivo = false;
let intervalId = null;

/**
 * ============================================================
 * MENSAGENS PRÉ-FORMATADAS
 * ============================================================
 */
/**
 * Formata data/hora vinda do banco (string "2026-06-23 15:00:00") como "wall clock"
 * Evita conversão de fuso (cliente em MS UTC-4 vê 15h, não 14h)
 */
function formatarDataHoraWallClock(dataHora) {
  if (!dataHora) return { data: '', hora: '', completo: '' };
  const s = String(dataHora);
  // Match "YYYY-MM-DD HH:MM" ou "YYYY-MM-DDTHH:MM"
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return { data: '', hora: '', completo: s };
  const [, ano, mes, dia, hh, mm] = m;
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const diasSemana = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  // Calcula dia da semana usando UTC para evitar conversões
  const d = new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
  const ds = diasSemana[d.getUTCDay()];
  return {
    data: `${dia}/${mes}/${ano}`,
    hora: `${hh}:${mm}`,
    completo: `${ds}, ${parseInt(dia)} de ${meses[parseInt(mes) - 1]}, ${hh}:${mm}`,
  };
}

function montarLembrete30Min({ clienteNome, servicoNome, profissionalNome, dataHora, barbeariaNome, endereco }) {
  const { hora: horaFmt } = formatarDataHoraWallClock(dataHora);
  
  return (
    `⏰ *Lembrete do seu agendamento!*\n\n` +
    `Olá ${clienteNome}! 👋\n\n` +
    `Seu agendamento na *${barbeariaNome}* é em *30 minutos*:\n\n` +
    `✂️ Serviço: ${servicoNome}\n` +
    `💈 Profissional: ${profissionalNome}\n` +
    `🕐 Horário: ${horaFmt}\n` +
    (endereco ? `📍 Endereço: ${endereco}\n` : '') +
    `\nTe esperamos! 😊`
  );
}

function montarMensagemRetorno({ clienteNome, barbeariaNome, ultimoServico, profissionalNome }) {
  const dias = Math.floor((Date.now() - new Date(ultimoServico).getTime()) / (1000 * 60 * 60 * 24));
  
  return (
    `Olá ${clienteNome}! 👋\n\n` +
    `Já se passaram ${dias} dias desde seu último corte na *${barbeariaNome}*. ✂️\n\n` +
    `Que tal agendar uma manutenção?` +
    (profissionalNome ? ` O ${profissionalNome} está te esperando!` : '') +
    `\n\nÉ só me responder *quero agendar* que cuido de tudo para você. 😊`
  );
}

function montarNotificacaoBarbeiro({ profissionalNome, clienteNome, clienteTelefone, servicoNome, dataHora, observacoes }) {
  const { completo: dataFmt } = formatarDataHoraWallClock(dataHora);
  
  return (
    `🔔 *Novo agendamento!*\n\n` +
    `Olá ${profissionalNome}! Você tem um novo cliente:\n\n` +
    `👤 Cliente: ${clienteNome}\n` +
    `📱 Contato: ${clienteTelefone || 'não informado'}\n` +
    `✂️ Serviço: ${servicoNome}\n` +
    `📅 Data: ${dataFmt}\n` +
    (observacoes ? `📝 Obs: ${observacoes}\n` : '') +
    `\nAcesse o painel para mais detalhes.`
  );
}

/**
 * ============================================================
 * 1. NOTIFICAR BARBEIRO (chamado imediatamente ao criar agendamento)
 * ============================================================
 */
export async function notificarBarbeiroNovoAgendamento(barbeariaId, agendamentoId) {
  try {
    const { rows } = await query(
      `SELECT 
          p.nome AS profissional_nome, 
          p.telefone AS profissional_telefone,
          p.notificar_whatsapp,
          c.nome AS cliente_nome, 
          c.telefone AS cliente_telefone,
          s.nome AS servico_nome,
          a.data_hora, 
          a.observacoes,
          a.notificacao_barbeiro_enviada_em
         FROM agendamentos a
         JOIN profissionais p ON p.id = a.profissional_id
         LEFT JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN servicos s ON s.id = a.servico_id
        WHERE a.id = $1 AND a.barbearia_id = $2`,
      [agendamentoId, barbeariaId]
    );
    
    const d = rows[0];
    if (!d) {
      console.log(`⚠️  Agendamento ${agendamentoId} não encontrado`);
      return { ok: false, motivo: 'agendamento_nao_encontrado' };
    }
    
    // Já foi enviado?
    if (d.notificacao_barbeiro_enviada_em) {
      console.log(`ℹ️  Notificação para barbeiro já enviada para ${agendamentoId}`);
      return { ok: false, motivo: 'ja_enviada' };
    }
    
    if (d.notificar_whatsapp === false) {
      return { ok: false, motivo: 'notificacao_desativada' };
    }
    
    if (!d.profissional_telefone) {
      console.log(`⚠️  Profissional sem telefone`);
      return { ok: false, motivo: 'sem_telefone' };
    }
    
    const mensagem = montarNotificacaoBarbeiro({
      profissionalNome: d.profissional_nome,
      clienteNome: d.cliente_nome || 'Cliente',
      clienteTelefone: d.cliente_telefone,
      servicoNome: d.servico_nome || 'Atendimento',
      dataHora: d.data_hora,
      observacoes: d.observacoes,
    });
    
    await enviarMensagem(barbeariaId, { telefone: d.profissional_telefone, mensagem, tipo: 'notificacao_barbeiro' });
    
    // Registra envio
    await query(
      `INSERT INTO whatsapp_mensagens (barbearia_id, agendamento_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, $4, 'novo_agendamento_barbeiro', 'enviada')`,
      [barbeariaId, agendamentoId, d.profissional_telefone, mensagem]
    );
    
    // Marca como enviada
    await query(
      `UPDATE agendamentos SET notificacao_barbeiro_enviada_em = now() WHERE id = $1`,
      [agendamentoId]
    );
    
    console.log(`✅ Barbeiro ${d.profissional_nome} notificado sobre agendamento ${agendamentoId}`);
    return { ok: true };
  } catch (err) {
    console.error(`❌ Erro ao notificar barbeiro:`, err.message);
    return { ok: false, erro: err.message };
  }
}

/**
 * ============================================================
 * 1B. NOTIFICAR BARBEIRO/RESPONSÁVEL SOBRE CANCELAMENTO
 * ============================================================
 */
export async function notificarBarberCancelamento(barbeariaId, agendamentoId) {
  try {
    const { rows } = await query(
      `SELECT 
          p.nome AS profissional_nome, 
          p.telefone AS profissional_telefone,
          p.notificar_whatsapp,
          p.eh_responsavel,
          c.nome AS cliente_nome, 
          c.telefone AS cliente_telefone,
          s.nome AS servico_nome,
          a.data_hora
         FROM agendamentos a
         JOIN profissionais p ON p.id = a.profissional_id
         LEFT JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN servicos s ON s.id = a.servico_id
        WHERE a.id = $1 AND a.barbearia_id = $2 AND a.status = 'cancelado'`,
      [agendamentoId, barbeariaId]
    );
    
    const d = rows[0];
    if (!d) {
      console.log(`⚠️  Agendamento ${agendamentoId} não encontrado ou não está cancelado`);
      return { ok: false, motivo: 'agendamento_nao_encontrado' };
    }
    
    if (d.notificar_whatsapp === false) {
      return { ok: false, motivo: 'notificacao_desativada' };
    }
    
    if (!d.profissional_telefone) {
      console.log(`⚠️  Profissional sem telefone`);
      return { ok: false, motivo: 'sem_telefone' };
    }
    
    const { hora: horaFmt, completo: dataFmt } = formatarDataHoraWallClock(d.data_hora);
    
    const mensagem = 
      `⚠️ *Cancelamento de agendamento*\n\n` +
      `Olá ${d.profissional_nome}! Um agendamento foi cancelado:\n\n` +
      `👤 Cliente: ${d.cliente_nome || 'Cliente'}\n` +
      `📱 Contato: ${d.cliente_telefone || 'não informado'}\n` +
      `✂️ Serviço: ${d.servico_nome || 'Atendimento'}\n` +
      `📅 Era para: ${dataFmt}\n\n` +
      `O horário volta a ficar disponível.`;
    
    await enviarMensagem(barbeariaId, { telefone: d.profissional_telefone, mensagem, tipo: 'notificacao_barbeiro' });
    
    // Registra envio
    await query(
      `INSERT INTO whatsapp_mensagens (barbearia_id, agendamento_id, telefone, mensagem, tipo, status)
       VALUES ($1, $2, $3, $4, 'cancelamento_barbeiro', 'enviada')`,
      [barbeariaId, agendamentoId, d.profissional_telefone, mensagem]
    );
    
    console.log(`✅ Barbeiro ${d.profissional_nome} notificado sobre cancelamento ${agendamentoId}`);
    return { ok: true };
  } catch (err) {
    console.error(`❌ Erro ao notificar cancelamento:`, err.message);
    return { ok: false, erro: err.message };
  }
}

/**
 * ============================================================
 * 2. ENVIAR LEMBRETES 30 MINUTOS ANTES
 * ============================================================
 */
async function enviarLembretes30Min() {
  try {
    const agora = new Date();
    const inicio = new Date(agora.getTime() + JANELA_LEMBRETE_30MIN_MIN * 60 * 1000);
    const fim = new Date(agora.getTime() + JANELA_LEMBRETE_30MIN_MAX * 60 * 1000);
    
    const { rows: agendamentos } = await query(
      `SELECT 
          a.id, a.data_hora, a.barbearia_id,
          c.nome AS cliente_nome, c.telefone AS cliente_telefone,
          s.nome AS servico_nome,
          p.nome AS profissional_nome,
          b.nome AS barbearia_nome, b.endereco AS endereco
         FROM agendamentos a
         JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN servicos s ON s.id = a.servico_id
         LEFT JOIN profissionais p ON p.id = a.profissional_id
         JOIN barbearias b ON b.id = a.barbearia_id
        WHERE a.data_hora BETWEEN $1 AND $2
          AND a.status NOT IN ('cancelado', 'concluido')
          AND a.lembrete_enviado_em IS NULL
          AND c.telefone IS NOT NULL`,
      [inicio.toISOString(), fim.toISOString()]
    );
    
    if (agendamentos.length === 0) return;
    
    console.log(`⏰ Enviando ${agendamentos.length} lembrete(s) de 30 min`);
    
    for (const ag of agendamentos) {
      try {
        const mensagem = montarLembrete30Min({
          clienteNome: ag.cliente_nome,
          servicoNome: ag.servico_nome || 'Atendimento',
          profissionalNome: ag.profissional_nome || 'profissional',
          dataHora: ag.data_hora,
          barbeariaNome: ag.barbearia_nome,
          endereco: ag.endereco,
        });
        
        await enviarMensagem(ag.barbearia_id, { telefone: ag.cliente_telefone, mensagem, tipo: 'lembrete_cliente' });
        
        await query(
          `INSERT INTO whatsapp_mensagens (barbearia_id, agendamento_id, telefone, mensagem, tipo, status)
           VALUES ($1, $2, $3, $4, 'lembrete_30min', 'enviada')`,
          [ag.barbearia_id, ag.id, ag.cliente_telefone, mensagem]
        );
        
        await query(
          `UPDATE agendamentos SET lembrete_enviado_em = now() WHERE id = $1`,
          [ag.id]
        );
        
        console.log(`   ✅ Lembrete enviado para ${ag.cliente_nome} (${ag.cliente_telefone})`);
      } catch (err) {
        console.error(`   ❌ Erro ao enviar lembrete para ${ag.cliente_telefone}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`❌ Erro em enviarLembretes30Min:`, err.message);
  }
}

/**
 * ============================================================
 * 3. ENVIAR MENSAGENS DE RETORNO (20 dias depois)
 * ============================================================
 * Roda 1x por dia (apenas no horário comercial)
 */
async function enviarMensagensRetorno() {
  try {
    const agora = new Date();
    const hora = agora.getHours();
    
    // Só envia em horário comercial (10h às 18h)
    if (hora < 10 || hora >= 18) return;
    
    // Atualiza ultimo_servico_em dos clientes baseado no último agendamento concluído
    await query(
      `UPDATE clientes c
          SET ultimo_servico_em = (
            SELECT MAX(a.data_hora) 
              FROM agendamentos a 
             WHERE a.cliente_id = c.id 
               AND a.status IN ('concluido', 'agendado')
               AND a.data_hora <= now()
          )
        WHERE EXISTS (
          SELECT 1 FROM agendamentos a 
           WHERE a.cliente_id = c.id 
             AND a.data_hora <= now()
        )`
    );
    
    // Busca clientes com último serviço há exatamente DIAS_RETORNO dias
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - DIAS_RETORNO);
    dataLimite.setHours(0, 0, 0, 0);
    
    const dataLimiteFim = new Date(dataLimite);
    dataLimiteFim.setHours(23, 59, 59, 999);
    
    const { rows: clientes } = await query(
      `SELECT 
          c.id, c.nome, c.telefone, c.barbearia_id, c.ultimo_servico_em,
          b.nome AS barbearia_nome,
          (SELECT p.nome FROM agendamentos a 
            JOIN profissionais p ON p.id = a.profissional_id 
           WHERE a.cliente_id = c.id 
             AND a.status IN ('concluido', 'agendado')
           ORDER BY a.data_hora DESC LIMIT 1) AS ultimo_profissional
         FROM clientes c
         JOIN barbearias b ON b.id = c.barbearia_id
        WHERE c.ultimo_servico_em BETWEEN $1 AND $2
          AND (c.retorno_enviado_em IS NULL 
               OR c.retorno_enviado_em < c.ultimo_servico_em)
          AND c.telefone IS NOT NULL
          AND NOT EXISTS (
            -- Cliente não tem agendamento futuro
            SELECT 1 FROM agendamentos a
             WHERE a.cliente_id = c.id
               AND a.data_hora > now()
               AND a.status NOT IN ('cancelado')
          )`,
      [dataLimite.toISOString(), dataLimiteFim.toISOString()]
    );
    
    if (clientes.length === 0) return;
    
    console.log(`📅 Enviando ${clientes.length} mensagem(ns) de retorno (20 dias)`);
    
    for (const cli of clientes) {
      try {
        const mensagem = montarMensagemRetorno({
          clienteNome: cli.nome,
          barbeariaNome: cli.barbearia_nome,
          ultimoServico: cli.ultimo_servico_em,
          profissionalNome: cli.ultimo_profissional,
        });
        
        await enviarMensagem(cli.barbearia_id, { telefone: cli.telefone, mensagem, tipo: 'retorno_cliente' });
        
        await query(
          `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
           VALUES ($1, $2, $3, 'retorno_20dias', 'enviada')`,
          [cli.barbearia_id, cli.telefone, mensagem]
        );
        
        await query(
          `UPDATE clientes SET retorno_enviado_em = now() WHERE id = $1`,
          [cli.id]
        );
        
        console.log(`   ✅ Retorno enviado para ${cli.nome} (${cli.telefone})`);
      } catch (err) {
        console.error(`   ❌ Erro retorno ${cli.telefone}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`❌ Erro em enviarMensagensRetorno:`, err.message);
  }
}

/**
 * ============================================================
 * EXECUÇÃO PRINCIPAL DO SCHEDULER
 * ============================================================
 */
async function executarVerificacoes() {
  if (!schedulerAtivo) return;
  
  console.log(`\n⏰ ====== SCHEDULER (${new Date().toLocaleString('pt-BR')}) ======`);
  
  try {
    // 1. Reconecta instâncias offline (Baileys e Evolution)
    try {
      const { reconectarTodasBaileys } = await import('./baileys-provider.js');
      await reconectarTodasBaileys();
    } catch (err) {
      console.error(`⚠️  Falha ao reconectar Baileys:`, err.message);
    }
    
    try {
      const { reconectarTodasOffline } = await import('./evolution-provider.js');
      await reconectarTodasOffline();
    } catch (err) {
      console.error(`⚠️  Falha ao reconectar Evolution:`, err.message);
    }
    
    // 2. Lembretes 30min
    await enviarLembretes30Min();
    
    // 3. Mensagens de retorno
    await enviarMensagensRetorno();
  } catch (err) {
    console.error(`❌ Erro no scheduler:`, err.message);
  }
  
  console.log(`====== FIM SCHEDULER ======\n`);
}

/**
 * Inicia o scheduler
 */
export async function iniciarScheduler() {
  if (schedulerAtivo) {
    console.log(`ℹ️  Scheduler já está ativo`);
    return;
  }
  
  // Inicia se houver barbearias com Baileys OU Evolution ativo
  try {
    const { rows } = await query(
      `SELECT COUNT(*) AS total FROM whatsapp_config WHERE provider IN ('baileys', 'evolution') AND enabled = true`
    );
    if (parseInt(rows[0]?.total || '0') === 0) {
      console.log(`⚠️  Scheduler não iniciado - nenhuma barbearia com WhatsApp ativo`);
      return;
    }
  } catch (err) {
    console.log(`⚠️  Scheduler não iniciado - erro ao verificar WhatsApp: ${err?.message}`);
    return;
  }
  
  schedulerAtivo = true;
  console.log(`🚀 Scheduler de notificações iniciado (verificação a cada ${INTERVALO_VERIFICACAO / 60000} min)`);
  
  // Roda imediatamente
  executarVerificacoes();
  
  // Depois roda no intervalo configurado
  intervalId = setInterval(executarVerificacoes, INTERVALO_VERIFICACAO);
}

/**
 * Para o scheduler
 */
export function pararScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  schedulerAtivo = false;
  console.log(`🛑 Scheduler parado`);
}

/**
 * Status do scheduler
 */
export function getStatusScheduler() {
  return {
    ativo: schedulerAtivo,
    intervalo_minutos: INTERVALO_VERIFICACAO / 60000,
    janela_lembrete_min: `${JANELA_LEMBRETE_30MIN_MIN}-${JANELA_LEMBRETE_30MIN_MAX} minutos`,
    dias_retorno: DIAS_RETORNO,
  };
}

/**
 * Executa verificações manualmente (útil para teste)
 */
export async function executarManualmente() {
  console.log(`🔧 Executando scheduler manualmente...`);
  await executarVerificacoes();
}
