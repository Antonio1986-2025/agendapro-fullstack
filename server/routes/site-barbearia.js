// ─── Site Publico da Barbearia (Agendamento Online) ───
// Tudo inline - sem dependencia de arquivos estaticos no Railway
import { Router } from 'express';
const router = Router();

const CSS = `*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0d0d0d;--bg2:#1a1a1a;--card:#222;--hover:#2a2a2a;--txt:#f0f0f0;--txt2:#aaa;--txt3:#666;--accent:#c8a95c;--accent2:#e8d08a;--border:#333;--success:#22c55e;--error:#ef4444;--radius:12px;--r2:8px;--font:'Inter',sans-serif}
html{scroll-behavior:smooth}
body{font-family:var(--font);background:var(--bg);color:var(--txt);line-height:1.6;-webkit-font-smoothing:antialiased}
.container{max-width:520px;margin:0 auto;padding:0 20px}
.hidden{display:none!important}
.fade-in{animation:fadeIn .3s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 28px;border-radius:var(--radius);font-size:16px;font-weight:600;border:none;cursor:pointer;transition:all .2s;text-decoration:none;width:100%}
.btn-primary{background:var(--accent);color:#000}
.btn-primary:hover{background:var(--accent2);transform:translateY(-1px)}
.btn-secondary{background:var(--card);color:var(--txt);border:1px solid var(--border)}
.btn-secondary:hover{background:var(--hover)}
.btn-danger{background:var(--error);color:#fff}
.btn-disabled{opacity:.5;cursor:not-allowed;pointer-events:none}
.btn-sm{padding:10px 18px;font-size:14px;width:auto}
.site-header{position:sticky;top:0;z-index:100;background:rgba(13,13,13,.95);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.header-inner{max-width:520px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 20px}
.header-logo{font-size:20px;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.nav-toggle{background:none;border:none;color:var(--txt);font-size:24px;cursor:pointer;padding:4px}
.nav-menu{display:none;flex-direction:column;position:absolute;top:100%;left:0;right:0;background:var(--bg2);border-bottom:1px solid var(--border);padding:8px 0}
.nav-menu.open{display:flex}
.nav-link{padding:12px 20px;color:var(--txt2);text-decoration:none;font-size:15px;transition:all .2s;display:flex;align-items:center;gap:10px}
.nav-link:hover,.nav-link.active{color:var(--accent);background:var(--hover)}
.loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;gap:16px}
.spinner{width:40px;height:40px;border:3px solid var(--border);border-top:3px solid var(--accent);border-radius:50%;animation:spin .8s linear infinite}
.loading p{color:var(--txt3);font-size:14px}
.hero{position:relative;overflow:hidden;padding:60px 20px 80px;text-align:center}
.hero::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,13,13,0) 0%,var(--bg) 100%)}
.hero-bg{position:absolute;inset:0;z-index:-1;background-size:cover;background-position:center;filter:brightness(.3) saturate(.8)}
.hero-icon{font-size:48px;margin-bottom:16px;position:relative}
.hero h1{font-size:32px;font-weight:800;margin-bottom:8px;position:relative}
.hero p{color:var(--txt2);font-size:16px;max-width:360px;margin:0 auto 24px;position:relative}
.hero .btn{max-width:260px;margin:0 auto;position:relative}
.section{padding:40px 0}
.section-title{font-size:18px;font-weight:700;margin-bottom:20px;display:flex;align-items:center;gap:8px}
.section-title .badge{font-size:12px;background:var(--accent);color:#000;padding:2px 10px;border-radius:20px;font-weight:600}
.insta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;border-radius:var(--radius);overflow:hidden}
.insta-item{aspect-ratio:1;background-size:cover;background-position:center;position:relative;cursor:pointer;transition:transform .3s}
.insta-item:hover{transform:scale(1.05);z-index:2}
.insta-item .overlay{position:absolute;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .3s;color:#fff;font-size:20px}
.insta-item:hover .overlay{opacity:1}
.insta-placeholder{aspect-ratio:1;background:var(--card);display:flex;align-items:center;justify-content:center;color:var(--txt3);font-size:13px;text-align:center;padding:8px}
.servico-card{background:var(--card);border-radius:var(--radius);padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;transition:all .2s;border:1px solid transparent}
.servico-card:hover,.servico-card.selected{border-color:var(--accent);background:var(--hover)}
.servico-card.selected{background:rgba(200,169,92,.1)}
.servico-info{flex:1}
.servico-nome{font-size:16px;font-weight:600}
.servico-categ{font-size:12px;color:var(--txt3);margin-top:2px}
.servico-preco{font-size:20px;font-weight:700;color:var(--accent)}
.servico-duracao{font-size:12px;color:var(--txt3);text-align:right}
.prof-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:12px}
.prof-item{background:var(--card);border-radius:var(--radius);padding:16px 8px;text-align:center;cursor:pointer;transition:all .2s;border:2px solid transparent}
.prof-item:hover,.prof-item.selected{border-color:var(--accent)}
.prof-item.selected{background:rgba(200,169,92,.1)}
.prof-avatar{width:56px;height:56px;border-radius:50%;background:var(--hover);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:24px}
.prof-nome{font-size:13px;font-weight:500}
.prof-espec{font-size:11px;color:var(--txt3)}
.date-nav{display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.date-nav::-webkit-scrollbar{display:none}
.date-btn{flex-shrink:0;padding:10px 16px;border-radius:var(--r2);background:var(--card);border:1px solid var(--border);color:var(--txt2);font-size:13px;cursor:pointer;text-align:center;min-width:60px;transition:all .2s}
.date-btn:hover{border-color:var(--accent)}
.date-btn.sel{background:var(--accent);color:#000;border-color:var(--accent);font-weight:600}
.date-btn .dia-semana{font-size:10px;opacity:.7;display:block}
.date-btn .dia-num{font-size:18px;font-weight:700;display:block}
.grid-horarios{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}
@media(max-width:400px){.grid-horarios{grid-template-columns:repeat(3,1fr)}}
.slot-horario{padding:12px 4px;border-radius:var(--r2);background:var(--card);border:1px solid var(--border);color:var(--txt);font-size:14px;cursor:pointer;text-align:center;transition:all .2s}
.slot-horario:hover{border-color:var(--accent)}
.slot-horario.sel{background:var(--accent);color:#000;border-color:var(--accent);font-weight:600}
.slot-horario.ocupado{opacity:.3;cursor:not-allowed;text-decoration:line-through}
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:14px;font-weight:500;margin-bottom:6px;color:var(--txt2)}
.form-input{width:100%;padding:14px 16px;border-radius:var(--r2);background:var(--card);border:1px solid var(--border);color:var(--txt);font-size:16px;outline:none;transition:border .2s}
.form-input:focus{border-color:var(--accent)}
.form-input::placeholder{color:var(--txt3)}
.resumo-card{background:var(--card);border-radius:var(--radius);padding:20px;margin-bottom:20px}
.resumo-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px}
.resumo-row:last-child{border:none}
.resumo-label{color:var(--txt2)}
.resumo-valor{font-weight:600}
.resumo-total{font-size:18px;color:var(--accent);font-weight:700}
.alert{padding:14px 16px;border-radius:var(--r2);font-size:14px;margin-bottom:16px;display:flex;align-items:center;gap:10px}
.alert-success{background:rgba(34,197,94,.15);color:var(--success);border:1px solid rgba(34,197,94,.3)}
.alert-error{background:rgba(239,68,68,.15);color:var(--error);border:1px solid rgba(239,68,68,.3)}
.alert-info{background:rgba(99,102,241,.15);color:#818cf8;border:1px solid rgba(99,102,241,.3)}
.sucesso-page{text-align:center;padding:60px 20px}
.sucesso-icon{width:80px;height:80px;border-radius:50%;background:rgba(34,197,94,.15);color:var(--success);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 24px}
.sucesso-page h2{font-size:24px;margin-bottom:8px}
.sucesso-page p{color:var(--txt2);margin-bottom:32px}
.agendamento-card{background:var(--card);border-radius:var(--radius);padding:16px;margin-bottom:12px;border-left:3px solid var(--accent)}
.agendamento-card.cancelado{border-left-color:var(--error);opacity:.7}
.agendamento-card.concluido{border-left-color:var(--success);opacity:.7}
.ag-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:8px}
.ag-servico{font-size:16px;font-weight:600}
.ag-status{font-size:11px;padding:2px 10px;border-radius:20px;font-weight:600}
.ag-status.agendado{background:rgba(200,169,92,.15);color:var(--accent)}
.ag-status.cancelado{background:rgba(239,68,68,.15);color:var(--error)}
.ag-status.concluido{background:rgba(34,197,75,.15);color:var(--success)}
.ag-detalhes{font-size:13px;color:var(--txt2)}
.ag-detalhes div{margin-top:4px}
.ag-actions{margin-top:12px;display:flex;gap:8px}
.phone-search{background:var(--card);border-radius:var(--radius);padding:24px;margin-bottom:24px}
.phone-search h3{font-size:16px;margin-bottom:12px}
.phone-search p{font-size:13px;color:var(--txt3);margin-bottom:16px}
.site-footer{text-align:center;padding:40px 20px;color:var(--txt3);font-size:13px;border-top:1px solid var(--border)}
.site-footer .powered{margin-top:8px}
.site-footer strong{color:var(--txt2)}`;

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#0d0d0d">
<title>💈 Barbearia - Agendamento Online</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div id="app"><div class="loading"><div class="spinner"></div><p>Carregando site da barbearia...</p></div></div>
<script>
// ─── Config ───
const SLUG = new URLSearchParams(location.search).get('b')||'barbearia-demo';
let barbeariaData=null,selectedServico=null,selectedProf=null,selectedData=null,selectedHorario=null,clienteNome='',clienteTelefone='';
const api={base:'/api/publico/'+SLUG,async get(p){const r=await fetch(this.base+p);if(!r.ok)throw new Error(await r.text());return r.json()},async post(p,b){const r=await fetch(this.base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});if(!r.ok)throw new Error((await r.json()).erro||'Erro');return r.json()},async patch(p){const r=await fetch(this.base+p,{method:'PATCH'});if(!r.ok)throw new Error((await r.json()).erro||'Erro');return r.json()}};
function navigate(h){history.pushState(null,'',h||'#home');render()}
window.addEventListener('hashchange',render);window.addEventListener('popstate',render);
async function render(){const h=location.hash||'#home',app=document.getElementById('app');app.className='fade-in';try{if(!barbeariaData){app.innerHTML='<div class=\"loading\"><div class=\"spinner\"></div><p>Carregando...</p></div>';barbeariaData=await api.get('')}switch(h.split('?')[0]){case'#home':app.innerHTML=homePage();break;case'#servicos':app.innerHTML=servicosPage();break;case'#agendar':const s=new URLSearchParams(h.split('?')[1]).get('step')||'1';app.innerHTML=await agendarPage(s);break;case'#meus-agendamentos':app.innerHTML=agendamentosPage();break;default:app.innerHTML=homePage()}}catch(e){app.innerHTML='<div class=\"container\" style=\"padding:80px 20px;text-align:center\"><div style=\"font-size:48px;margin-bottom:16px\">😕</div><h2>Ops! Algo deu errado</h2><p style=\"color:var(--txt2);margin:8px 0 24px\">'+e.message+'</p><button class=\"btn btn-primary\" onclick=\"location.reload()\">Tentar novamente</button></div>'}document.querySelectorAll('.nav-link').forEach(a=>{a.classList.toggle('active',a.getAttribute('href')===h)});const m=document.getElementById('nav-menu');if(m)m.classList.remove('open')}
function navBar(){return'<header class=\"site-header\"><div class=\"header-inner\"><a href=\"#home\" class=\"header-logo\">💈 '+(barbeariaData?.barbearia?.nome||'Barbearia')+'</a><button class=\"nav-toggle\" onclick=\"document.getElementById(\\'nav-menu\\').classList.toggle(\\'open\\')\">☰</button></div><nav class=\"nav-menu\" id=\"nav-menu\"><a href=\"#home\" class=\"nav-link\">🏠 Início</a><a href=\"#servicos\" class=\"nav-link\">💇 Serviços</a><a href=\"#agendar\" class=\"nav-link\">📅 Agendar</a><a href=\"#meus-agendamentos\" class=\"nav-link\">📋 Meus Agendamentos</a></nav></header>'}
function footerHTML(){return'<footer class=\"site-footer\"><div>💈 '+(barbeariaData?.barbearia?.nome||'Barbearia')+'</div><div class=\"powered\">Powered by <strong>AgendaPro</strong></div></footer>'}
function homePage(){const b=barbeariaData.barbearia,servicos=barbeariaData.servicos||[],profissionais=barbeariaData.profissionais||[];return navBar()+'<div class=\"hero\"><div class=\"hero-bg\" style=\"background-image:url(\\'https://images.unsplash.com/photo-1585747861115-7f5b5a3a3c4f?w=800&q=80\\')\"></div><div class=\"hero-icon\">💈</div><h1>'+b.nome+'</h1><p>'+(b.endereco||'Seu estilo merece o melhor cuidado')+'</p><a href=\"#agendar\" class=\"btn btn-primary\">📅 Agende seu horario</a></div><div class=\"container\"><div class=\"section\"><div class=\"section-title\">📸 <span>Nosso trabalho</span></div>'+instaGridHTML()+'</div><div class=\"section\"><div class=\"section-title\">💇 <span>Servicos</span> <span class=\"badge\">'+servicos.length+'</span></div>'+servicos.slice(0,4).map(s=>'<div class=\"servico-card\" onclick=\"navigate(\\'#agendar?step=2&servico='+s.id+'\\')\"><div class=\"servico-info\"><div class=\"servico-nome\">'+s.nome+'</div><div class=\"servico-categ\">'+(s.categoria||'•')+' · '+s.duracao_minutos+'min</div></div><div class=\"servico-preco\">R$ '+parseFloat(s.preco).toFixed(2).replace('.',',')+'</div></div>').join('')+(servicos.length>4?'<a href=\"#servicos\" class=\"btn btn-secondary mt-sm\" style=\"margin-top:12px\">Ver todos os servicos</a>':'')+'</div><div class=\"section\"><div class=\"section-title\">✂️ <span>Nossa equipe</span></div><div class=\"prof-grid\">'+profissionais.map(p=>'<div class=\"prof-item\" onclick=\"navigate(\\'#agendar?step=3&prof='+p.id+'\\')\"><div class=\"prof-avatar\">'+(p.avatar_inicial||'✂️')+'</div><div class=\"prof-nome\">'+p.nome+'</div><div class=\"prof-espec\">'+(p.especialidade||'Barbeiro')+'</div></div>').join('')+'</div></div>'+(b.endereco?'<div class=\"section\"><div class=\"section-title\">📍 <span>Localização</span></div><div style=\"background:var(--card);border-radius:var(--radius);padding:16px;font-size:14px;color:var(--txt2)\">'+b.endereco+'</div></div>':'')+'</div>'+footerHTML()}
function instaGridHTML(){const fotos=barbeariaData?.barbearia?.instagram_fotos;if(fotos&&Array.isArray(fotos)&&fotos.length>0)return'<div class=\"insta-grid\">'+fotos.slice(0,9).map(f=>'<div class=\"insta-item\" style=\"background-image:url(\\''+f+'\\')\"><div class=\"overlay\">❤️</div></div>').join('')+'</div>';return'<div class=\"insta-grid\"><div class=\"insta-item\" style=\"background-image:url(\\'https://images.unsplash.com/photo-1599351431202-1e0f5e7a5b6a?w=200&h=200&fit=crop\\')\"><div class=\"overlay\">📷</div></div><div class=\"insta-item\" style=\"background-image:url(\\'https://images.unsplash.com/photo-1596728325488-58c87691e9af?w=200&h=200&fit=crop\\')\"><div class=\"overlay\">📷</div></div><div class=\"insta-item\" style=\"background-image:url(\\'https://images.unsplash.com/photo-1567894340315-735d7c361db7?w=200&h=200&fit=crop\\')\"><div class=\"overlay\">📷</div></div><div class=\"insta-item\" style=\"background-image:url(\\'https://images.unsplash.com/photo-1560869713-7d0a29430803?w=200&h=200&fit=crop\\')\"><div class=\"overlay\">📷</div></div><div class=\"insta-item\" style=\"background-image:url(\\'https://images.unsplash.com/photo-1599351431202-1e0f5e7a5b6a?w=200&h=200&fit=crop\\')\"><div class=\"overlay\">📷</div></div><div class=\"insta-item\" style=\"background-image:url(\\'https://images.unsplash.com/photo-1567894340315-735d7c361db7?w=200&h=200&fit=crop\\')\"><div class=\"overlay\">📷</div></div><div class=\"insta-placeholder\"><div><div style=\"font-size:24px;margin-bottom:4px\">📸</div>Conecte seu Instagram<br><small style=\"font-size:11px\">@'+(barbeariaData?.barbearia?.instagram||'sua barbearia')+'</small></div></div><div class=\"insta-placeholder\"><div><div style=\"font-size:24px;margin-bottom:4px\">📸</div>Fotos do seu<br><small style=\"font-size:11px\">trabalho aqui</small></div></div></div>'}
function servicosPage(){const servicos=barbeariaData.servicos||[],categorias=[...new Set(servicos.map(s=>s.categoria).filter(Boolean))];return navBar()+'<div class=\"container\" style=\"padding-top:24px\"><h2 style=\"font-size:22px;margin-bottom:20px\">💇 Nossos Servicos</h2>'+categorias.map(cat=>'<div style=\"margin-bottom:24px\"><div class=\"section-title\" style=\"text-transform:capitalize;font-size:14px;color:var(--accent);margin-bottom:12px\">'+cat+'</div>'+servicos.filter(s=>s.categoria===cat).map(s=>'<div class=\"servico-card\" onclick=\"navigate(\\'#agendar?step=2&servico='+s.id+'\\')\"><div class=\"servico-info\"><div class=\"servico-nome\">'+s.nome+'</div><div class=\"servico-categ\">'+s.duracao_minutos+' min</div></div><div style=\"text-align:right\"><div class=\"servico-preco\">R$ '+parseFloat(s.preco).toFixed(2).replace('.',',')+'</div><div class=\"servico-duracao\">'+s.duracao_minutos+'min</div></div></div>').join('')+'</div>').join('')+(categorias.length===0?servicos.map(s=>'<div class=\"servico-card\" onclick=\"navigate(\\'#agendar?step=2&servico='+s.id+'\\')\"><div class=\"servico-info\"><div class=\"servico-nome\">'+s.nome+'</div></div><div class=\"servico-preco\">R$ '+parseFloat(s.preco).toFixed(2).replace('.',',')+'</div></div>').join(''):'')+(servicos.length===0?'<p style=\"color:var(--txt3);text-align:center;padding:40px 0\">Nenhum servico cadastrado ainda</p>':'')+'<a href=\"#agendar\" class=\"btn btn-primary mt-md\" style=\"margin-top:24px\">📅 Agendar horario</a></div>'+footerHTML()}
async function agendarPage(step){const p=new URLSearchParams(location.hash.split('?')[1]),sid=p.get('servico'),pid=p.get('prof');if(sid&&!selectedServico)selectedServico=barbeariaData.servicos.find(s=>s.id===sid)||null;if(pid&&!selectedProf)selectedProf=barbeariaData.profissionais.find(p=>p.id===pid)||null;const servicos=barbeariaData.servicos||[],profissionais=barbeariaData.profissionais||[],steps={'1':agendarStep1(servicos),'2':agendarStep2(servicos),'3':agendarStep3(profissionais),'4':agendarStep4(),'5':agendarStep5(),'6':agendarStep6()};return navBar()+'<div class=\"container\" style=\"padding-top:24px\"><div style=\"display:flex;gap:8px;margin-bottom:24px\">'+[1,2,3,4,5].map(i=>'<div style=\"flex:1;height:4px;border-radius:2px;background:'+(parseInt(step)>=i?'var(--accent)':'var(--border)')+'\"></div>').join('')+'</div>'+(steps[step]||steps['1'])+'</div>'+footerHTML()}
function agendarStep1(servicos){return'<h2 style=\"font-size:22px;margin-bottom:4px\">Escolha o servico</h2><p style=\"color:var(--txt3);font-size:14px;margin-bottom:20px\">Selecione o que voce precisa</p>'+servicos.map(s=>'<div class=\"servico-card '+(selectedServico?.id===s.id?'selected':'')+'\" onclick=\"selectServico(\\''+s.id+'\\')\"><div class=\"servico-info\"><div class=\"servico-nome\">'+s.nome+'</div><div class=\"servico-categ\">'+(s.categoria||'•')+' · '+s.duracao_minutos+'min</div></div><div class=\"servico-preco\">R$ '+parseFloat(s.preco).toFixed(2).replace('.',',')+'</div></div>').join('')+'<button class=\"btn btn-primary mt-md '+(selectedServico?'':'btn-disabled')+'\" onclick=\"navigate(\\'#agendar?step=2\\')\">Continuar →</button>'}
function agendarStep2(servicos){if(!selectedServico)return agendarStep1(servicos);const s=selectedServico;return'<div class=\"alert alert-info\">💇 Servico escolhido: <strong>'+s.nome+'</strong> (R$ '+parseFloat(s.preco).toFixed(2).replace('.',',')+')</div><h2 style=\"font-size:22px;margin-bottom:4px\">Quase la!</h2><p style=\"color:var(--txt3);font-size:14px;margin-bottom:20px\">Escolha o profissional</p><div class=\"prof-grid\" style=\"grid-template-columns:repeat(2,1fr)\">'+barbeariaData.profissionais.map(p=>'<div class=\"prof-item '+(selectedProf?.id===p.id?'selected':'')+'\" onclick=\"selectProf(\\''+p.id+'\\')\"><div class=\"prof-avatar\">'+(p.avatar_inicial||'✂️')+'</div><div class=\"prof-nome\">'+p.nome+'</div><div class=\"prof-espec\">'+(p.especialidade||'Barbeiro')+'</div></div>').join('')+'</div><div style=\"display:flex;gap:12px;margin-top:24px\"><button class=\"btn btn-secondary\" style=\"flex:1\" onclick=\"navigate(\\'#agendar?step=1\\')\">← Voltar</button><button class=\"btn btn-primary\" style=\"flex:2 '+(selectedProf?'':'btn-disabled')+'\" onclick=\"navigate(\\'#agendar?step=3\\')\">Escolher horario →</button></div>'}
async function agendarStep3(profissionais){if(!selectedServico||!selectedProf)return agendarStep2(barbeariaData.servicos);const dias=[];const hoje=new Date();for(let i=0;i<14;i++){const d=new Date(hoje);d.setDate(d.getDate()+i);dias.push(d.toISOString().split('T')[0])}const dataSel=selectedData||dias[0];let ocupados=[];try{const d=await api.get('/horarios?data='+dataSel+'&profissional_id='+selectedProf.id);ocupados=d.ocupados||[]}catch(e){console.warn(e)}const ocup=new Set(ocupados.map(o=>o.data_hora));const horarios=[];for(let h=8;h<=19;h++){for(let m=0;m<60;m+=30){const hora=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00';horarios.push({label:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'),value:dataSel+'T'+hora,ocupado:ocup.has(dataSel+'T'+hora)})}}const diasSem=['dom','seg','ter','qua','qui','sex','sab'];return'<h2 style=\"font-size:22px;margin-bottom:4px\">Escolha o horario</h2><p style=\"color:var(--txt3);font-size:14px;margin-bottom:20px\">Com '+(selectedProf?.nome||'')+'</p><div class=\"date-nav\">'+dias.map(d=>'<div class=\"date-btn '+(dataSel===d?'sel':'')+'\" onclick=\"selectData(\\''+d+'\\')\"><span class=\"dia-semana\">'+diasSem[new Date(d+'T12:00:00').getDay()]+'</span><span class=\"dia-num\">'+d.split('-')[2]+'</span></div>').join('')+'</div><div class=\"grid-horarios\">'+horarios.map(h=>'<div class=\"slot-horario '+(h.ocupado?'ocupado':'')+' '+(selectedHorario===h.value?'sel':'')+'\"'+(h.ocupado?'':' onclick=\"selectHorario(\\''+h.value+'\\')\"')+'>'+h.label+'</div>').join('')+'</div><div style=\"display:flex;gap:12px;margin-top:24px\"><button class=\"btn btn-secondary\" style=\"flex:1\" onclick=\"navigate(\\'#agendar?step=2\\')\">← Voltar</button><button class=\"btn btn-primary\" style=\"flex:2 '+(selectedHorario?'':'btn-disabled')+'\" onclick=\"navigate(\\'#agendar?step=4\\')\">Confirmar →</button></div>'}
function agendarStep4(){if(!selectedServico||!selectedProf||!selectedHorario)return agendarStep3(barbeariaData.profissionais);return'<h2 style=\"font-size:22px;margin-bottom:4px\">Seus dados</h2><p style=\"color:var(--txt3);font-size:14px;margin-bottom:20px\">Preencha para confirmar o agendamento</p><div class=\"form-group\"><label>Seu nome</label><input class=\"form-input\" id=\"input-nome\" placeholder=\"Digite seu nome\" value=\"'+clienteNome+'\"></div><div class=\"form-group\"><label>Seu WhatsApp</label><input class=\"form-input\" id=\"input-telefone\" type=\"tel\" placeholder=\"(11) 99999-8888\" value=\"'+clienteTelefone+'\" oninput=\"this.value=this.value.replace(/\\\\D/g,\\'\\').substring(0,11)\"></div><div class=\"resumo-card\"><div class=\"resumo-row\"><span class=\"resumo-label\">💇 Servico</span><span class=\"resumo-valor\">'+selectedServico.nome+'</span></div><div class=\"resumo-row\"><span class=\"resumo-label\">✂️ Profissional</span><span class=\"resumo-valor\">'+selectedProf.nome+'</span></div><div class=\"resumo-row\"><span class=\"resumo-label\">📅 Data</span><span class=\"resumo-valor\">'+new Date(selectedHorario.split('T')[0]+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long'})+'</span></div><div class=\"resumo-row\"><span class=\"resumo-label\">⏰ Horario</span><span class=\"resumo-valor\">'+(selectedHorario.match(/(\\d{2}):(\\d{2})/)?.[0]||selectedHorario)+'</span></div><div class=\"resumo-row\"><span class=\"resumo-label\">⏱ Duracao</span><span class=\"resumo-valor\">'+selectedServico.duracao_minutos+'min</span></div><div class=\"resumo-row\" style=\"border:none;padding-top:12px\"><span class=\"resumo-label\" style=\"font-weight:600\">Valor</span><span class=\"resumo-valor resumo-total\">R$ '+parseFloat(selectedServico.preco).toFixed(2).replace('.',',')+'</span></div></div><div id=\"agendar-erro\"></div><div style=\"display:flex;gap:12px;margin-top:24px\"><button class=\"btn btn-secondary\" style=\"flex:1\" onclick=\"navigate(\\'#agendar?step=3\\')\">← Voltar</button><button class=\"btn btn-primary\" style=\"flex:2\" onclick=\"confirmarAgendamento()\">✅ Confirmar</button></div>'}
async function confirmarAgendamento(){const n=document.getElementById('input-nome').value.trim(),t=document.getElementById('input-telefone').value.trim(),e=document.getElementById('agendar-erro');if(!n){e.innerHTML='<div class=\"alert alert-error\">✏️ Digite seu nome</div>';return}if(!t||t.length<10){e.innerHTML='<div class=\"alert alert-error\">📱 Digite seu WhatsApp com DDD</div>';return}clienteNome=n;clienteTelefone=t;try{await api.post('/agendar',{nome:n,telefone:t,profissional_id:selectedProf.id,servico_id:selectedServico.id,data_hora:selectedHorario});selectedServico=null;selectedProf=null;selectedData=null;selectedHorario=null;navigate('#agendar?step=6')}catch(err){e.innerHTML='<div class=\"alert alert-error\">❌ '+err.message+'</div>'}}
function agendarStep5(){return'<div class=\"loading\"><div class=\"spinner\"></div><p>Confirmando...</p></div>'}
function agendarStep6(){return'<div class=\"sucesso-page\"><div class=\"sucesso-icon\">✅</div><h2>Agendamento Confirmado! 🎉</h2><p>Voce recebera uma confirmacao no WhatsApp.<br>Se precisar alterar ou cancelar, e so consultar "Meus Agendamentos".</p><a href=\"#meus-agendamentos\" class=\"btn btn-primary\" style=\"max-width:280px;margin:0 auto\">📋 Ver meus agendamentos</a><a href=\"#home\" class=\"btn btn-secondary mt-sm\" style=\"max-width:280px;margin:12px auto 0\">🏠 Voltar ao inicio</a></div>'}
function agendamentosPage(){return navBar()+'<div class=\"container\" style=\"padding-top:24px\"><h2 style=\"font-size:22px;margin-bottom:4px\">📋 Meus Agendamentos</h2><p style=\"color:var(--txt3);font-size:14px;margin-bottom:20px\">Consulte ou cancele seus agendamentos</p><div class=\"phone-search\"><h3>🔍 Buscar pelo WhatsApp</h3><p>Digite o mesmo numero que usou para agendar</p><div class=\"form-group\"><input class=\"form-input\" id=\"busca-telefone\" type=\"tel\" placeholder=\"(11) 99999-8888\" value=\"'+clienteTelefone+'\" oninput=\"this.value=this.value.replace(/\\\\D/g,\\'\\').substring(0,11)\"></div><button class=\"btn btn-primary\" onclick=\"buscarAgendamentos()\">🔍 Buscar</button></div><div id=\"agendamentos-resultado\"></div></div>'+footerHTML()}
async function buscarAgendamentos(){const t=document.getElementById('busca-telefone').value.trim(),r=document.getElementById('agendamentos-resultado');if(!t||t.length<10){r.innerHTML='<div class=\"alert alert-error\">📱 Digite seu WhatsApp com DDD</div>';return}clienteTelefone=t;r.innerHTML='<div class=\"loading\" style=\"padding:40px\"><div class=\"spinner\"></div><p>Buscando...</p></div>';try{const d=await api.get('/agendamentos?telefone='+t);if(!d.agendamentos||d.agendamentos.length===0){r.innerHTML='<div class=\"alert alert-info\" style=\"text-align:center;padding:40px\"><div style=\"font-size:32px;margin-bottom:12px\">📭</div><strong>Nenhum agendamento encontrado</strong><p style=\"color:var(--txt3);margin-top:8px\">Esse numero nao tem agendamentos ou voce ainda nao agendou conosco.</p><a href=\"#agendar\" class=\"btn btn-primary mt-md\" style=\"max-width:220px;margin:16px auto 0\">📅 Fazer agendamento</a></div>';return}const agora=new Date();r.innerHTML='<div style=\"margin-bottom:16px\"><span style=\"color:var(--txt2);font-size:14px\">👤 Cliente: <strong style=\"color:var(--txt)\">'+(d.cliente?.nome||t)+'</strong></span><span style=\"color:var(--txt3);font-size:13px;margin-left:8px\">('+d.agendamentos.length+' agendamentos)</span></div>'+d.agendamentos.map(a=>{const dataAg=new Date(a.data_hora),podeCancelar=a.status==='agendado'&&dataAg>agora,statusClass=a.status==='cancelado'?'cancelado':a.status==='concluido'?'concluido':'';return'<div class=\"agendamento-card '+statusClass+'\"><div class=\"ag-header\"><div class=\"ag-servico\">'+(a.servico_nome||'Atendimento')+'</div><span class=\"ag-status '+a.status+'\">'+(a.status==='agendado'?'✅ Agendado':a.status==='cancelado'?'❌ Cancelado':'✔️ Concluido')+'</span></div><div class=\"ag-detalhes\"><div>📅 '+new Date(a.data_hora.split('T')[0]+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long'})+' as '+(a.data_hora.match(/(\\d{2}):(\\d{2})/)?.[0]||a.data_hora)+'</div><div>✂️ '+(a.profissional_nome||'—')+'</div>'+(a.preco?'<div>💰 R$ '+parseFloat(a.preco).toFixed(2).replace('.',',')+'</div>':'')+'</div>'+(podeCancelar?'<div class=\"ag-actions\"><button class=\"btn btn-danger btn-sm\" onclick=\"cancelarAgendamento(\\''+a.id+'\\',this)\">Cancelar</button></div>':'')+'</div>'}).join('')}catch(err){r.innerHTML='<div class=\"alert alert-error\">❌ '+err.message+'</div>'}}
async function cancelarAgendamento(id,btn){if(!confirm('Tem certeza que deseja cancelar este agendamento?'))return;btn.disabled=true;btn.textContent='Cancelando...';try{await api.patch('/agendamentos/'+id+'/cancelar');buscarAgendamentos()}catch(err){btn.disabled=false;btn.textContent='Cancelar';alert('Erro: '+err.message)}}
window.selectServico=function(id){selectedServico=barbeariaData.servicos.find(s=>s.id===id);render()}
window.selectProf=function(id){selectedProf=barbeariaData.profissionais.find(p=>p.id===id);render()}
window.selectData=function(d){selectedData=d;selectedHorario=null;render()}
window.selectHorario=function(h){selectedHorario=h;render()}
window.buscarAgendamentos=buscarAgendamentos
window.cancelarAgendamento=cancelarAgendamento
window.confirmarAgendamento=confirmarAgendamento
window.navigate=navigate
render();
<\/script>
</body>
</html>`;

router.get('/', (req, res) => {
  res.type('html').send(HTML);
});

export default router;
