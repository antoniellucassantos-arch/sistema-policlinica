/* ==========================================================
   MEDAGENDA — FRONT-END
   Conversa com o servidor próprio (pasta /server) pela API /api.
========================================================== */

/* ==========================================================
   ESTADO GLOBAL
========================================================== */
const state = {
  usuario: null,
  profissional: null, // perfil do profissional logado
  profissionais: [],
  busca: '',
  filtroEspecialidade: '',
  profissionalSelecionado: null,
  dataSelecionada: null,
  horarioSelecionado: null,
  horarios: null,
  mesAtual: inicioDoMes(new Date()),
  consultas: [],
  abaConsultas: 'proximas',
  periodoAgenda: 'proximas',
  tokenRedefinicao: null,
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // segunda a domingo
const DIAS_ANTECEDENCIA_MAX = 180;

const TIPOS = { paciente: 'Paciente', profissional: 'Profissional', admin: 'Administrador' };
const STATUS = { agendada: 'Agendada', concluida: 'Concluída', cancelada: 'Cancelada' };

const MENUS = {
  paciente: [
    { id: 'inicio', rotulo: 'Início', icone: 'home' },
    { id: 'agendar', rotulo: 'Agendar consulta', icone: 'calendar-plus' },
    { id: 'consultas', rotulo: 'Minhas consultas', icone: 'clipboard' },
    { id: 'conta', rotulo: 'Minha conta', icone: 'user' },
  ],
  profissional: [
    { id: 'agenda', rotulo: 'Minha agenda', icone: 'calendar' },
    { id: 'perfil-publico', rotulo: 'Perfil público', icone: 'stethoscope' },
    { id: 'conta', rotulo: 'Minha conta', icone: 'user' },
  ],
  admin: [
    { id: 'admin', rotulo: 'Profissionais', icone: 'users' },
    { id: 'conta', rotulo: 'Minha conta', icone: 'user' },
  ],
};

/* ==========================================================
   HELPERS
========================================================== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function icone(nome) {
  return `<svg class="ic"><use href="#i-${nome}"/></svg>`;
}

async function api(caminho, { metodo = 'GET', corpo } = {}) {
  let resp;
  try {
    resp = await fetch(`/api${caminho}`, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique sua internet.');
  }

  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const erro = new Error(dados.erro || 'Algo deu errado. Tente novamente.');
    erro.status = resp.status;
    if (resp.status === 401 && state.usuario) {
      sessaoExpirada();
      erro.silencioso = true; // o aviso de sessão expirada já foi mostrado
    }
    throw erro;
  }
  return dados;
}

function showToast(msg, tipo = 'info') {
  const t = $('#toast');
  const icones = { success: 'check', error: 'alert', info: 'alert' };
  t.innerHTML = `${icone(icones[tipo] || 'alert')}<span>${esc(msg)}</span>`;
  t.className = `toast show ${tipo}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3800);
}

function setLoading(btn, carregando) {
  if (carregando) {
    btn.disabled = true;
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> Aguarde...';
  } else {
    btn.disabled = false;
    if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
  }
}

/** Executa uma ação de formulário mostrando "Aguarde..." no botão e erros em toast. */
async function comCarregamento(btn, acao) {
  setLoading(btn, true);
  try {
    await acao();
  } catch (err) {
    console.error(err);
    if (!err.silencioso) showToast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

/* ---------- Datas ---------- */
const pad = (n) => String(n).padStart(2, '0');

function inicioDoMes(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDe(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dataDeISO(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function hojeISO() {
  return isoDe(new Date());
}

function fmtData(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "2026-10-09" → "Sexta-feira, 9 de outubro" */
function fmtDataLonga(iso) {
  return capitalizar(dataDeISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
}

function idade(nascimento) {
  if (!nascimento) return null;
  const n = dataDeISO(nascimento);
  const hoje = new Date();
  let anos = hoje.getFullYear() - n.getFullYear();
  if (hoje.getMonth() < n.getMonth() || (hoje.getMonth() === n.getMonth() && hoje.getDate() < n.getDate())) anos -= 1;
  return anos;
}

/* ---------- Nomes e avatares ---------- */
const TITULOS = /^(dr|dra|sr|sra|prof|profa)\.?$/i;

function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter((p) => p && !TITULOS.test(p));
  if (!partes.length) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

/** "Dra. Ana Beatriz Lima" → "Dra. Ana"; "Maria Souza" → "Maria" */
function nomeCurto(nome) {
  const partes = String(nome || '').trim().split(/\s+/);
  if (partes.length > 1 && TITULOS.test(partes[0])) return `${partes[0]} ${partes[1]}`;
  return partes[0] || '';
}

const CORES_AVATAR = ['#0d9488', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#4d7c0f', '#c026d3'];

function corDoNome(nome) {
  let h = 0;
  for (const c of String(nome || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[h % CORES_AVATAR.length];
}

function avatarHTML(pessoa, tamanho = '') {
  const nome = pessoa?.nome || '';
  const classe = `avatar${tamanho ? ` avatar-${tamanho}` : ''}`;
  const conteudo = pessoa?.foto
    ? `<img src="${esc(pessoa.foto)}" alt="" data-iniciais="${esc(iniciais(nome))}" referrerpolicy="no-referrer">`
    : esc(iniciais(nome));
  return `<span class="${classe}" style="--cor:${corDoNome(nome)}">${conteudo}</span>`;
}

// Se a foto não carregar, mostra as iniciais no lugar.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.iniciais !== undefined && img.parentElement) {
    img.parentElement.textContent = img.dataset.iniciais;
  }
}, true);

function diasHTML(dias) {
  return `<div class="prof-dias">${ORDEM_DIAS.map((d) => (
    `<span class="${String(dias || '').includes(String(d)) ? 'on' : ''}">${DIAS_CURTOS[d][0]}</span>`
  )).join('')}</div>`;
}

function diasPorExtenso(dias) {
  return ORDEM_DIAS.filter((d) => String(dias || '').includes(String(d))).map((d) => DIAS_CURTOS[d]).join(', ');
}

function vazioHTML(nomeIcone, titulo, texto = '', extra = '') {
  return `
    <div class="vazio-box">
      <div class="vazio-icone">${icone(nomeIcone)}</div>
      <strong>${esc(titulo)}</strong>
      ${texto ? `<p>${esc(texto)}</p>` : ''}
      ${extra}
    </div>`;
}

function carregandoHTML() {
  return '<div class="vazio-box"><div class="spinner" style="margin:0 auto"></div></div>';
}

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* ---------- Campos de senha com botão "mostrar" ---------- */
function aprimorarCamposSenha(raiz = document) {
  raiz.querySelectorAll('input[type="password"]').forEach((input) => {
    const caixa = input.closest('.campo-input');
    if (!caixa || caixa.classList.contains('tem-olho')) return;
    caixa.classList.add('tem-olho');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-olho';
    btn.setAttribute('aria-label', 'Mostrar senha');
    btn.innerHTML = icone('eye');
    btn.addEventListener('click', () => {
      const mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      btn.innerHTML = icone(mostrar ? 'eye-off' : 'eye');
      btn.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    });
    caixa.appendChild(btn);
  });
}

/* ---------- Máscara de telefone ---------- */
document.addEventListener('input', (e) => {
  if (e.target.type !== 'tel') return;
  const d = e.target.value.replace(/\D/g, '').slice(0, 11);
  let v = d;
  if (d.length > 10) v = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  else if (d.length > 6) v = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  else if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  else if (d.length) v = `(${d}`;
  e.target.value = v;
});

/* ==========================================================
   MODAL
========================================================== */
let resolverModal = null;

function abrirModal(html, { largo = false } = {}) {
  const caixa = $('#modal-box');
  caixa.className = `modal-box${largo ? ' largo' : ''}`;
  caixa.innerHTML = html;
  $('#modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  aprimorarCamposSenha(caixa);
}

function fecharModal(resultado = false) {
  $('#modal').classList.add('hidden');
  document.body.style.overflow = '';
  if (resolverModal) {
    const r = resolverModal;
    resolverModal = null;
    r(resultado);
  }
}

/** Substitui o confirm() do navegador por um modal bonito. */
function confirmar({ titulo, texto, botao = 'Confirmar', perigo = false }) {
  abrirModal(`
    <div class="modal-icone ${perigo ? 'perigo' : 'sucesso'}">${icone(perigo ? 'alert' : 'check')}</div>
    <h3 class="modal-titulo">${esc(titulo)}</h3>
    <p class="modal-texto">${esc(texto)}</p>
    <div class="modal-acoes">
      <button class="btn btn-secundario" data-fechar>Voltar</button>
      <button class="btn ${perigo ? 'btn-perigo' : 'btn-primary'}" data-confirmar>${esc(botao)}</button>
    </div>`);
  return new Promise((resolve) => { resolverModal = resolve; });
}

$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal' || e.target.closest('[data-fechar]')) fecharModal(false);
  else if (e.target.closest('[data-confirmar]')) fecharModal(true);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) fecharModal(false);
});

/* ==========================================================
   TELAS (carregando / auth / app)
========================================================== */
function mostrarTela(qual) {
  $('#tela-carregando').classList.toggle('hidden', qual !== 'carregando');
  $('#auth-screen').classList.toggle('hidden', qual !== 'auth');
  $('#app-screen').classList.toggle('hidden', qual !== 'app');
}

function mostrarFormAuth(nome) {
  $$('.auth-form').forEach((f) => f.classList.remove('active'));
  $(`#form-${nome}`).classList.add('active');
  if (nome === 'esqueci') {
    $('#esqueci-pedido').classList.remove('hidden');
    $('#esqueci-enviado').classList.add('hidden');
    const emailLogin = $('#log-email').value.trim();
    if (emailLogin && !$('#esq-email').value) $('#esq-email').value = emailLogin;
  }
  const primeiro = $(`#form-${nome} input:not([type=hidden])`);
  if (primeiro && window.innerWidth > 900) primeiro.focus();
}

$$('[data-auth]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    mostrarFormAuth(e.currentTarget.dataset.auth);
  });
});

/* ==========================================================
   NAVEGAÇÃO ENTRE PÁGINAS (pelo # da URL)
========================================================== */
function montarMenu() {
  $('#nav-links').innerHTML = MENUS[state.usuario.tipo].map((i) => `
    <a href="#${i.id}" class="nav-link" data-page="${i.id}">${icone(i.icone)} ${esc(i.rotulo)}</a>
  `).join('');
}

function irPara(pagina) {
  if (location.hash === `#${pagina}`) renderizarPagina();
  else location.hash = pagina;
}

function renderizarPagina() {
  if (!state.usuario) return;
  const itens = MENUS[state.usuario.tipo];
  let pagina = location.hash.slice(1);
  if (!itens.some((i) => i.id === pagina)) {
    pagina = itens[0].id;
    history.replaceState(null, '', `#${pagina}`);
  }

  $$('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${pagina}`));
  $$('.nav-link').forEach((l) => l.classList.toggle('active', l.dataset.page === pagina));
  $('#nav-links').classList.remove('open');
  window.scrollTo(0, 0);

  const carregar = {
    inicio: carregarInicio,
    agendar: abrirAgendar,
    consultas: carregarConsultas,
    agenda: carregarAgenda,
    'perfil-publico': abrirPerfilPublico,
    admin: carregarAdmin,
    conta: preencherConta,
  }[pagina];

  Promise.resolve(carregar?.()).catch((err) => {
    console.error(err);
    if (!err.silencioso) showToast(err.message, 'error');
  });
}

window.addEventListener('hashchange', renderizarPagina);

$('#menu-toggle').addEventListener('click', () => $('#nav-links').classList.toggle('open'));

/* ==========================================================
   SESSÃO
========================================================== */
function atualizarCabecalho() {
  const u = state.usuario;
  $('#nav-avatar').outerHTML = avatarHTML({ nome: u.nome, foto: state.profissional?.foto }, 'sm')
    .replace('<span class="avatar', '<span id="nav-avatar" class="avatar');
  $('#nav-nome').textContent = nomeCurto(u.nome);
  $('#nav-tipo').textContent = TIPOS[u.tipo];
}

async function iniciarApp(dados) {
  state.usuario = dados.usuario;
  state.profissional = dados.profissional;
  atualizarCabecalho();
  montarMenu();
  mostrarTela('app');
  renderizarPagina();
}

function limparSessao() {
  state.usuario = null;
  state.profissional = null;
  state.profissionalSelecionado = null;
  state.dataSelecionada = null;
  state.horarioSelecionado = null;
  fecharModal(false);
  history.replaceState(null, '', location.pathname);
}

function sessaoExpirada() {
  limparSessao();
  mostrarTela('auth');
  mostrarFormAuth('login');
  showToast('Sua sessão expirou. Entre novamente.', 'info');
}

$('#btn-logout').addEventListener('click', async () => {
  await api('/auth/logout', { metodo: 'POST' }).catch(() => {});
  limparSessao();
  mostrarTela('auth');
  mostrarFormAuth('login');
  showToast('Você saiu da conta.', 'info');
});

/* ==========================================================
   LOGIN / CADASTRO / ESQUECI MINHA SENHA
========================================================== */
$('#form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  comCarregamento(e.submitter || e.target.querySelector('button[type=submit]'), async () => {
    const dados = await api('/auth/login', {
      metodo: 'POST',
      corpo: { email: $('#log-email').value.trim(), senha: $('#log-senha').value },
    });
    $('#log-senha').value = '';
    await iniciarApp(dados);
    showToast(`Bem-vindo(a), ${nomeCurto(dados.usuario.nome)}!`, 'success');
  });
});

$('#form-cadastro').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('#cad-senha').value !== $('#cad-senha2').value) {
    showToast('As senhas não coincidem.', 'error');
    return;
  }
  comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
    const dados = await api('/auth/cadastro', {
      metodo: 'POST',
      corpo: {
        nome: $('#cad-nome').value.trim(),
        email: $('#cad-email').value.trim(),
        telefone: $('#cad-telefone').value.trim(),
        data_nascimento: $('#cad-nascimento').value,
        senha: $('#cad-senha').value,
      },
    });
    e.target.reset();
    await iniciarApp(dados);
    showToast('Conta criada com sucesso!', 'success');
  });
});

$('#form-esqueci').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('#esq-email').value.trim();
  comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
    await api('/auth/esqueci-senha', { metodo: 'POST', corpo: { email } });
    $('#esq-email-enviado').textContent = email;
    $('#esqueci-pedido').classList.add('hidden');
    $('#esqueci-enviado').classList.remove('hidden');
  });
});

$('#esq-reenviar').addEventListener('click', (e) => {
  e.preventDefault();
  $('#esqueci-pedido').classList.remove('hidden');
  $('#esqueci-enviado').classList.add('hidden');
});

$('#form-redefinir').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('#red-senha').value !== $('#red-senha2').value) {
    showToast('As senhas não coincidem.', 'error');
    return;
  }
  comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
    const dados = await api('/auth/redefinir-senha', {
      metodo: 'POST',
      corpo: { token: state.tokenRedefinicao, senha: $('#red-senha').value },
    });
    state.tokenRedefinicao = null;
    e.target.reset();
    await iniciarApp(dados);
    showToast('Senha alterada com sucesso!', 'success');
  });
});

/* ==========================================================
   PROFISSIONAIS (cartões e perfil completo)
========================================================== */
async function carregarProfissionais() {
  state.profissionais = await api('/profissionais');
  if (state.profissionalSelecionado) {
    state.profissionalSelecionado = state.profissionais
      .find((p) => p.id === state.profissionalSelecionado.id) || null;
  }
}

function cardProfissionalHTML(p, selecionado = false) {
  return `
    <div class="prof-card clicavel${selecionado ? ' selected' : ''}" data-id="${p.id}" tabindex="0" role="button"
         aria-pressed="${selecionado}">
      <div class="prof-topo">
        ${avatarHTML(p, 'lg')}
        <div>
          <h4>${esc(p.nome)}</h4>
          <div class="esp">${esc(p.especialidade)}</div>
        </div>
      </div>
      <p class="desc">${esc(p.descricao || 'Profissional da nossa equipe.')}</p>
      <div class="prof-rodape">
        ${diasHTML(p.dias_atendimento)}
        <button type="button" class="btn-perfil" data-perfil="${p.id}">Ver perfil</button>
      </div>
    </div>`;
}

function perfilDetalhadoHTML(p) {
  const formacao = String(p.formacao || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return `
    <div class="perfil-det-topo">
      ${avatarHTML(p, 'xl')}
      <div>
        <h3>${esc(p.nome || 'Seu nome')}</h3>
        <div class="esp">${esc(p.especialidade || 'Especialidade')}</div>
        ${p.registro ? `<div class="registro">${icone('badge')} ${esc(p.registro)}</div>` : ''}
      </div>
    </div>
    ${p.descricao ? `<p class="perfil-det-desc">“${esc(p.descricao)}”</p>` : ''}
    <div class="perfil-det-secao">
      <h4>${icone('user')} Sobre</h4>
      <p>${esc(p.sobre || 'Este profissional ainda não escreveu uma apresentação.')}</p>
    </div>
    ${formacao.length ? `
      <div class="perfil-det-secao">
        <h4>${icone('cap')} Formação</h4>
        <ul>${formacao.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      </div>` : ''}
    <div class="perfil-det-secao">
      <h4>${icone('calendar')} Dias de atendimento</h4>
      <p>${esc(diasPorExtenso(p.dias_atendimento) || 'Nenhum dia definido')} · 8h às 18h</p>
    </div>`;
}

function abrirPerfilProfissional(id) {
  const p = state.profissionais.find((x) => x.id === id);
  if (!p) return;
  abrirModal(`
    <button class="btn-icone modal-fechar" data-fechar aria-label="Fechar">${icone('x')}</button>
    ${perfilDetalhadoHTML(p)}
    <div class="modal-acoes">
      <button class="btn btn-primary btn-lg" data-agendar-com="${p.id}">
        ${icone('calendar-plus')} Agendar consulta
      </button>
    </div>`, { largo: true });
}

$('#modal').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-agendar-com]');
  if (!btn) return;
  fecharModal(false);
  selecionarProfissional(Number(btn.dataset.agendarCom));
  irPara('agendar');
});

/** Liga cliques/teclado de uma lista de cartões de profissionais. */
function ligarCartoes(container, aoEscolher) {
  container.addEventListener('click', (e) => {
    const perfil = e.target.closest('[data-perfil]');
    if (perfil) {
      abrirPerfilProfissional(Number(perfil.dataset.perfil));
      return;
    }
    const card = e.target.closest('.prof-card');
    if (card) aoEscolher(Number(card.dataset.id));
  });
  container.addEventListener('keydown', (e) => {
    const card = e.target.closest('.prof-card');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      aoEscolher(Number(card.dataset.id));
    }
  });
}

/* ==========================================================
   PACIENTE — INÍCIO
========================================================== */
async function carregarInicio() {
  $('#hero-nome').textContent = nomeCurto(state.usuario.nome);
  $('#hero-data').textContent = fmtDataLonga(hojeISO());

  const [resumo] = await Promise.all([api('/resumo'), carregarProfissionais()]);
  $('#stat-prof').textContent = resumo.profissionais;
  $('#stat-consultas').textContent = resumo.proximas;

  const c = resumo.proxima;
  $('#hero-proxima').innerHTML = c
    ? `
      <span class="rotulo">Sua próxima consulta</span>
      <h3>${esc(c.profissional_nome)}</h3>
      <div class="esp">${esc(c.especialidade)}</div>
      <div class="quando">
        <span>${icone('calendar')} ${esc(fmtDataLonga(c.data))}</span>
        <span>${icone('clock')} ${esc(c.horario)}</span>
      </div>`
    : `
      <span class="rotulo">Sua próxima consulta</span>
      <p class="vazio">Você não tem consultas marcadas. Que tal agendar um check-up?</p>`;

  const lista = state.profissionais.slice(0, 4);
  $('#inicio-profissionais').innerHTML = lista.length
    ? lista.map((p) => cardProfissionalHTML(p)).join('')
    : vazioHTML('stethoscope', 'Nenhum profissional disponível no momento.');
}

ligarCartoes($('#inicio-profissionais'), (id) => {
  selecionarProfissional(id);
  irPara('agendar');
});

/* ==========================================================
   PACIENTE — AGENDAR
========================================================== */
async function abrirAgendar() {
  renderCalendario();
  atualizarResumo();
  await carregarProfissionais();
  renderFiltros();
  renderProfissionais();
  renderCalendario();
  carregarHorarios();
}

function renderFiltros() {
  const especialidades = [...new Set(state.profissionais.map((p) => p.especialidade))].sort();
  if (!especialidades.includes(state.filtroEspecialidade)) state.filtroEspecialidade = '';
  $('#filtro-especialidades').innerHTML = especialidades.length > 1
    ? ['', ...especialidades].map((e) => `
        <button type="button" class="chip${state.filtroEspecialidade === e ? ' active' : ''}" data-esp="${esc(e)}">
          ${esc(e || 'Todas')}
        </button>`).join('')
    : '';
}

$('#filtro-especialidades').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-esp]');
  if (!chip) return;
  state.filtroEspecialidade = chip.dataset.esp;
  renderFiltros();
  renderProfissionais();
});

$('#busca-prof').addEventListener('input', (e) => {
  state.busca = e.target.value;
  renderProfissionais();
});

function renderProfissionais() {
  const termo = normalizar(state.busca);
  const lista = state.profissionais.filter((p) => (
    (!state.filtroEspecialidade || p.especialidade === state.filtroEspecialidade)
    && (!termo || normalizar(`${p.nome} ${p.especialidade}`).includes(termo))
  ));

  const container = $('#profissionais-list');
  if (!state.profissionais.length) {
    container.innerHTML = vazioHTML('stethoscope', 'Nenhum profissional cadastrado ainda.');
    return;
  }
  container.innerHTML = lista.length
    ? lista.map((p) => cardProfissionalHTML(p, state.profissionalSelecionado?.id === p.id)).join('')
    : vazioHTML('search', 'Nenhum profissional encontrado.', 'Tente outro nome ou especialidade.');
}

ligarCartoes($('#profissionais-list'), selecionarProfissional);

function atendeNoDia(p, iso) {
  return String(p.dias_atendimento).includes(String(dataDeISO(iso).getDay()));
}

function selecionarProfissional(id) {
  const p = state.profissionais.find((x) => x.id === id);
  if (!p) return;
  state.profissionalSelecionado = p;
  state.horarioSelecionado = null;
  if (state.dataSelecionada && !atendeNoDia(p, state.dataSelecionada)) state.dataSelecionada = null;
  if ($('#page-agendar').classList.contains('active')) {
    renderProfissionais();
    renderCalendario();
    carregarHorarios();
  }
  atualizarResumo();
}

/* ---------- Calendário ---------- */
function renderCalendario() {
  const ano = state.mesAtual.getFullYear();
  const mes = state.mesAtual.getMonth();
  $('#cal-title').textContent = `${MESES[mes]} ${ano}`;

  const hoje = hojeISO();
  const limite = new Date();
  limite.setDate(limite.getDate() + DIAS_ANTECEDENCIA_MAX);
  const limiteISO = isoDe(limite);
  const p = state.profissionalSelecionado;

  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < primeiroDia; i++) html += '<div class="dia empty"></div>';

  for (let d = 1; d <= diasNoMes; d++) {
    const iso = `${ano}-${pad(mes + 1)}-${pad(d)}`;
    const desabilitado = iso < hoje || iso > limiteISO || (p && !atendeNoDia(p, iso));
    const classes = ['dia'];
    if (desabilitado) classes.push('disabled');
    if (iso === hoje) classes.push('today');
    if (iso === state.dataSelecionada) classes.push('selected');
    html += `<div class="${classes.join(' ')}" ${desabilitado ? '' : `data-data="${iso}" tabindex="0" role="button"`}>${d}</div>`;
  }
  $('#calendar-days').innerHTML = html;

  const mesHoje = inicioDoMes(new Date());
  $('#prev-month').disabled = state.mesAtual <= mesHoje;
  $('#next-month').disabled = state.mesAtual >= inicioDoMes(limite);

  $('#cal-legenda').textContent = p
    ? `${nomeCurto(p.nome)} atende: ${diasPorExtenso(p.dias_atendimento)}`
    : 'Escolha um profissional para ver os dias de atendimento.';
}

function escolherData(iso) {
  state.dataSelecionada = iso;
  state.horarioSelecionado = null;
  renderCalendario();
  carregarHorarios();
  atualizarResumo();
}

$('#calendar-days').addEventListener('click', (e) => {
  const dia = e.target.closest('[data-data]');
  if (dia) escolherData(dia.dataset.data);
});
$('#calendar-days').addEventListener('keydown', (e) => {
  const dia = e.target.closest('[data-data]');
  if (dia && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    escolherData(dia.dataset.data);
  }
});

$('#prev-month').addEventListener('click', () => {
  state.mesAtual = new Date(state.mesAtual.getFullYear(), state.mesAtual.getMonth() - 1, 1);
  renderCalendario();
});
$('#next-month').addEventListener('click', () => {
  state.mesAtual = new Date(state.mesAtual.getFullYear(), state.mesAtual.getMonth() + 1, 1);
  renderCalendario();
});

/* ---------- Horários ---------- */
let pedidoHorarios = 0;

async function carregarHorarios() {
  const container = $('#horarios-container');
  const p = state.profissionalSelecionado;
  const data = state.dataSelecionada;
  state.horarios = null;

  if (!p || !data) {
    container.innerHTML = vazioHTML('clock', 'Escolha o profissional e a data', 'Os horários livres aparecem aqui.');
    return;
  }

  container.innerHTML = carregandoHTML();
  const pedido = ++pedidoHorarios;
  try {
    const r = await api(`/profissionais/${p.id}/horarios?data=${data}`);
    if (pedido !== pedidoHorarios) return;
    state.horarios = r;
    renderHorarios();
  } catch (err) {
    if (pedido !== pedidoHorarios) return;
    container.innerHTML = vazioHTML('alert', 'Não foi possível carregar os horários.', err.message);
  }
}

function renderHorarios() {
  const container = $('#horarios-container');
  const r = state.horarios;
  if (!r.atende) {
    container.innerHTML = vazioHTML('calendar', 'Sem atendimento nesta data', r.motivo);
    return;
  }
  if (!r.horarios.some((h) => h.disponivel)) {
    container.innerHTML = vazioHTML('calendar', 'Agenda cheia neste dia', 'Escolha outra data para ver mais horários.');
    return;
  }

  const grupo = (titulo, lista) => (lista.length ? `
    <div class="horarios-grupo">
      <h4>${titulo}</h4>
      <div class="horarios-grid">
        ${lista.map((h) => `
          <button type="button" class="horario${h.disponivel ? '' : ' ocupado'}${state.horarioSelecionado === h.horario ? ' selected' : ''}"
            ${h.disponivel ? `data-horario="${h.horario}"` : 'disabled title="Horário indisponível"'}>${h.horario}</button>
        `).join('')}
      </div>
    </div>` : '');

  container.innerHTML = grupo('Manhã', r.horarios.filter((h) => h.horario < '12:00'))
    + grupo('Tarde', r.horarios.filter((h) => h.horario >= '12:00'));
}

$('#horarios-container').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-horario]');
  if (!btn) return;
  state.horarioSelecionado = btn.dataset.horario;
  renderHorarios();
  atualizarResumo();
});

/* ---------- Resumo e confirmação ---------- */
function atualizarResumo() {
  const p = state.profissionalSelecionado;
  const linha = (nomeIcone, rotulo, valor, vazio) => `
    <div class="resumo-linha ${valor ? 'ok' : 'vazio'}">
      <span class="resumo-icone">${icone(nomeIcone)}</span>
      <div><small>${rotulo}</small><strong>${esc(valor || vazio)}</strong></div>
    </div>`;

  $('#resumo-conteudo').innerHTML = (p
    ? `<div class="resumo-linha ok">${avatarHTML(p, 'sm')}<div><small>Profissional</small><strong>${esc(p.nome)}</strong><div class="muted pequeno">${esc(p.especialidade)}</div></div></div>`
    : linha('stethoscope', 'Profissional', '', 'Não selecionado'))
    + linha('calendar', 'Data', state.dataSelecionada ? fmtDataLonga(state.dataSelecionada) : '', 'Não selecionada')
    + linha('clock', 'Horário', state.horarioSelecionado, 'Não selecionado');

  $('#btn-agendar').disabled = !(p && state.dataSelecionada && state.horarioSelecionado);
}

$('#btn-agendar').addEventListener('click', (e) => {
  const p = state.profissionalSelecionado;
  const data = state.dataSelecionada;
  const horario = state.horarioSelecionado;
  if (!p || !data || !horario) return;

  comCarregamento(e.currentTarget, async () => {
    try {
      await api('/consultas', { metodo: 'POST', corpo: { profissional_id: p.id, data, horario } });
    } catch (err) {
      if (err.status === 409) carregarHorarios();
      throw err;
    }

    abrirModal(`
      <div class="modal-icone sucesso">${icone('check')}</div>
      <h3 class="modal-titulo">Consulta agendada!</h3>
      <p class="modal-texto">Tudo certo. Chegue com 15 minutos de antecedência.</p>
      <div class="detalhes">
        <div class="detalhe"><span>Profissional</span><strong>${esc(p.nome)}</strong></div>
        <div class="detalhe"><span>Especialidade</span><strong>${esc(p.especialidade)}</strong></div>
        <div class="detalhe"><span>Data</span><strong>${esc(fmtDataLonga(data))}</strong></div>
        <div class="detalhe"><span>Horário</span><strong>${esc(horario)}</strong></div>
        <div class="detalhe"><span>Paciente</span><strong>${esc(state.usuario.nome)}</strong></div>
      </div>
      <div class="modal-acoes">
        <button class="btn btn-secundario" data-fechar>Fechar</button>
        <a href="#consultas" class="btn btn-primary" data-fechar>Ver minhas consultas</a>
      </div>`);

    state.profissionalSelecionado = null;
    state.dataSelecionada = null;
    state.horarioSelecionado = null;
    renderProfissionais();
    renderCalendario();
    carregarHorarios();
    atualizarResumo();
  });
});

/* ==========================================================
   PACIENTE — MINHAS CONSULTAS
========================================================== */
async function carregarConsultas() {
  $('#consultas-list').innerHTML = carregandoHTML();
  state.consultas = await api('/consultas');
  renderConsultas();
}

function renderConsultas() {
  const hoje = hojeISO();
  const ehProxima = (c) => c.status === 'agendada' && c.data >= hoje;
  const lista = state.abaConsultas === 'proximas'
    ? state.consultas.filter(ehProxima).reverse()
    : state.consultas.filter((c) => !ehProxima(c));

  $$('#abas-consultas .aba').forEach((a) => a.classList.toggle('active', a.dataset.aba === state.abaConsultas));
  const container = $('#consultas-list');

  if (!lista.length) {
    container.innerHTML = state.abaConsultas === 'proximas'
      ? vazioHTML('calendar', 'Nenhuma consulta agendada', 'Quando você agendar, ela aparece aqui.',
        `<a href="#agendar" class="btn btn-primary">${icone('calendar-plus')} Agendar consulta</a>`)
      : vazioHTML('clipboard', 'Seu histórico está vazio', 'Consultas passadas e canceladas aparecem aqui.');
    return;
  }

  container.innerHTML = lista.map((c) => {
    const d = dataDeISO(c.data);
    const podeCancelar = ehProxima(c);
    return `
      <div class="consulta-card ${c.status}">
        <div class="consulta-data">
          <strong>${d.getDate()}</strong>
          <span>${MESES[d.getMonth()].slice(0, 3)}</span>
        </div>
        <div class="consulta-info">
          <h4>${esc(c.profissional_nome)}</h4>
          <div class="esp">${esc(c.especialidade)}</div>
          <div class="consulta-meta">
            <span>${icone('calendar')} ${esc(fmtDataLonga(c.data))}</span>
            <span>${icone('clock')} ${esc(c.horario)}</span>
            <span class="status status-${c.status}">${STATUS[c.status] || esc(c.status)}</span>
          </div>
        </div>
        ${podeCancelar ? `
          <div class="consulta-acoes">
            <button class="btn btn-perigo btn-sm" data-cancelar="${c.id}">${icone('x')} Cancelar</button>
          </div>` : ''}
      </div>`;
  }).join('');
}

$('#abas-consultas').addEventListener('click', (e) => {
  const aba = e.target.closest('[data-aba]');
  if (!aba) return;
  state.abaConsultas = aba.dataset.aba;
  renderConsultas();
});

$('#consultas-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cancelar]');
  if (!btn) return;
  const c = state.consultas.find((x) => x.id === Number(btn.dataset.cancelar));
  const ok = await confirmar({
    titulo: 'Cancelar consulta?',
    texto: `${c.profissional_nome} — ${fmtData(c.data)} às ${c.horario}. O horário ficará livre para outros pacientes.`,
    botao: 'Sim, cancelar',
    perigo: true,
  });
  if (!ok) return;
  await alterarStatus(c.id, 'cancelada', 'Consulta cancelada.');
  carregarConsultas();
});

async function alterarStatus(id, status, mensagem) {
  try {
    await api(`/consultas/${id}`, { metodo: 'PATCH', corpo: { status } });
    showToast(mensagem, 'success');
  } catch (err) {
    if (!err.silencioso) showToast(err.message, 'error');
  }
}

/* ==========================================================
   PROFISSIONAL — AGENDA
========================================================== */
async function carregarAgenda() {
  $('#agenda-nome').textContent = nomeCurto(state.usuario.nome);
  $('#agenda-subtitulo').textContent = `Hoje é ${fmtDataLonga(hojeISO()).toLowerCase()}. Esta é a sua agenda de atendimentos.`;
  $('#aviso-inativo').classList.toggle('hidden', !state.profissional || state.profissional.ativo);
  $$('#abas-agenda .aba').forEach((a) => a.classList.toggle('active', a.dataset.periodo === state.periodoAgenda));
  $('#agenda-list').innerHTML = carregandoHTML();

  const [resumo, lista] = await Promise.all([
    api('/resumo'),
    api(`/profissional/agenda?periodo=${state.periodoAgenda}`),
  ]);
  $('#ag-stat-hoje').textContent = resumo.hoje;
  $('#ag-stat-proximas').textContent = resumo.proximas;
  $('#ag-stat-concluidas').textContent = resumo.concluidas;
  renderAgenda(lista);
}

function renderAgenda(lista) {
  const container = $('#agenda-list');
  if (!lista.length) {
    const textos = {
      hoje: ['Nenhuma consulta hoje', 'Aproveite para organizar sua semana.'],
      proximas: ['Nenhuma consulta agendada', 'Quando um paciente agendar, ela aparece aqui.'],
      anteriores: ['Nenhuma consulta anterior', ''],
      todas: ['Nenhuma consulta ainda', ''],
    }[state.periodoAgenda];
    container.innerHTML = `<div class="card">${vazioHTML('calendar', ...textos)}</div>`;
    return;
  }

  const hoje = hojeISO();
  const grupos = [];
  lista.forEach((c) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.data === c.data) ultimo.itens.push(c);
    else grupos.push({ data: c.data, itens: [c] });
  });

  container.innerHTML = grupos.map((g) => `
    <div class="agenda-dia">
      <h3>${esc(fmtDataLonga(g.data))} ${g.data === hoje ? '<span class="hoje">Hoje</span>' : ''}</h3>
      <div class="agenda-itens">
        ${g.itens.map((c) => {
    const anos = idade(c.paciente_nascimento);
    return `
          <div class="agenda-item ${c.status}">
            <span class="agenda-hora">${esc(c.horario)}</span>
            <div class="agenda-paciente">
              ${avatarHTML({ nome: c.paciente_nome }, 'sm')}
              <div>
                <strong>${esc(c.paciente_nome)}</strong>
                <div class="contato">
                  ${c.paciente_telefone ? `<span>${icone('phone')} ${esc(c.paciente_telefone)}</span>` : ''}
                  <span>${icone('mail')} ${esc(c.paciente_email)}</span>
                  ${anos !== null ? `<span>${anos} anos</span>` : ''}
                </div>
              </div>
            </div>
            <span class="status status-${c.status}">${STATUS[c.status] || esc(c.status)}</span>
            ${c.status === 'agendada' ? `
              <div class="consulta-acoes">
                <button class="btn btn-sucesso btn-sm" data-concluir="${c.id}">${icone('check')} Concluir</button>
                <button class="btn btn-perigo btn-sm" data-cancelar-ag="${c.id}" data-info="${esc(`${c.paciente_nome} — ${fmtData(c.data)} às ${c.horario}`)}">${icone('x')} Cancelar</button>
              </div>` : ''}
          </div>`;
  }).join('')}
      </div>
    </div>`).join('');
}

$('#abas-agenda').addEventListener('click', (e) => {
  const aba = e.target.closest('[data-periodo]');
  if (!aba) return;
  state.periodoAgenda = aba.dataset.periodo;
  carregarAgenda().catch((err) => { if (!err.silencioso) showToast(err.message, 'error'); });
});

$('#agenda-list').addEventListener('click', async (e) => {
  const concluir = e.target.closest('[data-concluir]');
  const cancelar = e.target.closest('[data-cancelar-ag]');
  if (concluir) {
    await alterarStatus(Number(concluir.dataset.concluir), 'concluida', 'Consulta marcada como concluída.');
  } else if (cancelar) {
    const ok = await confirmar({
      titulo: 'Cancelar esta consulta?',
      texto: `${cancelar.dataset.info}. Avise o paciente sobre o cancelamento.`,
      botao: 'Sim, cancelar',
      perigo: true,
    });
    if (!ok) return;
    await alterarStatus(Number(cancelar.dataset.cancelarAg), 'cancelada', 'Consulta cancelada.');
  } else {
    return;
  }
  carregarAgenda().catch((err) => { if (!err.silencioso) showToast(err.message, 'error'); });
});

/* ==========================================================
   PROFISSIONAL — PERFIL PÚBLICO
========================================================== */
$('#pp-dias').innerHTML = ORDEM_DIAS.map((d) => `
  <label class="dia-check">
    <input type="checkbox" value="${d}"/>
    <span>${DIAS_CURTOS[d]}</span>
  </label>`).join('');

function lerFormPerfil() {
  return {
    nome: $('#pp-nome').value.trim(),
    especialidade: $('#pp-especialidade').value.trim(),
    registro: $('#pp-registro').value.trim(),
    foto: $('#pp-foto').value.trim(),
    descricao: $('#pp-descricao').value.trim(),
    sobre: $('#pp-sobre').value.trim(),
    formacao: $('#pp-formacao').value.trim(),
    dias_atendimento: [...$$('#pp-dias input:checked')].map((i) => i.value).sort().join(''),
  };
}

function renderPreviewPerfil() {
  const dados = lerFormPerfil();
  if (!/^https?:\/\//i.test(dados.foto)) dados.foto = '';
  $('#pp-preview').innerHTML = `
    <div class="profissionais-grid" style="grid-template-columns:1fr;margin-bottom:1rem">
      ${cardProfissionalHTML({ ...dados, id: 0, nome: dados.nome || 'Seu nome', especialidade: dados.especialidade || 'Especialidade' })}
    </div>
    <div class="card preview-card">${perfilDetalhadoHTML(dados)}</div>`;
}

function abrirPerfilPublico() {
  const p = state.profissional || {};
  $('#pp-nome').value = state.usuario.nome || '';
  $('#pp-especialidade').value = p.especialidade || '';
  $('#pp-registro').value = p.registro || '';
  $('#pp-foto').value = p.foto || '';
  $('#pp-descricao').value = p.descricao || '';
  $('#pp-sobre').value = p.sobre || '';
  $('#pp-formacao').value = p.formacao || '';
  $$('#pp-dias input').forEach((i) => { i.checked = String(p.dias_atendimento || '').includes(i.value); });
  renderPreviewPerfil();
}

$('#form-perfil-prof').addEventListener('input', renderPreviewPerfil);
$('#form-perfil-prof').addEventListener('change', renderPreviewPerfil);

$('#form-perfil-prof').addEventListener('submit', (e) => {
  e.preventDefault();
  const dados = lerFormPerfil();
  if (!dados.dias_atendimento) {
    showToast('Selecione pelo menos um dia de atendimento.', 'error');
    return;
  }
  comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
    const atualizado = await api('/profissional/perfil', { metodo: 'PUT', corpo: dados });
    state.profissional = { ...state.profissional, ...atualizado };
    state.usuario.nome = atualizado.nome;
    atualizarCabecalho();
    abrirPerfilPublico();
    showToast('Perfil atualizado! Os pacientes já veem as mudanças.', 'success');
  });
});

/* ==========================================================
   ADMIN — PROFISSIONAIS
========================================================== */
async function carregarAdmin() {
  $('#admin-prof-list').innerHTML = carregandoHTML();
  const [resumo, lista] = await Promise.all([api('/resumo'), api('/admin/profissionais')]);
  $('#adm-stat-prof').textContent = resumo.profissionais;
  $('#adm-stat-pacientes').textContent = resumo.pacientes;
  $('#adm-stat-agendadas').textContent = resumo.agendadas;

  if (!lista.length) {
    $('#admin-prof-list').innerHTML = vazioHTML('stethoscope', 'Nenhum profissional cadastrado',
      'Cadastre o primeiro profissional para liberar os agendamentos.',
      `<button class="btn btn-primary" data-novo-prof>${icone('plus')} Novo profissional</button>`);
    return;
  }

  $('#admin-prof-list').innerHTML = `
    <table class="tabela">
      <thead>
        <tr><th>Profissional</th><th>Especialidade</th><th>Registro</th><th>Atende</th><th class="direita">Visível para pacientes</th></tr>
      </thead>
      <tbody>
        ${lista.map((p) => `
          <tr>
            <td>
              <div class="pessoa">
                ${avatarHTML(p)}
                <div><strong>${esc(p.nome)}</strong><span>${esc(p.email)}</span></div>
              </div>
            </td>
            <td data-rotulo="Especialidade">${esc(p.especialidade)}</td>
            <td data-rotulo="Registro">${esc(p.registro || '—')}</td>
            <td>${diasHTML(p.dias_atendimento)}</td>
            <td class="direita">
              <label class="interruptor">
                <span>${p.ativo ? 'Ativo' : 'Inativo'}</span>
                <input type="checkbox" data-ativo="${p.id}" ${p.ativo ? 'checked' : ''}/>
                <span class="trilho"></span>
              </label>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

$('#admin-prof-list').addEventListener('change', async (e) => {
  const input = e.target.closest('[data-ativo]');
  if (!input) return;
  const ativo = input.checked;
  input.disabled = true;
  try {
    await api(`/admin/profissionais/${input.dataset.ativo}`, { metodo: 'PATCH', corpo: { ativo } });
    showToast(ativo ? 'Profissional ativado.' : 'Profissional desativado — não aparece mais para agendamento.', 'success');
    carregarAdmin();
  } catch (err) {
    input.checked = !ativo;
    input.disabled = false;
    if (!err.silencioso) showToast(err.message, 'error');
  }
});

function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => letras[b % letras.length]).join('');
}

function abrirNovoProfissional() {
  abrirModal(`
    <button class="btn-icone modal-fechar" data-fechar aria-label="Fechar">${icone('x')}</button>
    <h3 class="form-titulo">Novo profissional</h3>
    <p class="form-sub">O profissional poderá entrar no sistema, ver a agenda e completar o próprio perfil.</p>
    <form id="form-novo-prof">
      <div class="campo">
        <label for="np-nome">Nome de exibição</label>
        <div class="campo-input sem-icone"><input id="np-nome" required maxlength="120" placeholder="Ex.: Dra. Ana Lima"/></div>
      </div>
      <div class="grade-2">
        <div class="campo">
          <label for="np-especialidade">Especialidade</label>
          <div class="campo-input sem-icone"><input id="np-especialidade" required maxlength="80" placeholder="Ex.: Cardiologia"/></div>
        </div>
        <div class="campo">
          <label for="np-registro">Registro <span class="opcional">(CRM, CRP...)</span></label>
          <div class="campo-input sem-icone"><input id="np-registro" maxlength="40" placeholder="Ex.: CRM 12345-SP"/></div>
        </div>
      </div>
      <div class="grade-2">
        <div class="campo">
          <label for="np-email">E-mail de acesso</label>
          <div class="campo-input sem-icone"><input type="email" id="np-email" required placeholder="nome@clinica.com"/></div>
        </div>
        <div class="campo">
          <label for="np-telefone">Telefone <span class="opcional">(opcional)</span></label>
          <div class="campo-input sem-icone"><input type="tel" id="np-telefone" placeholder="(00) 00000-0000"/></div>
        </div>
      </div>
      <div class="campo">
        <label for="np-senha">Senha provisória</label>
        <div class="senha-gerada">
          <div class="campo-input sem-icone"><input id="np-senha" required minlength="6" value="${gerarSenha()}"/></div>
          <button type="button" class="btn btn-secundario" id="np-gerar">Gerar outra</button>
        </div>
      </div>
      <div class="modal-acoes">
        <button type="button" class="btn btn-secundario" data-fechar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Cadastrar profissional</button>
      </div>
    </form>`, { largo: true });

  $('#np-gerar').addEventListener('click', () => { $('#np-senha').value = gerarSenha(); });
  $('#form-novo-prof').addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = {
      nome: $('#np-nome').value.trim(),
      especialidade: $('#np-especialidade').value.trim(),
      registro: $('#np-registro').value.trim(),
      email: $('#np-email').value.trim(),
      telefone: $('#np-telefone').value.trim(),
      senha: $('#np-senha').value,
    };
    comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
      await api('/admin/profissionais', { metodo: 'POST', corpo: dados });
      abrirModal(`
        <div class="modal-icone sucesso">${icone('check')}</div>
        <h3 class="modal-titulo">Profissional cadastrado!</h3>
        <p class="modal-texto">Envie os dados de acesso abaixo para ${esc(nomeCurto(dados.nome))}. A senha pode ser trocada depois em “Minha conta”.</p>
        <div class="detalhes">
          <div class="detalhe"><span>Endereço</span><strong>${esc(location.origin)}</strong></div>
          <div class="detalhe"><span>E-mail</span><strong>${esc(dados.email.toLowerCase())}</strong></div>
          <div class="detalhe"><span>Senha provisória</span><strong>${esc(dados.senha)}</strong></div>
        </div>
        <div class="modal-acoes"><button class="btn btn-primary" data-fechar>Pronto</button></div>`);
      carregarAdmin();
    });
  });
}

$('#btn-novo-prof').addEventListener('click', abrirNovoProfissional);
$('#admin-prof-list').addEventListener('click', (e) => {
  if (e.target.closest('[data-novo-prof]')) abrirNovoProfissional();
});

/* ==========================================================
   MINHA CONTA (todos)
========================================================== */
function preencherConta() {
  const u = state.usuario;
  $('#conta-avatar').outerHTML = avatarHTML({ nome: u.nome, foto: state.profissional?.foto }, 'xl')
    .replace('<span class="avatar', '<span id="conta-avatar" class="avatar');
  $('#conta-nome').textContent = u.nome;
  $('#conta-email').textContent = u.email;
  $('#conta-tipo').textContent = TIPOS[u.tipo];
  $('#conta-cadastro').textContent = u.data_cadastro
    ? `Cadastro em ${new Date(u.data_cadastro).toLocaleDateString('pt-BR')}`
    : '';
  $('#conta-in-nome').value = u.nome || '';
  $('#conta-in-telefone').value = u.telefone || '';
  $('#conta-in-nascimento').value = u.data_nascimento || '';
}

$('#form-conta').addEventListener('submit', (e) => {
  e.preventDefault();
  comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
    const dados = await api('/auth/eu', {
      metodo: 'PUT',
      corpo: {
        nome: $('#conta-in-nome').value.trim(),
        telefone: $('#conta-in-telefone').value.trim(),
        data_nascimento: $('#conta-in-nascimento').value,
      },
    });
    state.usuario = dados.usuario;
    atualizarCabecalho();
    preencherConta();
    showToast('Dados atualizados!', 'success');
  });
});

$('#form-senha').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('#senha-nova').value !== $('#senha-nova2').value) {
    showToast('As senhas novas não coincidem.', 'error');
    return;
  }
  comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
    await api('/auth/senha', {
      metodo: 'PUT',
      corpo: { senha_atual: $('#senha-atual').value, nova_senha: $('#senha-nova').value },
    });
    e.target.reset();
    showToast('Senha alterada com sucesso!', 'success');
  });
});

/* ==========================================================
   INÍCIO
========================================================== */
(async function iniciar() {
  aprimorarCamposSenha();
  atualizarResumo();

  // Link de "esqueci minha senha" recebido por e-mail: /?redefinir=TOKEN
  const token = new URLSearchParams(location.search).get('redefinir');
  if (token) {
    state.tokenRedefinicao = token;
    history.replaceState(null, '', location.pathname);
    mostrarTela('auth');
    mostrarFormAuth('redefinir');
    return;
  }

  try {
    const dados = await api('/auth/eu');
    if (dados.usuario) {
      await iniciarApp(dados);
      return;
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
  mostrarTela('auth');
  mostrarFormAuth('login');
}());
