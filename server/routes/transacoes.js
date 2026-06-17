import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';

const router = Router();
router.use(autenticar);

// GET /api/transacoes
router.get('/', async (req, res) => {
  const { inicio, fim, tipo, categoria } = req.query;
  let sql = `SELECT * FROM transacoes WHERE barbearia_id = $1`;
  const params = [req.barbeariaId];

  if (inicio) {
    params.push(inicio);
    sql += ` AND data >= $${params.length}`;
  }
  if (fim) {
    params.push(fim);
    sql += ` AND data <= $${params.length}`;
  }
  if (tipo) {
    params.push(tipo);
    sql += ` AND tipo = $${params.length}`;
  }
  if (categoria) {
    params.push(categoria);
    sql += ` AND categoria = $${params.length}`;
  }
  sql += ` ORDER BY data DESC, created_at DESC`;

  const { rows } = await query(sql, params);
  res.json(rows);
});

// POST /api/transacoes
router.post('/', async (req, res) => {
  const { tipo, categoria, descricao, valor, forma_pagamento, data, observacao } = req.body;
  if (!tipo || !categoria || !descricao || valor === undefined) {
    return res.status(400).json({ erro: 'tipo, categoria, descricao e valor são obrigatórios' });
  }

  const { rows } = await query(
    `INSERT INTO transacoes (barbearia_id, tipo, categoria, descricao, valor, forma_pagamento, data, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.barbeariaId, tipo, categoria, descricao, valor.toFixed(2), forma_pagamento || null,
     data || new Date().toISOString().slice(0, 10), observacao || null]
  );

  res.status(201).json(rows[0]);
});

// DELETE /api/transacoes/:id
router.delete('/:id', async (req, res) => {
  const r = await query(`DELETE FROM transacoes WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]);
  if (r.rowCount === 0) return res.status(404).json({ erro: 'Transacao nao encontrada' });
  res.status(204).end();
});

export default router;
