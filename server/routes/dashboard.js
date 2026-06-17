import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';

const router = Router();
router.use(autenticar);

// GET /api/dashboard  -> metricas resumidas
router.get('/', async (req, res) => {
  const id = req.barbeariaId;

  const [hoje, mes, clientes, profissionais, proximos] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(preco),0)::numeric AS faturamento
         FROM agendamentos
        WHERE barbearia_id = $1 AND data_hora::date = CURRENT_DATE
          AND status <> 'cancelado'`,
      [id]
    ),
    query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(preco),0)::numeric AS faturamento
         FROM agendamentos
        WHERE barbearia_id = $1
          AND date_trunc('month', data_hora) = date_trunc('month', CURRENT_DATE)
          AND status <> 'cancelado'`,
      [id]
    ),
    query(`SELECT COUNT(*)::int AS total FROM clientes WHERE barbearia_id = $1`, [id]),
    query(`SELECT COUNT(*)::int AS total FROM profissionais WHERE barbearia_id = $1 AND ativo = true`, [id]),
    query(
      `SELECT a.id, a.data_hora, a.status,
              c.nome AS cliente_nome, p.nome AS profissional_nome, s.nome AS servico_nome
         FROM agendamentos a
         LEFT JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN profissionais p ON p.id = a.profissional_id
         LEFT JOIN servicos s ON s.id = a.servico_id
        WHERE a.barbearia_id = $1 AND a.data_hora >= now() AND a.status <> 'cancelado'
        ORDER BY a.data_hora ASC LIMIT 5`,
      [id]
    ),
  ]);

  res.json({
    hoje: { agendamentos: hoje.rows[0].total, faturamento: Number(hoje.rows[0].faturamento) },
    mes: { agendamentos: mes.rows[0].total, faturamento: Number(mes.rows[0].faturamento) },
    clientes_ativos: clientes.rows[0].total,
    profissionais: profissionais.rows[0].total,
    proximos: proximos.rows,
  });
});

export default router;
