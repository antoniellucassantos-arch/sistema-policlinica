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
  config: { ...RegrasAgenda.CONFIG_PADRAO },
  bloqueiosProf: [], // datas bloqueadas do profissional escolhido no agendamento
  pacienteSelecionado: null, // recepção agendando em nome de alguém
  motivo: RegrasAgenda.MOTIVOS[0],
  pagamento: 'particular',
  convenio: '',
  diaAgenda: null, // agenda geral da equipe
  filtroAgendaProf: '',
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // segunda a domingo

const TIPOS = {
  paciente: 'Paciente', profissional: 'Profissional', recepcao: 'Recepção', admin: 'Administrador',
};
const STATUS = {
  agendada: 'Agendada', concluida: 'Concluída', cancelada: 'Cancelada', faltou: 'Faltou',
};
const EQUIPE = ['admin', 'recepcao'];
const ehEquipe = () => EQUIPE.includes(state.usuario?.tipo);

const CONTA = { id: 'conta', rotulo: 'Minha conta', icone: 'user', soCelular: true };

// "Minha conta" fica no nome do usuário (canto superior); no celular aparece no menu.
const MENUS = {
  paciente: [
    { id: 'inicio', rotulo: 'Início', icone: 'home' },
    { id: 'agendar', rotulo: 'Agendar consulta', icone: 'calendar-plus' },
    { id: 'consultas', rotulo: 'Minhas consultas', icone: 'clipboard' },
    CONTA,
  ],
  profissional: [
    { id: 'agenda', rotulo: 'Minha agenda', icone: 'calendar' },
    { id: 'bloqueios', rotulo: 'Folgas e bloqueios', icone: 'lock' },
    { id: 'perfil-publico', rotulo: 'Perfil e horários', icone: 'stethoscope' },
    CONTA,
  ],
  recepcao: [
    { id: 'agenda-geral', rotulo: 'Agenda', icone: 'calendar' },
    { id: 'agendar', rotulo: 'Agendar', icone: 'calendar-plus' },
    { id: 'bloqueios', rotulo: 'Bloqueios', icone: 'lock' },
    CONTA,
  ],
  admin: [
    { id: 'agenda-geral', rotulo: 'Agenda', icone: 'calendar' },
    { id: 'agendar', rotulo: 'Agendar', icone: 'calendar-plus' },
    { id: 'admin', rotulo: 'Equipe', icone: 'users' },
    { id: 'bloqueios', rotulo: 'Bloqueios', icone: 'lock' },
    { id: 'configuracoes', rotulo: 'Configurações', icone: 'shield' },
    CONTA,
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

async function api(caminho, opcoes = {}) {
  if (window.MODO_DEMO) return apiModoDemo(caminho, opcoes);
  return apiServidor(caminho, opcoes);
}

/** Modo demonstração (GitHub Pages): a "API" roda no próprio navegador, em demo.js. */
async function apiModoDemo(caminho, opcoes) {
  try {
    return await window.apiDemo(caminho, opcoes);
  } catch (err) {
    const erro = new Error(err.message || 'Algo deu errado. Tente novamente.');
    erro.status = err.status || 500;
    if (erro.status === 401 && state.usuario) {
      sessaoExpirada();
      erro.silencioso = true;
    }
    throw erro;
  }
}

async function apiServidor(caminho, { metodo = 'GET', corpo } = {}) {
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
    <a href="#${i.id}" class="nav-link${i.soCelular ? ' so-celular' : ''}" data-page="${i.id}">${icone(i.icone)} ${esc(i.rotulo)}</a>
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
    'agenda-geral': carregarAgendaGeral,
    bloqueios: carregarBloqueios,
    configuracoes: preencherConfiguracoes,
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
  state.pacienteSelecionado = null;
  atualizarCabecalho();
  montarMenu();
  try {
    state.config = await api('/configuracoes');
  } catch {
    // mantém o padrão
  }
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
    const r = await api('/auth/esqueci-senha', { metodo: 'POST', corpo: { email } });
    $('#esq-email-enviado').textContent = email;
    // Na demonstração não há e-mail: o link aparece na própria tela.
    $('#esq-link-demo').classList.toggle('hidden', !r.link_demo);
    if (r.link_demo) $('#esq-link-demo a').href = r.link_demo;
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
   FORMATAÇÃO DE AGENDA, VALORES E CONSULTAS
========================================================== */
function fmtValor(centavos) {
  if (centavos === null || centavos === undefined) return '';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDuracao(min) {
  return min >= 60 && min % 60 === 0 ? `${min / 60}h` : `${min} min`;
}

/** "08:00" → "8h"; "08:30" → "8h30" */
function fmtHora(h) {
  if (!h) return '';
  const [hh, mm] = h.split(':');
  return `${Number(hh)}h${mm === '00' ? '' : mm}`;
}

function expedienteTexto(p) {
  if (!p.hora_inicio) return '';
  const pausa = p.pausa_inicio && p.pausa_fim ? ` (pausa ${fmtHora(p.pausa_inicio)}–${fmtHora(p.pausa_fim)})` : '';
  return `${fmtHora(p.hora_inicio)} às ${fmtHora(p.hora_fim)}${pausa}`;
}

function pagamentoTexto(c) {
  if (c.pagamento === 'convenio') return `Convênio ${c.convenio || ''}`.trim();
  return c.valor !== null && c.valor !== undefined ? `Particular · ${fmtValor(c.valor)}` : 'Particular';
}

function agoraLocal() {
  const d = new Date();
  return { data: isoDe(d), hora: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** O paciente ainda está dentro do prazo para cancelar/remarcar pelo site? */
function pacientePodeAlterar(c) {
  const horas = state.config.prazo_cancelamento_horas;
  return !horas || RegrasAgenda.minutosAte(c.data, c.horario, agoraLocal()) >= horas * 60;
}

function limiteDeAgendamentoISO() {
  const d = new Date();
  d.setDate(d.getDate() + state.config.antecedencia_maxima_dias);
  return isoDe(d);
}

function tagsConsultaHTML(c) {
  const tags = [];
  if (c.motivo) tags.push(`<span class="tag">${esc(c.motivo)}</span>`);
  tags.push(`<span class="tag ${c.pagamento === 'convenio' ? 'convenio' : 'particular'}">${esc(pagamentoTexto(c))}</span>`);
  if (c.duracao) tags.push(`<span class="tag">${icone('clock')} ${fmtDuracao(c.duracao)}</span>`);
  return `
    <div class="consulta-extra">${tags.join('')}</div>
    ${c.observacao ? `<p class="observacao-texto">“${esc(c.observacao)}”</p>` : ''}`;
}

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

function precoResumo(p) {
  if (p.aceita_particular && p.valor_consulta !== null && p.valor_consulta !== undefined) return fmtValor(p.valor_consulta);
  if (!p.aceita_particular) return 'Só convênio';
  return '';
}

function cardProfissionalHTML(p, selecionado = false) {
  const meta = [p.duracao_consulta ? fmtDuracao(p.duracao_consulta) : '', precoResumo(p),
    (p.convenios || []).length ? `${p.convenios.length} convênio${p.convenios.length > 1 ? 's' : ''}` : '']
    .filter(Boolean);
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
      ${meta.length ? `<p class="prof-meta">${meta.map(esc).join(' · ')}</p>` : ''}
      <div class="prof-rodape">
        ${diasHTML(p.dias_atendimento)}
        <button type="button" class="btn-perfil" data-perfil="${p.id}">Ver perfil</button>
      </div>
    </div>`;
}

function perfilDetalhadoHTML(p) {
  const formacao = String(p.formacao || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const convenios = p.convenios || [];
  const valor = p.aceita_particular
    ? `Particular: ${p.valor_consulta !== null && p.valor_consulta !== undefined ? fmtValor(p.valor_consulta) : 'consulte a clínica'}`
    : 'Não atende consultas particulares';
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
      <h4>${icone('calendar')} Atendimento</h4>
      <p>${esc(diasPorExtenso(p.dias_atendimento) || 'Nenhum dia definido')} · ${esc(expedienteTexto(p))}<br/>
      Consultas de ${esc(fmtDuracao(p.duracao_consulta || 30))}</p>
    </div>
    <div class="perfil-det-secao">
      <h4>${icone('badge')} Valores e convênios</h4>
      <p>${esc(valor)}</p>
      ${convenios.length ? `<div class="consulta-extra">${convenios.map((c) => `<span class="tag convenio">${esc(c)}</span>`).join('')}</div>` : '<p class="muted pequeno">Não atende por convênio.</p>'}
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
    if (card && card.dataset.id !== '0') aoEscolher(Number(card.dataset.id));
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
  $('#stat-especialidades').textContent = new Set(state.profissionais.map((p) => p.especialidade)).size;

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
   AGENDAR (paciente para si; recepção em nome do paciente)
========================================================== */
async function abrirAgendar() {
  const equipe = ehEquipe();
  $('#agendar-titulo').textContent = equipe ? 'Novo agendamento' : 'Agendar consulta';
  $('#agendar-subtitulo').textContent = equipe
    ? 'Agende em nome de um paciente (por telefone ou no balcão).'
    : 'Escolha o profissional, a data e o horário que preferir.';
  $('#resumo-rodape').textContent = equipe
    ? 'A consulta aparece na agenda do profissional e na área do paciente.'
    : 'Você pode remarcar ou cancelar em “Minhas consultas”.';
  $('#passo-paciente').classList.toggle('hidden', !equipe);
  if (equipe) {
    renderPacienteEscolhido();
    if (!state.pacienteSelecionado) buscarPacientes('');
  }

  renderCalendario();
  renderMotivos();
  renderPagamento();
  atualizarResumo();
  await carregarProfissionais();
  if (state.profissionalSelecionado) await carregarBloqueiosDoProfissional();
  renderFiltros();
  renderProfissionais();
  renderCalendario();
  renderPagamento();
  carregarHorarios();
}

/* ---------- Passo "Paciente" (só equipe) ---------- */
let esperaBusca = null;
let pedidoPacientes = 0;

function descricaoPaciente(p) {
  return [p.telefone, p.email].filter(Boolean).join(' · ') || 'Sem contato cadastrado';
}

function renderPacienteEscolhido() {
  const p = state.pacienteSelecionado;
  $('#paciente-escolhido').classList.toggle('hidden', !p);
  $('#paciente-busca').classList.toggle('hidden', !!p);
  $('#paciente-escolhido').innerHTML = p ? `
    <div class="paciente-escolhido">
      ${avatarHTML(p)}
      <div><strong>${esc(p.nome)}</strong><span>${esc(descricaoPaciente(p))}</span></div>
      <button type="button" class="btn btn-secundario btn-sm" id="btn-trocar-paciente">Trocar</button>
    </div>` : '';
}

async function buscarPacientes(termo) {
  const pedido = ++pedidoPacientes;
  const container = $('#pacientes-resultado');
  try {
    const lista = await api(`/pacientes?busca=${encodeURIComponent(termo)}`);
    if (pedido !== pedidoPacientes) return;
    state.pacientesEncontrados = lista;
    container.innerHTML = lista.length
      ? lista.map((p) => `
          <button type="button" class="paciente-item" data-paciente="${p.id}">
            ${avatarHTML(p, 'sm')}
            <div><strong>${esc(p.nome)}</strong><span>${esc(descricaoPaciente(p))}</span></div>
          </button>`).join('')
      : `<p class="muted pequeno">${termo ? 'Nenhum paciente encontrado. Cadastre um novo abaixo.' : 'Nenhum paciente cadastrado ainda.'}</p>`;
  } catch (err) {
    if (!err.silencioso) container.innerHTML = `<p class="muted pequeno">${esc(err.message)}</p>`;
  }
}

$('#busca-paciente').addEventListener('input', (e) => {
  clearTimeout(esperaBusca);
  esperaBusca = setTimeout(() => buscarPacientes(e.target.value.trim()), 250);
});

$('#pacientes-resultado').addEventListener('click', (e) => {
  const item = e.target.closest('[data-paciente]');
  if (!item) return;
  state.pacienteSelecionado = state.pacientesEncontrados.find((p) => p.id === Number(item.dataset.paciente));
  renderPacienteEscolhido();
  atualizarResumo();
});

$('#paciente-escolhido').addEventListener('click', (e) => {
  if (!e.target.closest('#btn-trocar-paciente')) return;
  state.pacienteSelecionado = null;
  renderPacienteEscolhido();
  atualizarResumo();
  $('#busca-paciente').focus();
});

$('#btn-novo-paciente').addEventListener('click', () => {
  const termo = $('#busca-paciente').value.trim();
  abrirModal(`
    <button class="btn-icone modal-fechar" data-fechar aria-label="Fechar">${icone('x')}</button>
    <h3 class="form-titulo">Novo paciente</h3>
    <p class="form-sub">Com e-mail, o paciente pode criar a senha depois em “Esqueci minha senha” e receber lembretes.</p>
    <form id="form-novo-paciente">
      <div class="campo">
        <label for="npac-nome">Nome completo</label>
        <div class="campo-input sem-icone"><input id="npac-nome" required maxlength="120" value="${esc(/\d|@/.test(termo) ? '' : termo)}"/></div>
      </div>
      <div class="grade-2">
        <div class="campo">
          <label for="npac-telefone">Telefone</label>
          <div class="campo-input sem-icone"><input type="tel" id="npac-telefone" placeholder="(00) 00000-0000"/></div>
        </div>
        <div class="campo">
          <label for="npac-nascimento">Nascimento <span class="opcional">(opcional)</span></label>
          <div class="campo-input sem-icone"><input type="date" id="npac-nascimento"/></div>
        </div>
      </div>
      <div class="campo">
        <label for="npac-email">E-mail <span class="opcional">(opcional)</span></label>
        <div class="campo-input sem-icone"><input type="email" id="npac-email" placeholder="paciente@email.com"/></div>
      </div>
      <div class="modal-acoes">
        <button type="button" class="btn btn-secundario" data-fechar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Cadastrar e selecionar</button>
      </div>
    </form>`);
  $('#form-novo-paciente').addEventListener('submit', (ev) => {
    ev.preventDefault();
    comCarregamento(ev.target.querySelector('button[type=submit]'), async () => {
      const paciente = await api('/pacientes', {
        metodo: 'POST',
        corpo: {
          nome: $('#npac-nome').value.trim(),
          telefone: $('#npac-telefone').value.trim(),
          email: $('#npac-email').value.trim(),
          data_nascimento: $('#npac-nascimento').value,
        },
      });
      fecharModal(false);
      state.pacienteSelecionado = paciente;
      renderPacienteEscolhido();
      atualizarResumo();
      showToast('Paciente cadastrado.', 'success');
    });
  });
});

/* ---------- Passo "Profissional" ---------- */
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

function diaDisponivel(p, iso) {
  return String(p.dias_atendimento).includes(String(dataDeISO(iso).getDay()))
    && !RegrasAgenda.bloqueioDoDia(state.bloqueiosProf, iso);
}

async function carregarBloqueiosDoProfissional() {
  const p = state.profissionalSelecionado;
  state.bloqueiosProf = [];
  if (!p) return;
  try {
    const lista = await api(`/profissionais/${p.id}/bloqueios`);
    if (state.profissionalSelecionado?.id === p.id) state.bloqueiosProf = lista;
  } catch {
    // sem bloqueios conhecidos; o servidor confere de novo ao agendar
  }
}

function pagamentoPadrao(p) {
  if (p.aceita_particular) return { pagamento: 'particular', convenio: '' };
  return { pagamento: 'convenio', convenio: p.convenios[0] || '' };
}

async function selecionarProfissional(id) {
  const p = state.profissionais.find((x) => x.id === id);
  if (!p) return;
  state.profissionalSelecionado = p;
  state.horarioSelecionado = null;
  Object.assign(state, pagamentoPadrao(p));
  await carregarBloqueiosDoProfissional();
  if (state.dataSelecionada && !diaDisponivel(p, state.dataSelecionada)) state.dataSelecionada = null;
  if ($('#page-agendar').classList.contains('active')) {
    renderProfissionais();
    renderCalendario();
    renderPagamento();
    carregarHorarios();
  }
  atualizarResumo();
}

/* ---------- Passo "Data" ---------- */
function renderCalendario() {
  const ano = state.mesAtual.getFullYear();
  const mes = state.mesAtual.getMonth();
  $('#cal-title').textContent = `${MESES[mes]} ${ano}`;

  const hoje = hojeISO();
  const limiteISO = limiteDeAgendamentoISO();
  const p = state.profissionalSelecionado;

  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < primeiroDia; i++) html += '<div class="dia empty"></div>';

  for (let d = 1; d <= diasNoMes; d++) {
    const iso = `${ano}-${pad(mes + 1)}-${pad(d)}`;
    const desabilitado = iso < hoje || iso > limiteISO || (p && !diaDisponivel(p, iso));
    const classes = ['dia'];
    if (desabilitado) classes.push('disabled');
    if (iso === hoje) classes.push('today');
    if (iso === state.dataSelecionada) classes.push('selected');
    html += `<div class="${classes.join(' ')}" ${desabilitado ? '' : `data-data="${iso}" tabindex="0" role="button"`}>${d}</div>`;
  }
  $('#calendar-days').innerHTML = html;

  $('#prev-month').disabled = state.mesAtual <= inicioDoMes(new Date());
  $('#next-month').disabled = state.mesAtual >= inicioDoMes(dataDeISO(limiteISO));

  $('#cal-legenda').textContent = p
    ? `${nomeCurto(p.nome)} atende: ${diasPorExtenso(p.dias_atendimento)}, ${expedienteTexto(p)}`
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

/* ---------- Passo "Horário" ---------- */
let pedidoHorarios = 0;

/** Grade de horários (usada no agendamento e no "remarcar"). */
function gradeHorariosHTML(r, selecionado) {
  if (!r.atende) return vazioHTML('calendar', 'Sem atendimento nesta data', r.motivo);
  if (!r.horarios.some((h) => h.disponivel)) {
    return vazioHTML('calendar', 'Agenda cheia neste dia', 'Escolha outra data para ver mais horários.');
  }
  const grupo = (titulo, lista) => (lista.length ? `
    <div class="horarios-grupo">
      <h4>${titulo}</h4>
      <div class="horarios-grid">
        ${lista.map((h) => `
          <button type="button" class="horario${h.disponivel ? '' : ' ocupado'}${selecionado === h.horario ? ' selected' : ''}"
            ${h.disponivel ? `data-horario="${h.horario}"` : 'disabled title="Horário indisponível"'}>${h.horario}</button>
        `).join('')}
      </div>
    </div>` : '');
  return grupo('Manhã', r.horarios.filter((h) => h.horario < '12:00'))
    + grupo('Tarde', r.horarios.filter((h) => h.horario >= '12:00' && h.horario < '18:00'))
    + grupo('Noite', r.horarios.filter((h) => h.horario >= '18:00'));
}

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
  $('#horarios-container').innerHTML = gradeHorariosHTML(state.horarios, state.horarioSelecionado);
}

$('#horarios-container').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-horario]');
  if (!btn) return;
  state.horarioSelecionado = btn.dataset.horario;
  renderHorarios();
  atualizarResumo();
});

/* ---------- Passo "Detalhes" (motivo, pagamento, observação) ---------- */
function renderMotivos() {
  $('#motivos').innerHTML = RegrasAgenda.MOTIVOS.map((m) => `
    <button type="button" class="chip${state.motivo === m ? ' active' : ''}" data-motivo="${esc(m)}">${esc(m)}</button>
  `).join('');
}

$('#motivos').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-motivo]');
  if (!chip) return;
  state.motivo = chip.dataset.motivo;
  renderMotivos();
});

function renderPagamento() {
  const p = state.profissionalSelecionado;
  const container = $('#pagamento-opcoes');
  if (!p) {
    container.innerHTML = '<p class="muted pequeno">Escolha o profissional para ver valores e convênios.</p>';
    return;
  }
  const convenios = p.convenios || [];
  container.innerHTML = `
    <label class="pagamento-opcao${p.aceita_particular ? '' : ' indisponivel'}">
      <input type="radio" name="pagamento" value="particular" ${state.pagamento === 'particular' ? 'checked' : ''} ${p.aceita_particular ? '' : 'disabled'}/>
      <strong>Particular</strong>
      <span>${p.aceita_particular ? esc(fmtValor(p.valor_consulta) || 'Valor informado pela clínica') : 'Não atende particular'}</span>
    </label>
    <label class="pagamento-opcao${convenios.length ? '' : ' indisponivel'}">
      <input type="radio" name="pagamento" value="convenio" ${state.pagamento === 'convenio' ? 'checked' : ''} ${convenios.length ? '' : 'disabled'}/>
      <strong>Convênio</strong>
      <span>${convenios.length ? esc(convenios.join(', ')) : 'Não atende convênio'}</span>
      ${state.pagamento === 'convenio' && convenios.length ? `
        <select class="select" id="sel-convenio">
          ${convenios.map((c) => `<option ${c === state.convenio ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>` : ''}
    </label>`;
}

$('#pagamento-opcoes').addEventListener('change', (e) => {
  if (e.target.name === 'pagamento') {
    state.pagamento = e.target.value;
    if (state.pagamento === 'convenio' && !state.convenio) {
      [state.convenio] = state.profissionalSelecionado.convenios;
    }
    renderPagamento();
  } else if (e.target.id === 'sel-convenio') {
    state.convenio = e.target.value;
  }
  atualizarResumo();
});

/* ---------- Resumo e confirmação ---------- */
function atualizarResumo() {
  const p = state.profissionalSelecionado;
  const paciente = state.pacienteSelecionado;
  const equipe = ehEquipe();
  const linha = (nomeIcone, rotulo, valor, vazio) => `
    <div class="resumo-linha ${valor ? 'ok' : 'vazio'}">
      <span class="resumo-icone">${icone(nomeIcone)}</span>
      <div><small>${rotulo}</small><strong>${esc(valor || vazio)}</strong></div>
    </div>`;

  const pagamentoOk = p && (state.pagamento === 'particular' ? p.aceita_particular : !!state.convenio);
  const pagamento = p ? pagamentoTexto({
    pagamento: state.pagamento, convenio: state.convenio, valor: state.pagamento === 'particular' ? p.valor_consulta : null,
  }) : '';

  $('#resumo-conteudo').innerHTML = (equipe ? linha('user', 'Paciente', paciente?.nome, 'Não selecionado') : '')
    + (p
      ? `<div class="resumo-linha ok">${avatarHTML(p, 'sm')}<div><small>Profissional</small><strong>${esc(p.nome)}</strong><div class="muted pequeno">${esc(p.especialidade)}</div></div></div>`
      : linha('stethoscope', 'Profissional', '', 'Não selecionado'))
    + linha('calendar', 'Data', state.dataSelecionada ? fmtDataLonga(state.dataSelecionada) : '', 'Não selecionada')
    + linha('clock', 'Horário', state.horarioSelecionado
      ? `${state.horarioSelecionado} (${fmtDuracao(p?.duracao_consulta || 30)})` : '', 'Não selecionado')
    + linha('badge', 'Pagamento', pagamentoOk ? pagamento : '', 'Não definido');

  $('#btn-agendar').disabled = !(p && state.dataSelecionada && state.horarioSelecionado && pagamentoOk
    && (!equipe || paciente));
}

function limparAgendamento() {
  state.profissionalSelecionado = null;
  state.dataSelecionada = null;
  state.horarioSelecionado = null;
  state.pacienteSelecionado = null;
  state.bloqueiosProf = [];
  state.motivo = RegrasAgenda.MOTIVOS[0];
  $('#observacao').value = '';
  $('#busca-paciente').value = '';
}

$('#btn-agendar').addEventListener('click', (e) => {
  const p = state.profissionalSelecionado;
  const data = state.dataSelecionada;
  const horario = state.horarioSelecionado;
  const paciente = state.pacienteSelecionado;
  const equipe = ehEquipe();
  if (!p || !data || !horario) return;

  const corpo = {
    profissional_id: p.id,
    data,
    horario,
    motivo: state.motivo,
    observacao: $('#observacao').value.trim(),
    pagamento: state.pagamento,
    convenio: state.pagamento === 'convenio' ? state.convenio : '',
    paciente_id: equipe ? paciente?.id : undefined,
  };

  comCarregamento(e.currentTarget, async () => {
    try {
      await api('/consultas', { metodo: 'POST', corpo });
    } catch (err) {
      if (err.status === 409) carregarHorarios();
      throw err;
    }

    abrirModal(`
      <div class="modal-icone sucesso">${icone('check')}</div>
      <h3 class="modal-titulo">Consulta agendada!</h3>
      <p class="modal-texto">${equipe ? 'Avise o paciente: chegar com 15 minutos de antecedência.' : 'Tudo certo. Chegue com 15 minutos de antecedência.'}</p>
      <div class="detalhes">
        <div class="detalhe"><span>Paciente</span><strong>${esc(equipe ? paciente.nome : state.usuario.nome)}</strong></div>
        <div class="detalhe"><span>Profissional</span><strong>${esc(p.nome)}</strong></div>
        <div class="detalhe"><span>Data</span><strong>${esc(fmtDataLonga(data))}</strong></div>
        <div class="detalhe"><span>Horário</span><strong>${esc(horario)} (${esc(fmtDuracao(p.duracao_consulta))})</strong></div>
        <div class="detalhe"><span>Pagamento</span><strong>${esc(pagamentoTexto({ ...corpo, valor: corpo.pagamento === 'particular' ? p.valor_consulta : null }))}</strong></div>
      </div>
      <div class="modal-acoes">
        <button class="btn btn-secundario" data-fechar>${equipe ? 'Agendar outra' : 'Fechar'}</button>
        <a href="#${equipe ? 'agenda-geral' : 'consultas'}" class="btn btn-primary" data-fechar>${equipe ? 'Ver agenda' : 'Ver minhas consultas'}</a>
      </div>`);

    limparAgendamento();
    abrirAgendar();
  });
});

/* ==========================================================
   REMARCAR (paciente, profissional e equipe)
========================================================== */
function abrirReagendar(c, aoConcluir) {
  const hoje = hojeISO();
  const estado = { data: c.data >= hoje ? c.data : hoje, horario: null };

  abrirModal(`
    <button class="btn-icone modal-fechar" data-fechar aria-label="Fechar">${icone('x')}</button>
    <h3 class="form-titulo">Remarcar consulta</h3>
    <p class="form-sub">${esc(c.paciente_nome && ehEquipe() ? `${c.paciente_nome} com ` : '')}${esc(c.profissional_nome || 'o profissional')}
      · marcada para ${esc(fmtData(c.data))} às ${esc(c.horario)}</p>
    <div class="campo">
      <label for="rea-data">Nova data</label>
      <div class="campo-input sem-icone"><input type="date" id="rea-data" min="${hoje}" max="${limiteDeAgendamentoISO()}" value="${estado.data}"/></div>
    </div>
    <div id="rea-horarios"></div>
    <div class="modal-acoes">
      <button type="button" class="btn btn-secundario" data-fechar>Voltar</button>
      <button type="button" class="btn btn-primary" id="rea-confirmar" disabled>Confirmar nova data</button>
    </div>`, { largo: true });

  const carregar = async () => {
    estado.horario = null;
    $('#rea-confirmar').disabled = true;
    const container = $('#rea-horarios');
    if (!estado.data) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = carregandoHTML();
    try {
      const r = await api(`/profissionais/${c.profissional_id}/horarios?data=${estado.data}&ignorar=${c.id}`);
      estado.resposta = r;
      container.innerHTML = gradeHorariosHTML(r, null);
    } catch (err) {
      container.innerHTML = vazioHTML('alert', 'Não foi possível carregar os horários.', err.message);
    }
  };

  $('#rea-data').addEventListener('change', (e) => {
    estado.data = e.target.value;
    carregar();
  });
  $('#rea-horarios').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-horario]');
    if (!btn) return;
    estado.horario = btn.dataset.horario;
    $('#rea-horarios').innerHTML = gradeHorariosHTML(estado.resposta, estado.horario);
    $('#rea-confirmar').disabled = false;
  });
  $('#rea-confirmar').addEventListener('click', (e) => {
    comCarregamento(e.currentTarget, async () => {
      await api(`/consultas/${c.id}/reagendar`, {
        metodo: 'PATCH', corpo: { data: estado.data, horario: estado.horario },
      });
      fecharModal(false);
      showToast(`Consulta remarcada para ${fmtData(estado.data)} às ${estado.horario}.`, 'success');
      aoConcluir();
    });
  });
  carregar();
}

/* ==========================================================
   AÇÕES SOBRE CONSULTAS (concluir, faltou, cancelar, remarcar)
========================================================== */
async function alterarStatus(id, status, mensagem) {
  try {
    await api(`/consultas/${id}`, { metodo: 'PATCH', corpo: { status } });
    showToast(mensagem, 'success');
  } catch (err) {
    if (!err.silencioso) showToast(err.message, 'error');
  }
}

/** Botões de ação para quem gerencia a agenda (profissional / equipe). */
function acoesEquipeHTML(c) {
  if (c.status !== 'agendada') return '';
  return `
    <div class="consulta-acoes">
      <button class="btn btn-sucesso btn-sm" data-acao="concluida" data-id="${c.id}">${icone('check')} Concluir</button>
      <button class="btn btn-secundario btn-sm" data-acao="faltou" data-id="${c.id}">Faltou</button>
      <button class="btn btn-secundario btn-sm" data-acao="reagendar" data-id="${c.id}">Remarcar</button>
      <button class="btn btn-perigo btn-sm" data-acao="cancelada" data-id="${c.id}">${icone('x')} Cancelar</button>
    </div>`;
}

/** Trata os cliques nos botões de ação de uma lista de consultas. */
async function tratarAcaoConsulta(e, lista, recarregar) {
  const btn = e.target.closest('[data-acao]');
  if (!btn) return;
  const c = lista().find((x) => x.id === Number(btn.dataset.id));
  if (!c) return;
  const quem = c.paciente_nome && state.usuario.tipo !== 'paciente' ? c.paciente_nome : c.profissional_nome;
  const resumo = `${quem} — ${fmtData(c.data)} às ${c.horario}`;
  const acao = btn.dataset.acao;

  if (acao === 'reagendar') {
    abrirReagendar(c, recarregar);
    return;
  }
  if (acao === 'concluida') {
    await alterarStatus(c.id, 'concluida', 'Consulta marcada como concluída.');
  } else if (acao === 'faltou') {
    const ok = await confirmar({
      titulo: 'Registrar falta?', texto: `${resumo}. O paciente não compareceu.`, botao: 'Registrar falta', perigo: true,
    });
    if (!ok) return;
    await alterarStatus(c.id, 'faltou', 'Falta registrada.');
  } else if (acao === 'cancelada') {
    const ok = await confirmar({
      titulo: 'Cancelar consulta?',
      texto: `${resumo}. O horário ficará livre para outros pacientes.`,
      botao: 'Sim, cancelar',
      perigo: true,
    });
    if (!ok) return;
    await alterarStatus(c.id, 'cancelada', 'Consulta cancelada.');
  }
  recarregar();
}

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

  const prazo = state.config.prazo_cancelamento_horas;
  container.innerHTML = lista.map((c) => {
    const d = dataDeISO(c.data);
    let acoes = '';
    if (ehProxima(c)) {
      acoes = pacientePodeAlterar(c)
        ? `<div class="consulta-acoes">
            <button class="btn btn-secundario btn-sm" data-acao="reagendar" data-id="${c.id}">Remarcar</button>
            <button class="btn btn-perigo btn-sm" data-acao="cancelada" data-id="${c.id}">${icone('x')} Cancelar</button>
          </div>`
        : `<p class="prazo-aviso">Faltam menos de ${prazo}h para a consulta. Para remarcar ou cancelar, fale com a clínica.</p>`;
    }
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
          ${tagsConsultaHTML(c)}
        </div>
        ${acoes}
      </div>`;
  }).join('');
}

$('#abas-consultas').addEventListener('click', (e) => {
  const aba = e.target.closest('[data-aba]');
  if (!aba) return;
  state.abaConsultas = aba.dataset.aba;
  renderConsultas();
});

$('#consultas-list').addEventListener('click', (e) => {
  tratarAcaoConsulta(e, () => state.consultas, () => carregarConsultas().catch(() => {}));
});

/* ==========================================================
   PROFISSIONAL — AGENDA
========================================================== */
function itemAgendaHTML(c, { mostrarProfissional = false } = {}) {
  const anos = idade(c.paciente_nascimento);
  return `
    <div class="agenda-item ${c.status}">
      <span class="agenda-hora">${esc(c.horario)}</span>
      <div class="agenda-paciente">
        ${avatarHTML({ nome: c.paciente_nome }, 'sm')}
        <div>
          ${mostrarProfissional ? `<span class="agenda-prof">${esc(c.profissional_nome)} · ${esc(c.especialidade)}</span>` : ''}
          <strong>${esc(c.paciente_nome)}</strong>
          <div class="contato">
            ${c.paciente_telefone ? `<span>${icone('phone')} ${esc(c.paciente_telefone)}</span>` : ''}
            ${c.paciente_email ? `<span>${icone('mail')} ${esc(c.paciente_email)}</span>` : ''}
            ${anos !== null ? `<span>${anos} anos</span>` : ''}
          </div>
          ${tagsConsultaHTML(c)}
        </div>
      </div>
      <span class="status status-${c.status}">${STATUS[c.status] || esc(c.status)}</span>
      ${acoesEquipeHTML(c)}
    </div>`;
}

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
  $('#ag-stat-faltas').textContent = resumo.faltas;
  state.agenda = lista;
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
      <div class="agenda-itens">${g.itens.map((c) => itemAgendaHTML(c)).join('')}</div>
    </div>`).join('');
}

$('#abas-agenda').addEventListener('click', (e) => {
  const aba = e.target.closest('[data-periodo]');
  if (!aba) return;
  state.periodoAgenda = aba.dataset.periodo;
  carregarAgenda().catch((err) => { if (!err.silencioso) showToast(err.message, 'error'); });
});

$('#agenda-list').addEventListener('click', (e) => {
  tratarAcaoConsulta(e, () => state.agenda || [], () => carregarAgenda().catch(() => {}));
});

/* ==========================================================
   EQUIPE — AGENDA GERAL DA CLÍNICA
========================================================== */
async function carregarAgendaGeral() {
  state.diaAgenda = state.diaAgenda || hojeISO();
  $('#ag-dia').value = state.diaAgenda;
  $('#ag-dia-titulo').textContent = `${fmtDataLonga(state.diaAgenda)}${state.diaAgenda === hojeISO() ? ' · hoje' : ''}`;
  $('#agenda-geral-list').innerHTML = carregandoHTML();

  const filtro = state.filtroAgendaProf ? `&profissional_id=${state.filtroAgendaProf}` : '';
  const [resumo, lista] = await Promise.all([
    api('/resumo'),
    api(`/agenda?data=${state.diaAgenda}${filtro}`),
    state.profissionais.length ? null : carregarProfissionais(),
  ]);
  $('#eq-stat-hoje').textContent = resumo.hoje;
  $('#eq-stat-agendadas').textContent = resumo.agendadas;
  $('#eq-stat-pacientes').textContent = resumo.pacientes;

  $('#ag-filtro-prof').innerHTML = `<option value="">Todos os profissionais</option>${
    state.profissionais.map((p) => `<option value="${p.id}" ${String(p.id) === String(state.filtroAgendaProf) ? 'selected' : ''}>${esc(p.nome)} — ${esc(p.especialidade)}</option>`).join('')}`;

  state.agendaGeral = lista;
  $('#agenda-geral-list').innerHTML = lista.length
    ? `<div class="agenda-itens">${lista.map((c) => itemAgendaHTML(c, { mostrarProfissional: true })).join('')}</div>`
    : `<div class="card">${vazioHTML('calendar', 'Nenhuma consulta neste dia', 'Use “Novo agendamento” para marcar uma consulta.')}</div>`;
}

function mudarDiaAgenda(iso) {
  state.diaAgenda = iso;
  carregarAgendaGeral().catch((err) => { if (!err.silencioso) showToast(err.message, 'error'); });
}

$('#ag-dia-anterior').addEventListener('click', () => {
  const d = dataDeISO(state.diaAgenda);
  d.setDate(d.getDate() - 1);
  mudarDiaAgenda(isoDe(d));
});
$('#ag-dia-seguinte').addEventListener('click', () => {
  const d = dataDeISO(state.diaAgenda);
  d.setDate(d.getDate() + 1);
  mudarDiaAgenda(isoDe(d));
});
$('#ag-hoje').addEventListener('click', () => mudarDiaAgenda(hojeISO()));
$('#ag-dia').addEventListener('change', (e) => { if (e.target.value) mudarDiaAgenda(e.target.value); });
$('#ag-filtro-prof').addEventListener('change', (e) => {
  state.filtroAgendaProf = e.target.value;
  mudarDiaAgenda(state.diaAgenda);
});
$('#agenda-geral-list').addEventListener('click', (e) => {
  tratarAcaoConsulta(e, () => state.agendaGeral || [], () => carregarAgendaGeral().catch(() => {}));
});

/* ==========================================================
   BLOQUEIOS (folgas, férias, feriados)
========================================================== */
function periodoTexto(b) {
  if (b.data_inicio === b.data_fim) return fmtDataLonga(b.data_inicio);
  const ini = dataDeISO(b.data_inicio);
  const fim = dataDeISO(b.data_fim);
  const mesmoMes = ini.getMonth() === fim.getMonth() && ini.getFullYear() === fim.getFullYear();
  return mesmoMes
    ? `${ini.getDate()} a ${fim.getDate()} de ${MESES[fim.getMonth()].toLowerCase()}`
    : `${fmtData(b.data_inicio)} a ${fmtData(b.data_fim)}`;
}

async function carregarBloqueios() {
  const equipe = ehEquipe();
  $('#bloq-titulo').textContent = equipe ? 'Bloqueios de agenda' : 'Folgas e bloqueios';
  $('#bloq-subtitulo').textContent = equipe
    ? 'Feche a agenda de um profissional (férias, congresso) ou da clínica toda (feriados).'
    : 'Feche sua agenda em férias, congressos ou folgas. Os pacientes não conseguem marcar nesses dias.';
  $('#bloq-campo-prof').classList.toggle('hidden', !equipe);
  $('#bloq-inicio').min = hojeISO();
  $('#bloq-fim').min = hojeISO();
  $('#bloqueios-list').innerHTML = carregandoHTML();

  if (equipe) {
    if (!state.profissionais.length) await carregarProfissionais();
    const atual = $('#bloq-prof').value;
    $('#bloq-prof').innerHTML = `<option value="">Clínica toda (feriado, recesso)</option>${
      state.profissionais.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}`;
    $('#bloq-prof').value = atual;
  }

  const lista = await api('/bloqueios');
  state.bloqueios = lista;
  const meuId = state.profissional?.id;
  $('#bloqueios-list').innerHTML = lista.length
    ? lista.map((b) => {
      const daClinica = !b.profissional_id;
      const podeRemover = equipe || b.profissional_id === meuId;
      const dono = daClinica ? 'Clínica toda' : (equipe ? b.profissional_nome : 'Sua agenda');
      return `
        <div class="bloqueio-item${daClinica ? ' clinica' : ''}">
          <span class="bloqueio-icone">${icone('lock')}</span>
          <div>
            <strong>${esc(capitalizar(periodoTexto(b)))}</strong>
            <span>${esc([dono, b.motivo].filter(Boolean).join(' · '))}</span>
          </div>
          ${podeRemover
    ? `<button class="btn btn-fantasma btn-sm" data-remover-bloqueio="${b.id}">${icone('x')} Remover</button>`
    : '<span class="muted pequeno">Definido pela clínica</span>'}
        </div>`;
    }).join('')
    : `<div class="card">${vazioHTML('lock', 'Nenhum bloqueio programado', 'A agenda está aberta em todos os dias de atendimento.')}</div>`;
}

$('#bloq-inicio').addEventListener('change', (e) => {
  $('#bloq-fim').min = e.target.value;
  if (!$('#bloq-fim').value || $('#bloq-fim').value < e.target.value) $('#bloq-fim').value = e.target.value;
});

$('#form-bloqueio').addEventListener('submit', (e) => {
  e.preventDefault();
  comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
    const r = await api('/bloqueios', {
      metodo: 'POST',
      corpo: {
        profissional_id: ehEquipe() ? $('#bloq-prof').value || null : undefined,
        data_inicio: $('#bloq-inicio').value,
        data_fim: $('#bloq-fim').value || $('#bloq-inicio').value,
        motivo: $('#bloq-motivo').value.trim(),
      },
    });
    e.target.reset();
    await carregarBloqueios();
    if (r.consultas_afetadas > 0) {
      abrirModal(`
        <div class="modal-icone perigo">${icone('alert')}</div>
        <h3 class="modal-titulo">Datas bloqueadas</h3>
        <p class="modal-texto">Atenção: já existem <strong>${r.consultas_afetadas} consulta(s)</strong> marcada(s) nesse período.
        Elas <strong>não</strong> foram canceladas — remarque ou cancele pela agenda e avise os pacientes.</p>
        <div class="modal-acoes"><button class="btn btn-primary" data-fechar>Entendi</button></div>`);
    } else {
      showToast('Datas bloqueadas. Ninguém consegue agendar nesse período.', 'success');
    }
  });
});

$('#bloqueios-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remover-bloqueio]');
  if (!btn) return;
  const ok = await confirmar({
    titulo: 'Remover bloqueio?', texto: 'A agenda volta a aceitar consultas nessas datas.', botao: 'Remover', perigo: true,
  });
  if (!ok) return;
  try {
    await api(`/bloqueios/${btn.dataset.removerBloqueio}`, { metodo: 'DELETE' });
    showToast('Bloqueio removido.', 'success');
    carregarBloqueios();
  } catch (err) {
    if (!err.silencioso) showToast(err.message, 'error');
  }
});

/* ==========================================================
   PROFISSIONAL — PERFIL PÚBLICO E HORÁRIOS
========================================================== */
$('#pp-dias').innerHTML = ORDEM_DIAS.map((d) => `
  <label class="dia-check">
    <input type="checkbox" value="${d}"/>
    <span>${DIAS_CURTOS[d]}</span>
  </label>`).join('');

$('#pp-duracao').innerHTML = RegrasAgenda.DURACOES.map((d) => `<option value="${d}">${fmtDuracao(d)}</option>`).join('');

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
    hora_inicio: $('#pp-hora-inicio').value,
    hora_fim: $('#pp-hora-fim').value,
    pausa_inicio: $('#pp-pausa-inicio').value,
    pausa_fim: $('#pp-pausa-fim').value,
    duracao_consulta: Number($('#pp-duracao').value),
    valor_consulta: $('#pp-valor').value,
    aceita_particular: $('#pp-particular').checked,
    convenios: $('#pp-convenios').value,
  };
}

function renderPreviewPerfil() {
  const dados = lerFormPerfil();
  if (!/^https?:\/\//i.test(dados.foto)) dados.foto = '';
  const preview = {
    ...dados,
    convenios: RegrasAgenda.listaConvenios(dados.convenios),
    valor_consulta: dados.valor_consulta === '' ? null : Math.round(Number(dados.valor_consulta) * 100),
  };

  const erro = RegrasAgenda.validarExpediente(dados);
  const horarios = erro ? [] : RegrasAgenda.gerarHorarios(dados);
  $('#pp-qtd-horarios').textContent = erro ? '—' : `${horarios.length} consultas`;
  $('#pp-horarios-exemplo').textContent = erro || `Horários: ${horarios.join(', ')}`;
  $('#pp-horarios-exemplo').classList.toggle('erro-texto', !!erro);

  $('#pp-preview').innerHTML = `
    <div class="profissionais-grid" style="grid-template-columns:1fr;margin-bottom:1rem">
      ${cardProfissionalHTML({ ...preview, id: 0, nome: dados.nome || 'Seu nome', especialidade: dados.especialidade || 'Especialidade' })}
    </div>
    <div class="card preview-card">${perfilDetalhadoHTML(preview)}</div>`;
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
  $('#pp-hora-inicio').value = p.hora_inicio || '08:00';
  $('#pp-hora-fim').value = p.hora_fim || '18:00';
  $('#pp-pausa-inicio').value = p.pausa_inicio || '';
  $('#pp-pausa-fim').value = p.pausa_fim || '';
  $('#pp-duracao').value = String(p.duracao_consulta || 30);
  $('#pp-valor').value = p.valor_consulta !== null && p.valor_consulta !== undefined ? (p.valor_consulta / 100).toFixed(2) : '';
  $('#pp-particular').checked = p.aceita_particular !== false;
  $('#pp-convenios').value = (p.convenios || []).join('\n');
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
  const erro = RegrasAgenda.validarExpediente(dados);
  if (erro) {
    showToast(erro, 'error');
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
   ADMIN — EQUIPE (profissionais e recepção)
========================================================== */
async function carregarAdmin() {
  $('#admin-prof-list').innerHTML = carregandoHTML();
  const [resumo, lista, recepcao] = await Promise.all([
    api('/resumo'), api('/admin/profissionais'), api('/admin/recepcao'),
  ]);
  $('#adm-stat-prof').textContent = resumo.profissionais;
  $('#adm-stat-pacientes').textContent = resumo.pacientes;
  $('#adm-stat-agendadas').textContent = resumo.agendadas;

  $('#admin-recepcao-list').innerHTML = recepcao.length
    ? `<table class="tabela"><tbody>${recepcao.map((u) => `
        <tr>
          <td><div class="pessoa">${avatarHTML(u)}<div><strong>${esc(u.nome)}</strong><span>${esc(u.email || '')}</span></div></div></td>
          <td data-rotulo="Telefone">${u.telefone ? `${icone('phone')} ${esc(u.telefone)}` : ''}</td>
          <td class="direita"><button class="btn btn-fantasma btn-sm" data-remover-recepcao="${u.id}" data-nome="${esc(u.nome)}">${icone('x')} Remover acesso</button></td>
        </tr>`).join('')}</tbody></table>`
    : vazioHTML('users', 'Nenhuma conta da recepção', 'Crie uma conta para quem atende o telefone e o balcão.');

  if (!lista.length) {
    $('#admin-prof-list').innerHTML = vazioHTML('stethoscope', 'Nenhum profissional cadastrado',
      'Cadastre o primeiro profissional para liberar os agendamentos.',
      `<button class="btn btn-primary" data-novo-prof>${icone('plus')} Novo profissional</button>`);
    return;
  }

  $('#admin-prof-list').innerHTML = `
    <table class="tabela">
      <thead>
        <tr><th>Profissional</th><th>Especialidade</th><th>Atendimento</th><th>Valor</th><th class="direita">Visível para pacientes</th></tr>
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
            <td data-rotulo="Especialidade">${esc(p.especialidade)}${p.registro ? `<br/><span class="muted pequeno">${esc(p.registro)}</span>` : ''}</td>
            <td>${diasHTML(p.dias_atendimento)}<span class="muted pequeno">${esc(expedienteTexto(p))} · ${esc(fmtDuracao(p.duracao_consulta))}</span></td>
            <td data-rotulo="Valor">${esc(precoResumo(p) || '—')}${p.convenios.length ? `<br/><span class="muted pequeno">${esc(p.convenios.join(', '))}</span>` : ''}</td>
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
    state.profissionais = [];
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

/** Modal de nova conta (profissional ou recepção). */
function abrirNovaConta(tipo) {
  const ehProf = tipo === 'profissional';
  abrirModal(`
    <button class="btn-icone modal-fechar" data-fechar aria-label="Fechar">${icone('x')}</button>
    <h3 class="form-titulo">${ehProf ? 'Novo profissional' : 'Nova conta da recepção'}</h3>
    <p class="form-sub">${ehProf
    ? 'O profissional poderá entrar no sistema, ver a agenda e configurar perfil, horários e valores.'
    : 'A recepção vê a agenda de todos, agenda em nome dos pacientes e bloqueia datas.'}</p>
    <form id="form-nova-conta">
      <div class="campo">
        <label for="nc-nome">${ehProf ? 'Nome de exibição' : 'Nome'}</label>
        <div class="campo-input sem-icone"><input id="nc-nome" required maxlength="120" placeholder="${ehProf ? 'Ex.: Dra. Ana Lima' : 'Ex.: Rita Souza'}"/></div>
      </div>
      ${ehProf ? `
      <div class="grade-2">
        <div class="campo">
          <label for="nc-especialidade">Especialidade</label>
          <div class="campo-input sem-icone"><input id="nc-especialidade" required maxlength="80" placeholder="Ex.: Cardiologia"/></div>
        </div>
        <div class="campo">
          <label for="nc-registro">Registro <span class="opcional">(CRM, CRP...)</span></label>
          <div class="campo-input sem-icone"><input id="nc-registro" maxlength="40" placeholder="Ex.: CRM 12345-SP"/></div>
        </div>
      </div>` : ''}
      <div class="grade-2">
        <div class="campo">
          <label for="nc-email">E-mail de acesso</label>
          <div class="campo-input sem-icone"><input type="email" id="nc-email" required placeholder="nome@clinica.com"/></div>
        </div>
        <div class="campo">
          <label for="nc-telefone">Telefone <span class="opcional">(opcional)</span></label>
          <div class="campo-input sem-icone"><input type="tel" id="nc-telefone" placeholder="(00) 00000-0000"/></div>
        </div>
      </div>
      <div class="campo">
        <label for="nc-senha">Senha provisória</label>
        <div class="senha-gerada">
          <div class="campo-input sem-icone"><input id="nc-senha" required minlength="6" value="${gerarSenha()}"/></div>
          <button type="button" class="btn btn-secundario" id="nc-gerar">Gerar outra</button>
        </div>
      </div>
      <div class="modal-acoes">
        <button type="button" class="btn btn-secundario" data-fechar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Criar conta</button>
      </div>
    </form>`, { largo: true });

  $('#nc-gerar').addEventListener('click', () => { $('#nc-senha').value = gerarSenha(); });
  $('#form-nova-conta').addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = {
      nome: $('#nc-nome').value.trim(),
      email: $('#nc-email').value.trim(),
      telefone: $('#nc-telefone').value.trim(),
      senha: $('#nc-senha').value,
    };
    if (ehProf) {
      dados.especialidade = $('#nc-especialidade').value.trim();
      dados.registro = $('#nc-registro').value.trim();
    }
    comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
      await api(ehProf ? '/admin/profissionais' : '/admin/recepcao', { metodo: 'POST', corpo: dados });
      abrirModal(`
        <div class="modal-icone sucesso">${icone('check')}</div>
        <h3 class="modal-titulo">Conta criada!</h3>
        <p class="modal-texto">Envie os dados de acesso abaixo para ${esc(nomeCurto(dados.nome))}. A senha pode ser trocada depois em “Minha conta”.</p>
        <div class="detalhes">
          <div class="detalhe"><span>Endereço</span><strong>${esc(location.origin + location.pathname)}</strong></div>
          <div class="detalhe"><span>E-mail</span><strong>${esc(dados.email.toLowerCase())}</strong></div>
          <div class="detalhe"><span>Senha provisória</span><strong>${esc(dados.senha)}</strong></div>
        </div>
        <div class="modal-acoes"><button class="btn btn-primary" data-fechar>Pronto</button></div>`);
      state.profissionais = [];
      carregarAdmin();
    });
  });
}

$('#btn-novo-prof').addEventListener('click', () => abrirNovaConta('profissional'));
$('#btn-nova-recepcao').addEventListener('click', () => abrirNovaConta('recepcao'));
$('#admin-prof-list').addEventListener('click', (e) => {
  if (e.target.closest('[data-novo-prof]')) abrirNovaConta('profissional');
});
$('#admin-recepcao-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remover-recepcao]');
  if (!btn) return;
  const ok = await confirmar({
    titulo: 'Remover acesso?',
    texto: `${btn.dataset.nome} não vai mais conseguir entrar no sistema.`,
    botao: 'Remover acesso',
    perigo: true,
  });
  if (!ok) return;
  try {
    await api(`/admin/recepcao/${btn.dataset.removerRecepcao}`, { metodo: 'DELETE' });
    showToast('Acesso removido.', 'success');
    carregarAdmin();
  } catch (err) {
    if (!err.silencioso) showToast(err.message, 'error');
  }
});

/* ==========================================================
   ADMIN — CONFIGURAÇÕES
========================================================== */
async function preencherConfiguracoes() {
  state.config = await api('/configuracoes');
  $('#cfg-limite').value = state.config.limite_consultas_futuras;
  $('#cfg-prazo').value = state.config.prazo_cancelamento_horas;
  $('#cfg-antecedencia').value = state.config.antecedencia_maxima_dias;
}

$('#form-config').addEventListener('submit', (e) => {
  e.preventDefault();
  comCarregamento(e.target.querySelector('button[type=submit]'), async () => {
    state.config = await api('/admin/configuracoes', {
      metodo: 'PUT',
      corpo: {
        limite_consultas_futuras: Number($('#cfg-limite').value),
        prazo_cancelamento_horas: Number($('#cfg-prazo').value),
        antecedencia_maxima_dias: Number($('#cfg-antecedencia').value),
      },
    });
    showToast('Configurações salvas.', 'success');
  });
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
/* ---------- Modo demonstração ---------- */
if (window.MODO_DEMO) {
  $('#demo-dica').classList.remove('hidden');
  $('#demo-faixa').classList.remove('hidden');
  $('#demo-dica').addEventListener('click', (e) => {
    const conta = e.target.closest('[data-email]');
    if (!conta) return;
    $('#log-email').value = conta.dataset.email;
    $('#log-senha').value = 'demo123';
    $('#form-login').requestSubmit();
  });
  $('#demo-reiniciar').addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Reiniciar a demonstração?',
      texto: 'Todas as consultas, contas e alterações feitas neste navegador serão apagadas.',
      botao: 'Reiniciar',
      perigo: true,
    });
    if (ok) window.reiniciarDemo();
  });
}

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
