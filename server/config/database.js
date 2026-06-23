import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// ─────────────────────────────────────────────────────────────────────
// FIX TIMEZONE: trata TIMESTAMP (sem TZ) como "relógio de parede"
// ─────────────────────────────────────────────────────────────────────
// Por padrão, pg-node converte TIMESTAMP em JS Date interpretando a hora
// como local do processo Node. Isso causa bug quando o cliente está em
// fuso diferente do servidor (ex: cliente em MS UTC-4, server em SP UTC-3).
//
// Solução: retornar TIMESTAMP como STRING ISO ("2026-06-23T15:00:00") direto.
// Sem o 'Z', o browser interpreta como hora local do navegador.
// Backend: extrai hora da string sem conversão de fuso.
//
// OID 1114 = TIMESTAMP without time zone
// OID 1184 = TIMESTAMPTZ (mantém comportamento default — virá como Date)
pg.types.setTypeParser(1114, (val) => {
  if (!val) return val;
  // Converte "2026-06-23 15:00:00" → "2026-06-23T15:00:00"
  // (formato ISO sem TZ — browser/Node interpretam como local)
  return String(val).replace(' ', 'T');
});

let connectionConfig;

if (process.env.SUPABASE_DB_HOST) {
  connectionConfig = {
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    host: process.env.SUPABASE_DB_HOST,
    port: parseInt(process.env.SUPABASE_DB_PORT || '6543', 10),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    ssl: process.env.SUPABASE_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
} else if (process.env.DATABASE_URL) {
  connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
} else {
  connectionConfig = {
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'agendapro',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool(connectionConfig);

pool.on('connect', () => {
  console.log('✅ PostgreSQL conectado');
});

pool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool do PostgreSQL:', err.message);
});

export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`⚡ query ${duration}ms | linhas: ${result.rowCount}`);
  }
  return result;
}

export default pool;
