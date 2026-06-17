import pg from 'pg';
import dns from 'dns';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function resolveHost(host) {
  // Forca IPv4 para evitar problemas de resolucao IPv6
  return new Promise((resolve, reject) => {
    dns.resolve4(host, (err, addresses) => {
      if (err || !addresses.length) {
        // fallback: usa o host original
        resolve(host);
      } else {
        resolve(addresses[0]);
      }
    });
  });
}

async function createPool() {
  let connectionConfig;

  if (process.env.SUPABASE_DB_HOST) {
    const host = await resolveHost(process.env.SUPABASE_DB_HOST);
    connectionConfig = {
      user: process.env.SUPABASE_DB_USER || 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD,
      host,
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

  return new Pool(connectionConfig);
}

const pool = await createPool();

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
