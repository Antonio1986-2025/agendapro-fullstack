/**
 * Adiciona dias_funcionamento no horario_config das barbearias
 * que ainda não têm essa configuração.
 * 
 * Uso: node server/db/add-dias-funcionamento.js
 */
import { query } from '../config/database.js';

async function main() {
  console.log('🔍 Buscando barbearias sem dias_funcionamento...');

  const { rows } = await query(
    `SELECT id, nome, horario_config FROM barbearias
      WHERE horario_config IS NULL
         OR horario_config->>'dias_funcionamento' IS NULL`
  );

  if (rows.length === 0) {
    console.log('✅ Todas as barbearias já têm dias_funcionamento.');
    return;
  }

  const defaultDias = [1, 2, 3, 4, 5, 6]; // segunda a sábado
  let atualizados = 0;

  for (const row of rows) {
    const config = row.horario_config || {
      manha: { inicio: '08:00', fim: '12:00' },
      tarde: { inicio: '13:00', fim: '19:00' },
      especial: { inicio: '19:00', fim: '21:00' },
      intervalo_minutos: 30,
    };

    config.dias_funcionamento = defaultDias;

    await query(
      `UPDATE barbearias SET horario_config = $1::jsonb WHERE id = $2`,
      [JSON.stringify(config), row.id]
    );

    atualizados++;
    console.log(`   ✅ ${row.nome} (${row.id}) — dias_funcionamento adicionado`);
  }

  console.log(`\n✅ ${atualizados} barbearia(s) atualizada(s) com sucesso!`);
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
