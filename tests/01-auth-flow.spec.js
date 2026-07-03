import { test, expect } from '@playwright/test';
import { seedDemoData, DEMO } from './helpers/seed.js';

test.describe('Fluxo de Autenticacao', () => {
  let token, userData;

  test.beforeAll(async ({ request }) => {
    const result = await seedDemoData(request);
    token = result.token;
  });

  test('Login com credenciais validas na API', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: DEMO.email, senha: DEMO.senha },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    userData = data.usuario;
    expect(data.token).toBeTruthy();
    expect(data.usuario.email).toBe(DEMO.email);
    expect(data.usuario.role).toBe('owner');
  });

  test('Login com senha errada retorna 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: DEMO.email, senha: 'senha_errada' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/auth/me retorna dados do usuario', async ({ request }) => {
    const res = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.email).toBe(DEMO.email);
    expect(data.barbearia_id).toBeTruthy();
    expect(data.role).toBeTruthy();
  });

  test('Acesso sem token retorna 401', async ({ request }) => {
    const res = await request.get('/api/auth/me');
    expect(res.status()).toBe(401);
  });

  test('Setup-status retorna dados', async ({ request }) => {
    const res = await request.get('/api/auth/setup-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(typeof data.servicos).toBe('number');
    expect(typeof data.profissionais).toBe('number');
    expect(typeof data.clientes).toBe('number');
  });

  test('Listar usuarios (owner)', async ({ request }) => {
    const res = await request.get('/api/auth/usuarios', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  test.describe('E2E - Pagina de Login', () => {
    test('Login E2E com credenciais validas', async ({ page }) => {
      await page.goto('/login.html');
      await page.fill('#login-email', DEMO.email);
      await page.fill('#login-senha', DEMO.senha);
      await page.click('#btn-login');
      await page.waitForTimeout(3000);
      const url = page.url();
      expect(url.includes('dashboard-mobile') || url.includes('onboarding')).toBeTruthy();
    });

    test('Login E2E com credenciais invalidas permanece na pagina', async ({ page }) => {
      await page.goto('/login.html');
      await page.fill('#login-email', DEMO.email);
      await page.fill('#login-senha', 'senha_errada');
      await page.click('#btn-login');
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('login.html');
      await expect(page.locator('#form-login')).toBeVisible();
    });

    test('Mostra formulario de registro ao clicar na tab', async ({ page }) => {
      await page.goto('/login.html');
      await page.click('#tab-registro');
      await expect(page.locator('#form-registro')).toBeVisible();
      await expect(page.locator('#form-login')).not.toBeVisible();
      await expect(page.locator('#reg-nome')).toBeVisible();
      await expect(page.locator('#reg-email')).toBeVisible();
      await expect(page.locator('#reg-senha')).toBeVisible();
    });

    test('Landing page tem link para login', async ({ page }) => {
      await page.goto('/');
      const loginLink = page.locator('a[href="login.html"]').first();
      await expect(loginLink).toBeVisible();
      await expect(loginLink).toContainText('Entrar');
    });
  });
});
