import pool from '../config/database.js';

const NOVO_HORARIO = {
  manha: { inicio: '07:30', fim: '11:00' },
  tarde: { inicio: '13:00', fim: '19:00' },
  especial: { inicio: '19:00', fim: '21:00' },
  intervalo_minutos: 30,
};

try {
  const { rowCount } = await pool.query(
    `UPDATE barbearias SET horario_config = $1::jsonb`,
    [JSON.stringify(NOVO_HORARIO)]
  );
  console.log(`✅ horario_config atualizado em ${rowCount} barbearia(s)`);
} catch (err) {
  console.error('❌ Erro ao atualizar horario_config:', err.message);
  process.exit(1);
}

process.exit(0);
