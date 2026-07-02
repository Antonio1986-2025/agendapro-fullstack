import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { requerPermissao } from '../middleware/permissoes.js';

const router = Router();
router.use(autenticar);

// GET /api/horarios/especiais -> lista config de horarios especiais por profissional
router.get('/especiais', requerPermissao('horarios'), async (req, res) => {
  const { rows } = await query(
    `SELECT he.*, p.nome AS profissional_nome
       FROM horarios_especiais he
       JOIN profissionais p ON p.id = he.profissional_id
      WHERE he.barbearia_id = $1
      ORDER BY p.nome, he.horario`,
    [req.barbeariaId]
  );
  res.json(rows);
});

// PUT /api/horarios/especiais -> define (upsert) o estado de um slot especial
router.put('/especiais', requerPermissao('horarios'), async (req, res) => {
  const { profissional_id, horario, ativo } = req.body;
  if (!profissional_id || !horario) {
    return res.status(400).json({ erro: 'profissional_id e horario obrigatorios' });
  }
  const { rows } = await query(
    `INSERT INTO horarios_especiais (barbearia_id, profissional_id, horario, ativo)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (profissional_id, horario)
     DO UPDATE SET ativo = EXCLUDED.ativo
     RETURNING *`,
    [req.barbeariaId, profissional_id, horario, ativo !== false]
  );
  res.json(rows[0]);
});

// PUT /api/horarios/config -> atualiza janelas de funcionamento da barbearia
router.put('/config', requerPermissao('horarios'), async (req, res) => {
  const { horario_config } = req.body;
  const { rows } = await query(
    `UPDATE barbearias SET horario_config = $1 WHERE id = $2 RETURNING horario_config`,
    [horario_config, req.barbeariaId]
  );
  res.json(rows[0]);
});

export default router;
