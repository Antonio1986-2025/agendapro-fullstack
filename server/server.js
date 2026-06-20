import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// Fixa o fuso horario do processo (horario do Brasil por padrao).
// Garante que horarios de agendamento sejam tratados como relogio de parede local.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

import pool from './config/database.js';
import { runMigrations } from './db/migrate.js';

import authRoutes from './routes/auth.js';
import profissionaisRoutes from './routes/profissionais.js';
import servicosRoutes from './routes/servicos.js';
import clientesRoutes from './routes/clientes.js';
import agendamentosRoutes from './routes/agendamentos.js';
import dashboardRoutes from './routes/dashboard.js';
import horariosRoutes from './routes/horarios.js';
import whatsappRoutes from './routes/whatsapp.js';
import comandasRoutes from './routes/comandas.js';
import caixaRoutes from './routes/caixa.js';
import transacoesRoutes from './routes/transacoes.js';
import estoqueRoutes from './routes/estoque.js';
import publicoRoutes from './routes/publico.js';
import comissoesRoutes from './routes/comissoes.js';
import aiRoutes from './routes/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();

// Seguranca - CSP relaxada para permitir CDNs usados no frontend
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------- HEALTH ----------
app.get('/api/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW()');
    res.json({ status: 'online', db: 'conectado', timestamp: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ status: 'erro', db: 'desconectado', erro: e.message });
  }
});

// ---------- API ----------
app.use('/api/auth', authRoutes);
app.use('/api/profissionais', profissionaisRoutes);
app.use('/api/servicos', servicosRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/agendamentos', agendamentosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/horarios', horariosRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/comandas', comandasRoutes);
app.use('/api/caixa', caixaRoutes);
app.use('/api/transacoes', transacoesRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/publico', publicoRoutes);
app.use('/api/comissoes', comissoesRoutes);
app.use('/api/ai', aiRoutes);

// ---------- FRONTEND ESTATICO ----------
// no-cache durante desenvolvimento: garante que o navegador sempre pegue a versao nova
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  },
}));

// Fallback: qualquer rota nao-API serve o index (navegacao do front)
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ---------- TRATAMENTO DE ERROS ----------
app.use((err, req, res, next) => {
  console.error('❌ Erro nao tratado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    if (process.env.AUTO_MIGRATE !== 'false') {
      await runMigrations();
    }
  } catch (e) {
    console.error('⚠️ Falha ao aplicar migrations (seguindo mesmo assim):', e.message);
  }

  app.listen(PORT, async () => {
    console.log('\n============================================');
    console.log('✅ AGENDAPRO FULLSTACK ONLINE');
    console.log('============================================');
    console.log(`Porta: ${PORT}`);
    console.log(`Frontend: http://localhost:${PORT}`);
    console.log(`API health: http://localhost:${PORT}/api/health`);
    console.log('============================================\n');

    // Auto-reconecta WhatsApp pra todas as barbearias que tinham provider baileys
    try {
      const { rows } = await pool.query(
        `SELECT barbearia_id, provider, enabled
           FROM whatsapp_config WHERE provider = 'baileys' AND enabled = true`
      );
      if (rows.length > 0) {
        const { conectarWhatsApp, getStatus, temAuthState } = await import('./services/baileys-provider.js');
        const { processarMensagem, getConversa, salvarConversa } = await import('./services/ai.js');
        const { enviarMensagemBaileys } = await import('./services/baileys-provider.js');

        for (const cfg of rows) {
          const barbId = cfg.barbearia_id;
          if (getStatus(barbId) === 'connected') continue;

          // So tenta reconectar se ja tem auth state salvo (evita loop com QR code invisivel)
          if (!temAuthState(barbId)) {
            console.log(`⏭️  Auto-reconnect ignorado para ${barbId} (sem auth state, precisa de QR)`);
            try {
              await pool.query(
                `UPDATE whatsapp_config SET session_status = 'disconnected' WHERE barbearia_id = $1`,
                [barbId]
              );
            } catch {}
            continue;
          }

          console.log(`🔄 Auto-reconectando WhatsApp para ${barbId}...`);

          conectarWhatsApp(
            barbId,
            () => {},
            async (userId) => {
              console.log(`✅ WhatsApp reconectado para ${barbId}: ${userId}`);
              try {
                await pool.query(
                  `UPDATE whatsapp_config SET session_status = 'connected' WHERE barbearia_id = $1`,
                  [barbId]
                );
              } catch {}
            },
            async (telefone, mensagem, remoteJid) => {
              try {
                console.log('\n🎯 ====== MENSAGEM PROCESSANDO (SERVER) ======');
                console.log(`📱 Telefone: ${telefone}`);
                console.log(`🆔 RemoteJid: ${remoteJid}`);
                console.log(`💬 Mensagem: ${mensagem}`);
                console.log(`🏪 Barbearia: ${barbId}`);
                
                const cfgData = await pool.query(
                  `SELECT ai_enabled, ai_prompt, (SELECT nome FROM barbearias WHERE id = $1) AS barbearia_nome
                     FROM whatsapp_config WHERE barbearia_id = $1`,
                  [barbId]
                );
                const config = cfgData.rows[0];
                
                console.log(`🤖 IA habilitada: ${config?.ai_enabled ? 'SIM' : 'NÃO'}`);
                
                if (!config?.ai_enabled) {
                  console.log('⏭️  IA desabilitada, não processando');
                  return;
                }

                // Salvar mensagem recebida
                await pool.query(
                  `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
                   VALUES ($1, $2, $3, 'recebida', 'recebida')`,
                  [barbId, telefone, mensagem]
                );
                console.log('💾 Mensagem salva no banco');

                // Buscar histórico
                const conversa = await getConversa(barbId, telefone);
                const historico = conversa?.historico || [];
                console.log(`📚 Histórico: ${historico.length} mensagens`);

                // Processar com IA
                console.log('🤖 Chamando processarMensagem...');
                const { resposta } = await processarMensagem(
                  barbId, config.barbearia_nome, mensagem, historico, config.ai_prompt
                );

                console.log(`💬 Resposta gerada: ${resposta?.substring(0, 100)}...`);
                console.log('==========================================\n');

                if (resposta) {
                  console.log(`📤 Auto: enviando resposta para ${telefone}: ${resposta.substring(0,50)}`);
                  await enviarMensagemBaileys(barbId, telefone, resposta);
                  await pool.query(
                    `INSERT INTO whatsapp_mensagens (barbearia_id, telefone, mensagem, tipo, status)
                     VALUES ($1, $2, $3, 'ia_resposta', 'enviada')`,
                    [barbId, telefone, resposta]
                  );
                }

                const novoHistorico = [
                  ...historico,
                  { role: 'user', content: mensagem },
                  { role: 'assistant', content: resposta },
                ];
                await salvarConversa(barbId, telefone, novoHistorico);
              } catch (err) {
                console.error(`Erro ao processar mensagem IA (${barbId}):`, err.message);
              }
            }
          ).catch(e => console.error(`Falha ao auto-reconectar WhatsApp ${barbId}:`, e.message));
        }
      }
    } catch (e) {
      console.error('Erro na auto-reconexão WhatsApp:', e.message);
    }
  });
}

start();
