import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';

export function gerarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      barbearia_id: usuario.barbearia_id,
      role: usuario.role,
      nome: usuario.nome,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION }
  );
}

// Middleware: exige token valido e injeta req.user + req.barbeariaId + req.userId + req.role
export function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Token nao fornecido' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    req.userId = payload.sub;
    req.barbeariaId = payload.barbearia_id;
    req.role = payload.role || 'owner';  // fallback para compatibilidade
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token invalido ou expirado' });
  }
}

// Middleware: exige um dos papeis informados
export function exigirRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ erro: 'Sem permissao para esta acao' });
    }
    next();
  };
}
