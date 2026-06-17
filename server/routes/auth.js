import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { gerarToken, autenticar } from '../middleware/auth.js';

const router = Router();

function slugify(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100);
}

// POST /api/auth/registrar  -> cria barbearia + usuario dono
router.post('/registrar', async (req, res) => {
  const { barbeariaNome, nome, email, senha, telefone } = req.body;

  if (!barbeariaNome || !nome || !email || !senha) {
    return res.status(400).json({ erro: 'Campos obrigatorios: barbeariaNome, nome, email, senha' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ erro: 'A senha deve ter ao menos 6 caracteres' });
  }

  const client = (await import('../config/database.js')).default;
  const conn = await client.connect();
  try {
    await conn.query('BEGIN');

    // slug unico
    let slug = slugify(barbeariaNome) || 'barbearia';
    const existe = await conn.query('SELECT 1 FROM barbearias WHERE slug = $1', [slug]);
    if (existe.rowCount > 0) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const barbearia = await conn.query(
      `INSERT INTO barbearias (nome, slug, telefone, email)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [barbeariaNome, slug, telefone || null, email]
    );
    const barbeariaId = barbearia.rows[0].id;

    const emailExiste = await conn.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
    if (emailExiste.rowCount > 0) {
      await conn.query('ROLLBACK');
      return res.status(409).json({ erro: 'Este email ja esta cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await conn.query(
      `INSERT INTO usuarios (barbearia_id, nome, email, senha_hash, role)
       VALUES ($1, $2, $3, $4, 'owner') RETURNING id, barbearia_id, nome, email, role`,
      [barbeariaId, nome, email, senhaHash]
    );

    // config WhatsApp padrao (modo log)
    await conn.query(
      `INSERT INTO whatsapp_config (barbearia_id, provider, enabled) VALUES ($1, 'log', false)`,
      [barbeariaId]
    );

    await conn.query('COMMIT');

    const token = gerarToken(usuario.rows[0]);
    res.status(201).json({
      token,
      usuario: usuario.rows[0],
      barbearia: barbearia.rows[0],
    });
  } catch (err) {
    await conn.query('ROLLBACK');
    console.error('Erro registrar:', err);
    res.status(500).json({ erro: 'Erro ao registrar barbearia' });
  } finally {
    conn.release();
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe email e senha' });
  }

  const { rows } = await query(
    `SELECT u.*, b.nome AS barbearia_nome, b.slug AS barbearia_slug
       FROM usuarios u JOIN barbearias b ON b.id = u.barbearia_id
      WHERE u.email = $1 AND u.ativo = true`,
    [email]
  );

  const usuario = rows[0];
  if (!usuario) return res.status(401).json({ erro: 'Credenciais invalidas' });

  const ok = await bcrypt.compare(senha, usuario.senha_hash);
  if (!ok) return res.status(401).json({ erro: 'Credenciais invalidas' });

  const token = gerarToken(usuario);
  res.json({
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
      barbearia_id: usuario.barbearia_id,
      barbearia_nome: usuario.barbearia_nome,
      barbearia_slug: usuario.barbearia_slug,
    },
  });
});

// GET /api/auth/me  -> dados do usuario logado
router.get('/me', autenticar, async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.nome, u.email, u.role, u.barbearia_id,
            b.nome AS barbearia_nome, b.slug AS barbearia_slug, b.horario_config
       FROM usuarios u JOIN barbearias b ON b.id = u.barbearia_id
      WHERE u.id = $1`,
    [req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Usuario nao encontrado' });
  res.json(rows[0]);
});

export default router;

// GET /api/auth/setup-status  -> quantos itens de setup faltam
router.get('/setup-status', autenticar, async (req, res) => {
  const id = req.barbeariaId;
  const [serv, prof, cli] = await Promise.all([
    query('SELECT COUNT(*) AS t FROM servicos WHERE barbearia_id = $1', [id]),
    query('SELECT COUNT(*) AS t FROM profissionais WHERE barbearia_id = $1 AND ativo = true', [id]),
    query('SELECT COUNT(*) AS t FROM clientes WHERE barbearia_id = $1', [id]),
  ]);
  const servicos = parseInt(serv.rows[0].t);
  const profissionais = parseInt(prof.rows[0].t);
  const clientes = parseInt(cli.rows[0].t);
  res.json({
    servicos, profissionais, clientes,
    pendente: (servicos ? 0 : 1) + (profissionais ? 0 : 1),
    completo: servicos > 0 && profissionais > 0,
  });
});
