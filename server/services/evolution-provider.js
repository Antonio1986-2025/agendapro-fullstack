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
    
    const instanceApiKey = response.data.hash?.apikey || response.data.hash || '';
    
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
    
    return {
      instanceName,
      apiKey: instanceApiKey,
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
 * Recupera dados de uma instância existente
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
    
    return {
      instanceName,
      apiKey: instance.token || EVOLUTION_API_KEY,
      status: instance.connectionStatus || 'unknown',
    };
  } catch (err) {
    console.error('Erro ao recuperar instância:', err.message);
    throw err;
  }
}

/**
 * Conecta a instância e retorna QR Code
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
  
  console.log(`🔗 Conectando instância ${instanceName}...`);
  
  try {
    const client = getClient(apiKey);
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
  
  const { evolution_instance_name: instanceName, evolution_api_key: apiKey } = rows[0];
  
  try {
    const client = getClient(apiKey);
    const response = await client.get(`/instance/connectionState/${instanceName}`);
    
    const state = response.data?.instance?.state || response.data?.state || 'unknown';
    
    let status = 'disconnected';
    if (state === 'open') status = 'connected';
    else if (state === 'connecting') status = 'connecting';
    
    // Tenta pegar o número
    let telefone = null;
    if (status === 'connected') {
      try {
        const info = await client.get(`/instance/fetchInstances?instanceName=${instanceName}`);
        const instance = Array.isArray(info.data) 
          ? info.data.find(i => i.name === instanceName || i.instance?.instanceName === instanceName)
          : info.data;
        telefone = instance?.ownerJid?.split('@')[0] || instance?.number || null;
      } catch {}
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
  
  const { evolution_instance_name: instanceName, evolution_api_key: apiKey } = rows[0];
  
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
  
  const { evolution_instance_name: instanceName, evolution_api_key: apiKey } = rows[0];
  
  try {
    const client = getClient(apiKey);
    
    // Tenta logout primeiro
    try {
      await client.delete(`/instance/logout/${instanceName}`);
    } catch {}
    
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
  
  const { evolution_instance_name: instanceName, evolution_api_key: apiKey } = rows[0];
  
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
