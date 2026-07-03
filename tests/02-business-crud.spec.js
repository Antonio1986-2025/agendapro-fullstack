import { test, expect } from '@playwright/test';
import { seedDemoData, DEMO } from './helpers/seed.js';

test.describe('CRUD de Negocio (Servicos, Profissionais, Clientes)', () => {
  let token;

  test.beforeAll(async ({ request }) => {
    const result = await seedDemoData(request);
    token = result.token;
  });

  const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });

  test.describe('Servicos', () => {
    let servicoId;

    test('GET /api/servicos lista servicos', async ({ request }) => {
      const res = await request.get('/api/servicos', auth());
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
      expect(data.length).toBeGreaterThanOrEqual(5);
    });

    test('POST /api/servicos cria novo servico', async ({ request }) => {
      const res = await request.post('/api/servicos', {
        headers: { Authorization: `Bearer ${token}` },
        data: { nome: 'Teste Playwright', preco: 99.90, duracao: 45, categoria: 'Teste' },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      servicoId = data.id;
      expect(data.nome).toBe('Teste Playwright');
    });

    test('PUT /api/servicos/:id atualiza servico', async ({ request }) => {
      const res = await request.put(`/api/servicos/${servicoId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { preco: 129.90 },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(parseFloat(data.preco)).toBe(129.90);
    });

    test('DELETE /api/servicos/:id deleta servico', async ({ request }) => {
      const res = await request.delete(`/api/servicos/${servicoId}`, auth());
      expect(res.status()).toBe(204);
    });
  });

  test.describe('Profissionais', () => {
    let profissionalId;

    test('GET /api/profissionais lista profissionais', async ({ request }) => {
      const res = await request.get('/api/profissionais', auth());
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
      expect(data.length).toBeGreaterThanOrEqual(3);
    });

    test('POST /api/profissionais cria profissional', async ({ request }) => {
      const res = await request.post('/api/profissionais', {
        headers: { Authorization: `Bearer ${token}` },
        data: { nome: 'Prof Teste', especialidade: 'Testador' },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      profissionalId = data.id;
      expect(data.nome).toBe('Prof Teste');
    });

    test('PUT /api/profissionais/:id atualiza', async ({ request }) => {
      const res = await request.put(`/api/profissionais/${profissionalId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { especialidade: 'Testador Senior' },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.especialidade).toBe('Testador Senior');
    });

    test('DELETE /api/profissionais/:id deleta', async ({ request }) => {
      const res = await request.delete(`/api/profissionais/${profissionalId}`, auth());
      expect(res.status()).toBe(204);
    });
  });

  test.describe('Clientes', () => {
    let clienteId;

    test('GET /api/clientes lista clientes', async ({ request }) => {
      const res = await request.get('/api/clientes', auth());
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
      expect(data.length).toBeGreaterThanOrEqual(5);
    });

    test('GET /api/clientes?busca= filtra', async ({ request }) => {
      const res = await request.get('/api/clientes?busca=joao', auth());
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.some(c => c.nome.toLowerCase().includes('joao'))).toBeTruthy();
    });

    test('POST /api/clientes cria cliente', async ({ request }) => {
      const res = await request.post('/api/clientes', {
        headers: { Authorization: `Bearer ${token}` },
        data: { nome: 'Cliente Teste PW', telefone: '67988887777' },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      clienteId = data.id;
      expect(data.nome).toBe('Cliente Teste PW');
    });

    test('POST /api/clientes duplicado retorna 409', async ({ request }) => {
      const res = await request.post('/api/clientes', {
        headers: { Authorization: `Bearer ${token}` },
        data: { nome: 'Cliente Teste PW', telefone: '67988887777' },
      });
      expect(res.status()).toBe(409);
    });

    test('PUT /api/clientes/:id atualiza', async ({ request }) => {
      const res = await request.put(`/api/clientes/${clienteId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { email: 'pw@teste.com' },
      });
      expect(res.ok()).toBeTruthy();
    });

    test('DELETE /api/clientes/:id deleta', async ({ request }) => {
      const res = await request.delete(`/api/clientes/${clienteId}`, auth());
      expect(res.status()).toBe(204);
    });
  });

  test.describe('E2E - Pagina de Clientes', () => {
    test('Pagina de clientes carrega e mostra lista', async ({ page }) => {
      await page.goto('/login.html');
      await page.fill('#login-email', DEMO.email);
      await page.fill('#login-senha', DEMO.senha);
      await page.click('#btn-login');
      await page.waitForURL(/dashboard-mobile\.html|onboarding\.html/);
      await page.goto('/clientes-mobile.html');
      await page.waitForTimeout(2000);
      await expect(page.locator('#lista')).toBeVisible();
    });
  });
});
