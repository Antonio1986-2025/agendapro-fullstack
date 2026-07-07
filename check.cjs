const { query } = require('./server/config/database');
query(`
  SELECT a.id, a.data_hora, a.status, s.nome as servico, p.nome as profissional, c.nome as cliente
  FROM agendamentos a
  LEFT JOIN servicos s ON s.id = a.servico_id
  LEFT JOIN profissionais p ON p.id = a.profissional_id
  LEFT JOIN clientes c ON c.id = a.cliente_id
  WHERE a.barbearia_id = '7a9fa1bc-54a5-4508-a1e8-35ad86352e38'
    AND a.data_hora >= '2026-07-06'
    AND a.data_hora < '2026-07-07'
    AND c.telefone LIKE '%556796543700%'
  ORDER BY a.data_hora
`).then(r => {
  console.log(JSON.stringify(r.rows, null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
