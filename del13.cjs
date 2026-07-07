const { query } = require('./server/config/database');
async function main() {
  // First check comandas
  const comandas = await query("SELECT id FROM comandas WHERE agendamento_id = 'ba7839a4-1c0e-4bcb-b4e2-9ed4ca41a160'");
  console.log('Comandas encontradas:', comandas.rows.length);
  if (comandas.rows.length > 0) {
    const r1 = await query("DELETE FROM comanda_itens WHERE comanda_id = ANY($1)", [comandas.rows.map(c => c.id)]);
    console.log('Itens deletados:', r1.rowCount);
    const r2 = await query("DELETE FROM comandas WHERE id = ANY($1)", [comandas.rows.map(c => c.id)]);
    console.log('Comandas deletadas:', r2.rowCount);
  }
  const r3 = await query("DELETE FROM agendamentos WHERE id = 'ba7839a4-1c0e-4bcb-b4e2-9ed4ca41a160'");
  console.log('Agendamento deletado:', r3.rowCount);
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
