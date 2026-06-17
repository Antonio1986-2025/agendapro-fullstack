import { Router } from 'express';
import { query } from '../config/database.js';
import { enviarMensagem, textoConfirmacao, notificarBarbeiroNovoAgendamento } from '../services/whatsapp.js';

const router = Router();

// GET /api/publico/:slug -> dados publicos da barbearia (profissionais + servicos)
router.get('/:slug', async (req, res) => {
  const b = await query(
    `SELECT id, nome, slug, telefone, endereco, horario_config
       FROM barbearias WHERE slug = $1 AND ativo = true`,
    [req.params.slug]
  );
  if (!b.rows[0]) return res.status(404).json({ erro: 'Barbearia nao encontrada' });
  const barbearia = b.rows[0];

  const [profs, servs, horariosEsp] = await Promise.all([
    query(
      `SELECT id, nome, especialidade, avatar_inicial
         FROM profissionais WHERE barbearia_id = $1 AND ativo = true ORDER BY ordem, nome`,
      [barbearia.id]
    ),
    query(
      `SELECT id, nome, categoria, duracao_minutos, preco
         FROM servicos WHERE barbearia_id = $1 AND ativo = true ORDER BY categoria, nome`,
      [barbearia.id]
    ),
    query(
      `SELECT profissional_id, horario
         FROM horarios_especiais WHERE barbearia_id = $1 AND ativo = true`,
      [barbearia.id]
    ),
  ]);

  // agrupa horarios especiais por profissional_id
  const especiaisMap = {};
  for (const h of horariosEsp.rows) {
    if (!especiaisMap[h.profissional_id]) especiaisMap[h.profissional_id] = [];
    especiaisMap[h.profissional_id].push(h.horario);
  }

  // acopla os horarios especiais a cada profissional
  const profissionais = profs.rows.map(p => ({
    ...p,
    horarios_especiais: especiaisMap[p.id] || [],
  }));

  res.json({ barbearia, profissionais, servicos: servs.rows });
});

// GET /api/publico/:slug/horarios?data=YYYY-MM-DD&profissional_id=
// retorna horarios ja ocupados para o cliente ver disponibilidade
router.get('/:slug/horarios', async (req, res) => {
  const { data, profissional_id } = req.query;
  const b = await query(`SELECT id FROM barbearias WHERE slug = $1`, [req.params.slug]);
  if (!b.rows[0]) return res.status(404).json({ erro: 'Barbearia nao encontrada' });

  let sql = `SELECT data_hora, profissional_id FROM agendamentos
              WHERE barbearia_id = $1 AND status <> 'cancelado'`;
  const params = [b.rows[0].id];
  if (data) { params.push(data); sql += ` AND data_hora::date = $${params.length}`; }
  if (profissional_id) { params.push(profissional_id); sql += ` AND profissional_id = $${params.length}`; }

  const { rows } = await query(sql, params);
  res.json({ ocupados: rows });
});

// POST /api/publico/:slug/agendar -> cliente final cria agendamento
router.post('/:slug/agendar', async (req, res) => {
  const { nome, telefone, profissional_id, servico_id, data_hora, is_especial } = req.body;
  if (!nome || !telefone || !profissional_id || !data_hora) {
    return res.status(400).json({ erro: 'nome, telefone, profissional_id e data_hora sao obrigatorios' });
  }

  const b = await query(`SELECT * FROM barbearias WHERE slug = $1 AND ativo = true`, [req.params.slug]);
  if (!b.rows[0]) return res.status(404).json({ erro: 'Barbearia nao encontrada' });
  const barbearia = b.rows[0];

  // upsert do cliente pelo telefone
  const cli = await query(
    `INSERT INTO clientes (barbearia_id, nome, telefone)
     VALUES ($1, $2, $3)
     ON CONFLICT (barbearia_id, telefone)
     DO UPDATE SET nome = EXCLUDED.nome, total_visitas = clientes.total_visitas + 1
     RETURNING *`,
    [barbearia.id, nome, telefone]
  );
  const cliente = cli.rows[0];

  // preco/duracao do servico
  let duracao = 30, preco = 0;
  if (servico_id) {
    const s = await query(
      `SELECT duracao_minutos, preco FROM servicos WHERE id = $1 AND barbearia_id = $2`,
      [servico_id, barbearia.id]
    );
    if (s.rows[0]) { duracao = s.rows[0].duracao_minutos; preco = parseFloat(s.rows[0].preco); }
  }

  // conflito
  const conflito = await query(
    `SELECT 1 FROM agendamentos
      WHERE barbearia_id = $1 AND profissional_id = $2 AND status <> 'cancelado' AND data_hora = $3`,
    [barbearia.id, profissional_id, data_hora]
  );
  if (conflito.rowCount > 0) {
    return res.status(409).json({ erro: 'Horario indisponivel, escolha outro' });
  }

  const ag = await query(
    `INSERT INTO agendamentos
       (barbearia_id, cliente_id, profissional_id, servico_id, data_hora, duracao_minutos, preco, is_especial, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'agendado') RETURNING *`,
    [barbearia.id, cliente.id, profissional_id, servico_id || null, data_hora, duracao, preco.toFixed(2), !!is_especial]
  );

  // dispara confirmacao WhatsApp (assincrono)
  const det = await query(
    `SELECT p.nome AS profissional_nome, s.nome AS servico_nome
       FROM profissionais p
       LEFT JOIN servicos s ON s.id = $1
      WHERE p.id = $2`,
    [servico_id || null, profissional_id]
  );
  const msg = textoConfirmacao({
    clienteNome: nome,
    barbeariaNome: barbearia.nome,
    servicoNome: det.rows[0]?.servico_nome || 'Atendimento',
    profissionalNome: det.rows[0]?.profissional_nome || '',
    dataHora: data_hora,
  });
  enviarMensagem(barbearia.id, {
    telefone, mensagem: msg, tipo: 'confirmacao', agendamentoId: ag.rows[0].id,
  }).catch((e) => console.error('WhatsApp falhou:', e.message));

  // notifica o barbeiro responsavel sobre o novo agendamento (assincrono)
  notificarBarbeiroNovoAgendamento(barbearia.id, ag.rows[0].id)
    .catch((e) => console.error('Notificacao barbeiro falhou:', e.message));

  res.status(201).json({ ok: true, agendamento: ag.rows[0] });
});

export default router;
