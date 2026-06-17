import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';

const router = Router();
router.use(autenticar);

// GET /api/profissionais
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM profissionais WHERE barbearia_id = $1 ORDER BY ordem, nome`,
    [req.barbeariaId]
  );
  res.json(rows);
});

// POST /api/profissionais
router.post('/', async (req, res) => {
  const { nome, especialidade, telefone, notificar_whatsapp, ordem } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatorio' });
  const inicial = nome.trim().charAt(0).toUpperCase();
  const { rows } = await query(
    `INSERT INTO profissionais (barbearia_id, nome, especialidade, telefone, notificar_whatsapp, avatar_inicial, ordem)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.barbeariaId, nome, especialidade || null, telefone || null,
     notificar_whatsapp !== false, inicial, ordem || 0]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/profissionais/:id
router.put('/:id', async (req, res) => {
  const { nome, especialidade, telefone, notificar_whatsapp, ativo, ordem } = req.body;
  const { rows } = await query(
    `UPDATE profissionais
        SET nome = COALESCE($1, nome),
            especialidade = COALESCE($2, especialidade),
            telefone = COALESCE($3, telefone),
            notificar_whatsapp = COALESCE($4, notificar_whatsapp),
            ativo = COALESCE($5, ativo),
            ordem = COALESCE($6, ordem),
            avatar_inicial = COALESCE(LEFT(UPPER($1),1), avatar_inicial)
      WHERE id = $7 AND barbearia_id = $8
      RETURNING *`,
    [nome, especialidade, telefone, notificar_whatsapp, ativo, ordem, req.params.id, req.barbeariaId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Profissional nao encontrado' });
  res.json(rows[0]);
});

// DELETE /api/profissionais/:id
router.delete('/:id', async (req, res) => {
  const r = await query(
    `DELETE FROM profissionais WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  if (r.rowCount === 0) return res.status(404).json({ erro: 'Profissional nao encontrado' });
  res.status(204).end();
});

export default router;
