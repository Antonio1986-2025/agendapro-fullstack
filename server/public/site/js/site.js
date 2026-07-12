/* ============================================================
   AgendaPro - Site da Barbearia (SPA Engine)
   ============================================================ */

// ─── Config ───
const SLUG = new URLSearchParams(location.search).get('b') || 'barbearia-demo';
let barbeariaData = null;
let selectedServico = null;
let selectedProf = null;
let selectedData = null;
let selectedHorario = null;
let clienteNome = '';
let clienteTelefone = '';

// ─── API ───
const api = {
  base: '/api/publico/' + SLUG,
  async get(path) {
    const r = await fetch(this.base + path);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(this.base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error((await r.json()).erro || 'Erro na requisição');
    return r.json();
  },
  async patch(path) {
    const r = await fetch(this.base + path, { method: 'PATCH' });
    if (!r.ok) throw new Error((await r.json()).erro || 'Erro ao cancelar');
    return r.json();
  }
};

// ─── Router ───
function navigate(hash) {
  history.pushState(null, '', hash || '#home');
  render();
}
window.addEventListener('hashchange', render);
window.addEventListener('popstate', render);

// ─── Render ───
async function render() {
  const hash = location.hash || '#home';
  const app = document.getElementById('app');
  app.className = 'fade-in';

  try {
    if (!barbeariaData) {
      app.innerHTML = loadingHTML();
      barbeariaData = await api.get('');
    }

    switch (hash.split('?')[0]) {
      case '#home': app.innerHTML = homePage(); break;
      case '#servicos': app.innerHTML = servicosPage(); break;
      case '#agendar':
        const step = new URLSearchParams(hash.split('?')[1]).get('step') || '1';
        app.innerHTML = await agendarPage(step);
        break;
      case '#meus-agendamentos': app.innerHTML = agendamentosPage(); break;
      default: app.innerHTML = homePage();
    }
  } catch (err) {
    app.innerHTML = `<div class="container" style="padding:80px 20px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">😕</div>
      <h2>Ops! Algo deu errado</h2>
      <p style="color:var(--text-muted);margin:8px 0 24px">${err.message}</p>
      <button class="btn btn-primary" onclick="location.reload()">Tentar novamente</button>
    </div>`;
  }

  // atualiza nav
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === hash);
  });
  document.getElementById('nav-menu').classList.remove('open');
}

// ─── Helpers ───
function formatData(d) {
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}
function formatDataCurta(d) {
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function formatHora(iso) {
  const m = iso.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : iso;
}
function diaSemana(d) {
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return dias[new Date(d + 'T12:00:00').getDay()];
}
function preco(valor) {
  return 'R$ ' + parseFloat(valor).toFixed(2).replace('.', ',');
}
function getTheme() {
  return localStorage.getItem('agendapro_theme') || 'classic';
}

// ─── Templates ───
function loadingHTML() {
  return `<div class="loading"><div class="spinner"></div><p>Carregando...</p></div>`;
}

function navBar() {
  return `
    <header class="site-header">
      <div class="header-inner">
        <a href="#home" class="header-logo"><span class="emoji">💈</span> ${barbeariaData?.barbearia?.nome || 'Barbearia'}</a>
        <button class="nav-toggle" onclick="document.getElementById('nav-menu').classList.toggle('open')">☰</button>
      </div>
      <nav class="nav-menu" id="nav-menu">
        <a href="#home" class="nav-link">🏠 Início</a>
        <a href="#servicos" class="nav-link">💇 Serviços</a>
        <a href="#agendar" class="nav-link">📅 Agendar</a>
        <a href="#meus-agendamentos" class="nav-link">📋 Meus Agendamentos</a>
      </nav>
    </header>`;
}

function footerHTML() {
  return `<footer class="site-footer">
    <div>💈 ${barbeariaData?.barbearia?.nome || 'Barbearia'}</div>
    <div class="powered">Powered by <strong>AgendaPro</strong></div>
  </footer>`;
}

// ─── Página Inicial ───
function homePage() {
  const b = barbeariaData.barbearia;
  const servicos = barbeariaData.servicos || [];
  const profissionais = barbeariaData.profissionais || [];

  return `
    ${navBar()}
    <div class="hero">
      <div class="hero-bg" style="background-image:url('https://images.unsplash.com/photo-1585747861115-7f5b5a3a3c4f?w=800&q=80')"></div>
      <div class="hero-icon">💈</div>
      <h1>${b.nome}</h1>
      <p>${b.endereco || 'Seu estilo merece o melhor cuidado'}</p>
      <a href="#agendar" class="btn btn-primary">📅 Agende seu horário</a>
    </div>

    <div class="container">
      <!-- Instagram -->
      <div class="section">
        <div class="section-title">📸 <span>Nosso trabalho</span></div>
        ${instaGridHTML()}
      </div>

      <!-- Serviços em destaque -->
      <div class="section">
        <div class="section-title">💇 <span>Serviços</span> <span class="badge">${servicos.length}</span></div>
        ${servicos.slice(0, 4).map(s => `
          <div class="servico-card" onclick="navigate('#agendar?step=2&servico=${s.id}')">
            <div class="servico-info">
              <div class="servico-nome">${s.nome}</div>
              <div class="servico-categ">${s.categoria || '•'} · ${s.duracao_minutos}min</div>
            </div>
            <div class="servico-preco">${preco(s.preco)}</div>
          </div>
        `).join('')}
        ${servicos.length > 4 ? `<a href="#servicos" class="btn btn-secondary mt-sm">Ver todos os serviços</a>` : ''}
      </div>

      <!-- Profissionais -->
      <div class="section">
        <div class="section-title">✂️ <span>Nossa equipe</span></div>
        <div class="prof-grid">
          ${profissionais.map(p => `
            <div class="prof-item" onclick="navigate('#agendar?step=3&prof=${p.id}')">
              <div class="prof-avatar">${p.avatar_inicial || '✂️'}</div>
              <div class="prof-nome">${p.nome}</div>
              <div class="prof-espec">${p.especialidade || 'Barbeiro'}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Localização -->
      ${b.endereco ? `
      <div class="section">
        <div class="section-title">📍 <span>Localização</span></div>
        <div style="background:var(--bg-card);border-radius:var(--radius);padding:16px;font-size:14px;color:var(--text-secondary)">
          ${b.endereco}
        </div>
      </div>` : ''}
    </div>
    ${footerHTML()}`;
}

// ─── Instagram Grid ───
function instaGridHTML() {
  const fotos = barbeariaData?.barbearia?.instagram_fotos;
  if (fotos && Array.isArray(fotos) && fotos.length > 0) {
    return `<div class="insta-grid">
      ${fotos.slice(0, 9).map(f => `
        <div class="insta-item" style="background-image:url('${f}')">
          <div class="overlay">❤️</div>
        </div>`).join('')}
    </div>`;
  }

  // Placeholder - fotos ilustrativas
  const placeholders = [
    'https://images.unsplash.com/photo-1599351431202-1e0f5e7a5b6a?w=200&h=200&fit=crop',
    'https://images.unsplash.com/photo-1596728325488-58c87691e9af?w=200&h=200&fit=crop',
    'https://images.unsplash.com/photo-1567894340315-735d7c361db7?w=200&h=200&fit=crop',
    'https://images.unsplash.com/photo-1560869713-7d0a29430803?w=200&h=200&fit=crop',
    'https://images.unsplash.com/photo-1599351431202-1e0f5e7a5b6a?w=200&h=200&fit=crop',
    'https://images.unsplash.com/photo-1567894340315-735d7c361db7?w=200&h=200&fit=crop',
  ];

  return `<div class="insta-grid">
    ${placeholders.slice(0, 6).map(url => `
      <div class="insta-item" style="background-image:url('${url}')">
        <div class="overlay">📷</div>
      </div>`).join('')}
    <div class="insta-placeholder">
      <div>
        <div style="font-size:24px;margin-bottom:4px">📸</div>
        Conecte seu Instagram<br>
        <small style="font-size:11px">@${barbeariaData?.barbearia?.instagram || 'sua barbearia'}</small>
      </div>
    </div>
    <div class="insta-placeholder">
      <div>
        <div style="font-size:24px;margin-bottom:4px">📸</div>
        Fotos do seu<br>
        <small style="font-size:11px">trabalho aqui</small>
      </div>
    </div>
  </div>`;
}

// ─── Página de Serviços ───
function servicosPage() {
  const servicos = barbeariaData.servicos || [];
  const categorias = [...new Set(servicos.map(s => s.categoria).filter(Boolean))];

  return `
    ${navBar()}
    <div class="container" style="padding-top:24px">
      <h2 style="font-size:22px;margin-bottom:20px">💇 Nossos Serviços</h2>
      ${categorias.map(cat => `
        <div style="margin-bottom:24px">
          <div class="section-title" style="text-transform:capitalize;font-size:14px;color:var(--accent);margin-bottom:12px">${cat}</div>
          ${servicos.filter(s => s.categoria === cat).map(s => `
            <div class="servico-card" onclick="navigate('#agendar?step=2&servico=${s.id}')">
              <div class="servico-info">
                <div class="servico-nome">${s.nome}</div>
                <div class="servico-categ">${s.duracao_minutos} min</div>
              </div>
              <div style="text-align:right">
                <div class="servico-preco">${preco(s.preco)}</div>
                <div class="servico-duracao">${s.duracao_minutos}min</div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
      ${categorias.length === 0 ? servicos.map(s => `
        <div class="servico-card" onclick="navigate('#agendar?step=2&servico=${s.id}')">
          <div class="servico-info">
            <div class="servico-nome">${s.nome}</div>
          </div>
          <div class="servico-preco">${preco(s.preco)}</div>
        </div>
      `).join('') : ''}
      ${servicos.length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:40px 0">Nenhum serviço cadastrado ainda</p>' : ''}
      <a href="#agendar" class="btn btn-primary mt-md">📅 Agendar horário</a>
    </div>
    ${footerHTML()}`;
}

// ─── Página de Agendamento ───
async function agendarPage(step) {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const servicoId = params.get('servico');
  const profId = params.get('prof');

  // Se recebeu servico via URL, pré-seleciona
  if (servicoId && !selectedServico) {
    selectedServico = barbeariaData.servicos.find(s => s.id === servicoId) || null;
  }
  if (profId && !selectedProf) {
    selectedProf = barbeariaData.profissionais.find(p => p.id === profId) || null;
  }

  const servicos = barbeariaData.servicos || [];
  const profissionais = barbeariaData.profissionais || [];

  const steps = {
    '1': agendarStep1(servicos),
    '2': agendarStep2(servicos),
    '3': agendarStep3(profissionais),
    '4': await agendarStep4(),
    '5': agendarStep5(), // confirmação
    '6': agendarStep6(), // sucesso
  };

  return `
    ${navBar()}
    <div class="container" style="padding-top:24px">
      <div style="display:flex;gap:8px;margin-bottom:24px">
        ${[1,2,3,4,5].map(i => `
          <div style="flex:1;height:4px;border-radius:2px;
            ${parseInt(step) >= i ? 'background:var(--accent)' : 'background:var(--border)'}"></div>
        `).join('')}
      </div>
      ${steps[step] || steps['1']}
    </div>
    ${footerHTML()}`;
}

function agendarStep1(servicos) {
  return `
    <h2 style="font-size:22px;margin-bottom:4px">Escolha o serviço</h2>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:20px">Selecione o que você precisa</p>
    ${servicos.map(s => `
      <div class="servico-card ${selectedServico?.id === s.id ? 'selected' : ''}"
           onclick="selectServico('${s.id}')">
        <div class="servico-info">
          <div class="servico-nome">${s.nome}</div>
          <div class="servico-categ">${s.categoria || '•'} · ${s.duracao_minutos}min</div>
        </div>
        <div class="servico-preco">${preco(s.preco)}</div>
      </div>
    `).join('')}
    <button class="btn btn-primary mt-md ${!selectedServico ? 'btn-disabled' : ''}"
            onclick="navigate('#agendar?step=2')">Continuar →</button>
  `;
}

function agendarStep2(servicos) {
  if (!selectedServico) return agendarStep1(servicos);
  const s = selectedServico;
  return `
    <div class="alert alert-info">💇 Serviço escolhido: <strong>${s.nome}</strong> (${preco(s.preco)})</div>
    <h2 style="font-size:22px;margin-bottom:4px">Quase lá!</h2>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:20px">Escolha o profissional</p>
    <div class="prof-grid" style="grid-template-columns:repeat(2,1fr)">
      ${barbeariaData.profissionais.map(p => `
        <div class="prof-item ${selectedProf?.id === p.id ? 'selected' : ''}"
             onclick="selectProf('${p.id}')">
          <div class="prof-avatar">${p.avatar_inicial || '✂️'}</div>
          <div class="prof-nome">${p.nome}</div>
          <div class="prof-espec">${p.especialidade || 'Barbeiro'}</div>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:12px;margin-top:24px">
      <button class="btn btn-secondary" style="flex:1" onclick="navigate('#agendar?step=1')">← Voltar</button>
      <button class="btn btn-primary" style="flex:2 ${!selectedProf ? 'btn-disabled' : ''}"
              onclick="navigate('#agendar?step=3')">Escolher horário →</button>
    </div>
  `;
}

async function agendarStep3(profissionais) {
  if (!selectedServico || !selectedProf) {
    return agendarStep2(barbeariaData.servicos);
  }

  // Gera próximos 7 dias
  const dias = [];
  const hoje = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    dias.push(d.toISOString().split('T')[0]);
  }

  const dataSel = selectedData || dias[0];

  // Busca horários ocupados
  let ocupados = [];
  try {
    const dados = await api.get(`/horarios?data=${dataSel}&profissional_id=${selectedProf.id}`);
    ocupados = dados.ocupados || [];
  } catch (e) {
    console.warn('Erro ao buscar horarios:', e);
  }

  const horariosOcupados = new Set(ocupados.map(o => o.data_hora));

  // Gera slots de 30min das 8h às 19h
  const horarios = [];
  for (let h = 8; h <= 19; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hora = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
      const dataHora = `${dataSel}T${hora}`;
      horarios.push({
        label: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,
        value: dataHora,
        ocupado: horariosOcupados.has(dataHora)
      });
    }
  }

  return `
    <h2 style="font-size:22px;margin-bottom:4px">Escolha o horário</h2>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:20px">
      Com ${selectedProf?.nome || ''}
    </p>

    <!-- Datas -->
    <div class="date-nav" id="date-nav">
      ${dias.map(d => `
        <div class="date-btn ${dataSel === d ? 'sel' : ''}" onclick="selectData('${d}')">
          <span class="dia-semana">${diaSemana(d)}</span>
          <span class="dia-num">${d.split('-')[2]}</span>
          <span style="font-size:10px;opacity:.7">${formatDataCurta(d).split('/')[1]}</span>
        </div>
      `).join('')}
    </div>

    <!-- Horários -->
    <div class="grid-horarios" id="grid-horarios">
      ${horarios.map(h => `
        <div class="slot-horario ${h.ocupado ? 'ocupado' : ''} ${selectedHorario === h.value ? 'sel' : ''}"
             ${h.ocupado ? '' : `onclick="selectHorario('${h.value}')"`}>
          ${h.label}
        </div>
      `).join('')}
    </div>

    <div style="display:flex;gap:12px;margin-top:24px">
      <button class="btn btn-secondary" style="flex:1" onclick="navigate('#agendar?step=2')">← Voltar</button>
      <button class="btn btn-primary" style="flex:2 ${!selectedHorario ? 'btn-disabled' : ''}"
              onclick="navigate('#agendar?step=4')">Confirmar →</button>
    </div>
  `;
}

// step 4 - dados do cliente
function agendarStep4() {
  if (!selectedServico || !selectedProf || !selectedHorario) {
    return agendarStep3(barbeariaData.profissionais);
  }

  return `
    <h2 style="font-size:22px;margin-bottom:4px">Seus dados</h2>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:20px">Preencha para confirmar o agendamento</p>

    <div class="form-group">
      <label>Seu nome</label>
      <input class="form-input" id="input-nome" placeholder="Digite seu nome" value="${clienteNome}">
    </div>
    <div class="form-group">
      <label>Seu WhatsApp</label>
      <input class="form-input" id="input-telefone" type="tel"
             placeholder="(11) 99999-8888" value="${clienteTelefone}"
             oninput="this.value=this.value.replace(/\\D/g,'').substring(0,11)">
    </div>

    <!-- Resumo -->
    <div class="resumo-card">
      <div class="resumo-row">
        <span class="resumo-label">💇 Serviço</span>
        <span class="resumo-valor">${selectedServico.nome}</span>
      </div>
      <div class="resumo-row">
        <span class="resumo-label">✂️ Profissional</span>
        <span class="resumo-valor">${selectedProf.nome}</span>
      </div>
      <div class="resumo-row">
        <span class="resumo-label">📅 Data</span>
        <span class="resumo-valor">${formatData(selectedHorario.split('T')[0])}</span>
      </div>
      <div class="resumo-row">
        <span class="resumo-label">⏰ Horário</span>
        <span class="resumo-valor">${formatHora(selectedHorario)}</span>
      </div>
      <div class="resumo-row">
        <span class="resumo-label">⏱ Duração</span>
        <span class="resumo-valor">${selectedServico.duracao_minutos}min</span>
      </div>
      <div class="resumo-row" style="border:none;padding-top:12px">
        <span class="resumo-label" style="font-weight:600">Valor</span>
        <span class="resumo-valor resumo-total">${preco(selectedServico.preco)}</span>
      </div>
    </div>

    <div id="agendar-erro"></div>

    <div style="display:flex;gap:12px;margin-top:24px">
      <button class="btn btn-secondary" style="flex:1" onclick="navigate('#agendar?step=3')">← Voltar</button>
      <button class="btn btn-primary" style="flex:2" onclick="confirmarAgendamento()">✅ Confirmar</button>
    </div>
  `;
}

async function confirmarAgendamento() {
  const nome = document.getElementById('input-nome').value.trim();
  const telefone = document.getElementById('input-telefone').value.trim();
  const errEl = document.getElementById('agendar-erro');

  if (!nome) { errEl.innerHTML = '<div class="alert alert-error">✏️ Digite seu nome</div>'; return; }
  if (!telefone || telefone.length < 10) { errEl.innerHTML = '<div class="alert alert-error">📱 Digite seu WhatsApp com DDD</div>'; return; }

  clienteNome = nome;
  clienteTelefone = telefone;

  try {
    const res = await api.post('/agendar', {
      nome,
      telefone,
      profissional_id: selectedProf.id,
      servico_id: selectedServico.id,
      data_hora: selectedHorario,
    });

    // Limpa seleção
    selectedServico = null;
    selectedProf = null;
    selectedData = null;
    selectedHorario = null;

    navigate('#agendar?step=6');
  } catch (err) {
    errEl.innerHTML = `<div class="alert alert-error">❌ ${err.message}</div>`;
  }
}

function agendarStep5() {
  return `<div class="loading"><div class="spinner"></div><p>Confirmando...</p></div>`;
}
function agendarStep6() {
  return `
    <div class="sucesso-page">
      <div class="sucesso-icon">✅</div>
      <h2>Agendamento Confirmado! 🎉</h2>
      <p>Você receberá uma confirmação no WhatsApp.<br>Se precisar alterar ou cancelar, é só consultar "Meus Agendamentos".</p>
      <a href="#meus-agendamentos" class="btn btn-primary" style="max-width:280px;margin:0 auto">📋 Ver meus agendamentos</a>
      <a href="#home" class="btn btn-secondary mt-sm" style="max-width:280px;margin:12px auto 0">🏠 Voltar ao início</a>
    </div>
  `;
}

// ─── Meus Agendamentos ───
function agendamentosPage() {
  return `
    ${navBar()}
    <div class="container" style="padding-top:24px">

      <h2 style="font-size:22px;margin-bottom:4px">📋 Meus Agendamentos</h2>
      <p style="color:var(--text-muted);font-size:14px;margin-bottom:20px">Consulte ou cancele seus agendamentos</p>

      <div class="phone-search" id="phone-search">
        <h3>🔍 Buscar pelo WhatsApp</h3>
        <p>Digite o mesmo número que usou para agendar</p>
        <div class="form-group">
          <input class="form-input" id="busca-telefone" type="tel"
                 placeholder="(11) 99999-8888" value="${clienteTelefone}"
                 oninput="this.value=this.value.replace(/\\D/g,'').substring(0,11)">
        </div>
        <button class="btn btn-primary" onclick="buscarAgendamentos()">🔍 Buscar</button>
      </div>

      <div id="agendamentos-resultado"></div>
    </div>
    ${footerHTML()}`;
}

async function buscarAgendamentos() {
  const telefone = document.getElementById('busca-telefone').value.trim();
  const resultEl = document.getElementById('agendamentos-resultado');

  if (!telefone || telefone.length < 10) {
    resultEl.innerHTML = '<div class="alert alert-error">📱 Digite seu WhatsApp com DDD</div>';
    return;
  }

  clienteTelefone = telefone;
  resultEl.innerHTML = '<div class="loading" style="padding:40px"><div class="spinner"></div><p>Buscando...</p></div>';

  try {
    const dados = await api.get(`/agendamentos?telefone=${telefone}`);

    if (!dados.agendamentos || dados.agendamentos.length === 0) {
      resultEl.innerHTML = `
        <div class="alert alert-info" style="text-align:center;padding:40px">
          <div style="font-size:32px;margin-bottom:12px">📭</div>
          <strong>Nenhum agendamento encontrado</strong>
          <p style="color:var(--text-muted);margin-top:8px">Esse número não tem agendamentos ou você ainda não agendou conosco.</p>
          <a href="#agendar" class="btn btn-primary mt-md" style="max-width:220px;margin:16px auto 0">📅 Fazer agendamento</a>
        </div>`;
      return;
    }

    const agora = new Date();
    resultEl.innerHTML = `
      <div style="margin-bottom:16px">
        <span style="color:var(--text-secondary);font-size:14px">👤 Cliente: <strong style="color:var(--text-primary)">${dados.cliente?.nome || telefone}</strong></span>
        <span style="color:var(--text-muted);font-size:13px;margin-left:8px">(${dados.agendamentos.length} agendamentos)</span>
      </div>
      ${dados.agendamentos.map(a => {
        const dataAg = new Date(a.data_hora);
        const podeCancelar = a.status === 'agendado' && dataAg > agora;
        const statusClass = a.status === 'cancelado' ? 'cancelado' : a.status === 'concluido' ? 'concluido' : '';
        return `
          <div class="agendamento-card ${statusClass}">
            <div class="ag-header">
              <div class="ag-servico">${a.servico_nome || 'Atendimento'}</div>
              <span class="ag-status ${a.status}">${a.status === 'agendado' ? '✅ Agendado' : a.status === 'cancelado' ? '❌ Cancelado' : '✔️ Concluído'}</span>
            </div>
            <div class="ag-detalhes">
              <div>📅 ${formatData(a.data_hora.split('T')[0])} às ${formatHora(a.data_hora)}</div>
              <div>✂️ ${a.profissional_nome || '—'}</div>
              ${a.preco ? `<div>💰 ${preco(a.preco)}</div>` : ''}
            </div>
            ${podeCancelar ? `
              <div class="ag-actions">
                <button class="btn btn-danger btn-sm" onclick="cancelarAgendamento('${a.id}', this)">Cancelar</button>
              </div>` : ''}
          </div>
        `;
      }).join('')}
    `;
  } catch (err) {
    resultEl.innerHTML = `<div class="alert alert-error">❌ ${err.message}</div>`;
  }
}

async function cancelarAgendamento(id, btnEl) {
  if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
  btnEl.disabled = true;
  btnEl.textContent = 'Cancelando...';

  try {
    await api.patch(`/agendamentos/${id}/cancelar`);
    // Recarrega a lista
    buscarAgendamentos();
  } catch (err) {
    btnEl.disabled = false;
    btnEl.textContent = 'Cancelar';
    alert('Erro ao cancelar: ' + err.message);
  }
}

// ─── Eventos Globais ───
window.selectServico = function(id) {
  selectedServico = barbeariaData.servicos.find(s => s.id === id);
  render();
};
window.selectProf = function(id) {
  selectedProf = barbeariaData.profissionais.find(p => p.id === id);
  render();
};
window.selectData = function(d) {
  selectedData = d;
  selectedHorario = null;
  render();
};
window.selectHorario = function(h) {
  selectedHorario = h;
  render();
};
window.buscarAgendamentos = buscarAgendamentos;
window.cancelarAgendamento = cancelarAgendamento;
window.confirmarAgendamento = confirmarAgendamento;
window.navigate = navigate;

// ─── Init ───
render();
