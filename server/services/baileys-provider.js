import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { query } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '..', 'baileys_auth');

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

const connections = new Map();
const connecting = new Set();

function getAuthDir(barbeariaId) {
  const dir = path.join(AUTH_DIR, barbeariaId.replace(/-/g, ''));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function getBarbeariaTelefone(barbeariaId) {
  const { rows } = await query(
    `SELECT telefone FROM barbearias WHERE id = $1`,
    [barbeariaId]
  );
  return rows[0]?.telefone || '';
}

async function isBaileysAtivo(barbeariaId) {
  const { rows } = await query(
    `SELECT provider, enabled FROM whatsapp_config WHERE barbearia_id = $1`,
    [barbeariaId]
  );
  const cfg = rows[0];
  return cfg && cfg.provider === 'baileys' && cfg.enabled === true;
}

export async function conectarBaileys(barbeariaId) {
  if (connecting.has(barbeariaId)) {
    const existing = connections.get(barbeariaId);
    if (existing?.qrCode) {
      return { status: 'connecting', ja_conectando: true, qrCode: existing.qrCode, qrCodeBase64: existing.qrCodeBase64 };
    }
    return { status: 'connecting', ja_conectando: true };
  }
  if (connections.has(barbeariaId)) {
    const existing = connections.get(barbeariaId);
    if (existing.socket?.ws?.readyState === 1) {
      return { status: 'connected', ja_conectado: true };
    }
    await desconectarBaileys(barbeariaId);
  }

  connecting.add(barbeariaId);
  try {

  const authDir = getAuthDir(barbeariaId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  let qrResolve = null;
  const qrPromise = new Promise((resolve) => {
    qrResolve = resolve;
    setTimeout(() => resolve(null), 30000);
  });

  const connectionState = {
    socket: sock,
    saveCreds,
    authDir,
    status: 'connecting',
    qrCode: null,
    qrResolve,
    telefone: null,
  };

  connections.set(barbeariaId, connectionState);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionState.qrCode = qr;
      connectionState.status = 'connecting';

      try {
        const qrBase64 = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        connectionState.qrCodeBase64 = qrBase64;
      } catch {}

      await query(
        `UPDATE whatsapp_config SET session_status = 'connecting', qr_code = $1, updated_at = now() WHERE barbearia_id = $2`,
        [qr, barbeariaId]
      );

      if (connectionState.qrResolve) {
        connectionState.qrResolve({ qrCode: qr, qrCodeBase64: connectionState.qrCodeBase64 });
        connectionState.qrResolve = null;
      }

      console.log(`📱 QR Code gerado para barbearia ${barbeariaId}`);
    }

    if (connection === 'open') {
      connectionState.status = 'connected';
      connectionState.retries = 0;
      connectionState.qrCode = null;

      const telefone = sock.user?.id?.split(':')[0]?.replace(/[^0-9]/g, '') || null;
      connectionState.telefone = telefone;

      await query(
        `UPDATE whatsapp_config SET session_status = 'connected', qr_code = NULL, updated_at = now() WHERE barbearia_id = $1`,
        [barbeariaId]
      );

      console.log(`✅ WhatsApp conectado para barbearia ${barbeariaId}${telefone ? ` (${telefone})` : ''}`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.output?.payload?.error;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
        && statusCode !== 401
        && statusCode !== DisconnectReason.connectionReplaced
        && statusCode !== undefined;
      connectionState.status = 'disconnected';

      await query(
        `UPDATE whatsapp_config SET session_status = 'disconnected', updated_at = now() WHERE barbearia_id = $1`,
        [barbeariaId]
      );

      console.log(`❌ WhatsApp desconectado para barbearia ${barbeariaId} | status=${statusCode} reason=${reason}${shouldReconnect ? ' (reconectando...)' : ' (sessão substituída/deslogada)'}`);

      if (shouldReconnect) {
        const retries = connectionState.retries || 0;
        if (retries >= 5) {
          console.log(`⛔ Máximo de tentativas atingido para ${barbeariaId}. Reconexão manual necessária.`);
          connections.delete(barbeariaId);
          await query(
            `UPDATE whatsapp_config SET session_status = 'disconnected' WHERE barbearia_id = $1`,
            [barbeariaId]
          );
          return;
        }
        const delay = retries < 2 ? 30000 : retries < 4 ? 60000 : 120000;
        connectionState.retries = retries + 1;
        console.log(`🔄 Reconectando em ${delay / 1000}s (tentativa ${connectionState.retries})...`);
        setTimeout(() => {
          if (connections.has(barbeariaId)) {
            connections.delete(barbeariaId);
            conectarBaileys(barbeariaId).catch(e => console.error(`Falha ao reconectar ${barbeariaId}:`, e.message));
          }
        }, delay);
      } else {
        connections.delete(barbeariaId);
        await query(
          `UPDATE whatsapp_config SET session_status = 'disconnected' WHERE barbearia_id = $1`,
          [barbeariaId]
        );
      }
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const ativo = await isBaileysAtivo(barbeariaId);
      if (!ativo) return;

      for (const msg of m.messages) {
        if (msg.key?.fromMe) continue;
        if (!msg.message?.conversation && !msg.message?.extendedTextMessage?.text) continue;

        const texto = msg.message.conversation || msg.message.extendedTextMessage.text;
        const remetente = msg.key.remoteJid;

        if (!texto || !remetente) continue;

        console.log(`📩 [Baileys] Mensagem de ${remetente}: ${texto.substring(0, 100)}`);

        await query(
          `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
           VALUES ($1, $2, $3, 'recebida', 'recebida')`,
          [barbeariaId, remetente, texto]
        );

        const { rows: wc } = await query(
          `SELECT ai_enabled, ai_prompt FROM whatsapp_config WHERE barbearia_id = $1`,
          [barbeariaId]
        );
        const aiEnabled = wc[0]?.ai_enabled;
        if (!aiEnabled) continue;

        const { rows: barb } = await query(
          `SELECT nome FROM barbearias WHERE id = $1`,
          [barbeariaId]
        );
        const barbeariaNome = barb[0]?.nome || 'Barbearia';

        const telefoneLimpo = remetente.replace(/[^0-9]/g, '');
        let historico = [];
        try {
          const { rows: conv } = await query(
            `SELECT historico FROM ai_conversas WHERE barbearia_id = $1 AND cliente_telefone = $2`,
            [barbeariaId, telefoneLimpo]
          );
          if (conv[0]?.historico) {
            historico = typeof conv[0].historico === 'string' ? JSON.parse(conv[0].historico) : conv[0].historico;
          }
        } catch {}

        const { processarMensagem } = await import('./ai.js');
        const { resposta } = await processarMensagem(
          barbeariaId, barbeariaNome, texto, historico,
          wc[0]?.ai_prompt || null, remetente
        );

        if (resposta) {
          await enviarMensagemBaileys(barbeariaId, remetente, resposta);

          historico.push({ role: 'user', content: texto }, { role: 'assistant', content: resposta });
          const limitado = historico.slice(-30);

          await query(
            `INSERT INTO ai_conversas (barbearia_id, cliente_telefone, historico, ultima_interacao)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (barbearia_id, cliente_telefone) DO UPDATE SET
                historico = $3, ultima_interacao = now()`,
            [barbeariaId, telefoneLimpo, JSON.stringify(limitado)]
          );

          console.log(`🤖 [Baileys] Resposta enviada para ${remetente}`);
        }
      }
    } catch (err) {
      console.error(`❌ Erro ao processar mensagem Baileys:`, err.message);
    }
  });

  const qrResult = await qrPromise;
  connecting.delete(barbeariaId);
  return { status: 'connecting', qrCode: qrResult?.qrCode || null, qrCodeBase64: qrResult?.qrCodeBase64 || null };

  } catch (err) {
    connecting.delete(barbeariaId);
    throw err;
  }
}

export async function getStatusBaileys(barbeariaId) {
  const conn = connections.get(barbeariaId);
  if (!conn) {
    return { status: 'disconnected', telefone: null };
  }
  return {
    status: conn.status,
    telefone: conn.telefone,
    qrCode: conn.qrCode,
    qrCodeBase64: conn.qrCodeBase64,
  };
}

export async function getQRCodeBaileys(barbeariaId) {
  const conn = connections.get(barbeariaId);
  if (!conn) return null;
  return { qrCode: conn.qrCode, qrCodeBase64: conn.qrCodeBase64 };
}

export async function desconectarBaileys(barbeariaId) {
  const conn = connections.get(barbeariaId);
  if (conn) {
    try {
      conn.socket?.end(undefined);
      conn.socket?.ws?.close();
    } catch {}
    connections.delete(barbeariaId);
  }

  await query(
    `UPDATE whatsapp_config SET session_status = 'disconnected', qr_code = NULL, updated_at = now() WHERE barbearia_id = $1`,
    [barbeariaId]
  );

  console.log(`📱 Baileys desconectado para barbearia ${barbeariaId}`);
  return { ok: true };
}

export async function enviarMensagemBaileys(barbeariaId, telefone, texto) {
  const conn = connections.get(barbeariaId);
  if (!conn || conn.status !== 'connected') {
    throw new Error('WhatsApp não conectado para esta barbearia');
  }

  let jid;
  if (telefone.includes('@')) {
    jid = telefone;
  } else {
    const numero = telefone.replace(/[^0-9]/g, '');
    jid = `${numero}@s.whatsapp.net`;
  }

  console.log(`📤 [Baileys] Enviando para ${jid}: ${texto.substring(0, 100)}...`);

  try {
    const result = await conn.socket.sendMessage(jid, { text: texto });
    console.log(`✅ [Baileys] Mensagem enviada para ${jid}`);
    return { ok: true, messageId: result?.key?.id };
  } catch (err) {
    console.error(`❌ [Baileys] Erro ao enviar:`, err.message);
    throw new Error(`Falha ao enviar: ${err.message}`);
  }
}

export async function reconectarTodasBaileys() {
  console.log(`🔄 ====== RECONECTANDO INSTÂNCIAS BAILEYS ======`);

  try {
    const { rows } = await query(
      `SELECT barbearia_id FROM whatsapp_config
        WHERE provider = 'baileys' AND enabled = true AND session_status = 'connected'`
    );

    console.log(`   📋 ${rows.length} barbearia(s) com Baileys`);

    for (const b of rows) {
      const conn = connections.get(b.barbearia_id);
      if (!conn || conn.status !== 'connected') {
        console.log(`   🔄 Reconectando ${b.barbearia_id}...`);
        conectarBaileys(b.barbearia_id).catch(e =>
          console.error(`   ❌ Falha ao reconectar ${b.barbearia_id}:`, e.message)
        );
      }
    }

    console.log(`====== FIM RECONEXÃO ======\n`);
  } catch (err) {
    console.error(`❌ Erro ao reconectar Baileys:`, err.message);
  }
}
