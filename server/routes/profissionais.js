import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { autenticar, exigirRole } from '../middleware/auth.js';

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

// POST /api/profissionais (agora aceita comissao, permissoes e criar usuario)
router.post('/', exigirRole('owner'), async (req, res) => {
  const { nome, especialidade, telefone, notificar_whatsapp, ordem, eh_responsavel,
          comissao_servico_percentual, comissao_produto_percentual, data_contratacao, permissoes,
          criar_acesso, email, senha } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatorio' });
  const inicial = nome.trim().charAt(0).toUpperCase();

  const perm = permissoes || { clientes: true, comandas: true, gerenciar_agenda: false, relatorios: false };

  const { rows } = await query(
    `INSERT INTO profissionais (barbearia_id, nome, especialidade, telefone, notificar_whatsapp, avatar_inicial, ordem,
                                eh_responsavel, comissao_servico_percentual, comissao_produto_percentual, data_contratacao, permissoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING *`,
    [req.barbeariaId, nome, especialidade || null, telefone || null,
     notificar_whatsapp !== false, inicial, ordem || 0, eh_responsavel === true,
     comissao_servico_percentual || 0, comissao_produto_percentual || 0,
     data_contratacao || null, JSON.stringify(perm)]
  );
  const profissional = rows[0];

  // Se marcou "criar acesso", cria o usuario barbeiro vinculado
  if (criar_acesso && email && senha) {
    const emailExiste = await query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
    if (emailExiste.rowCount > 0) {
      return res.status(409).json({ erro: 'Este email ja esta em uso', profissional });
    }
    const senhaHash = bcrypt.hashSync(senha, 10);
    await query(
      `INSERT INTO usuarios (barbearia_id, nome, email, senha_hash, role, profissional_id)
       VALUES ($1,$2,$3,$4,'staff',$5)`,
      [req.barbeariaId, nome, email, senhaHash, profissional.id]
    );
  }

  res.status(201).json(profissional);
});

// PUT /api/profissionais/:id
router.put('/:id', async (req, res) => {
  const { nome, especialidade, telefone, notificar_whatsapp, ativo, ordem, eh_responsavel,
          comissao_servico_percentual, comissao_produto_percentual, data_contratacao, permissoes } = req.body;

  let sql = `UPDATE profissionais SET `;
  const sets = []; const params = []; let i = 0;
  const fields = [
    ['nome', nome], ['especialidade', especialidade], ['telefone', telefone],
    ['notificar_whatsapp', notificar_whatsapp], ['ativo', ativo], ['ordem', ordem],
    ['eh_responsavel', eh_responsavel],
    ['comissao_servico_percentual', comissao_servico_percentual],
    ['comissao_produto_percentual', comissao_produto_percentual],
    ['data_contratacao', data_contratacao],
  ];
  fields.forEach(([col, val]) => {
    if (val !== undefined) { i++; sets.push(`${col} = $${i}`); params.push(val); }
  });
  if (permissoes) { i++; sets.push(`permissoes = $${i}::jsonb`); params.push(JSON.stringify(permissoes)); }
  if (nome) { i++; sets.push(`avatar_inicial = $${i}`); params.push(nome.trim().charAt(0).toUpperCase()); }

  if (!sets.length) return res.status(400).json({ erro: 'Nenhum campo enviado' });

  i++; params.push(req.params.id);
  i++; params.push(req.barbeariaId);
  sql += sets.join(', ') + ` WHERE id = $${i-1} AND barbearia_id = $${i} RETURNING *`;

  const { rows } = await query(sql, params);
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