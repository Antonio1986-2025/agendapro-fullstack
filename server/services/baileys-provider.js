import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '..', 'wa_auth');

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const sockets = {};
const conflictCount = {}; // Contador de conflitos
const reconnectTimers = {}; // Timers de reconexão
const messageQueue = {}; // Fila de mensagens pendentes
const lastConnectionTime = {}; // Timestamp da última conexão estável

const MAX_CONFLICTS = 5; // Máximo de conflitos antes de parar
const CONFLICT_WINDOW = 60000; // Janela de 1 minuto para contar conflitos

export function temAuthState(barbeariaId) {
  const dir = path.join(AUTH_DIR, barbeariaId.replace(/-/g, ''));
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

async function getAuthDir(barbeariaId) {
  const dir = path.join(AUTH_DIR, barbeariaId.replace(/-/g, ''));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Verifica se o socket está realmente conectado e pronto para enviar
 */
function isSocketReady(barbeariaId) {
  const sock = sockets[barbeariaId];
  if (!sock) return false;
  if (!sock.user) return false;
  // Verifica se está conectado há pelo menos 2 segundos (conexão estável)
  const lastConn = lastConnectionTime[barbeariaId];
  if (!lastConn) return false;
  return (Date.now() - lastConn) > 2000;
}

/**
 * Aguarda conexão ficar estável (com timeout)
 */
async function aguardarConexao(barbeariaId, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (isSocketReady(barbeariaId)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Processa fila de mensagens pendentes quando conexão fica estável
 */
async function processarFilaMensagens(barbeariaId) {
  const fila = messageQueue[barbeariaId] || [];
  if (fila.length === 0) return;
  
  console.log(`📦 Processando fila: ${fila.length} mensagens pendentes`);
  
  while (fila.length > 0) {
    const msg = fila.shift();
    try {
      await enviarMensagemDireto(barbeariaId, msg.jid, msg.texto);
      console.log(`✅ Mensagem da fila enviada para ${msg.jid}`);
    } catch (err) {
      console.error(`❌ Falha ao enviar mensagem da fila:`, err.message);
      // Re-adiciona no início se for erro de conexão (tenta de novo depois)
      if (err.message.includes('desconectado') || err.message.includes('conexão')) {
        fila.unshift(msg);
        break;
      }
    }
  }
}

export async function conectarWhatsApp(barbeariaId, onQr, onConnected, onMessage) {
  // Cancela timer de reconexão anterior se existir
  if (reconnectTimers[barbeariaId]) {
    clearTimeout(reconnectTimers[barbeariaId]);
    delete reconnectTimers[barbeariaId];
  }
  
  // Fecha socket anterior se existir (evita handlers duplicados)
  if (sockets[barbeariaId]) {
    try { sockets[barbeariaId].end(undefined); } catch {}
    delete sockets[barbeariaId];
  }

  // Inicializa fila se não existir
  if (!messageQueue[barbeariaId]) {
    messageQueue[barbeariaId] = [];
  }

  const authDir = await getAuthDir(barbeariaId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    browser: Browsers.windows('AgendaPro'),
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
  });

  sockets[barbeariaId] = socket;

  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && onQr) {
      const qrBase64 = await qrcode.toDataURL(qr);
      onQr(qrBase64);
    }
    
    if (connection === 'open') {
      lastConnectionTime[barbeariaId] = Date.now();
      console.log(`✅ WhatsApp conectado para barbearia ${barbeariaId}: ${socket.user?.id}`);
      
      // Reseta contador de conflitos após conexão estável
      setTimeout(() => {
        if (isSocketReady(barbeariaId)) {
          conflictCount[barbeariaId] = 0;
          console.log(`✅ Conexão estável - contador de conflitos resetado`);
          // Processa fila de mensagens
          processarFilaMensagens(barbeariaId);
        }
      }, 3000);
      
      if (onConnected) {
        onConnected(socket.user.id);
      }
    }
    
    if (connection === 'close') {
      delete sockets[barbeariaId];
      delete lastConnectionTime[barbeariaId];
      
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMsg = lastDisconnect?.error?.message || '';
      const isConflict = errorMsg.includes('conflict') || statusCode === 440;
      
      try {
        await query(`UPDATE whatsapp_config SET session_status = 'disconnected' WHERE barbearia_id = $1`, [barbeariaId]);
      } catch {}
      
      // Se foi logout (401), não tenta reconectar
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log(`🚪 WhatsApp deslogado (401) - precisa de novo QR Code`);
        return;
      }
      
      // Trata conflito (outro dispositivo conectado)
      if (isConflict) {
        if (!conflictCount[barbeariaId]) conflictCount[barbeariaId] = 0;
        conflictCount[barbeariaId]++;
        
        console.warn(`⚠️  CONFLITO detectado (${conflictCount[barbeariaId]}/${MAX_CONFLICTS}): outro dispositivo está conectado com este WhatsApp`);
        
        if (conflictCount[barbeariaId] >= MAX_CONFLICTS) {
          console.error(`❌ Muitos conflitos! Parando reconexão automática.`);
          console.error(`📱 SOLUÇÃO: Desconecte outros dispositivos do WhatsApp:`);
          console.error(`   1. Abra o WhatsApp no celular`);
          console.error(`   2. Vá em Configurações > Aparelhos conectados`);
          console.error(`   3. Desconecte TODOS os dispositivos`);
          console.error(`   4. Reconecte pelo painel do sistema`);
          
          try {
            await query(
              `UPDATE whatsapp_config SET session_status = 'conflito_multiplos_dispositivos' WHERE barbearia_id = $1`,
              [barbeariaId]
            );
          } catch {}
          
          // Reseta contador depois de 5 minutos
          setTimeout(() => {
            conflictCount[barbeariaId] = 0;
            console.log(`🔄 Contador de conflitos resetado após 5 minutos`);
          }, 5 * 60 * 1000);
          
          return;
        }
        
        // Aguarda mais tempo entre conflitos (backoff exponencial)
        const delay = Math.min(5000 * Math.pow(2, conflictCount[barbeariaId] - 1), 60000);
        console.log(`⏳ Aguardando ${delay/1000}s antes de tentar reconectar...`);
        
        reconnectTimers[barbeariaId] = setTimeout(() => {
          conectarWhatsApp(barbeariaId, onQr, onConnected, onMessage);
        }, delay);
        return;
      }
      
      // Reconexão normal (não conflito)
      console.log(`🔄 Reconectando WhatsApp em 5 segundos...`);
      reconnectTimers[barbeariaId] = setTimeout(() => {
        conectarWhatsApp(barbeariaId, onQr, onConnected, onMessage);
      }, 5000);
    }
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      
      // Log completo para debug
      console.log('\n📱 ====== MENSAGEM RECEBIDA (BAILEYS) ======');
      console.log('fromMe:', msg.key.fromMe);
      console.log('remoteJid:', msg.key.remoteJid);
      console.log('remoteJidAlt:', msg.key.remoteJidAlt);
      
      // Ignora mensagens próprias, grupos e broadcasts
      if (!msg || msg.key.fromMe) {
        console.log('⏭️  Ignorada: mensagem própria');
        return;
      }
      
      if (msg.key.remoteJid?.includes('@g.us')) {
        console.log('⏭️  Ignorada: mensagem de grupo');
        return;
      }
      
      if (msg.key.remoteJid?.includes('@broadcast')) {
        console.log('⏭️  Ignorada: broadcast');
        return;
      }
      
      // Extrai texto da mensagem
      const texto = msg.message?.conversation 
                 || msg.message?.extendedTextMessage?.text 
                 || msg.message?.imageMessage?.caption
                 || '';
      
      // CORREÇÃO: Se o remoteJid é @lid (LID = Linked ID),
      // usa o remoteJidAlt que tem o número real do WhatsApp
      let remoteJid = msg.key.remoteJid || '';
      
      if (remoteJid.includes('@lid') && msg.key.remoteJidAlt) {
        console.log(`🔄 LID detectado! Usando remoteJidAlt: ${msg.key.remoteJidAlt}`);
        remoteJid = msg.key.remoteJidAlt;
      }
      
      // Normaliza telefone
      let telefone = remoteJid.split('@')[0] || '';
      telefone = telefone.replace(/\D/g, '');
      
      console.log('📞 Telefone extraído:', telefone);
      console.log('💬 Texto:', texto);
      console.log('🆔 RemoteJid final:', remoteJid);
      
      // Validações
      if (!texto) {
        console.log('⚠️  Mensagem sem texto, ignorando');
        return;
      }
      
      if (!telefone || telefone.length < 10) {
        console.log(`⚠️  Telefone inválido: ${telefone}`);
        return;
      }
      
      if (!onMessage) {
        console.log('⚠️  onMessage handler não definido');
        return;
      }
      
      console.log('✅ Mensagem válida, chamando onMessage handler');
      console.log('==========================================\n');
      
      onMessage(telefone, texto, remoteJid);
      
    } catch (err) {
      console.error('❌ Erro ao processar mensagem upsert:', err);
    }
  });

  // Aguarda conexão
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ status: 'timeout' }), 60000);
    socket.ev.on('connection.update', ({ connection }) => {
      if (connection === 'open') {
        clearTimeout(timeout);
        resolve({ status: 'connected', id: socket.user.id });
      }
    });
  });
}

export function getStatus(barbeariaId) {
  const sock = sockets[barbeariaId];
  if (!sock) return 'disconnected';
  return sock.user ? 'connected' : 'connecting';
}

export function getTelefone(barbeariaId) {
  const sock = sockets[barbeariaId];
  if (!sock?.user?.id) return null;
  return sock.user.id.split(':')[0];
}

export async function desconectarWhatsApp(barbeariaId) {
  // Cancela timers
  if (reconnectTimers[barbeariaId]) {
    clearTimeout(reconnectTimers[barbeariaId]);
    delete reconnectTimers[barbeariaId];
  }
  
  // Reseta contadores
  delete conflictCount[barbeariaId];
  delete lastConnectionTime[barbeariaId];
  delete messageQueue[barbeariaId];
  
  const sock = sockets[barbeariaId];
  if (sock) {
    sock.end(undefined);
    delete sockets[barbeariaId];
  }
  const authDir = await getAuthDir(barbeariaId);
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
}

/**
 * Envia mensagem direto (sem fila) - usado internamente
 */
async function enviarMensagemDireto(barbeariaId, telefone, texto) {
  const sock = sockets[barbeariaId];
  if (!sock || !sock.user) {
    throw new Error('WhatsApp desconectado');
  }
  
  const jid = telefone.includes('@') ? telefone : `${telefone.replace(/\D/g, '')}@s.whatsapp.net`;
  
  await sock.sendMessage(jid, { text: texto });
  return jid;
}

/**
 * Envia mensagem com retry e fila
 */
export async function enviarMensagemBaileys(barbeariaId, telefone, texto) {
  const jid = telefone.includes('@') ? telefone : `${telefone.replace(/\D/g, '')}@s.whatsapp.net`;
  
  console.log(`📤 ====== ENVIANDO MENSAGEM (BAILEYS) ======`);
  console.log(`🏪 Barbearia: ${barbeariaId}`);
  console.log(`📞 Telefone: ${telefone}`);
  console.log(`🆔 JID: ${jid}`);
  console.log(`💬 Texto: ${texto.substring(0, 100)}...`);
  
  // Se conexão não está pronta, aguarda
  if (!isSocketReady(barbeariaId)) {
    console.log(`⏳ Conexão instável, aguardando ficar pronta...`);
    const conectou = await aguardarConexao(barbeariaId, 15000);
    
    if (!conectou) {
      console.warn(`⚠️  Conexão não ficou estável, adicionando à fila`);
      if (!messageQueue[barbeariaId]) messageQueue[barbeariaId] = [];
      messageQueue[barbeariaId].push({ jid, texto, timestamp: Date.now() });
      console.log(`📦 Mensagem adicionada à fila (${messageQueue[barbeariaId].length} pendentes)`);
      throw new Error('WhatsApp instável - mensagem adicionada à fila');
    }
  }
  
  // Tenta enviar com retry
  let lastError;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      await enviarMensagemDireto(barbeariaId, telefone, texto);
      console.log(`✅ Mensagem enviada com sucesso para ${jid} (tentativa ${tentativa})`);
      console.log(`==========================================\n`);
      return;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️  Tentativa ${tentativa}/3 falhou: ${err.message}`);
      
      if (tentativa < 3) {
        // Aguarda antes de tentar de novo
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  // Se falhou todas as tentativas, adiciona à fila
  console.error(`❌ Falhou após 3 tentativas, adicionando à fila`);
  if (!messageQueue[barbeariaId]) messageQueue[barbeariaId] = [];
  messageQueue[barbeariaId].push({ jid, texto, timestamp: Date.now() });
  console.log(`📦 Mensagem na fila (${messageQueue[barbeariaId].length} pendentes)`);
  
  throw lastError || new Error('Falha ao enviar mensagem');
}
