import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { requerRole } from '../middleware/permissoes.js';

const router = Router();
router.use(autenticar);

// 🛡️ PROTEÇÃO: Apenas owner/admin podem gerenciar caixa
router.use(requerRole(['owner', 'admin']));

// GET /api/caixa - Retorna caixa do dia ou lista
router.get('/', async (req, res) => {
  try {
    const { data } = req.query;
    const dia = data || 'CURRENT_DATE';

    const caixa = await query(
      `SELECT * FROM caixa_registros WHERE barbearia_id = $1 AND data = $2`,
      [req.barbeariaId, dia === 'CURRENT_DATE' ? new Date().toISOString().slice(0,10) : dia]
    );

    if (!caixa.rows[0]) {
      return res.json(null);
    }

    const movimentos = await query(
      `SELECT * FROM caixa_movimentos WHERE caixa_id = $1 ORDER BY hora`,
      [caixa.rows[0].id]
    );

    const entradas = movimentos.rows.filter(m => m.tipo === 'entrada').reduce((s, m) => s + parseFloat(m.valor), 0);
    const saidas = movimentos.rows.filter(m => m.tipo === 'saida').reduce((s, m) => s + parseFloat(m.valor), 0);

    res.json({
      ...caixa.rows[0],
      movimentos: movimentos.rows,
      total_entradas: entradas.toFixed(2),
      total_saidas: saidas.toFixed(2),
      saldo: (parseFloat(caixa.rows[0].valor_inicial || 0) + entradas - saidas).toFixed(2),
    });
  } catch (e) {
    console.error('Erro GET /caixa:', e);
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/caixa/abrir
router.post('/abrir', async (req, res) => {
  try {
    const { valor_inicial, responsavel } = req.body;

    // Verifica se ja existe caixa aberto hoje
    const existente = await query(
      `SELECT id FROM caixa_registros WHERE barbearia_id = $1 AND data = CURRENT_DATE`,
      [req.barbeariaId]
    );
    if (existente.rows[0]) {
      return res.status(400).json({ erro: 'Caixa ja foi aberto hoje' });
    }

    const { rows } = await query(
      `INSERT INTO caixa_registros (barbearia_id, data, valor_inicial, responsavel)
       VALUES ($1, CURRENT_DATE, $2, $3) RETURNING *`,
      [req.barbeariaId, (valor_inicial || 0).toFixed(2), responsavel || null]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Erro POST /caixa/abrir:', e);
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/caixa/fechar
router.post('/fechar', async (req, res) => {
  try {
    const caixa = await query(
      `SELECT * FROM caixa_registros WHERE barbearia_id = $1 AND data = CURRENT_DATE AND status = 'aberto'`,
      [req.barbeariaId]
    );
    if (!caixa.rows[0]) return res.status(400).json({ erro: 'Nenhum caixa aberto hoje' });

    const movimentos = await query(
      `SELECT * FROM caixa_movimentos WHERE caixa_id = $1`,
      [caixa.rows[0].id]
    );

    const entradas = movimentos.rows.filter(m => m.tipo === 'entrada').reduce((s, m) => s + parseFloat(m.valor), 0);
    const saidas = movimentos.rows.filter(m => m.tipo === 'saida').reduce((s, m) => s + parseFloat(m.valor), 0);
    const valor_final = parseFloat(caixa.rows[0].valor_inicial) + entradas - saidas;

    await query(
      `UPDATE caixa_registros SET status = 'fechado', valor_final = $1, fechamento = now()
       WHERE id = $2`,
      [valor_final.toFixed(2), caixa.rows[0].id]
    );

    res.json({ ok: true, valor_final: valor_final.toFixed(2) });
  } catch (e) {
    console.error('Erro POST /caixa/fechar:', e);
    res.status(500).json({ erro: e.message });
  }
});

// POST /api/caixa/movimento - Registrar entrada/saída manual
router.post('/movimento', async (req, res) => {
  try {
    const { tipo, descricao, valor, forma_pagamento } = req.body;
    if (!tipo || !descricao || valor === undefined) {
      return res.status(400).json({ erro: 'tipo, descricao e valor são obrigatórios' });
    }

    const caixa = await query(
      `SELECT id FROM caixa_registros WHERE barbearia_id = $1 AND data = CURRENT_DATE AND status = 'aberto'`,
      [req.barbeariaId]
    );
    if (!caixa.rows[0]) return res.status(400).json({ erro: 'Caixa nao esta aberto' });

    const { rows } = await query(
      `INSERT INTO caixa_movimentos (caixa_id, barbearia_id, tipo, descricao, valor, forma_pagamento)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [caixa.rows[0].id, req.barbeariaId, tipo, descricao, valor.toFixed(2), forma_pagamento || null]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Erro POST /caixa/movimento:', e);
    res.status(500).json({ erro: e.message });
  }
});

// GET /api/caixa/historico?inicio=&fim=
router.get('/historico', async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    let sql = `SELECT * FROM caixa_registros WHERE barbearia_id = $1`;
    const params = [req.barbeariaId];

    if (inicio) {
      params.push(inicio);
      sql += ` AND data >= $${params.length}`;
    }
    if (fim) {
      params.push(fim);
      sql += ` AND data <= $${params.length}`;
    }
    sql += ` ORDER BY data DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error('Erro GET /caixa/historico:', e);
    res.status(500).json({ erro: e.message });
  }
});

export default router;
