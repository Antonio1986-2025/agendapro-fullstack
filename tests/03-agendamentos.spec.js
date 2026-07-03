import { test, expect } from '@playwright/test';
import { seedDemoData } from './helpers/seed.js';

test.describe('Agendamentos', () => {
  let token, barbeariaSlug, profissionalId, servicoId, clienteId, agendamentoId;

  test.beforeAll(async ({ request }) => {
    const r = await seedDemoData(request);
    token = r.token;
    const auth = { headers: { Authorization: `Bearer ${token}` } };

    const profs = await (await request.get('/api/profissionais', auth)).json();
    profissionalId = profs[0].id;

    const servs = await (await request.get('/api/servicos', auth)).json();
    servicoId = servs[0].id;

    const clis = await (await request.get('/api/clientes', auth)).json();
    clienteId = clis[0].id;

    const me = await (await request.get('/api/auth/me', auth)).json();
    barbeariaSlug = me.barbearia_slug;
  });

  test('GET /api/agendamentos lista (vazio ou com dados)', async ({ request }) => {
    const res = await request.get('/api/agendamentos', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('POST /api/agendamentos cria agendamento', async ({ request }) => {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const dataHora = `${amanha.toISOString().split('T')[0]}T10:00:00`;

    const res = await request.post('/api/agendamentos', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        cliente_id: clienteId,
        profissional_id: profissionalId,
        servico_id: servicoId,
        data_hora: dataHora,
        observacoes: 'Teste Playwright',
      },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    agendamentoId = data.id;
    expect(data.status).toBe('agendado');
  });

  test('PATCH /api/agendamentos/:id/status confirma', async ({ request }) => {
    const res = await request.patch(`/api/agendamentos/${agendamentoId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'confirmado' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('confirmado');
  });

  test('PATCH /api/agendamentos/:id/status conclui', async ({ request }) => {
    const res = await request.patch(`/api/agendamentos/${agendamentoId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'concluido' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('concluido');
  });

  test('DELETE /api/agendamentos/:id deleta', async ({ request }) => {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 2);
    const dataHora = `${amanha.toISOString().split('T')[0]}T14:00:00`;

    const criado = await request.post('/api/agendamentos', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        cliente_id: clienteId,
        profissional_id: profissionalId,
        servico_id: servicoId,
        data_hora: dataHora,
      },
    });
    const { id } = await criado.json();

    const res = await request.delete(`/api/agendamentos/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(204);
  });

  test.describe('Rotas Publicas de Agendamento', () => {
    test('GET /api/publico/:slug retorna dados da barbearia', async ({ request }) => {
      const res = await request.get(`/api/publico/${barbeariaSlug}`);
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.barbearia).toBeTruthy();
      expect(data.profissionais.length).toBeGreaterThanOrEqual(1);
      expect(data.servicos.length).toBeGreaterThanOrEqual(1);
    });

    test('GET /api/publico/:slug/horarios retorna disponibilidade', async ({ request }) => {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      const data = amanha.toISOString().split('T')[0];

      const res = await request.get(`/api/publico/${barbeariaSlug}/horarios?data=${data}`);
      expect(res.ok()).toBeTruthy();
      const result = await res.json();
      expect(Array.isArray(result.ocupados)).toBeTruthy();
    });

    test('POST /api/publico/:slug/agendar cria agendamento publico', async ({ request }) => {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 3);
      if (amanha.getDay() === 0) amanha.setDate(amanha.getDate() + 1);
      if (amanha.getDay() === 6) amanha.setDate(amanha.getDate() + 2);
      let dataHora = `${amanha.toISOString().split('T')[0]}T09:00:00`;

      let res = await request.post(`/api/publico/${barbeariaSlug}/agendar`, {
        data: {
          nome: 'Cliente Publico PW',
          telefone: '67912345678',
          profissional_id: profissionalId,
          servico_id: servicoId,
          data_hora: dataHora,
        },
      });

      if (!res.ok()) {
        dataHora = `${amanha.toISOString().split('T')[0]}T14:00:00`;
        res = await request.post(`/api/publico/${barbeariaSlug}/agendar`, {
          data: {
            nome: 'Cliente Publico PW',
            telefone: '67912345678',
            profissional_id: profissionalId,
            servico_id: servicoId,
            data_hora: dataHora,
          },
        });
      }

      expect(res.ok()).toBeTruthy();
      const result = await res.json();
      expect(result.ok).toBeTruthy();
      expect(result.agendamento).toBeTruthy();
    });
  });

  test.describe('E2E - Pagina de Agendamento Publico', () => {
    test('Pagina de agendamento carrega com slug valido', async ({ page }) => {
      await page.goto(`/agendar.html?b=${barbeariaSlug}`);
      await page.waitForTimeout(2000);
      await expect(page.locator('#barbearia-nome')).not.toContainText('Carregando...');
      await expect(page.locator('#lista-servicos')).toBeVisible();
    });
  });
});
