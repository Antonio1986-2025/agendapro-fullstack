import { Router } from 'express';
import pool, { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { requerPermissao } from '../middleware/permissoes.js';

const router = Router();
router.use(autenticar);

// 🛡️ PROTEÇÃO: Todas as rotas de comandas requerem permissão
router.use(requerPermissao('comandas'));

// GET /api/comandas
router.get('/', async (req, res) => {
  const { status, busca } = req.query;
  let sql = `SELECT c.*, COALESCE(ci.total_itens,0) AS total_itens
              FROM comandas c
              LEFT JOIN (SELECT comanda_id, COUNT(*) AS total_itens FROM comanda_itens GROUP BY comanda_id) ci ON ci.comanda_id = c.id
              WHERE c.barbearia_id = $1`;
  const params = [req.barbeariaId];

  if (status) {
    params.push(status);
    sql += ` AND c.status = $${params.length}`;
  }
  if (busca) {
    params.push(`%${busca}%`);
    sql += ` AND (c.cliente_nome ILIKE $${params.length} OR CAST(c.numero AS TEXT) ILIKE $${params.length})`;
  }
  sql += ` ORDER BY c.abertura DESC`;

  const { rows } = await query(sql, params);
  res.json(rows);
});

// GET /api/comandas/:id
router.get('/:id', async (req, res) => {
  const cmd = await query(
    `SELECT * FROM comandas WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  if (!cmd.rows[0]) return res.status(404).json({ erro: 'Comanda nao encontrada' });

  const itens = await query(
    `SELECT ci.*, p.nome AS profissional_nome
       FROM comanda_itens ci
       LEFT JOIN profissionais p ON p.id = ci.profissional_id
      WHERE ci.comanda_id = $1 ORDER BY ci.created_at`,
    [req.params.id]
  );

  res.json({ ...cmd.rows[0], itens: itens.rows });
});

// POST /api/comandas
router.post('/', async (req, res) => {
  const { cliente_nome, cliente_id, itens } = req.body;
  if (!cliente_nome) return res.status(400).json({ erro: 'cliente_nome é obrigatório' });

  const lastNum = await query(
    `SELECT COALESCE(MAX(numero),0) + 1 AS prox FROM comandas WHERE barbearia_id = $1`,
    [req.barbeariaId]
  );
  const proxNum = lastNum.rows[0].prox;

  let valor = 0;
  if (itens && itens.length) {
    valor = itens.reduce((s, i) => s + Number(i.valor || 0), 0);
  }

  const { rows } = await query(
    `INSERT INTO comandas (barbearia_id, numero, cliente_id, cliente_nome, valor)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.barbeariaId, proxNum, cliente_id || null, cliente_nome, valor.toFixed(2)]
  );
  const comanda = rows[0];

  if (itens && itens.length) {
    const vals = itens.map((_, i) =>
      `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`
    ).join(',');
    const flat = [];
    itens.forEach(i => {
      flat.push(comanda.id, i.descricao, i.valor, i.tipo || 'servico');
    });
    await query(
      `INSERT INTO comanda_itens (comanda_id, descricao, valor, tipo) VALUES ${vals}`,
      [...flat]
    );
  }

  res.status(201).json(comanda);
});

// POST /api/comandas/:id/itens
router.post('/:id/itens', async (req, res) => {
  const { descricao, valor, tipo, profissional_id, quantidade } = req.body;
  if (!descricao || valor === undefined) return res.status(400).json({ erro: 'descricao e valor são obrigatórios' });

  // Verifica se comanda existe
  const cmd = await query(`SELECT id FROM comandas WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]);
  if (!cmd.rows[0]) return res.status(404).json({ erro: 'Comanda nao encontrada' });

  await query(
    `INSERT INTO comanda_itens (comanda_id, descricao, valor, tipo, profissional_id, quantidade)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.params.id, descricao, valor, tipo || 'servico', profissional_id || null, quantidade || 1]
  );

  // Recalcula total
  const tot = await query(
    `SELECT COALESCE(SUM(valor),0) AS total FROM comanda_itens WHERE comanda_id = $1`,
    [req.params.id]
  );
  await query(`UPDATE comandas SET valor = $1 WHERE id = $2`,
    [Number(tot.rows[0].total).toFixed(2), req.params.id]);

  res.status(201).json({ ok: true });
});

// DELETE /api/comandas/:id/itens/:itemId
router.delete('/:id/itens/:itemId', async (req, res) => {
  await query(`DELETE FROM comanda_itens WHERE id = $1 AND comanda_id = $2`,
    [req.params.itemId, req.params.id]);

  const tot = await query(
    `SELECT COALESCE(SUM(valor),0) AS total FROM comanda_itens WHERE comanda_id = $1`,
    [req.params.id]
  );
  await query(`UPDATE comandas SET valor = $1 WHERE id = $2`,
    [Number(tot.rows[0].total).toFixed(2), req.params.id]);

  res.json({ ok: true });
});

// PATCH /api/comandas/:id/pagar
router.patch('/:id/pagar', async (req, res) => {
  const { forma_pagamento, valor_recebido } = req.body;
  if (!forma_pagamento) return res.status(400).json({ erro: 'forma_pagamento é obrigatório' });

  const cmd = await query(`SELECT * FROM comandas WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]);
  if (!cmd.rows[0]) return res.status(404).json({ erro: 'Comanda nao encontrada' });
  const comanda = cmd.rows[0];
  if (comanda.status !== 'aberta') return res.status(400).json({ erro: 'Comanda nao esta aberta' });

  // 🛡️ Issue 3: Bloqueia pagamento se agendamento associado estiver cancelado
  if (comanda.agendamento_id) {
    const ag = await query(`SELECT status FROM agendamentos WHERE id = $1`, [comanda.agendamento_id]);
    if (ag.rows[0] && ag.rows[0].status === 'cancelado') {
      return res.status(400).json({ erro: 'Agendamento cancelado — não é possível pagar esta comanda' });
    }
  }

  // 🛡️ Issue 1: Valida caixa aberto antes de prosseguir
  const caixa = await query(
    `SELECT id FROM caixa_registros WHERE barbearia_id = $1 AND data = CURRENT_DATE AND status = 'aberto'`,
    [req.barbeariaId]
  );
  if (!caixa.rows[0]) return res.status(400).json({ erro: 'Caixa nao esta aberto' });

  const total = parseFloat(comanda.valor);
  const recebido = valor_recebido ? parseFloat(valor_recebido) : total;
  const troco = recebido > total ? (recebido - total).toFixed(2) : null;

  // 🛡️ Issue 7: Transação atômica
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fecha comanda
    await client.query(
      `UPDATE comandas SET status = 'finalizada', forma_pagamento = $1, valor_recebido = $2, troco = $3, fechamento = now()
       WHERE id = $4`,
      [forma_pagamento, recebido.toFixed(2), troco, req.params.id]
    );

    // 🛡️ Issue 2: Marca agendamento como concluído
    if (comanda.agendamento_id) {
      await client.query(
        `UPDATE agendamentos SET status = 'concluido' WHERE id = $1 AND status <> 'cancelado'`,
        [comanda.agendamento_id]
      );
    }

    // Registra transação
    await client.query(
      `INSERT INTO transacoes (barbearia_id, tipo, categoria, descricao, valor, forma_pagamento, data, comanda_id)
       VALUES ($1,'entrada','VENDA DE SERVIÇOS/PRODUTOS',$2,$3,$4,CURRENT_DATE,$5)`,
      [req.barbeariaId,
       `VENDA COMANDA #${comanda.numero} - ${comanda.cliente_nome}`,
       total.toFixed(2), forma_pagamento, req.params.id]
    );

    // Registra no caixa do dia
    await client.query(
      `INSERT INTO caixa_movimentos (caixa_id, barbearia_id, tipo, descricao, valor, forma_pagamento, comanda_id)
       VALUES ($1,$2,'entrada',$3,$4,$5,$6)`,
      [caixa.rows[0].id, req.barbeariaId,
       `VENDA COMANDA #${comanda.numero} - ${comanda.cliente_nome}`,
       total.toFixed(2), forma_pagamento, req.params.id]
    );

    // Calcula comissoes dos profissionais nos itens
    const itens = await client.query(
      `SELECT ci.*, p.comissao_servico_percentual, p.comissao_produto_percentual
         FROM comanda_itens ci
         LEFT JOIN profissionais p ON p.id = ci.profissional_id
        WHERE ci.comanda_id = $1`,
      [req.params.id]
    );
    for (const item of itens.rows) {
      if (!item.profissional_id) continue;
      const percentual = item.tipo === 'produto'
        ? parseFloat(item.comissao_produto_percentual || 0)
        : parseFloat(item.comissao_servico_percentual || 0);
      if (percentual <= 0) continue;
      const valorComissao = parseFloat(item.valor) * (percentual / 100);
      await client.query(
        `INSERT INTO comissoes (barbearia_id, profissional_id, comanda_id, tipo, descricao, valor_item, percentual, valor_comissao, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendente')`,
        [req.barbeariaId, item.profissional_id, req.params.id, item.tipo,
         item.descricao, parseFloat(item.valor).toFixed(2), percentual, valorComissao.toFixed(2)]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, troco });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Erro ao processar pagamento:', e);
    res.status(500).json({ erro: 'Erro ao processar pagamento: ' + e.message });
  } finally {
    client.release();
  }
});

// PATCH /api/comandas/:id/cancelar
router.patch('/:id/cancelar', async (req, res) => {
  await query(`UPDATE comandas SET status = 'cancelada' WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]);
  res.json({ ok: true });
});

export default router;
