import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar, exigirRole } from '../middleware/auth.js';

const router = Router();
router.use(autenticar);

// GET /api/comissoes?profissional_id=X&status=pendente
router.get('/', async (req, res) => {
  const { profissional_id, status, inicio, fim } = req.query;
  let sql = `SELECT c.*, p.nome AS profissional_nome, co.numero AS comanda_numero
              FROM comissoes c
              LEFT JOIN profissionais p ON p.id = c.profissional_id
              LEFT JOIN comandas co ON co.id = c.comanda_id
              WHERE c.barbearia_id = $1`;
  const params = [req.barbeariaId];
  let i = 1;

  // Se for barbeiro (staff), só vê as próprias comissões
  if (req.user.role === 'staff' && profissional_id) {
    i++; sql += ` AND c.profissional_id = $${i}`; params.push(profissional_id);
  } else if (req.user.role === 'staff') {
    i++; sql += ` AND c.profissional_id = (SELECT profissional_id FROM usuarios WHERE id = $${i})`;
    params.push(req.user.sub);
  }

  if (status) { i++; sql += ` AND c.status = $${i}`; params.push(status); }
  if (req.query.acerto_id) { i++; sql += ` AND c.acerto_id = $${i}`; params.push(req.query.acerto_id); }
  if (inicio) { i++; sql += ` AND c.created_at >= $${i}::date`; params.push(inicio); }
  if (fim) { i++; sql += ` AND c.created_at <= $${i}::date`; params.push(fim); }

  sql += ` ORDER BY c.created_at DESC LIMIT 200`;

  const { rows } = await query(sql, params);
  res.json(rows);
});

// GET /api/comissoes/saldo
router.get('/saldo', async (req, res) => {
  if (req.user.role === 'staff') {
    const prof = await query('SELECT profissional_id FROM usuarios WHERE id = $1', [req.user.sub]);
    if (!prof.rows[0]?.profissional_id) return res.json({ pendente: 0, pago: 0, total: 0 });
    const pid = prof.rows[0].profissional_id;
    const [pend, pg] = await Promise.all([
      query(`SELECT COALESCE(SUM(valor_comissao),0) AS t FROM comissoes WHERE profissional_id = $1 AND status = 'pendente'`, [pid]),
      query(`SELECT COALESCE(SUM(valor_comissao),0) AS t FROM comissoes WHERE profissional_id = $1 AND status = 'pago'`, [pid]),
    ]);
    return res.json({ pendente: parseFloat(pend.rows[0].t), pago: parseFloat(pg.rows[0].t), total: parseFloat(pend.rows[0].t) + parseFloat(pg.rows[0].t) });
  }

  // Dono: saldo por profissional
  const { rows } = await query(
    `SELECT c.profissional_id, p.nome AS profissional_nome,
            COALESCE(SUM(CASE WHEN c.status = 'pendente' THEN c.valor_comissao ELSE 0 END),0) AS pendente,
            COALESCE(SUM(CASE WHEN c.status = 'pago' THEN c.valor_comissao ELSE 0 END),0) AS pago
       FROM comissoes c
       JOIN profissionais p ON p.id = c.profissional_id
      WHERE c.barbearia_id = $1
      GROUP BY c.profissional_id, p.nome
      ORDER BY p.nome`,
    [req.barbeariaId]
  );
  res.json(rows);
});

// POST /api/comissoes/pagar  (dono marca como paga)
router.post('/pagar', exigirRole('owner'), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ erro: 'Informe os IDs das comissoes' });

  // Busca as comissões pendentes sendo pagas
  const { rows } = await query(
    `SELECT id, profissional_id, valor_comissao FROM comissoes
      WHERE id = ANY($1::uuid[]) AND barbearia_id = $2 AND status = 'pendente'`,
    [ids, req.barbeariaId]
  );
  if (!rows.length) return res.json({ ok: true });

  // Agrupa por profissional
  const grupos = {};
  for (const r of rows) {
    if (!grupos[r.profissional_id]) grupos[r.profissional_id] = { ids: [], total: 0 };
    grupos[r.profissional_id].ids.push(r.id);
    grupos[r.profissional_id].total += parseFloat(r.valor_comissao);
  }

  // Cria um acerto para cada profissional e vincula as comissões
  for (const [profissionalId, data] of Object.entries(grupos)) {
    const acerto = await query(
      `INSERT INTO acertos (barbearia_id, profissional_id, valor_total) VALUES ($1,$2,$3) RETURNING id`,
      [req.barbeariaId, profissionalId, data.total.toFixed(2)]
    );
    const acertoId = acerto.rows[0].id;
    await query(
      `UPDATE comissoes SET status = 'pago', pago_em = now(), acerto_id = $1
        WHERE id = ANY($2::uuid[])`,
      [acertoId, data.ids]
    );
  }

  res.json({ ok: true });
});

// GET /api/acertos  — histórico de pagamentos agrupados
router.get('/acertos', exigirRole('owner'), async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.profissional_id, p.nome AS profissional_nome,
            a.valor_total, a.created_at,
            (SELECT COUNT(*) FROM comissoes WHERE acerto_id = a.id) AS total_comissoes
       FROM acertos a
       JOIN profissionais p ON p.id = a.profissional_id
      WHERE a.barbearia_id = $1
      ORDER BY a.created_at DESC
      LIMIT 100`,
    [req.barbeariaId]
  );
  res.json(rows);
});

export default router;