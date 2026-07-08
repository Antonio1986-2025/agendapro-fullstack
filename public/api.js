/**
 * AgendaPro - Cliente de API compartilhado
 * Gerencia token JWT, chamadas HTTP e protecao de paginas.
 */

// ─────────────────────────────────────────────────────────────────────
// HELPERS DE DATA/HORA (Wall Clock — sem conversão de fuso horário)
// ─────────────────────────────────────────────────────────────────────
// data_hora vem do backend como string ISO sem TZ ("2026-06-23T15:00:00")
// Esses helpers extraem HH:MM literal da string, sem conversão de fuso.
// Crítico para clientes em fusos diferentes do servidor (ex: MS UTC-4).

window.formatarHora = function(dataHora) {
  if (!dataHora) return '';
  const m = String(dataHora).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
};

window.formatarData = function(dataHora) {
  if (!dataHora) return '';
  const m = String(dataHora).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, ano, mes, dia] = m;
  return `${dia}/${mes}/${ano}`;
};

window.formatarDataHora = function(dataHora) {
  if (!dataHora) return '';
  const data = window.formatarData(dataHora);
  const hora = window.formatarHora(dataHora);
  return data && hora ? `${data} ${hora}` : (data || hora);
};

const API = (() => {
  const TOKEN_KEY = 'agendapro_token';
  const USER_KEY = 'agendapro_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function setSession(token, usuario) {
    localStorage.setItem(TOKEN_KEY, token);
    if (usuario) localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  }
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = 'login.html';
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      logout();
      throw new Error('Sessao expirada');
    }

    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.erro || `Erro ${res.status}`);
    }
    return data;
  }

  // Protege uma pagina: redireciona para login se nao autenticado
  function exigirLogin() {
    if (!getToken()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  return {
    getToken, setSession, getUser, logout, exigirLogin,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del: (p) => request('DELETE', p),
    // helpers de dominio
    auth: {
      login: (email, senha) => request('POST', '/auth/login', { email, senha }),
      registrar: (dados) => request('POST', '/auth/registrar', dados),
      me: () => request('GET', '/auth/me'),
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────
// INICIALIZAÇÃO COMPARTILHADA (chamado ao final de cada página)
// ─────────────────────────────────────────────────────────────────────
window.initMobilePage = function() {
  // Animação de entrada da página
  const app = document.querySelector('.mobile-app');
  if (app) {
    app.classList.add('page-enter');
    // Remove a classe após a animação para não conflitar com interações
    setTimeout(() => app.classList.remove('page-enter'), 300);
  }

  // Toggle de tema com ícone consistente
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  // Ajusta o ícone do tema em todos os botões
  const moonIcons = document.querySelectorAll('.theme-toggle i, #theme-icon, #theme-icon-desk');
  if (moonIcons.length) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    moonIcons.forEach(el => {
      el.className = 'fas ' + (isDark ? 'fa-sun' : 'fa-moon');
    });
  }
};
