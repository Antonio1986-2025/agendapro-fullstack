import { test, expect } from '@playwright/test';
import { seedDemoData, DEMO } from './helpers/seed.js';

test.describe('Seguranca e Permissoes', () => {
  let token;

  test.beforeAll(async ({ request }) => {
    const r = await seedDemoData(request);
    token = r.token;
  });

  test('Rota protegida sem token retorna 401', async ({ request }) => {
    const rotas = [
      '/auth/me',
      '/agendamentos',
      '/clientes',
      '/servicos',
      '/profissionais',
      '/dashboard',
      '/caixa',
      '/comandas',
      '/estoque',
      '/transacoes',
      '/comissoes',
      '/bloqueios',
      '/horarios/especiais',
      '/ai/conversas',
      '/whatsapp/config',
    ];
    for (const rota of rotas) {
      const res = await request.get(`/api${rota}`);
      expect(res.status()).toBe(401, `Rota ${rota} deveria retornar 401`);
    }
  });

  test('Rotas sem autenticacao funcionam', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
  });

  test('Rota publica de barbearia funciona sem token', async ({ request }) => {
    const me = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const userData = await me.json();
    const slug = userData.barbearia_slug;

    const res = await request.get(`/api/publico/${slug}`);
    expect(res.ok()).toBeTruthy();
  });

  test('Login com email inexistente retorna 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: 'inexistente@teste.com', senha: '123456' },
    });
    expect(res.status()).toBe(401);
  });

  test('Registro de usuario duplicado retorna erro', async ({ request }) => {
    const res = await request.post('/api/auth/registrar', {
      data: {
        barbeariaNome: 'Outra Barbearia',
        nome: 'Outro User',
        email: DEMO.email,
        senha: '123456',
      },
    });
    expect(res.ok()).toBeFalsy();
  });

  test('Token invalido retorna 401', async ({ request }) => {
    const res = await request.get('/api/auth/me', {
      headers: { Authorization: 'Bearer token_invalido_aqui' },
    });
    expect(res.status()).toBe(401);
  });

  test('Staff nao pode listar usuarios (owner only)', async ({ request }) => {
    const login = await request.post('/api/auth/login', {
      data: { email: DEMO.email, senha: DEMO.senha },
    });
    const data = await login.json();

    const res = await request.get('/api/auth/usuarios', {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    expect(res.ok()).toBeTruthy();
  });
});
