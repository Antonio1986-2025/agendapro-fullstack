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

// Expor API globalmente
window.API = API;

// ─────────────────────────────────────────────────────────────────────
// SISTEMA DE TOASTS
// ─────────────────────────────────────────────────────────────────────
window.showToast = function(message, type = 'success') {
  // Garante que o container existe
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i><span>${message}</span>`;

  container.appendChild(toast);

  // Auto-dismiss após 3.5 segundos
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
};

// ─────────────────────────────────────────────────────────────────────
// SIDEBAR DINÂMICA BASEADA EM PERMISSÕES (para usuários staff)
// ─────────────────────────────────────────────────────────────────────
window.montarSidebarPermissoes = function() {
  const user = API.getUser();
  if (!user || user.role !== 'staff') return;

  const permissoes = user.permissoes || {};
  const temPermissao = (p) => permissoes[p] === true;
  const pagina = window.location.pathname.split('/').pop() || '';

  const sidebar = document.querySelector('.sidebar-nav');
  if (!sidebar) return;

  let html = '<div class="nav-section">Principal</div>';
  html += `<a href="barbeiro.html" class="sidebar-item${pagina === 'barbeiro.html' || !pagina ? ' active' : ''}"><i class="fas fa-calendar-day"></i> Minha Agenda</a>`;
  if (temPermissao('clientes')) html += `<a href="clientes-mobile.html" class="sidebar-item${pagina === 'clientes-mobile.html' ? ' active' : ''}"><i class="fas fa-users"></i> Clientes</a>`;

  if (temPermissao('caixa') || temPermissao('comandas') || temPermissao('servicos') || temPermissao('estoque')) {
    html += '<div class="nav-section">Operação</div>';
    if (temPermissao('caixa')) html += `<a href="financeiro-mobile.html" class="sidebar-item${pagina === 'financeiro-mobile.html' ? ' active' : ''}"><i class="fas fa-cash-register"></i> Caixa</a>`;
    if (temPermissao('comandas')) html += `<a href="comanda-detalhe.html" class="sidebar-item${pagina === 'comanda-detalhe.html' ? ' active' : ''}"><i class="fas fa-receipt"></i> Comandas</a>`;
    if (temPermissao('servicos')) html += `<a href="servicos-mobile.html" class="sidebar-item${pagina === 'servicos-mobile.html' ? ' active' : ''}"><i class="fas fa-cut"></i> Serviços</a>`;
    if (temPermissao('estoque')) html += `<a href="estoque-mobile.html" class="sidebar-item${pagina === 'estoque-mobile.html' ? ' active' : ''}"><i class="fas fa-boxes"></i> Estoque</a>`;
  }

  if (temPermissao('relatorios') || temPermissao('configuracoes')) {
    html += '<div class="nav-section">Outros</div>';
    if (temPermissao('relatorios')) html += `<a href="relatorios-mobile.html" class="sidebar-item${pagina === 'relatorios-mobile.html' ? ' active' : ''}"><i class="fas fa-chart-bar"></i> Relatórios</a>`;
    if (temPermissao('configuracoes')) html += `<a href="configuracoes-mobile.html" class="sidebar-item${pagina === 'configuracoes-mobile.html' ? ' active' : ''}"><i class="fas fa-cog"></i> Configurações</a>`;
  }
  sidebar.innerHTML = html;

  const roleEl = document.getElementById('sidebar-role');
  if (roleEl) roleEl.textContent = 'Barbeiro';
};

// ─────────────────────────────────────────────────────────────────────
// BOTTOM NAVIGATION PADRONIZADO (5 itens fixos)
// ─────────────────────────────────────────────────────────────────────
window.montarBottomNav = function() {
  const pagina = window.location.pathname.split('/').pop() || '';
  const user = API.getUser();
  const isStaff = user?.role === 'staff';

  // Se for staff, redireciona Início para barbeiro.html
  const inicioUrl = isStaff ? 'barbeiro.html' : 'dashboard-mobile.html';
  const inicioAtivo = pagina === 'dashboard-mobile.html' || pagina === 'barbeiro.html' || pagina === '' || pagina === 'index.html';

  const navContainer = document.querySelector('.bottom-nav .nav-items');
  if (!navContainer) return;

  const itens = [
    { href: inicioUrl, icon: 'fa-house', label: 'Início', active: inicioAtivo },
    { href: 'agenda-mobile.html', icon: 'fa-calendar-days', label: 'Agenda', active: pagina === 'agenda-mobile.html' },
    { href: 'clientes-mobile.html', icon: 'fa-users', label: 'Clientes', active: pagina === 'clientes-mobile.html' },
    { href: 'financeiro-mobile.html', icon: 'fa-chart-line', label: 'Financeiro', active: pagina === 'financeiro-mobile.html' || pagina === 'comissoes-mobile.html' || pagina === 'comanda-detalhe.html' },
    { href: 'configuracoes-mobile.html', icon: 'fa-gear', label: 'Config', active: pagina === 'configuracoes-mobile.html' || pagina === 'servicos-mobile.html' || pagina === 'estoque-mobile.html' || pagina === 'equipe.html' || pagina === 'profissionais-mobile.html' || pagina === 'relatorios-mobile.html' },
  ];

  navContainer.innerHTML = itens.map(item =>
    `<a href="${item.href}" class="nav-item${item.active ? ' active' : ''}">
      <i class="fas ${item.icon} nav-icon"></i>
      <span class="nav-label">${item.label}</span>
    </a>`
  ).join('');
};

// ─────────────────────────────────────────────────────────────────────
// INICIALIZAÇÃO COMPARTILHADA (chamado ao final de cada página)
// ─────────────────────────────────────────────────────────────────────
window.initMobilePage = function() {
  // Sidebar dinâmica para barbeiros
  window.montarSidebarPermissoes();

  // Bottom nav padronizado
  window.montarBottomNav();

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
