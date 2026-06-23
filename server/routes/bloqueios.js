import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { injetarContextoPermissoes } from '../middleware/permissoes.js';

const router = Router();
router.use(autenticar);
router.use(injetarContextoPermissoes);

// GET /api/bloqueios?data=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { data } = req.query;
  let sql = `SELECT b.*, p.nome AS profissional_nome
               FROM bloqueios b
               JOIN profissionais p ON p.id = b.profissional_id
              WHERE b.barbearia_id = $1`;
  const params = [req.barbeariaId];

  if (req.contexto.role === 'staff' && req.contexto.profissional_id) {
    params.push(req.contexto.profissional_id);
    sql += ` AND b.profissional_id = $${params.length}`;
  }

  if (data) {
    params.push(data);
    sql += ` AND b.data_hora::date = $${params.length}`;
  }

  sql += ` ORDER BY b.data_hora`;
  const { rows } = await query(sql, params);
  res.json(rows);
});

// POST /api/bloqueios
router.post('/', async (req, res) => {
  const { profissional_id, data_hora, duracao_minutos, motivo } = req.body;

  if (!profissional_id || !data_hora) {
    return res.status(400).json({ erro: 'profissional_id e data_hora sao obrigatorios' });
  }

  if (req.contexto.role === 'staff' && req.contexto.profissional_id !== profissional_id) {
    return res.status(403).json({ erro: 'Voce so pode bloquear seus proprios horarios' });
  }

  const duracao = duracao_minutos || 30;

  const { rows } = await query(
    `INSERT INTO bloqueios (barbearia_id, profissional_id, data_hora, duracao_minutos, motivo)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.barbeariaId, profissional_id, data_hora, duracao, motivo || null]
  );
  res.status(201).json(rows[0]);
});

// DELETE /api/bloqueios/:id
router.delete('/:id', async (req, res) => {
  const { rows: existente } = await query(
    `SELECT profissional_id FROM bloqueios WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );

  if (existente.length === 0) {
    return res.status(404).json({ erro: 'Bloqueio nao encontrado' });
  }

  if (req.contexto.role === 'staff' && req.contexto.profissional_id !== existente[0].profissional_id) {
    return res.status(403).json({ erro: 'Voce so pode remover seus proprios bloqueios' });
  }

  const r = await query(
    `DELETE FROM bloqueios WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  if (r.rowCount === 0) return res.status(404).json({ erro: 'Bloqueio nao encontrado' });
  res.status(204).end();
});

export default router;
