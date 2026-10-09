/* ==========================================================
   ⚠️ CONFIGURAÇÃO DO SUPABASE
   Supabase Dashboard → Settings → API
   ========================================================== */
const SUPABASE_URL = 'https://wwvlkfitcelxspyborzt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_e6Yg5vObTbt0_Sy2P4gclw_ykMcMeLl';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==========================================================
   ESTADO GLOBAL
========================================================== */
const state = {
  user: null,
  perfil: null,
  profissionais: [],
  profissionalSelecionado: null,
  dataSelecionada: null,
  horarioSelecionado: null,
  mesAtual: new Date(),
  horariosOcupados: new Set(),
};

const HORARIOS = [
  '08:00','08:30','09:00','09:30','10:00','10:30',
  '11:00','11:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30'
];

/* ==========================================================
   HELPERS
========================================================== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(msg, tipo = 'info') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

function fmtData(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function setLoading(btn, loading, textoOriginal) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.original = btn.textContent;
    btn.textContent = 'Aguarde...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.original || textoOriginal;
  }
}

/* ==========================================================
   NAVEGAÇÃO ENTRE TELAS (auth <-> app)
========================================================== */
function mostrarAuth() {
  $('#auth-screen').classList.remove('hidden');
  $('#app-screen').classList.add('hidden');
}

function mostrarApp() {
  $('#auth-screen').classList.add('hidden');
  $('#app-screen').classList.remove('hidden');
}

function trocarPagina(pageId) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${pageId}`);
  if (target) target.classList.add('active');

  $$('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === pageId);
  });

  if (pageId === 'minhas') carregarConsultas();
  if (pageId === 'perfil') preencherPerfil();
  if (pageId === 'home') carregarHome();
}

/* ==========================================================
   ALTERNAR FORMULÁRIOS CADASTRO / LOGIN
========================================================== */
$$('[data-switch]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const alvo = e.currentTarget.dataset.switch;
    $$('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById(`form-${alvo}`).classList.add('active');
  });
});

/* ==========================================================
   CADASTRO
========================================================== */
$('#form-cadastro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');

  const nome = $('#cad-nome').value.trim();
  const email = $('#cad-email').value.trim();
  const telefone = $('#cad-telefone').value.trim();
  const nascimento = $('#cad-nascimento').value;
  const senha = $('#cad-senha').value;
  const senha2 = $('#cad-senha2').value;

  if (senha !== senha2) {
    showToast('As senhas não coincidem.', 'error');
    return;
  }

  setLoading(btn, true);
  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password: senha,
      options: {
        data: {
          nome,
          telefone,
          data_nascimento: nascimento,
        }
      }
    });

    if (error) throw error;

    if (data.session) {
      // Login automático (email confirm desativado)
      showToast('Cadastro realizado com sucesso!', 'success');
      await iniciarSessao(data.session.user);
    } else {
      // Email de confirmação ativado
      showToast('Cadastro criado! Confirme seu e-mail para entrar.', 'info');
      $$('.auth-form').forEach(f => f.classList.remove('active'));
      $('#form-login').classList.add('active');
    }
  } catch (err) {
    console.error(err);
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('already registered') || msg.includes('already exists')) {
      showToast('E-mail já cadastrado.', 'error');
    } else {
      showToast(err.message || 'Erro ao criar conta.', 'error');
    }
  } finally {
    setLoading(btn, false, 'Criar conta');
  }
});

/* ==========================================================
   LOGIN
========================================================== */
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const email = $('#log-email').value.trim();
  const senha = $('#log-senha').value;

  setLoading(btn, true);
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;

    showToast('Login realizado com sucesso!', 'success');
    await iniciarSessao(data.user);
  } catch (err) {
    console.error(err);
    showToast('E-mail ou senha incorretos.', 'error');
  } finally {
    setLoading(btn, false, 'Entrar');
  }
});

/* ==========================================================
   LOGOUT
========================================================== */
$('#btn-logout').addEventListener('click', async (e) => {
  e.preventDefault();
  await sb.auth.signOut();
  state.user = null;
  state.perfil = null;
  mostrarAuth();
  showToast('Você saiu da conta.', 'info');
});

/* ==========================================================
   INICIAR SESSÃO
========================================================== */
async function iniciarSessao(user) {
  state.user = user;

  // Carrega perfil (pode não existir caso o trigger não tenha rodado)
  const { data: perfil } = await sb
    .from('usuarios')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  state.perfil = perfil || {
    nome: user.user_metadata?.nome || user.email,
    email: user.email,
    telefone: user.user_metadata?.telefone || '',
    data_nascimento: user.user_metadata?.data_nascimento || '',
  };

  $('#user-name').textContent = (state.perfil.nome || 'paciente').split(' ')[0];
  mostrarApp();
  trocarPagina('home');
}

/* ==========================================================
   VERIFICAR SESSÃO AO CARREGAR
========================================================== */
async function verificarSessao() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await iniciarSessao(session.user);
  } else {
    mostrarAuth();
  }
}

// Reage a mudanças de auth (login, logout em outra aba, token expirado)
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    state.user = null;
    mostrarAuth();
  }
});

/* ==========================================================
   HOME
========================================================== */
async function carregarHome() {
  const { count } = await sb
    .from('profissionais')
    .select('*', { count: 'exact', head: true });

  $('#stat-prof').textContent = count ?? 0;

  if (state.user) {
    const { count: c } = await sb
      .from('consultas')
      .select('*', { count: 'exact', head: true })
      .eq('usuario_id', state.user.id)
      .eq('status', 'agendada');
    $('#stat-consultas').textContent = c ?? 0;
  }
}

/* ==========================================================
   PROFISSIONAIS
========================================================== */
async function carregarProfissionais() {
  const { data, error } = await sb
    .from('profissionais')
    .select('*')
    .order('nome');

  if (error) {
    console.error(error);
    showToast('Erro ao carregar profissionais.', 'error');
    return;
  }

  state.profissionais = data || [];
  renderProfissionais();
}

function renderProfissionais() {
  const container = $('#profissionais-list');
  container.innerHTML = '';

  if (!state.profissionais.length) {
    container.innerHTML = '<p class="muted">Nenhum profissional cadastrado.</p>';
    return;
  }

  state.profissionais.forEach(p => {
    const card = document.createElement('div');
    card.className = 'prof-card';
    if (state.profissionalSelecionado?.id === p.id) card.classList.add('selected');

    card.innerHTML = `
      <img src="${p.foto || 'https://i.pravatar.cc/150?u=' + p.id}" alt="${p.nome}">
      <h4>${p.nome}</h4>
      <div class="esp">${p.especialidade}</div>
      <div class="desc">${p.descricao || ''}</div>
    `;

    card.addEventListener('click', () => {
      state.profissionalSelecionado = p;
      state.horarioSelecionado = null;
      renderProfissionais();
      atualizarHorarios();
      atualizarBotaoAgendar();
    });

    container.appendChild(card);
  });
}

/* ==========================================================
   CALENDÁRIO
========================================================== */
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function renderCalendario() {
  const ano = state.mesAtual.getFullYear();
  const mes = state.mesAtual.getMonth();

  $('#cal-title').textContent = `${MESES[mes]} ${ano}`;

  const firstDay = new Date(ano, mes, 1).getDay();
  const daysInMonth = new Date(ano, mes + 1, 0).getDate();

  const hoje = new Date();
  hoje.setHours(0,0,0,0);

  const container = $('#calendar-days');
  container.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'day empty';
    container.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dia = new Date(ano, mes, d);
    const el = document.createElement('div');
    el.className = 'day';
    el.textContent = d;

    const iso = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    if (dia < hoje) {
      el.classList.add('disabled');
    } else {
      if (dia.getTime() === hoje.getTime()) el.classList.add('today');
      if (state.dataSelecionada === iso) el.classList.add('selected');

      el.addEventListener('click', () => {
        state.dataSelecionada = iso;
        state.horarioSelecionado = null;
        renderCalendario();
        carregarHorariosOcupados();
      });
    }

    container.appendChild(el);
  }
}

$('#prev-month').addEventListener('click', () => {
  state.mesAtual.setMonth(state.mesAtual.getMonth() - 1);
  renderCalendario();
});

$('#next-month').addEventListener('click', () => {
  state.mesAtual.setMonth(state.mesAtual.getMonth() + 1);
  renderCalendario();
});

/* ==========================================================
   HORÁRIOS
========================================================== */
async function carregarHorariosOcupados() {
  if (!state.profissionalSelecionado || !state.dataSelecionada) return;

  const { data, error } = await sb
    .from('horarios_ocupados')
    .select('horario')
    .eq('profissional_id', state.profissionalSelecionado.id)
    .eq('data', state.dataSelecionada);

  if (error) {
    console.error(error);
    state.horariosOcupados = new Set();
  } else {
    state.horariosOcupados = new Set(
      (data || []).map(h => (h.horario || '').slice(0, 5))
    );
  }

  atualizarHorarios();
}

function atualizarHorarios() {
  const container = $('#horarios-container');

  if (!state.profissionalSelecionado || !state.dataSelecionada) {
    container.innerHTML = '<p class="muted">Selecione um profissional e uma data para ver os horários.</p>';
    atualizarBotaoAgendar();
    return;
  }

  container.innerHTML = '';

  HORARIOS.forEach(h => {
    const el = document.createElement('div');
    el.className = 'horario';
    el.textContent = h;

    if (state.horariosOcupados.has(h)) {
      el.classList.add('ocupado');
      el.title = 'Horário indisponível';
    } else {
      if (state.horarioSelecionado === h) el.classList.add('selected');
      el.addEventListener('click', () => {
        state.horarioSelecionado = h;
        atualizarHorarios();
      });
    }

    container.appendChild(el);
  });

  atualizarBotaoAgendar();
}

function atualizarBotaoAgendar() {
  const btn = $('#btn-agendar');
  btn.disabled = !(state.profissionalSelecionado && state.dataSelecionada && state.horarioSelecionado);
}

/* ==========================================================
   AGENDAR CONSULTA
========================================================== */
$('#btn-agendar').addEventListener('click', async () => {
  const btn = $('#btn-agendar');
  if (!state.profissionalSelecionado || !state.dataSelecionada || !state.horarioSelecionado) return;

  setLoading(btn, true);
  try {
    // Revalida disponibilidade antes de inserir
    const { data: existente } = await sb
      .from('horarios_ocupados')
      .select('horario')
      .eq('profissional_id', state.profissionalSelecionado.id)
      .eq('data', state.dataSelecionada)
      .eq('horario', state.horarioSelecionado)
      .maybeSingle();

    if (existente) {
      showToast('Este horário acabou de ser reservado. Escolha outro.', 'error');
      await carregarHorariosOcupados();
      return;
    }

    const { error } = await sb.from('consultas').insert({
      usuario_id: state.user.id,
      profissional_id: state.profissionalSelecionado.id,
      data: state.dataSelecionada,
      horario: state.horarioSelecionado,
      status: 'agendada',
    });

    if (error) throw error;

    abrirModalConfirmacao();

    // Limpa seleções
    state.profissionalSelecionado = null;
    state.dataSelecionada = null;
    state.horarioSelecionado = null;
    state.horariosOcupados.clear();
    renderProfissionais();
    renderCalendario();
    atualizarHorarios();

    showToast('Consulta agendada com sucesso!', 'success');
  } catch (err) {
    console.error(err);
    if ((err.message || '').includes('duplicate')) {
      showToast('Horário indisponível. Escolha outro.', 'error');
      await carregarHorariosOcupados();
    } else {
      showToast(err.message || 'Erro ao agendar.', 'error');
    }
  } finally {
    setLoading(btn, false, 'Agendar consulta');
  }
});

/* ==========================================================
   MODAL
========================================================== */
function abrirModalConfirmacao() {
  const p = state.profissionalSelecionado || {};
  const usuario = state.perfil?.nome || state.user?.email || '—';

  $('#modal-content').innerHTML = `
    <div class="info-item"><span>Profissional</span><strong>${p.nome || '—'}</strong></div>
    <div class="info-item"><span>Especialidade</span><strong>${p.especialidade || '—'}</strong></div>
    <div class="info-item"><span>Data</span><strong>${state.dataSelecionada ? fmtData(state.dataSelecionada) : '—'}</strong></div>
    <div class="info-item"><span>Horário</span><strong>${state.horarioSelecionado || '—'}</strong></div>
    <div class="info-item"><span>Paciente</span><strong>${usuario}</strong></div>
  `;
  $('#modal').classList.remove('hidden');
}

$('#modal-close').addEventListener('click', () => {
  $('#modal').classList.add('hidden');
});

/* ==========================================================
   MINHAS CONSULTAS
========================================================== */
async function carregarConsultas() {
  const container = $('#consultas-list');
  container.innerHTML = '<p class="muted">Carregando...</p>';

  const { data, error } = await sb
    .from('consultas')
    .select(`
      id, data, horario, status, data_criacao,
      profissionais ( nome, especialidade )
    `)
    .eq('usuario_id', state.user.id)
    .order('data', { ascending: false });

  if (error) {
    console.error(error);
    container.innerHTML = '<p class="muted">Erro ao carregar consultas.</p>';
    return;
  }

  if (!data?.length) {
    container.innerHTML = '<p class="muted">Você ainda não tem consultas agendadas.</p>';
    return;
  }

  container.innerHTML = '';
  data.forEach(c => {
    const card = document.createElement('div');
    card.className = 'consulta-card' + (c.status === 'cancelada' ? ' cancelada' : '');

    const prof = c.profissionais || {};

    card.innerHTML = `
      <div class="consulta-info">
        <h4>${prof.nome || '—'}</h4>
        <div class="esp">${prof.especialidade || ''}</div>
        <div class="consulta-meta">
          <span>📅 ${fmtData(c.data)}</span>
          <span>⏰ ${(c.horario || '').slice(0,5)}</span>
          <span class="status-badge status-${c.status}">${c.status}</span>
        </div>
      </div>
    `;

    if (c.status === 'agendada') {
      const btn = document.createElement('button');
      btn.className = 'btn-cancelar';
      btn.textContent = 'Cancelar';
      btn.addEventListener('click', () => cancelarConsulta(c.id));
      card.appendChild(btn);
    }

    container.appendChild(card);
  });
}

async function cancelarConsulta(id) {
  if (!confirm('Deseja realmente cancelar esta consulta?')) return;

  const { error } = await sb
    .from('consultas')
    .update({ status: 'cancelada' })
    .eq('id', id)
    .eq('usuario_id', state.user.id);

  if (error) {
    console.error(error);
    showToast('Erro ao cancelar consulta.', 'error');
    return;
  }

  showToast('Consulta cancelada com sucesso.', 'success');
  carregarConsultas();
}

/* ==========================================================
   PERFIL
========================================================== */
function preencherPerfil() {
  const p = state.perfil || {};
  $('#perfil-avatar').textContent = (p.nome || 'U')[0].toUpperCase();
  $('#perfil-nome').textContent = p.nome || '—';
  $('#perfil-email').textContent = p.email || state.user?.email || '—';
  $('#perfil-telefone').textContent = p.telefone || '—';
  $('#perfil-nascimento').textContent = p.data_nascimento ? fmtData(p.data_nascimento) : '—';
  $('#perfil-cadastro').textContent = p.data_cadastro
    ? new Date(p.data_cadastro).toLocaleDateString('pt-BR')
    : '—';
}

/* ==========================================================
   NAVEGAÇÃO (links do menu)
========================================================== */
$$('.nav-link[data-page]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    trocarPagina(e.currentTarget.dataset.page);
    $('#nav-links').classList.remove('open');
  });
});

$$('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => trocarPagina(btn.dataset.goto));
});

$('#menu-toggle').addEventListener('click', () => {
  $('#nav-links').classList.toggle('open');
});

/* ==========================================================
   BOOT
========================================================== */
(async function init() {
  renderCalendario();
  await carregarProfissionais();
  await verificarSessao();
})();