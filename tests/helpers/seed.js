const DEMO = {
  email: 'demo@agendapro.com',
  senha: '123456',
  barbearia: 'Barbearia Teste Demo',
  nome: 'Admin Demo',
  telefone: '(67) 99999-0001',
};

const servicosDemo = [
  { nome: 'Corte Masculino', preco: 35.00, duracao: 30, categoria: 'Corte' },
  { nome: 'Barba', preco: 20.00, duracao: 20, categoria: 'Barba' },
  { nome: 'Corte + Barba', preco: 50.00, duracao: 50, categoria: 'Combo' },
  { nome: 'Hidratacao Capilar', preco: 45.00, duracao: 40, categoria: 'Tratamento' },
  { nome: 'Sobrancelha', preco: 15.00, duracao: 15, categoria: 'Estetica' },
];

const profissionaisDemo = [
  { nome: 'Carlos Silva', especialidade: 'Barbeiro Senior' },
  { nome: 'Pedro Santos', especialidade: 'Barbeiro' },
  { nome: 'Lucas Oliveira', especialidade: 'Cabelereiro' },
];

const clientesDemo = [
  { nome: 'Joao Souza', telefone: '67911110001' },
  { nome: 'Maria Santos', telefone: '67911110002' },
  { nome: 'Jose Lima', telefone: '67911110003' },
  { nome: 'Ana Costa', telefone: '67911110004' },
  { nome: 'Pedro Alves', telefone: '67911110005' },
];

async function seedDemoData(request) {
  const res = await request.post('/api/auth/login', {
    data: { email: DEMO.email, senha: DEMO.senha },
  });

  let token;
  if (res.ok()) {
    const data = await res.json();
    token = data.token;
  } else {
    const reg = await request.post('/api/auth/registrar', {
      data: {
        barbeariaNome: DEMO.barbearia,
        nome: DEMO.nome,
        email: DEMO.email,
        senha: DEMO.senha,
        telefone: DEMO.telefone,
      },
    });
    if (!reg.ok()) throw new Error(`Falha ao registrar demo: ${await reg.text()}`);
    const data = await reg.json();
    token = data.token;
  }

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  for (const s of servicosDemo) {
    const r = await request.post('/api/servicos', { ...auth, data: s });
    if (!r.ok() && !(await r.text()).includes('ja existe')) {
      const text = await r.text();
      console.warn(`Aviso servico ${s.nome}: ${text}`);
    }
  }

  for (const p of profissionaisDemo) {
    const r = await request.post('/api/profissionais', { ...auth, data: p });
    if (!r.ok()) {
      const text = await r.text();
      console.warn(`Aviso profissional ${p.nome}: ${text}`);
    }
  }

  for (const c of clientesDemo) {
    const r = await request.post('/api/clientes', { ...auth, data: c });
    if (!r.ok()) {
      const text = await r.text();
      console.warn(`Aviso cliente ${c.nome}: ${text}`);
    }
  }

  return { token, user: { email: DEMO.email, senha: DEMO.senha, nome: DEMO.nome } };
}

export { seedDemoData, DEMO };
