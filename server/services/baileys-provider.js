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
    const msg = m.messages[0];
    if (!msg || msg.key.fromMe || msg.key.remoteJid?.includes('@g.us') || msg.key.remoteJid?.includes('@broadcast')) return;
    const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const telefone = msg.key.remoteJid?.split('@')[0] || '';
    if (!texto || !telefone || !onMessage) return;
    onMessage(telefone, texto);
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
  const jid = telefone.includes('@') ? telefone : `${telefone.replace(/\D/g, '')}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: texto });
}