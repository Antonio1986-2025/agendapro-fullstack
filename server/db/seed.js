import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { runMigrations } from './migrate.js';

/**
 * Cria uma barbearia de demonstracao com login, profissionais e servicos.
 * Login demo:  email: demo@agendapro.com   senha: 123456
 */
async function seed() {
  await runMigrations();
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');

    const jaExiste = await conn.query(`SELECT id FROM barbearias WHERE slug = 'barbearia-demo'`);
    if (jaExiste.rowCount > 0) {
      console.log('ℹ️  Seed ja aplicado (barbearia-demo existe). Pulando.');
      await conn.query('ROLLBACK');
      return;
    }

    const barb = await conn.query(
      `INSERT INTO barbearias (nome, slug, telefone, email)
       VALUES ('Barbearia Demo', 'barbearia-demo', '(67) 99999-0000', 'demo@agendapro.com')
       RETURNING id`
    );
    const bid = barb.rows[0].id;

    const senhaHash = await bcrypt.hash('123456', 10);
    await conn.query(
      `INSERT INTO usuarios (barbearia_id, nome, email, senha_hash, role)
       VALUES ($1, 'Dono Demo', 'demo@agendapro.com', $2, 'owner')`,
      [bid, senhaHash]
    );

    await conn.query(
      `INSERT INTO whatsapp_config (barbearia_id, provider, enabled, ai_enabled) VALUES ($1, 'log', false, false)`,
      [bid]
    );

    const profs = [
      ['Joao', 'Barbeiro Senior', '67991110001', 1],
      ['Diogo', 'Cabeleireiro', '67991110002', 2],
      ['Felipe', 'Barbeiro Junior', '67991110003', 3],
      ['Luan', 'Barbeiro', '67991110004', 4],
    ];
    for (const [nome, esp, tel, ordem] of profs) {
      await conn.query(
        `INSERT INTO profissionais (barbearia_id, nome, especialidade, telefone, avatar_inicial, ordem)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [bid, nome, esp, tel, nome.charAt(0), ordem]
      );
    }

    const servs = [
      ['Corte Masculino', 'Cortes', 30, 45],
      ['Barba Completa', 'Barba', 30, 35],
      ['Corte + Barba', 'Combos', 60, 75],
      ['Sobrancelha', 'Estetica', 15, 20],
      ['Hidratacao', 'Tratamentos', 60, 50],
    ];
    for (const [nome, cat, dur, preco] of servs) {
      await conn.query(
        `INSERT INTO servicos (barbearia_id, nome, categoria, duracao_minutos, preco)
         VALUES ($1, $2, $3, $4, $5)`,
        [bid, nome, cat, dur, preco]
      );
    }

    await conn.query('COMMIT');
    console.log('✅ Seed aplicado!');
    console.log('   Login demo -> email: demo@agendapro.com | senha: 123456');
    console.log('   Pagina publica -> /agendar.html?b=barbearia-demo');
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  } finally {
    conn.release();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  });
