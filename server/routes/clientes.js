import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { requerPermissao } from '../middleware/permissoes.js';

const router = Router();
router.use(autenticar);

// GET /api/clientes?busca=
router.get('/', async (req, res) => {
  const { busca } = req.query;
  let sql = `SELECT * FROM clientes WHERE barbearia_id = $1`;
  const params = [req.barbeariaId];
  if (busca) {
    sql += ` AND (nome ILIKE $2 OR telefone ILIKE $2)`;
    params.push(`%${busca}%`);
  }
  sql += ` ORDER BY nome`;
  const { rows } = await query(sql, params);
  res.json(rows);
});

// POST /api/clientes
router.post('/', requerPermissao('clientes'), async (req, res) => {
  const { nome, telefone, email, observacoes } = req.body;
  if (!nome || !telefone) return res.status(400).json({ erro: 'Nome e telefone obrigatorios' });
  const telLimpo = String(telefone).replace(/\D/g, '');
  try {
    const { rows } = await query(
      `INSERT INTO clientes (barbearia_id, nome, telefone, email, observacoes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.barbeariaId, nome, telLimpo, email || null, observacoes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Ja existe um cliente com este telefone' });
    }
    throw err;
  }
});

// PUT /api/clientes/:id
router.put('/:id', requerPermissao('clientes'), async (req, res) => {
  const { nome, telefone, email, observacoes } = req.body;
  const telLimpo = telefone ? String(telefone).replace(/\D/g, '') : undefined;
  const { rows } = await query(
    `UPDATE clientes
        SET nome = COALESCE($1, nome),
            telefone = COALESCE($2, telefone),
            email = COALESCE($3, email),
            observacoes = COALESCE($4, observacoes)
      WHERE id = $5 AND barbearia_id = $6
      RETURNING *`,
    [nome, telLimpo, email, observacoes, req.params.id, req.barbeariaId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Cliente nao encontrado' });
  res.json(rows[0]);
});

// DELETE /api/clientes/:id
router.delete('/:id', requerPermissao('clientes'), async (req, res) => {
  const r = await query(
    `DELETE FROM clientes WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  if (r.rowCount === 0) return res.status(404).json({ erro: 'Cliente nao encontrado' });
  res.status(204).end();
});

export default router;
