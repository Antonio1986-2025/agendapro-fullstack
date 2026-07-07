/**
 * Evolution API Provider
 * 
 * Gerencia conexões WhatsApp via Evolution API.
 * Cada barbearia tem sua própria instância isolada.
 * 
 * Documentação: https://doc.evolution-api.com
 */

import axios from 'axios';
import { query } from '../config/database.js';

// Configuração da Evolution API
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const SISTEMA_URL = process.env.SISTEMA_URL || 'http://localhost:3000';

/**
 * Cliente HTTP base para Evolution API
 */
function getClient(apiKey = EVOLUTION_API_KEY) {
  return axios.create({
    baseURL: EVOLUTION_URL,
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    },
    timeout: 30000,
  });
}

/**
 * Gera nome único da instância para a barbearia
 */
function getInstanceName(barbeariaId) {
  return `barbearia-${barbeariaId.replace(/-/g, '').substring(0, 16)}`;
}

/**
 * Cria uma nova instância na Evolution API para a barbearia
 * Chamado automaticamente quando barbearia se cadastra
 */
export async function criarInstancia(barbeariaId) {
  const instanceName = getInstanceName(barbeariaId);
  const webhookUrl = `${SISTEMA_URL}/api/whatsapp/webhook/evolution/${barbeariaId}`;
  
  console.log(`🆕 Criando instância Evolution para barbearia ${barbeariaId}`);
  console.log(`   Nome da instância: ${instanceName}`);
  console.log(`   Webhook: ${webhookUrl}`);
  
  try {
    const client = getClient();
    
    const response = await client.post('/instance/create', {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: [
          'MESSAGES_UPSERT',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
        ],
      },
    });
    
    const instanceApiKey = response.data.hash?.apikey || response.data.hash || response.data.token || '';
    
    // Salva dados da instância no banco
    await query(
      `UPDATE whatsapp_config 
          SET evolution_instance_name = $1,
              evolution_api_key = $2,
              provider = 'evolution',
              session_status = 'created',
              updated_at = now()
        WHERE barbearia_id = $3`,
      [instanceName, instanceApiKey, barbeariaId]
    );
    
    console.log(`✅ Instância criada com sucesso: ${instanceName}`);
    console.log(`   API Key: ${instanceApiKey.substring(0, 8)}...`);
    
    return {
      instanceName,
      apiKey: instanceApiKey || EVOLUTION_API_KEY,
      status: 'created',
    };
  } catch (err) {
    // Se já existe, busca os dados existentes
    if (err.response?.status === 403 || err.response?.data?.message?.includes('already exists')) {
      console.log(`ℹ️  Instância ${instanceName} já existe, recuperando...`);
      return await recuperarInstancia(barbeariaId);
    }
    
    console.error(`❌ Erro ao criar instância:`, err.response?.data || err.message);
    throw new Error(`Falha ao criar instância: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Atualiza o webhook de uma instância existente para o SISTEMA_URL atual
 */
async function atualizarWebhook(barbeariaId, instanceName) {
  const webhookUrl = `${SISTEMA_URL}/api/whatsapp/webhook/evolution/${barbeariaId}`;
  try {
    const client = getClient();
    await client.post(`/webhook/set/${instanceName}`, {
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: true,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
    });
    console.log(`   Webhook atualizado: ${webhookUrl}`);
  } catch (err) {
    console.warn(`   ⚠️  Falha ao atualizar webhook: ${err.message}`);
  }
}

/**
 * Recupera dados de uma instância existente e atualiza o webhook
 */
export async function recuperarInstancia(barbeariaId) {
  const instanceName = getInstanceName(barbeariaId);
  
  try {
    const client = getClient();
    const response = await client.get(`/instance/fetchInstances?instanceName=${instanceName}`);
    
    const instance = Array.isArray(response.data) 
      ? response.data.find(i => i.name === instanceName || i.instance?.instanceName === instanceName)
      : response.data;
    
    if (!instance) {
      throw new Error('Instância não encontrada');
    }
    
    // Atualiza webhook para o SISTEMA_URL atual
    await atualizarWebhook(barbeariaId, instanceName);
    
    return {
      instanceName,
      apiKey: instanceApiKey || EVOLUTION_API_KEY,
      status: instance.connectionStatus || 'unknown',
    };
  } catch (err) {
    console.error('Erro ao recuperar instância:', err.message);
    throw err;
  }
}

/**
 * Conecta a instância e retorna QR Code.
 * Se já está conectado, retorna status 'connected' sem gerar QR.
 */
export async function conectarInstancia(barbeariaId) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  
  let instanceName = rows[0]?.evolution_instance_name;
  let apiKey = rows[0]?.evolution_api_key;
  
  // Se não tem instância, cria
  if (!instanceName) {
    const nova = await criarInstancia(barbeariaId);
    instanceName = nova.instanceName;
    apiKey = nova.apiKey;
  }
  
  const effectiveKey = apiKey || EVOLUTION_API_KEY;
  
  // Verifica se já está conectado antes de gerar QR
  try {
    const client = getClient(effectiveKey);
    const statusResp = await client.get(`/instance/connectionState/${instanceName}`);
    const state = statusResp.data?.instance?.state || statusResp.data?.state;
    
    if (state === 'open') {
      console.log(`✅ Instância ${instanceName} já está conectada`);
      await query(
        `UPDATE whatsapp_config 
            SET session_status = 'connected', updated_at = now()
          WHERE barbearia_id = $1`,
        [barbeariaId]
      );
      return { qr: null, status: 'connected', instanceName };
    }
  } catch (statusErr) {
    console.log(`⚠️ Não foi possível verificar status: ${statusErr.message}`);
  }
  
  console.log(`🔗 Conectando instância ${instanceName}...`);
  
  try {
    const client = getClient(effectiveKey);
    const response = await client.get(`/instance/connect/${instanceName}`);
    
    const qrCode = response.data.base64 || response.data.code || null;
    
    await query(
      `UPDATE whatsapp_config 
          SET session_status = 'connecting', updated_at = now()
        WHERE barbearia_id = $1`,
      [barbeariaId]
    );
    
    return {
      qr: qrCode,
      status: 'connecting',
      instanceName,
    };
  } catch (err) {
    console.error('Erro ao conectar:', err.response?.data || err.message);
    throw new Error(`Falha ao conectar: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Reconecta uma instância silenciosamente (sem retornar QR para usuário).
 * Se a sessão já existe na Evolution, ela retoma automaticamente.
 * Se não existe, vai falhar (precisa QR Code novo).
 */
export async function reconectarInstanciaSilencioso(barbeariaId) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  
  const instanceName = rows[0]?.evolution_instance_name;
  const apiKey = rows[0]?.evolution_api_key;
  
  if (!instanceName) {
    return { ok: false, motivo: 'sem_instancia' };
  }
  
  try {
    const client = getClient(apiKey);
    
    // Verifica estado atual
    const statusResp = await client.get(`/instance/connectionState/${instanceName}`);
    const state = statusResp.data?.instance?.state || statusResp.data?.state;
    
    // Já conectado? Não faz nada
    if (state === 'open') {
      return { ok: true, status: 'connected', motivo: 'ja_conectado' };
    }
    
    // Tenta conectar (retoma sessão se existir)
    console.log(`🔄 Tentando reconectar ${instanceName} (estado atual: ${state})...`);
    await client.get(`/instance/connect/${instanceName}`);
    
    // Aguarda alguns segundos e verifica de novo
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const novoStatus = await client.get(`/instance/connectionState/${instanceName}`);
    const novoState = novoStatus.data?.instance?.state || novoStatus.data?.state;
    
    if (novoState === 'open') {
      console.log(`✅ ${instanceName} reconectada com sucesso!`);
      
      await query(
        `UPDATE whatsapp_config SET session_status = 'connected', updated_at = now()
          WHERE barbearia_id = $1`,
        [barbeariaId]
      );
      
      return { ok: true, status: 'connected' };
    }
    
    if (novoState === 'connecting') {
      console.log(`⏳ ${instanceName} ainda conectando...`);
      return { ok: true, status: 'connecting', motivo: 'conectando' };
    }
    
    console.log(`⚠️  ${instanceName} não conectou (estado: ${novoState}). Pode precisar de QR novo.`);
    return { ok: false, status: novoState, motivo: 'precisa_qr_novo' };
    
  } catch (err) {
    console.error(`❌ Erro ao reconectar ${instanceName}:`, err.message);
    return { ok: false, motivo: err.message };
  }
}

/**
 * Verifica e reconecta TODAS as instâncias que estão offline
 */
export async function reconectarTodasOffline() {
  console.log(`🔄 ====== VERIFICANDO INSTÂNCIAS OFFLINE ======`);
  
  try {
    // Busca todas barbearias com Evolution configurada
    const { rows: barbearias } = await query(
      `SELECT barbearia_id, evolution_instance_name, session_status 
         FROM whatsapp_config 
        WHERE provider = 'evolution' 
          AND evolution_instance_name IS NOT NULL
          AND enabled = true`
    );
    
    if (barbearias.length === 0) {
      console.log(`   ℹ️  Nenhuma barbearia com Evolution configurada`);
      return { total: 0 };
    }
    
    console.log(`   📋 ${barbearias.length} barbearia(s) Evolution`);
    
    let reconectadas = 0;
    let jaConectadas = 0;
    let falhas = 0;
    
    for (const barb of barbearias) {
      const result = await reconectarInstanciaSilencioso(barb.barbearia_id);
      
      if (result.motivo === 'ja_conectado') {
        jaConectadas++;
      } else if (result.ok) {
        reconectadas++;
      } else {
        falhas++;
      }
    }
    
    console.log(`   ✅ ${jaConectadas} já conectadas, ${reconectadas} reconectadas, ${falhas} falhas`);
    console.log(`====== FIM VERIFICAÇÃO ======\n`);
    
    return { total: barbearias.length, jaConectadas, reconectadas, falhas };
  } catch (err) {
    console.error(`❌ Erro:`, err.message);
    return { erro: err.message };
  }
}

/**
 * Verifica status da conexão
 */
export async function getStatusInstancia(barbeariaId) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  
  if (!rows[0]?.evolution_instance_name) {
    return { status: 'no_instance', telefone: null };
  }
  
  const { evolution_instance_name: instanceName, evolution_api_key: instanceApiKey } = rows[0];
  const apiKey = instanceApiKey || EVOLUTION_API_KEY;
  
  try {
    const client = getClient(apiKey);
    const response = await client.get(`/instance/connectionState/${instanceName}`);
    
    const state = response.data?.instance?.state || response.data?.state || 'unknown';
    
    let status = 'disconnected';
    if (state === 'open') status = 'connected';
    else if (state === 'connecting') status = 'connecting';
    
    // Sincroniza status no banco
    try {
      await query(
        `UPDATE whatsapp_config SET session_status = $1, updated_at = now() 
         WHERE barbearia_id = $2 AND session_status != $1`,
        [status, barbeariaId]
      );
    } catch (err) {
      console.warn(`[evolution] Erro ao atualizar session_status: ${err?.message}`);
    }
    
    // Tenta pegar o número
    let telefone = null;
    if (status === 'connected') {
      try {
        const info = await client.get(`/instance/fetchInstances?instanceName=${instanceName}`);
        const instance = Array.isArray(info.data) 
          ? info.data.find(i => i.name === instanceName || i.instance?.instanceName === instanceName)
          : info.data;
        telefone = instance?.ownerJid?.split('@')[0] || instance?.number || null;
      } catch (err) {
        console.warn(`[evolution] Erro ao buscar info da instância: ${err?.message}`);
      }
    }
    
    return { status, telefone, state };
  } catch (err) {
    return { status: 'error', telefone: null, error: err.message };
  }
}

/**
 * Desconecta a instância (logout)
 */
export async function desconectarInstancia(barbeariaId) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  
  if (!rows[0]?.evolution_instance_name) {
    return { ok: true, message: 'Nenhuma instância para desconectar' };
  }
  
  const { evolution_instance_name: instanceName, evolution_api_key: instanceApiKey } = rows[0];
  const apiKey = instanceApiKey || EVOLUTION_API_KEY;
  
  try {
    const client = getClient(apiKey);
    await client.delete(`/instance/logout/${instanceName}`);
    
    await query(
      `UPDATE whatsapp_config 
          SET session_status = 'disconnected', updated_at = now()
        WHERE barbearia_id = $1`,
      [barbeariaId]
    );
    
    console.log(`✅ Instância ${instanceName} desconectada`);
    return { ok: true };
  } catch (err) {
    console.error('Erro ao desconectar:', err.message);
    throw err;
  }
}

/**
 * Deleta a instância completamente
 */
export async function deletarInstancia(barbeariaId) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  
  if (!rows[0]?.evolution_instance_name) {
    return { ok: true, message: 'Nenhuma instância para deletar' };
  }
  
  const { evolution_instance_name: instanceName, evolution_api_key: instanceApiKey } = rows[0];
  const apiKey = instanceApiKey || EVOLUTION_API_KEY;
  
  try {
    const client = getClient(apiKey);
    
    // Tenta logout primeiro
    try {
      await client.delete(`/instance/logout/${instanceName}`);
    } catch (err) {
      console.warn(`[evolution] Erro ao fazer logout (ignorado): ${err?.message}`);
    }
    
    // Depois deleta
    await client.delete(`/instance/delete/${instanceName}`);
    
    await query(
      `UPDATE whatsapp_config 
          SET evolution_instance_name = NULL,
              evolution_api_key = NULL,
              session_status = 'disconnected',
              updated_at = now()
        WHERE barbearia_id = $1`,
      [barbeariaId]
    );
    
    console.log(`✅ Instância ${instanceName} deletada`);
    return { ok: true };
  } catch (err) {
    console.error('Erro ao deletar instância:', err.message);
    throw err;
  }
}

/**
 * Envia mensagem de texto via Evolution API
 */
export async function enviarMensagemEvolution(barbeariaId, telefone, texto) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  
  if (!rows[0]?.evolution_instance_name) {
    throw new Error('Instância Evolution não configurada para esta barbearia');
  }
  
  const { evolution_instance_name: instanceName, evolution_api_key: instanceApiKey } = rows[0];
  const apiKey = instanceApiKey || EVOLUTION_API_KEY;
  
  // Normaliza telefone (apenas números)
  const numero = telefone.replace(/\D/g, '').replace(/^@.*/, '');
  
  console.log(`📤 ====== ENVIANDO VIA EVOLUTION ======`);
  console.log(`🏪 Barbearia: ${barbeariaId}`);
  console.log(`📞 Número: ${numero}`);
  console.log(`💬 Texto: ${texto.substring(0, 100)}...`);
  
  try {
    const client = getClient(apiKey);
    const response = await client.post(`/message/sendText/${instanceName}`, {
      number: numero,
      text: texto,
    });
    
    console.log(`✅ Mensagem enviada com sucesso para ${numero}`);
    console.log(`==========================================\n`);
    
    return {
      ok: true,
      messageId: response.data?.key?.id,
    };
  } catch (err) {
    console.error(`❌ Erro ao enviar mensagem:`, err.response?.data || err.message);
    throw new Error(`Falha ao enviar: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Baixa mídia (áudio/imagem) da Evolution API como base64
 * Usa endpoint /chat/getBase64FromMediaMessage/{instance}
 * Documentação: https://doc.evolution-api.com/v2.1.1/api/endpoints/chat#get-base64-from-media-message
 */
export async function baixarMediaEvolution(barbeariaId, message) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );

  if (!rows[0]?.evolution_instance_name) {
    throw new Error('Instância Evolution não configurada');
  }

  const { evolution_instance_name: instanceName, evolution_api_key: instanceApiKey } = rows[0];
  const apiKey = instanceApiKey || EVOLUTION_API_KEY;

  const messageId = message?.key?.id;
  if (!messageId) {
    throw new Error('Message ID não encontrado no payload');
  }

  const body = {
    message: { key: { id: messageId } },
    convertToMp4: false,
  };

  try {
    const client = getClient(apiKey);
    console.log(`📥 [Evolution] Baixando mídia da instância: ${instanceName}, msgId: ${messageId}`);
    const response = await client.post(
      `/chat/getBase64FromMediaMessage/${instanceName}`,
      body
    );

    const result = response.data;
    const base64 = result?.base64 || result?.media || null;
    console.log(`📥 [Evolution] Download: ${base64 ? 'sucesso (' + Math.round(base64.length * 0.75 / 1024) + 'KB)' : 'base64 vazio'} | status: ${response.status}`);
    return base64;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.response?.data?.response?.message || err.message;
    const status = err.response?.status || 'sem status';
    console.error(`❌ [Evolution] Erro ao baixar mídia (status ${status}): ${JSON.stringify(errMsg)}`);
    console.error(`   Instância: ${instanceName}, msgId: ${messageId}, temKey: ${!!apiKey}`);
    throw new Error(`Falha ao baixar mídia: ${Array.isArray(errMsg) ? errMsg.join(', ') : errMsg}`);
  }
}

/**
 * Envia indicador de digitação ("digitando...") via Evolution API
 * Presence: "composing" (digitando), "recording" (gravando áudio), "paused" (parou)
 */
export async function enviarDigitandoEvolution(barbeariaId, telefone) {
  const { rows } = await query(
    `SELECT evolution_instance_name, evolution_api_key 
       FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  
  if (!rows[0]?.evolution_instance_name) {
    console.log(`⌨️ [Digitando] Instância não configurada para ${barbeariaId}`);
    return;
  }
  
  const { evolution_instance_name: instanceName, evolution_api_key: instanceApiKey } = rows[0];
  const apiKey = instanceApiKey || EVOLUTION_API_KEY;
  const numero = telefone.replace(/\D/g, '').replace(/^@.*/, '');
  
  try {
    const client = getClient(apiKey);
    console.log(`⌨️ [Digitando] Enviando presence para ${numero} na instância ${instanceName}...`);
    await client.post(`/chat/sendPresence/${instanceName}`, {
      number: numero,
      presence: 'composing',
    });
  } catch (err) {
    console.error(`⌨️ [Digitando] Falha ao enviar presence:`, err.response?.data || err.message);
  }
}

/**
 * Testa conexão com Evolution API
 */
export async function testarEvolutionAPI() {
  try {
    const client = getClient();
    const response = await client.get('/');
    return {
      ok: true,
      versao: response.data?.version || 'unknown',
      mensagem: response.data?.message || 'Evolution API conectada',
    };
  } catch (err) {
    return {
      ok: false,
      erro: err.message,
    };
  }
}
