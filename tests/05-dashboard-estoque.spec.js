import { test, expect } from '@playwright/test';
import { seedDemoData, DEMO } from './helpers/seed.js';

test.describe('Dashboard, Estoque, Bloqueios, Horarios', () => {
  let token, profissionalId, itemId;

  test.beforeAll(async ({ request }) => {
    const r = await seedDemoData(request);
    token = r.token;
    const auth = { headers: { Authorization: `Bearer ${token}` } };

    const profs = await (await request.get('/api/profissionais', auth)).json();
    profissionalId = profs[0].id;
  });

  test.describe('Dashboard', () => {
    test('GET /api/dashboard retorna metricas', async ({ request }) => {
      const res = await request.get('/api/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(typeof data.hoje.agendamentos).toBe('number');
      expect(typeof data.hoje.faturamento).toBe('number');
      expect(typeof data.mes.agendamentos).toBe('number');
      expect(typeof data.clientes_ativos).toBe('number');
      expect(typeof data.profissionais).toBe('number');
      expect(Array.isArray(data.proximos)).toBeTruthy();
    });

    test('GET /api/dashboard/relatorios retorna relatorios', async ({ request }) => {
      const res = await request.get('/api/dashboard/relatorios?dias=30', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok()) return;
      const data = await res.json();
      expect(typeof data.faturamento).toBe('number');
      expect(typeof data.agendamentos).toBe('number');
    });
  });

  test.describe('Estoque', () => {
    test('POST /api/estoque cria item', async ({ request }) => {
      const res = await request.post('/api/estoque', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          nome: 'Shampoo Premium',
          unidade: 'un',
          quantidade: 10,
          minimo: 2,
          custo: 15.00,
          preco_venda: 45.00,
        },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      itemId = data.id;
      expect(data.nome).toBe('Shampoo Premium');
    });

    test('GET /api/estoque lista itens', async ({ request }) => {
      const res = await request.get('/api/estoque', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
      expect(data.length).toBeGreaterThanOrEqual(1);
    });

    test('GET /api/estoque?baixo=true filtra estoque baixo', async ({ request }) => {
      const res = await request.get('/api/estoque?baixo=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });

    test('GET /api/estoque/:id retorna detalhes', async ({ request }) => {
      const res = await request.get(`/api/estoque/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.id).toBe(itemId);
      expect(Array.isArray(data.movimentos)).toBeTruthy();
    });

    test('POST /api/estoque/:id/movimento registra entrada', async ({ request }) => {
      const res = await request.post(`/api/estoque/${itemId}/movimento`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { tipo: 'entrada', quantidade: 5, motivo: 'Reposicao' },
      });
      expect(res.ok()).toBeTruthy();
    });

    test('POST /api/estoque/:id/movimento registra saida', async ({ request }) => {
      const res = await request.post(`/api/estoque/${itemId}/movimento`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { tipo: 'saida', quantidade: 2, motivo: 'Venda' },
      });
      expect(res.ok()).toBeTruthy();
    });

    test('PATCH /api/estoque/:id atualiza item', async ({ request }) => {
      const res = await request.patch(`/api/estoque/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { preco_venda: 49.90 },
      });
      expect(res.ok()).toBeTruthy();
    });

    test('DELETE /api/estoque/:id desativa item', async ({ request }) => {
      const res = await request.delete(`/api/estoque/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(204);
    });
  });

  test.describe('Bloqueios', () => {
    let bloqueioId;

    test('POST /api/bloqueios cria bloqueio', async ({ request }) => {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      const dataHora = `${amanha.toISOString().split('T')[0]}T12:00:00`;

      const res = await request.post('/api/bloqueios', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          profissional_id: profissionalId,
          data_hora: dataHora,
          duracao_minutos: 60,
          motivo: 'Almoco',
        },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      bloqueioId = data.id;
    });

    test('GET /api/bloqueios lista bloqueios', async ({ request }) => {
      const res = await request.get('/api/bloqueios', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(Array.isArray(data)).toBeTruthy();
    });

    test('DELETE /api/bloqueios/:id deleta bloqueio', async ({ request }) => {
      const res = await request.delete(`/api/bloqueios/${bloqueioId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(204);
    });
  });

  test.describe('Horarios', () => {
    test('PUT /api/horarios/config atualiza config', async ({ request }) => {
      const res = await request.put('/api/horarios/config', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          horario_config: {
            manha: { inicio: '08:00', fim: '12:00' },
            tarde: { inicio: '13:00', fim: '20:00' },
            intervalo_minutos: 30,
          },
        },
      });
      expect(res.ok()).toBeTruthy();
    });
  });

  test.describe('E2E - Dashboard', () => {
    test('Dashboard carrega metricas', async ({ page }) => {
      await page.goto('/login.html');
      await page.fill('#login-email', DEMO.email);
      await page.fill('#login-senha', DEMO.senha);
      await page.click('#btn-login');
      await page.waitForURL(/dashboard-mobile\.html/);
      await page.waitForTimeout(2000);
      await expect(page.locator('#m-hoje')).toBeVisible();
      await expect(page.locator('#m-fat-hoje')).toBeVisible();
      await expect(page.locator('#m-mes')).toBeVisible();
      await expect(page.locator('#m-clientes')).toBeVisible();
      await expect(page.locator('#lista-proximos')).toBeVisible();
    });

    test('Sidebar do dashboard tem navegacao', async ({ page }) => {
      await page.goto('/login.html');
      await page.fill('#login-email', DEMO.email);
      await page.fill('#login-senha', DEMO.senha);
      await page.click('#btn-login');
      await page.waitForURL(/dashboard-mobile\.html/);
      await page.waitForTimeout(1000);
      await page.goto('/clientes-mobile.html');
      await page.waitForTimeout(1000);
      await expect(page.locator('#lista')).toBeVisible();
    });
  });
});
