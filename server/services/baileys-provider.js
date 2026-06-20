import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '..', 'wa_auth');

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const sockets = {};

export function temAuthState(barbeariaId) {
  const dir = path.join(AUTH_DIR, barbeariaId.replace(/-/g, ''));
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

async function getAuthDir(barbeariaId) {
  const dir = path.join(AUTH_DIR, barbeariaId.replace(/-/g, ''));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function conectarWhatsApp(barbeariaId, onQr, onConnected, onMessage) {
  // Fecha socket anterior se existir (evita handlers duplicados)
  if (sockets[barbeariaId]) {
    try { sockets[barbeariaId].end(undefined); } catch {}
    delete sockets[barbeariaId];
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
  });

  sockets[barbeariaId] = socket;

  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && onQr) {
      const qrBase64 = await qrcode.toDataURL(qr);
      onQr(qrBase64);
    }
    if (connection === 'open' && onConnected) {
      onConnected(socket.user.id);
    }
    if (connection === 'close') {
      delete sockets[barbeariaId];
      try {
        const { query } = await import('../config/database.js');
        await query(`UPDATE whatsapp_config SET session_status = 'disconnected' WHERE barbearia_id = $1`, [barbeariaId]);
      } catch {}
      if (lastDisconnect?.error?.output?.statusCode !== 401) {
        setTimeout(() => conectarWhatsApp(barbeariaId, onQr, onConnected, onMessage), 5000);
      }
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
      
      // CORREÇÃO IMPORTANTE: Se o remoteJid é @lid (LID = Linked ID),
      // usa o remoteJidAlt que tem o número real do WhatsApp
      let remoteJid = msg.key.remoteJid || '';
      
      if (remoteJid.includes('@lid') && msg.key.remoteJidAlt) {
        console.log(`🔄 LID detectado! Usando remoteJidAlt: ${msg.key.remoteJidAlt}`);
        remoteJid = msg.key.remoteJidAlt;
      }
      
      // Normaliza telefone - remove tudo que não é número
      let telefone = remoteJid.split('@')[0] || '';
      telefone = telefone.replace(/\D/g, ''); // Remove tudo que não é dígito
      
      console.log('📞 Telefone extraído:', telefone);
      console.log('💬 Texto:', texto);
      console.log('🆔 RemoteJid final:', remoteJid);
      
      // Validações
      if (!texto) {
        console.log('⚠️  Mensagem sem texto, ignorando');
        return;
      }
      
      if (!telefone) {
        console.log('⚠️  Não foi possível extrair telefone');
        return;
      }
      
      if (!onMessage) {
        console.log('⚠️  onMessage handler não definido');
        return;
      }
      
      // Validação adicional: telefone deve ter pelo menos 10 dígitos
      if (telefone.length < 10) {
        console.log(`⚠️  Telefone muito curto (${telefone.length} dígitos): ${telefone}`);
        return;
      }
      
      console.log('✅ Mensagem válida, chamando onMessage handler');
      console.log('==========================================\n');
      
      // Chama o handler
      onMessage(telefone, texto, remoteJid);
      
    } catch (err) {
      console.error('❌ Erro ao processar mensagem upsert:', err);
      console.error('Stack:', err.stack);
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

export async function enviarMensagemBaileys(barbeariaId, telefone, texto) {
  const sock = sockets[barbeariaId];
  if (!sock) throw new Error('WhatsApp desconectado');
  
  // Se já vem com @, usa direto; senão normaliza para @s.whatsapp.net
  const jid = telefone.includes('@') ? telefone : `${telefone.replace(/\D/g, '')}@s.whatsapp.net`;
  
  console.log(`📤 ====== ENVIANDO MENSAGEM (BAILEYS) ======`);
  console.log(`🏪 Barbearia: ${barbeariaId}`);
  console.log(`📞 Telefone original: ${telefone}`);
  console.log(`🆔 JID normalizado: ${jid}`);
  console.log(`💬 Texto: ${texto.substring(0, 100)}...`);
  console.log(`==========================================\n`);
  
  await sock.sendMessage(jid, { text: texto });
  
  console.log(`✅ Mensagem enviada com sucesso para ${jid}\n`);
}