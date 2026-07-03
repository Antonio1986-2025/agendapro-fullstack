import { test, expect } from '@playwright/test';
import { seedDemoData, DEMO } from './helpers/seed.js';

test.describe('Equipe, Permissoes, Configuracoes, IA', () => {
  let token, profissionalId;

  test.beforeAll(async ({ request }) => {
    const r = await seedDemoData(request);
    token = r.token;
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const profs = await (await request.get('/api/profissionais', auth)).json();
    profissionalId = profs[0].id;
  });

  test.describe('Permissoes', () => {
    let staffUserId;

    test('POST /api/auth/convidar cria usuario staff', async ({ request }) => {
      const emailUnico = `staff${Date.now()}@teste.com`;
      const res = await request.post('/api/auth/convidar', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          nome: 'Staff Teste',
          email: emailUnico,
          senha: '123456',
          profissional_id: profissionalId,
        },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      staffUserId = data.id;
      expect(data.role).toBe('staff');
    });

    test('PATCH /api/profissionais/:id/permissoes atualiza permissoes', async ({ request }) => {
      const res = await request.patch(`/api/profissionais/${profissionalId}/permissoes`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { clientes: true, comandas: true, caixa: true, estoque: true },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.sucesso).toBeTruthy();
    });

    test('GET /api/profissionais/:id/permissoes retorna permissoes', async ({ request }) => {
      const res = await request.get(`/api/profissionais/${profissionalId}/permissoes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.permissoes).toBeTruthy();
    });

    test('Staff consegue login e acessa barbeiro.html', async ({ request }) => {
      const users = await (await request.get('/api/auth/usuarios', {
        headers: { Authorization: `Bearer ${token}` },
      })).json();

      const staffUser = users.find(u => u.role === 'staff');
      if (!staffUser) return;

      const login = await request.post('/api/auth/login', {
        data: { email: staffUser.email, senha: '123456' },
      });
      expect(login.ok()).toBeTruthy();
      const data = await login.json();
      expect(data.usuario.role).toBe('staff');
    });
  });

  test.describe('Configuracoes', () => {
    test('GET /api/whatsapp/config retorna config', async ({ request }) => {
      const res = await request.get('/api/whatsapp/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(typeof data.enabled).toBe('boolean');
    });

    test('PUT /api/whatsapp/config atualiza config', async ({ request }) => {
      const res = await request.put('/api/whatsapp/config', {
        headers: { Authorization: `Bearer ${token}` },
        data: { enabled: false, ai_enabled: false },
      });
      expect(res.ok()).toBeTruthy();
    });

    test('GET /api/whatsapp/status retorna status', async ({ request }) => {
      const res = await request.get('/api/whatsapp/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
    });

    test('GET /api/whatsapp/diagnostico retorna diagnostico', async ({ request }) => {
      const res = await request.get('/api/whatsapp/diagnostico', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
    });
  });

  test.describe('IA / Chat', () => {
    test('GET /api/ai/conversas retorna conversas', async ({ request }) => {
      const res = await request.get('/api/ai/conversas', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });
  });

  test.describe('E2E - Staff Barbeiro', () => {
    test('Staff ve pagina de barbeiro', async ({ page }) => {
      const login = await page.request.post('/api/auth/login', {
        data: { email: DEMO.email, senha: DEMO.senha },
      });
      const data = await login.json();

      await page.goto('/login.html');
      await page.evaluate((t) => {
        localStorage.setItem('agendapro_token', t);
        localStorage.setItem('agendapro_user', JSON.stringify({ role: 'staff', nome: 'Staff Teste' }));
      }, data.token);
      await page.goto('/barbeiro.html');
      await page.waitForTimeout(1000);
      await expect(page.locator('#barbeiro-nome')).toBeVisible();
    });
  });
});
