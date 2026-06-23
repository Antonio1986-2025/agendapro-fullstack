import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { requerRole } from '../middleware/permissoes.js';

const router = Router();
router.use(autenticar);

// 🛡️ GET pode ser acessado por todos (para listar serviços na agenda)
// Outras rotas (POST, PUT, DELETE) requerem owner/admin

// GET /api/servicos
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM servicos WHERE barbearia_id = $1 ORDER BY categoria, nome`,
    [req.barbeariaId]
  );
  res.json(rows);
});

// POST /api/servicos
router.post('/', requerRole(['owner', 'admin']), async (req, res) => {
  const { nome, categoria, duracao_minutos, preco } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatorio' });
  const { rows } = await query(
    `INSERT INTO servicos (barbearia_id, nome, categoria, duracao_minutos, preco)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.barbeariaId, nome, categoria || 'Geral', duracao_minutos || 30, preco || 0]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/servicos/:id
router.put('/:id', requerRole(['owner', 'admin']), async (req, res) => {
  const { nome, categoria, duracao_minutos, preco, ativo } = req.body;
  const { rows } = await query(
    `UPDATE servicos
        SET nome = COALESCE($1, nome),
            categoria = COALESCE($2, categoria),
            duracao_minutos = COALESCE($3, duracao_minutos),
            preco = COALESCE($4, preco),
            ativo = COALESCE($5, ativo)
      WHERE id = $6 AND barbearia_id = $7
      RETURNING *`,
    [nome, categoria, duracao_minutos, preco, ativo, req.params.id, req.barbeariaId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Servico nao encontrado' });
  res.json(rows[0]);
});

// DELETE /api/servicos/:id
router.delete('/:id', requerRole(['owner', 'admin']), async (req, res) => {
  const r = await query(
    `DELETE FROM servicos WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  if (r.rowCount === 0) return res.status(404).json({ erro: 'Servico nao encontrado' });
  res.status(204).end();
});

export default router;
