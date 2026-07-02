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

  const perm = permissoes || {
    clientes: true, comandas: true, gerenciar_agenda: false, relatorios: false,
    caixa: false, estoque: false, servicos: false, horarios: false,
    configuracoes: false, cancelar_agendamento: false,
  };

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
router.put('/:id', exigirRole('owner', 'admin'), async (req, res) => {
  const { nome, especialidade, telefone, notificar_whatsapp, ativo, ordem, eh_responsavel,
          comissao_servico_percentual, comissao_produto_percentual, data_contratacao, permissoes,
          criar_acesso, email, senha } = req.body;

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

  const profissional = rows[0];

  // ─── Gerenciar acesso ao sistema (criar/atualizar usuario) ───
  if (criar_acesso === true) {
    if (!email || !senha) {
      return res.status(400).json({ erro: 'Email e senha obrigatorios para criar acesso' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: 'Senha deve ter ao menos 6 caracteres' });
    }

    // Verifica se ja existe usuario vinculado a este profissional
    const { rows: userExistente } = await query(
      `SELECT id, email FROM usuarios WHERE profissional_id = $1 AND barbearia_id = $2 LIMIT 1`,
      [profissional.id, req.barbeariaId]
    );

    if (userExistente[0]) {
      // Verifica se o novo email ja esta em uso por OUTRO usuario
      const { rows: emailConflito } = await query(
        `SELECT id FROM usuarios WHERE email = $1 AND id != $2 LIMIT 1`,
        [email, userExistente[0].id]
      );
      if (emailConflito[0]) {
        return res.status(409).json({ erro: 'Este email ja esta em uso por outro usuario' });
      }
      const senhaHash = bcrypt.hashSync(senha, 10);
      await query(
        `UPDATE usuarios SET nome = $1, email = $2, senha_hash = $3 WHERE id = $4`,
        [profissional.nome, email, senhaHash, userExistente[0].id]
      );
    } else {
      // Verifica se o email ja esta em uso
      const { rows: emailConflito } = await query(
        `SELECT id FROM usuarios WHERE email = $1 LIMIT 1`,
        [email]
      );
      if (emailConflito[0]) {
        return res.status(409).json({ erro: 'Este email ja esta em uso' });
      }
      const senhaHash = bcrypt.hashSync(senha, 10);
      await query(
        `INSERT INTO usuarios (barbearia_id, nome, email, senha_hash, role, profissional_id)
         VALUES ($1, $2, $3, $4, 'staff', $5)`,
        [req.barbeariaId, profissional.nome, email, senhaHash, profissional.id]
      );
    }
  }

  res.json(profissional);
});

// DELETE /api/profissionais/:id
router.delete('/:id', exigirRole('owner'), async (req, res) => {
  const r = await query(
    `DELETE FROM profissionais WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  if (r.rowCount === 0) return res.status(404).json({ erro: 'Profissional nao encontrado' });
  res.status(204).end();
});

export default router;

// PATCH /api/profissionais/:id/permissoes - Endpoint dedicado para atualizar permissões
const TODAS_PERMISSOES = ['clientes', 'comandas', 'gerenciar_agenda', 'relatorios',
  'caixa', 'estoque', 'servicos', 'horarios', 'configuracoes', 'cancelar_agendamento'];

router.patch('/:id/permissoes', exigirRole('owner', 'admin'), async (req, res) => {
  // Busca permissões atuais
  const { rows: atual } = await query(
    `SELECT permissoes FROM profissionais WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  
  if (atual.length === 0) {
    return res.status(404).json({ erro: 'Profissional não encontrado' });
  }

  const temAlguma = TODAS_PERMISSOES.some(p => req.body[p] !== undefined);
  if (!temAlguma) {
    return res.status(400).json({
      erro: 'Envie pelo menos uma permissão',
      permissoes_disponiveis: TODAS_PERMISSOES,
    });
  }
  
  const permissoesAtuais = atual[0].permissoes || {};
  const novasPermissoes = {};
  TODAS_PERMISSOES.forEach(p => {
    novasPermissoes[p] = req.body[p] !== undefined ? req.body[p] : permissoesAtuais[p];
  });
  
  const { rows } = await query(
    `UPDATE profissionais SET permissoes = $1::jsonb
      WHERE id = $2 AND barbearia_id = $3 RETURNING *`,
    [JSON.stringify(novasPermissoes), req.params.id, req.barbeariaId]
  );
  
  res.json({
    sucesso: true,
    profissional: rows[0].nome,
    permissoes_anteriores: permissoesAtuais,
    permissoes_novas: novasPermissoes,
  });
});

// GET /api/profissionais/:id/permissoes - Ver permissões de um profissional
router.get('/:id/permissoes', exigirRole('owner', 'admin'), async (req, res) => {
  const { rows } = await query(
    `SELECT id, nome, permissoes FROM profissionais 
      WHERE id = $1 AND barbearia_id = $2`,
    [req.params.id, req.barbeariaId]
  );
  
  if (rows.length === 0) {
    return res.status(404).json({ erro: 'Profissional não encontrado' });
  }
  
  const permissoes = rows[0].permissoes || {
    clientes: true, comandas: true, gerenciar_agenda: false, relatorios: false,
    caixa: false, estoque: false, servicos: false, horarios: false,
    configuracoes: false, cancelar_agendamento: false,
  };
  
  res.json({
    profissional_id: rows[0].id,
    profissional_nome: rows[0].nome,
    permissoes,
    descricoes: {
      clientes: 'Ver todos os clientes da barbearia',
      comandas: 'Acessar e gerenciar comandas',
      gerenciar_agenda: 'Ver agenda de todos os profissionais (padrão: apenas própria agenda)',
      relatorios: 'Acessar dashboard e relatórios financeiros',
      caixa: 'Acessar e gerenciar caixa',
      estoque: 'Gerenciar estoque',
      servicos: 'Criar/editar serviços',
      horarios: 'Configurar horários',
      configuracoes: 'Configurações da barbearia',
      cancelar_agendamento: 'Pode cancelar agendamentos',
    },
  });
});
