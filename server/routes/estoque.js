import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { requerPermissao } from '../middleware/permissoes.js';

const router = Router();
router.use(autenticar);

// 🛡️ PROTEÇÃO: Verifica permissão 'estoque'
router.use(requerPermissao('estoque'));

// GET /api/estoque
router.get('/', async (req, res) => {
  const { busca, baixo } = req.query;
  let sql = `SELECT * FROM estoque_itens WHERE barbearia_id = $1 AND ativo = true`;
  const params = [req.barbeariaId];

  if (busca) {
    params.push(`%${busca}%`);
    sql += ` AND nome ILIKE $${params.length}`;
  }
  if (baixo === 'true') {
    sql += ` AND quantidade <= minimo`;
  }
  sql += ` ORDER BY nome`;

  const { rows } = await query(sql, params);
  res.json(rows);
});

// GET /api/estoque/:id
router.get('/:id', async (req, res) => {
  const item = await query(
    `SELECT * FROM estoque_itens WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  if (!item.rows[0]) return res.status(404).json({ erro: 'Item nao encontrado' });

  const movimentos = await query(
    `SELECT em.*, p.nome AS profissional_nome
       FROM estoque_movimentos em
       LEFT JOIN profissionais p ON p.id = em.profissional_id
      WHERE em.item_id = $1 ORDER BY em.created_at DESC`,
    [req.params.id]
  );

  res.json({ ...item.rows[0], movimentos: movimentos.rows });
});

// POST /api/estoque
router.post('/', async (req, res) => {
  const { nome, unidade, quantidade, minimo, custo, preco_venda } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome é obrigatório' });

  const { rows } = await query(
    `INSERT INTO estoque_itens (barbearia_id, nome, unidade, quantidade, minimo, custo, preco_venda)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.barbeariaId, nome, unidade || 'un',
     (quantidade || 0).toFixed(2), (minimo || 0).toFixed(2),
     (custo || 0).toFixed(2), (preco_venda || 0).toFixed(2)]
  );

  res.status(201).json(rows[0]);
});

// PATCH /api/estoque/:id
router.patch('/:id', async (req, res) => {
  const { nome, unidade, quantidade, minimo, custo, preco_venda, ativo } = req.body;
  const sets = [];
  const params = [req.params.id, req.barbeariaId];
  let idx = 3;

  if (nome !== undefined) { sets.push(`nome = $${idx++}`); params.push(nome); }
  if (unidade !== undefined) { sets.push(`unidade = $${idx++}`); params.push(unidade); }
  if (quantidade !== undefined) { sets.push(`quantidade = $${idx++}`); params.push(quantidade.toFixed(2)); }
  if (minimo !== undefined) { sets.push(`minimo = $${idx++}`); params.push(minimo.toFixed(2)); }
  if (custo !== undefined) { sets.push(`custo = $${idx++}`); params.push(custo.toFixed(2)); }
  if (preco_venda !== undefined) { sets.push(`preco_venda = $${idx++}`); params.push(preco_venda.toFixed(2)); }
  if (ativo !== undefined) { sets.push(`ativo = $${idx++}`); params.push(ativo); }

  if (!sets.length) return res.status(400).json({ erro: 'Nenhum campo para atualizar' });

  const { rows } = await query(
    `UPDATE estoque_itens SET ${sets.join(', ')} WHERE id = $1 AND barbearia_id = $2 RETURNING *`,
    params
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Item nao encontrado' });
  res.json(rows[0]);
});

// POST /api/estoque/:id/movimento
router.post('/:id/movimento', async (req, res) => {
  const { tipo, quantidade, motivo, profissional_id } = req.body;
  if (!tipo || quantidade === undefined) {
    return res.status(400).json({ erro: 'tipo e quantidade são obrigatórios' });
  }

  const { rows } = await query(
    `INSERT INTO estoque_movimentos (barbearia_id, item_id, tipo, quantidade, motivo, profissional_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.barbeariaId, req.params.id, tipo, quantidade.toFixed(2), motivo || null, profissional_id || null]
  );

  // Atualiza quantidade no item
  const mov = rows[0];
  if (tipo === 'entrada') {
    await query(`UPDATE estoque_itens SET quantidade = quantidade + $1 WHERE id = $2`,
      [quantidade.toFixed(2), req.params.id]);
  } else if (tipo === 'saida' || tipo === 'consumo') {
    await query(`UPDATE estoque_itens SET quantidade = quantidade - $1 WHERE id = $2`,
      [quantidade.toFixed(2), req.params.id]);
  } else if (tipo === 'ajuste') {
    await query(`UPDATE estoque_itens SET quantidade = $1 WHERE id = $2`,
      [quantidade.toFixed(2), req.params.id]);
  }

  res.status(201).json(rows[0]);
});

// DELETE /api/estoque/:id
router.delete('/:id', async (req, res) => {
  const r = await query(`UPDATE estoque_itens SET ativo = false WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]);
  if (r.rowCount === 0) return res.status(404).json({ erro: 'Item nao encontrado' });
  res.status(204).end();
});

export default router;
