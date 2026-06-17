import { Router } from 'express';
import { query } from '../config/database.js';
import { autenticar } from '../middleware/auth.js';
import { enviarMensagem, textoConfirmacao, notificarBarbeiroNovoAgendamento } from '../services/whatsapp.js';

const router = Router();
router.use(autenticar);

// GET /api/agendamentos?data=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { data, status } = req.query;
  let sql = `
    SELECT a.*,
           c.nome AS cliente_nome, c.telefone AS cliente_telefone,
           p.nome AS profissional_nome,
           s.nome AS servico_nome
      FROM agendamentos a
      LEFT JOIN clientes c ON c.id = a.cliente_id
      LEFT JOIN profissionais p ON p.id = a.profissional_id
      LEFT JOIN servicos s ON s.id = a.servico_id
     WHERE a.barbearia_id = $1`;
  const params = [req.barbeariaId];

  if (data) {
    params.push(data);
    sql += ` AND a.data_hora::date = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND a.status = $${params.length}`;
  }
  sql += ` ORDER BY a.data_hora`;

  const { rows } = await query(sql, params);
  res.json(rows);
});

// POST /api/agendamentos
router.post('/', async (req, res) => {
  const {
    cliente_id, profissional_id, servico_id,
    data_hora, observacoes, is_especial,
  } = req.body;

  if (!profissional_id || !data_hora) {
    return res.status(400).json({ erro: 'profissional_id e data_hora sao obrigatorios' });
  }

  // Busca dados do servico para preco/duracao
  let duracao = 30;
  let preco = 0;
  if (servico_id) {
    const serv = await query(
      `SELECT duracao_minutos, preco FROM servicos WHERE id = $1 AND barbearia_id = $2`,
      [servico_id, req.barbeariaId]
    );
    if (serv.rows[0]) {
      duracao = serv.rows[0].duracao_minutos;
      preco = parseFloat(serv.rows[0].preco);
    }
  }

  // Verifica conflito de horario para o mesmo profissional
  const conflito = await query(
    `SELECT 1 FROM agendamentos
      WHERE barbearia_id = $1 AND profissional_id = $2
        AND status <> 'cancelado'
        AND data_hora = $3`,
    [req.barbeariaId, profissional_id, data_hora]
  );
  if (conflito.rowCount > 0) {
    return res.status(409).json({ erro: 'Ja existe agendamento para este profissional neste horario' });
  }

  const { rows } = await query(
    `INSERT INTO agendamentos
       (barbearia_id, cliente_id, profissional_id, servico_id, data_hora, duracao_minutos, preco, is_especial, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.barbeariaId, cliente_id || null, profissional_id, servico_id || null,
     data_hora, duracao, preco.toFixed(2), !!is_especial, observacoes || null]
  );

  // notifica o barbeiro responsavel sobre o novo agendamento (assincrono)
  notificarBarbeiroNovoAgendamento(req.barbeariaId, rows[0].id)
    .catch((e) => console.error('Notificacao barbeiro falhou:', e.message));

  // Cria comanda automaticamente para o agendamento
  try {
    const ag = rows[0];
    const proxNum = await query(
      `SELECT COALESCE(MAX(numero),0) + 1 AS prox FROM comandas WHERE barbearia_id = $1`, [req.barbeariaId]
    );
    const cmd = await query(
      `INSERT INTO comandas (barbearia_id, agendamento_id, numero, cliente_id, cliente_nome, valor)
       SELECT $1, $2, $3, c.id, c.nome, $4
         FROM clientes c WHERE c.id = $5
       RETURNING *`,
      [req.barbeariaId, ag.id, proxNum.rows[0].prox, preco.toFixed(2), ag.cliente_id]
    );
    if (cmd.rows[0] && servico_id) {
      const srv = await query(`SELECT nome FROM servicos WHERE id = $1`, [servico_id]);
      await query(
        `INSERT INTO comanda_itens (comanda_id, descricao, valor, tipo, profissional_id)
         VALUES ($1,$2,$3,'servico',$4)`,
        [cmd.rows[0].id, srv.rows[0]?.nome || 'Serviço', preco.toFixed(2), profissional_id]
      );
    }
  } catch (e) {
    console.error('Erro ao criar comanda automatica:', e.message);
  }

  res.status(201).json(rows[0]);
});

// PATCH /api/agendamentos/:id/status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validos = ['agendado', 'confirmado', 'concluido', 'cancelado'];
  if (!validos.includes(status)) {
    return res.status(400).json({ erro: 'Status invalido' });
  }

  const { rows } = await query(
    `UPDATE agendamentos SET status = $1
      WHERE id = $2 AND barbearia_id = $3 RETURNING *`,
    [status, req.params.id, req.barbeariaId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Agendamento nao encontrado' });
  const ag = rows[0];

  // Ao confirmar, dispara WhatsApp para o cliente
  if (status === 'confirmado' && ag.cliente_id) {
    const det = await query(
      `SELECT c.nome AS cliente_nome, c.telefone, b.nome AS barbearia_nome,
              p.nome AS profissional_nome, s.nome AS servico_nome
         FROM agendamentos a
         JOIN clientes c ON c.id = a.cliente_id
         JOIN barbearias b ON b.id = a.barbearia_id
         JOIN profissionais p ON p.id = a.profissional_id
         LEFT JOIN servicos s ON s.id = a.servico_id
        WHERE a.id = $1`,
      [ag.id]
    );
    const d = det.rows[0];
    if (d?.telefone) {
      const msg = textoConfirmacao({
        clienteNome: d.cliente_nome,
        barbeariaNome: d.barbearia_nome,
        servicoNome: d.servico_nome || 'Atendimento',
        profissionalNome: d.profissional_nome,
        dataHora: ag.data_hora,
      });
      enviarMensagem(req.barbeariaId, {
        telefone: d.telefone, mensagem: msg, tipo: 'confirmacao', agendamentoId: ag.id,
      }).catch((e) => console.error('WhatsApp falhou:', e.message));
    }
  }

  res.json(ag);
});

// DELETE /api/agendamentos/:id
router.delete('/:id', async (req, res) => {
  const r = await query(
    `DELETE FROM agendamentos WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  if (r.rowCount === 0) return res.status(404).json({ erro: 'Agendamento nao encontrado' });
  res.status(204).end();
});

export default router;
