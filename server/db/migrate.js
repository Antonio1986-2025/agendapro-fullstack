import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  await pool.query(sql);
  console.log('✅ Migrations aplicadas (schema atualizado)');
}

// Permite rodar via "npm run migrate"
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('Concluido.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Erro nas migrations:', err);
      process.exit(1);
    });
}
