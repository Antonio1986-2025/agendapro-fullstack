import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { requerPermissao } from '../middleware/permissoes.js';

const router = Router();
router.use(autenticar);

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
