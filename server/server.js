import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// Fixa o fuso horario do processo (horario do Brasil por padrao).
// Garante que horarios de agendamento sejam tratados como relogio de parede local.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

import pool from './config/database.js';
import { runMigrations } from './db/migrate.js';
import { limparSessoesStale, reconectarTodasBaileys } from './services/baileys-provider.js';
import { reconectarTodasOffline } from './services/evolution-provider.js';
import { iniciarScheduler } from './services/scheduler.js';

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
import adminRoutes from './routes/admin.js';
import bloqueiosRoutes from './routes/bloqueios.js';
import notificacoesRoutes from './routes/notificacoes.js';
import siteBarbeariaRoutes from './routes/site-barbearia.js';
import siteClienteRoutes from './routes/site-cliente.js';

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
app.use(compression({ level: 6, threshold: 256 }));
app.use(express.json({ limit: '1mb' }));

// ─── RATE LIMITING ───
// Global: 200 req/min por IP (API geral)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Tente novamente em instantes.' },
});

// Webhook: 30 req/min por IP (Evolution/Baileys pode floodar)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições no webhook. Tente novamente em instantes.' },
});

app.use('/api', apiLimiter);
app.use('/api/whatsapp/webhook', webhookLimiter);

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
app.use('/api/admin', adminRoutes);
app.use('/api/bloqueios', bloqueiosRoutes);
app.use('/api/notificacoes', notificacoesRoutes);

// ---------- FRONTEND ESTATICO ----------
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  lastModified: true,
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  },
}));

// Rota do site publico da barbearia (tudo inline, sem estaticos)
app.use('/barbearia-demo', siteBarbeariaRoutes);

// Rota SaaS — site profissional para cada barbearia (template dinâmico)
// GET /b/:slug → site completo com dados da barbearia
app.use('/b', siteClienteRoutes);

// Catch-all SPA (exclui arquivos estaticos)
app.get(/^\/(?!api\/)(?!.*\.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$).*/, (req, res) => {
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
    
    setTimeout(() => { limparSessoesStale().catch(e => console.error('⚠️  Limpeza stale:', e.message)); }, 2000);
    setTimeout(() => { reconectarTodasBaileys().then(() => console.log('✅ Baileys: reconexão automática iniciada')).catch(e => console.error('⚠️  Baileys:', e.message)); }, 5000);
    setTimeout(() => { reconectarTodasOffline().then(r => console.log('✅ Evolution:', JSON.stringify(r))).catch(e => console.error('⚠️  Evolution:', e.message)); }, 6000);
    iniciarScheduler();
    
    console.log('============================================\n');
  });
}

start();
