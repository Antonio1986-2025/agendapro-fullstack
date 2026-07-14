// ===== CONFIGURAÇÃO AGENDAPRO =====
// Detecta o slug automaticamente da URL: /b/{slug} → slug
const pathMatch = window.location.pathname.match(/^\/b\/([a-z0-9-]+)/);
const AGENDAPRO_SLUG = pathMatch ? pathMatch[1] : 'barbearia-demo';
const AGENDAPRO_API = window.location.origin + '/api/publico';

// Dados carregados da API (preenchidos no primeiro fetch)
let apiServicos = [];
let apiProfissionais = [];
let apiHorarioConfig = null;

// ===== CARREGAR DADOS REAIS DO AGENDAPRO =====
async function carregarDadosBarbearia() {
  try {
    const res = await fetch(`${AGENDAPRO_API}/${AGENDAPRO_SLUG}`);
    if (!res.ok) throw new Error('API indisponivel');
    const dados = await res.json();

    apiServicos = dados.servicos || [];
    apiProfissionais = dados.profissionais || [];
    apiHorarioConfig = (dados.barbearia && dados.barbearia.horario_config)
      ? dados.barbearia.horario_config
      : { manha: { inicio: '09:00', fim: '12:00' }, tarde: { inicio: '13:00', fim: '19:00' }, intervalo_minutos: 30 };

    // Atualizar modal com dados reais
    renderizarServicosModal();
    renderizarBarbeirosModal();
    console.log('✅ AgendaPro conectado —', apiServicos.length, 'serviços,', apiProfissionais.length, 'barbeiros');
  } catch (err) {
    console.warn('⚠️ AgendaPro offline — usando dados locais', err.message);
    // Mantém os dados hardcoded como fallback
  }
}

function renderizarServicosModal() {
  if (!apiServicos.length) return;
  const container = document.getElementById('serviceList');
  container.innerHTML = apiServicos.map(s =>
    `<div class="service-option" data-service="${s.nome}" data-price="${s.preco || ''}" data-duration="${s.duracao_minutos || 45}" onclick="selectService(this)">
      <span class="name"><i class="fas fa-cut"></i> ${s.nome} — ${s.duracao_minutos || 45}min ${s.preco ? '· R$ ' + parseFloat(s.preco).toFixed(2).replace('.', ',') : ''}</span>
    </div>`
  ).join('');
}

function renderizarBarbeirosModal() {
  if (!apiProfissionais.length) return;
  // Encontrar o container correto (dentro do modal step2)
  const step2 = document.getElementById('step2');
  const container = step2.querySelector('.barber-select');
  if (!container) return;
  container.innerHTML = apiProfissionais.map(p =>
    `<div class="barber-option" data-barber="${p.nome}" data-id="${p.id}" onclick="selectBarber(this)">
      <span class="name">${p.nome}</span>
      <span class="count">${p.especialidade || 'Barbeiro'}</span>
    </div>`
  ).join('');
}

// ===== NAVIGATION =====
const navbar = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
});

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navLinks.classList.toggle('open');
});

document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navLinks.classList.remove('open');
  });
});

// ===== SCROLL REVEAL =====
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

revealElements.forEach(el => revealObserver.observe(el));

// ===== BOOKING MODAL =====
let bookingData = { service: '', price: '', duration: 0, barber: '', barberId: '', date: '', time: '' };
const weekdayNames = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

function openBookingModal() {
  document.getElementById('bookingModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  const t = new Date(); t.setDate(t.getDate() + 1);
  document.getElementById('bookingDate').min = t.toISOString().split('T')[0];
}
function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
  document.body.style.overflow = '';
}
document.getElementById('bookingModal').addEventListener('click', function(e) {
  if (e.target === this) closeBookingModal();
});

function selectService(el) {
  document.querySelectorAll('.service-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  bookingData.service = el.dataset.service;
  bookingData.price = el.dataset.price || '';
  bookingData.duration = parseInt(el.dataset.duration) || 45;
  document.getElementById('step1Btn').disabled = false;
}
function selectBarber(el) {
  document.querySelectorAll('.barber-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  bookingData.barber = el.dataset.barber;
  bookingData.barberId = el.dataset.id || '';
  document.getElementById('step2Btn').disabled = false;
}
function goToStep1() { switchStep('step1'); }
function goToStep2() { switchStep('step2'); }
function goToStep3() { switchStep('step3'); generateTimeSlots(); }
function goToStep4() {
  if (!bookingData.date || !bookingData.time) return;
  switchStep('step4');
  const d = new Date(bookingData.date + 'T12:00:00');
  const dayName = weekdayNames[d.getDay()];
  const formattedDate = d.toLocaleDateString('pt-BR');
  const precoStr = bookingData.price ? 'R$ ' + parseFloat(bookingData.price).toFixed(2).replace('.', ',') : '';
  document.getElementById('reviewContent').innerHTML =
    '<p><span class="label">Serviço</span><br><span>' + bookingData.service + (precoStr ? ' — ' + precoStr : '') + ' · ' + bookingData.duration + 'min</span></p>' +
    '<p style="margin-top:0.8rem;"><span class="label">Barbeiro</span><br><span>' + bookingData.barber + '</span></p>' +
    '<p style="margin-top:0.8rem;"><span class="label">Data</span><br><span>' + dayName + ', ' + formattedDate + '</span></p>' +
    '<p style="margin-top:0.8rem;"><span class="label">Horário</span><br><span>' + bookingData.time + '</span></p>';
}

function switchStep(id) {
  document.querySelectorAll('.modal-step').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ===== GERAR HORÁRIOS COM API REAL =====
async function generateTimeSlots() {
  const dateInput = document.getElementById('bookingDate').value;
  if (!dateInput) return;
  bookingData.date = dateInput;

  const slots = document.getElementById('timeSlots');
  slots.innerHTML = '<p style="color:var(--gray);grid-column:1/-1;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Buscando horários disponíveis...</p>';

  const d = new Date(dateInput + 'T12:00:00');
  const day = d.getDay();
  document.getElementById('step3Btn').disabled = true;

  // Domingo (0) ou Segunda (1) — fechado
  if (day === 0 || day === 1) {
    slots.innerHTML = '<p style="color:var(--gray);grid-column:1/-1;text-align:center;"><i class="fas fa-lock"></i> Fechado neste dia</p>';
    return;
  }

  // Buscar horários ocupados da API
  let ocupados = [];
  try {
    const barberId = bookingData.barberId;
    const url = `${AGENDAPRO_API}/${AGENDAPRO_SLUG}/horarios?data=${dateInput}${barberId ? '&profissional_id=' + barberId : ''}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      ocupados = (data.ocupados || []).map(o => {
        // Extrai HH:MM da string ISO
        const m = String(o.data_hora).match(/(\d{2}):(\d{2})/);
        return m ? m[1] + ':' + m[2] : '';
      });
    }
  } catch (err) {
    console.warn('⚠️ Erro ao buscar horários:', err.message);
    // Continua com ocupados vazio (todos horários disponíveis)
  }

  // Definir faixas de horário
  const config = apiHorarioConfig || { manha: { inicio: '09:00', fim: '12:00' }, tarde: { inicio: '13:00', fim: '19:00' }, intervalo_minutos: 30 };
  const intervalo = config.intervalo_minutos || 30;
  let start = 9, end = 19;
  if (day === 6) { start = 9; end = 16; } // Sábado mais cedo

  // Também usar horário config da barbearia se disponível
  if (config.manha && config.manha.inicio) {
    start = parseInt(config.manha.inicio.split(':')[0]);
  }
  if (config.tarde && config.tarde.fim) {
    end = parseInt(config.tarde.fim.split(':')[0]);
  }

  slots.innerHTML = '';
  const now = new Date();
  const isToday = dateInput === new Date().toISOString().split('T')[0];
  let hasSlots = false;

  for (let h = start; h < end; h++) {
    for (let m = 0; m < 60; m += intervalo) {
      if (h === end - 1 && m === 60 - intervalo && intervalo !== 60) continue;
      const t = h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
      const isOcupado = ocupados.includes(t);

      // Se for hoje, filtrar horários passados
      if (isToday) {
        const slotTime = new Date(dateInput + 'T' + t + ':00');
        if (slotTime <= now) continue;
      }

      const slot = document.createElement('div');
      slot.className = 'time-slot' + (isOcupado ? ' ocupado' : '');
      slot.textContent = t;
      if (!isOcupado) {
        slot.onclick = function() { selectTime(this); };
        hasSlots = true;
      }
      slots.appendChild(slot);
    }
  }

  if (!hasSlots && ocupados.length === 0) {
    slots.innerHTML = '<p style="color:var(--gray);grid-column:1/-1;text-align:center;"><i class="fas fa-clock"></i> Sem horários disponíveis para este dia</p>';
  }
}

function selectTime(el) {
  document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  bookingData.time = el.textContent;
  document.getElementById('step3Btn').disabled = false;
}

// ===== ENVIAR AGENDAMENTO PARA AGENDAPRO =====
async function sendBooking() {
  const btn = document.querySelector('#step4 .modal-btn.whatsapp');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
  btn.disabled = true;

  try {
    // Montar data_hora no formato ISO (sem timezone)
    const dataHora = bookingData.date + 'T' + bookingData.time + ':00';

    const body = {
      nome: document.getElementById('bookingName')?.value || 'Cliente',
      telefone: document.getElementById('bookingPhone')?.value || '',
      profissional_id: bookingData.barberId,
      data_hora: dataHora,
    };

    // Adicionar servico_id se tiver correspondência
    if (apiServicos.length > 0) {
      const servicoMatch = apiServicos.find(s => s.nome === bookingData.service);
      if (servicoMatch) body.servico_id = servicoMatch.id;
    }

    const res = await fetch(`${AGENDAPRO_API}/${AGENDAPRO_SLUG}/agendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await res.json();

    if (res.ok) {
      // SUCESSO — mostrar confirmação
      btn.innerHTML = '<i class="fas fa-circle-check"></i> Agendado com sucesso! ✅';
      btn.className = 'modal-btn success';
      btn.style.background = 'var(--gold)';
      btn.style.color = 'var(--black)';

      // Após 2 segundos, oferecer WhatsApp
      setTimeout(() => {
        const phone = '556730459452';
        const d = new Date(bookingData.date + 'T12:00:00');
        const dayName = weekdayNames[d.getDay()];
        const formattedDate = d.toLocaleDateString('pt-BR');
        const precoStr = bookingData.price ? ' — R$ ' + parseFloat(bookingData.price).toFixed(2).replace('.', ',') : '';
        const msg = '✅ *Agendamento confirmado!*%0A%0A' +
          '🔹 *Serviço:* ' + bookingData.service + precoStr + '%0A' +
          '🔹 *Barbeiro:* ' + bookingData.barber + '%0A' +
          '🔹 *Data:* ' + dayName + ', ' + formattedDate + '%0A' +
          '🔹 *Horário:* ' + bookingData.time + '%0A%0A' +
          'Agendamento realizado via AgendaPro. Obrigado! 🙋‍♂️';
        window.open('https://wa.me/55' + phone + '?text=' + msg, '_blank');
        closeBookingModal();
      }, 2000);

    } else if (res.status === 409) {
      // Horário já ocupado
      btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Horário indisponível!';
      btn.className = 'modal-btn error';
      alert('Este horário acabou de ser reservado. Por favor, volte e escolha outro horário.');
      setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; btn.className = 'modal-btn whatsapp'; }, 2000);

    } else {
      throw new Error(result.erro || 'Erro ao agendar');
    }
  } catch (err) {
    console.error('❌ Erro AgendaPro:', err.message);
    // FALLBACK: WhatsApp
    btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Usando WhatsApp...';
    setTimeout(() => sendToWhatsAppFallback(), 800);
  }
}

// Fallback — abre WhatsApp diretamente (comportamento antigo)
function sendToWhatsAppFallback() {
  const d = new Date(bookingData.date + 'T12:00:00');
  const dayName = weekdayNames[d.getDay()];
  const formattedDate = d.toLocaleDateString('pt-BR');
  const precoStr = bookingData.price ? ' — R$ ' + parseFloat(bookingData.price).toFixed(2).replace('.', ',') : '';
  const msg = 'Olá! Gostaria de agendar um horário 🙋‍♂️%0A%0A' +
    '🔹 *Serviço:* ' + bookingData.service + precoStr + '%0A' +
    '🔹 *Barbeiro:* ' + bookingData.barber + '%0A' +
    '🔹 *Data:* ' + dayName + ', ' + formattedDate + '%0A' +
    '🔹 *Horário:* ' + bookingData.time + '%0A%0A' +
    'Pode confirmar?';
  window.open('https://wa.me/556730459452?text=' + msg, '_blank');
  closeBookingModal();
}

// O botão do modal step4 chama sendBooking()
document.querySelector('#step4 .modal-btn.whatsapp').addEventListener('click', function(e) {
  e.preventDefault();
  sendBooking();
});

// ===== LIGHTBOX DA GALERIA =====
function openLightbox(imgEl) {
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = '<button class="lightbox-close"><i class="fas fa-times"></i></button><img src="' + imgEl.src + '" alt="' + imgEl.alt + '">';
  lightbox.addEventListener('click', function(e) { if (e.target === lightbox || e.target.classList.contains('lightbox-close')) lightbox.remove(); });
  document.body.appendChild(lightbox);
  document.body.style.overflow = 'hidden';
}

// Inicializar lightbox na galeria
document.querySelectorAll('.gallery-item img').forEach(img => {
  img.style.cursor = 'pointer';
  img.addEventListener('click', function() { openLightbox(this); });
});

// ===== TEMA CLARO/ESCURO =====
function initTheme() {
  const saved = localStorage.getItem('cg-barbershop-theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cg-barbershop-theme', next);
}

initTheme();

// ===== ANIMAÇÕES =====

// Mouse follower
const follower = document.getElementById('mouseFollower');
let mouseX = 0, mouseY = 0, followerX = 0, followerY = 0;
document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});
function animateFollower() {
  followerX += (mouseX - followerX) * 0.1;
  followerY += (mouseY - followerY) * 0.1;
  follower.style.transform = 'translate(' + (followerX - 10) + 'px, ' + (followerY - 10) + 'px)';
  requestAnimationFrame(animateFollower);
}
if (window.innerWidth > 768) {
  animateFollower();
  document.querySelectorAll('.service-card, .btn, .gallery-item, .barber-option, a').forEach(el => {
    el.addEventListener('mouseenter', () => follower.classList.add('hovering'));
    el.addEventListener('mouseleave', () => follower.classList.remove('hovering'));
  });
} else {
  follower.style.display = 'none';
}

// Service card 3D tilt
document.querySelectorAll('.service-card').forEach(card => {
  card.addEventListener('mousemove', function(e) {
    if (window.innerWidth < 768) return;
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / centerY * -8;
    const rotateY = (x - centerX) / centerX * 8;
    this.style.transform = 'perspective(1000px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) scale3d(1.02,1.02,1.02)';
  });
  card.addEventListener('mouseleave', function() {
    this.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1,1,1)';
  });
});

// Stat numbers counter
const statsObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      const num = entry.target.querySelector('.stat-number');
      if (num && !num.dataset.counted) {
        num.dataset.counted = 'true';
        const target = num.textContent;
        num.textContent = '0';
        let start = 0;
        const end = parseFloat(target.replace(',','.'));
        if (isNaN(end)) { num.textContent = target; return; }
        const duration = 1500;
        const step = (end / duration) * 16;
        const timer = setInterval(() => {
          start += step;
          if (start >= end) {
            num.textContent = target;
            clearInterval(timer);
          } else {
            num.textContent = Math.floor(start).toString();
          }
        }, 16);
      }
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.stat-item').forEach(item => statsObserver.observe(item));

// Enhanced scroll reveal
const enhancedObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      const children = entry.target.querySelectorAll('.service-card, .gallery-item, .testimonial-card');
      children.forEach((child, i) => {
        setTimeout(() => child.classList.add('visible'), i * 80);
      });
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.services-grid, .gallery-grid, .testimonials-grid').forEach(grid => {
  enhancedObserver.observe(grid);
  grid.querySelectorAll('.service-card, .gallery-item, .testimonial-card').forEach(c => c.classList.add('reveal'));
});

// Smooth anchor scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Active nav highlight on scroll
const sections = document.querySelectorAll('section[id]');
const navLinkElements = document.querySelectorAll('.nav-links a:not(.nav-cta)');
const navObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinkElements.forEach(l => l.style.color = '');
      const link = document.querySelector('.nav-links a[href="#' + entry.target.id + '"]');
      if (link) link.style.color = 'var(--gold)';
    }
  });
}, { threshold: 0.4 });
sections.forEach(s => navObserver.observe(s));

// Mouse parallax in hero
document.querySelector('.hero-content').addEventListener('mousemove', function(e) {
  if (window.innerWidth < 768) return;
  const rect = this.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;
  this.querySelector('h1').style.transform = 'translate(' + (x * 20) + 'px, ' + (y * 10) + 'px)';
  this.querySelector('p').style.transform = 'translate(' + (x * 10) + 'px, ' + (y * 5) + 'px)';
});
document.querySelector('.hero-content').addEventListener('mouseleave', function() {
  this.querySelector('h1').style.transform = '';
  this.querySelector('p').style.transform = '';
});

// ===== INICIAR =====
carregarDadosBarbearia();
