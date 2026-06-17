/**
 * AgendaPro - Cliente de API compartilhado
 * Gerencia token JWT, chamadas HTTP e protecao de paginas.
 */
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
