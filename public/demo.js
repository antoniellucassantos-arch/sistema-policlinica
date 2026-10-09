/* ==========================================================
   MODO DEMONSTRAÇÃO
   Simula a API do servidor dentro do navegador (localStorage),
   para mostrar o sistema em hospedagens estáticas como o
   GitHub Pages. Os dados ficam só no navegador de quem acessa.
   Ativado automaticamente em *.github.io, ao abrir o arquivo
   direto (file://) ou com ?demo na URL.
   As regras de horário vêm de shared/agenda.js (as mesmas do servidor).
========================================================== */
(function () {
  let lembrado = false;
  try {
    if (new URLSearchParams(location.search).has('demo')) sessionStorage.setItem('medagenda_modo_demo', '1');
    lembrado = sessionStorage.getItem('medagenda_modo_demo') === '1';
  } catch { /* sem armazenamento */ }
  const ativo = location.hostname.endsWith('github.io')
    || location.protocol === 'file:'
    || lembrado;
  window.MODO_DEMO = ativo;
  if (!ativo) return;

  const R = window.RegrasAgenda;
  const CHAVE = 'medagenda_demo_v2';
  const EQUIPE = ['admin', 'recepcao'];

  const pad = (n) => String(n).padStart(2, '0');
  const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const diaSemana = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).getDay(); };
  const dataValida = (t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));
  function somarDias(iso, n) {
    const [a, m, d] = iso.split('-').map(Number);
    return isoDe(new Date(a, m - 1, d + n));
  }
  function agora() {
    const d = new Date();
    return { data: isoDe(d), hora: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  /** n-ésimo dia (a partir de hoje + inicio) em que o profissional atende */
  function diaDeAtendimento(dias, inicio, n = 0) {
    let data = somarDias(agora().data, inicio);
    const passo = inicio < 0 ? -1 : 1;
    let achados = -1;
    for (;;) {
      if (dias.includes(String(diaSemana(data)))) achados += 1;
      if (achados === n) return data;
      data = somarDias(data, passo);
    }
  }

  class ErroDemo extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }

  /* ---------- Dados iniciais ---------- */
  function dadosIniciais() {
    const hoje = new Date().toISOString();
    const usuarios = [
      { id: 1, nome: 'Administrador', email: 'admin@demo.com', tipo: 'admin' },
      { id: 2, nome: 'Dra. Ana Beatriz Lima', email: 'ana.lima@demo.com', tipo: 'profissional' },
      { id: 3, nome: 'Dr. Carlos Eduardo Souza', email: 'carlos.souza@demo.com', tipo: 'profissional' },
      { id: 4, nome: 'Dra. Juliana Martins', email: 'juliana.martins@demo.com', tipo: 'profissional' },
      { id: 5, nome: 'Rafael Oliveira', email: 'rafael.oliveira@demo.com', tipo: 'profissional' },
      { id: 6, nome: 'Maria Paciente', email: 'paciente@demo.com', tipo: 'paciente', telefone: '(11) 98888-7777', data_nascimento: '1990-05-20' },
      { id: 7, nome: 'João Pereira', email: 'joao@demo.com', tipo: 'paciente', telefone: '(11) 97777-1234', data_nascimento: '1978-11-02' },
      { id: 8, nome: 'Luiza Fernandes', email: 'luiza@demo.com', tipo: 'paciente', telefone: '(11) 96666-4321', data_nascimento: '2001-03-15' },
      { id: 9, nome: 'Rita Recepção', email: 'recepcao@demo.com', tipo: 'recepcao' },
    ].map((u) => ({
      telefone: null, data_nascimento: null, senha: 'demo123', data_cadastro: hoje, ...u,
    }));

    const expediente = {
      hora_inicio: '08:00', hora_fim: '18:00', pausa_inicio: '12:00', pausa_fim: '14:00', duracao_consulta: 30,
    };
    const profissionais = [
      {
        id: 1, usuario_id: 2, especialidade: 'Clínica Geral', registro: 'CRM 12345-SP',
        descricao: 'Atendimento humanizado para adultos e idosos.',
        sobre: 'Médica clínica com foco em prevenção e acompanhamento de doenças crônicas, como hipertensão e diabetes.',
        formacao: 'Medicina — USP\nResidência em Clínica Médica — Hospital das Clínicas',
        dias_atendimento: '12345', valor_consulta: 18000, convenios: 'Unimed\nBradesco Saúde\nSulAmérica',
      },
      {
        id: 2, usuario_id: 3, especialidade: 'Cardiologia', registro: 'CRM 23456-SP',
        descricao: 'Check-up cardiológico e acompanhamento de arritmias.',
        sobre: 'Cardiologista com mais de 15 anos de experiência em prevenção cardiovascular.',
        formacao: 'Medicina — UNIFESP\nResidência em Cardiologia — InCor',
        dias_atendimento: '135', hora_inicio: '07:00', hora_fim: '13:00', pausa_inicio: null, pausa_fim: null,
        duracao_consulta: 40, valor_consulta: 35000, convenios: 'Unimed',
      },
      {
        id: 3, usuario_id: 4, especialidade: 'Pediatria', registro: 'CRM 34567-SP',
        descricao: 'Cuidado com a saúde de bebês, crianças e adolescentes.',
        sobre: 'Pediatra apaixonada por acompanhar o crescimento e desenvolvimento dos pequenos.',
        formacao: 'Medicina — UNICAMP\nResidência em Pediatria — Hospital Infantil Sabará',
        dias_atendimento: '246', duracao_consulta: 20, valor_consulta: 22000, convenios: 'Unimed\nAmil',
      },
      {
        id: 4, usuario_id: 5, especialidade: 'Psicologia', registro: 'CRP 06/98765',
        descricao: 'Terapia cognitivo-comportamental para adultos.',
        sobre: 'Psicólogo clínico com atuação em ansiedade, depressão e orientação profissional.',
        formacao: 'Psicologia — PUC-SP\nEspecialização em Terapia Cognitivo-Comportamental',
        dias_atendimento: '1234', hora_inicio: '09:00', hora_fim: '20:00', pausa_inicio: '13:00', pausa_fim: '14:00',
        duracao_consulta: 50, valor_consulta: 20000, convenios: null,
      },
    ].map((p) => ({
      foto: null, ativo: true, aceita_particular: true, ...expediente, ...p,
    }));

    const [ana, carlos] = profissionais;
    const slotAna = R.gerarHorarios(ana);
    const slotCarlos = R.gerarHorarios(carlos);
    const base = (c) => ({
      motivo: 'Primeira consulta', observacao: null, pagamento: 'particular', convenio: null, valor: null, ...c,
    });
    const consultas = [
      base({ usuario_id: 6, profissional_id: 1, data: diaDeAtendimento(ana.dias_atendimento, 1, 0), horario: slotAna[2], status: 'agendada', motivo: 'Retorno', pagamento: 'convenio', convenio: 'Unimed' }),
      base({ usuario_id: 7, profissional_id: 1, data: diaDeAtendimento(ana.dias_atendimento, 1, 0), horario: slotAna[5], status: 'agendada', valor: 18000, observacao: 'Dor de cabeça frequente' }),
      base({ usuario_id: 8, profissional_id: 1, data: diaDeAtendimento(ana.dias_atendimento, 1, 1), horario: slotAna[8], status: 'agendada', pagamento: 'convenio', convenio: 'SulAmérica' }),
      base({ usuario_id: 7, profissional_id: 1, data: diaDeAtendimento(ana.dias_atendimento, -1, 0), horario: slotAna[4], status: 'concluida', valor: 18000 }),
      base({ usuario_id: 8, profissional_id: 1, data: diaDeAtendimento(ana.dias_atendimento, -1, 1), horario: slotAna[1], status: 'faltou', valor: 18000 }),
      base({ usuario_id: 6, profissional_id: 2, data: diaDeAtendimento(carlos.dias_atendimento, -1, 1), horario: slotCarlos[3], status: 'concluida', motivo: 'Exame / resultado', valor: 35000 }),
    ].map((c, i) => ({
      id: i + 1, data_criacao: hoje, duracao: profissionais[c.profissional_id - 1].duracao_consulta, ...c,
    }));

    const bloqueios = [{
      id: 1, profissional_id: 3, data_inicio: somarDias(agora().data, 12), data_fim: somarDias(agora().data, 16),
      motivo: 'Férias', criado_por: 4,
    }];

    return {
      usuarios,
      profissionais,
      consultas,
      bloqueios,
      config: { ...R.CONFIG_PADRAO },
      redefinicoes: [],
      sessao: null,
      seq: { usuarios: usuarios.length, profissionais: 4, consultas: consultas.length, bloqueios: 1 },
    };
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(CHAVE)); } catch { db = null; }
  if (!db) db = dadosIniciais();
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch { /* sem armazenamento */ } };
  salvar();

  window.reiniciarDemo = function () {
    try { localStorage.removeItem(CHAVE); } catch { /* ignora */ }
    location.href = location.pathname;
  };

  /* ---------- Helpers ---------- */
  const novoId = (tabela) => { db.seq[tabela] += 1; return db.seq[tabela]; };
  const usuarioLogado = () => db.usuarios.find((u) => u.id === db.sessao) || null;
  function exigir(...tipos) {
    const u = usuarioLogado();
    if (!u) throw new ErroDemo(401, 'Faça login para continuar.');
    if (tipos.length && !tipos.includes(u.tipo)) throw new ErroDemo(403, 'Você não tem permissão para isso.');
    return u;
  }
  function texto(v, { obrigatorio = false, max = 200, nome = 'Campo' } = {}) {
    const t = typeof v === 'string' ? v.trim() : '';
    if (obrigatorio && !t) throw new ErroDemo(400, `${nome} é obrigatório.`);
    if (t.length > max) throw new ErroDemo(400, `${nome} deve ter no máximo ${max} caracteres.`);
    return t || null;
  }
  function validarSenha(s) {
    if (typeof s !== 'string' || s.length < 6) throw new ErroDemo(400, 'A senha deve ter pelo menos 6 caracteres.');
  }
  const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
  const publico = (u) => {
    const { senha, ...resto } = u; // eslint-disable-line no-unused-vars
    return resto;
  };
  const profDoUsuario = (u) => db.profissionais.find((x) => x.usuario_id === u.id) || null;
  function perfilPublico(p) {
    const u = db.usuarios.find((x) => x.id === p.usuario_id);
    return {
      id: p.id, nome: u.nome, especialidade: p.especialidade, registro: p.registro, descricao: p.descricao,
      sobre: p.sobre, formacao: p.formacao, foto: p.foto, dias_atendimento: p.dias_atendimento, ativo: p.ativo,
      hora_inicio: p.hora_inicio, hora_fim: p.hora_fim, pausa_inicio: p.pausa_inicio || null, pausa_fim: p.pausa_fim || null,
      duracao_consulta: Number(p.duracao_consulta), valor_consulta: p.valor_consulta ?? null,
      aceita_particular: !!p.aceita_particular, convenios: R.listaConvenios(p.convenios),
    };
  }
  function resposta(u) {
    const p = u.tipo === 'profissional' ? profDoUsuario(u) : null;
    return { usuario: publico(u), profissional: p ? perfilPublico(p) : null };
  }
  function detalhar(c) {
    const p = db.profissionais.find((x) => x.id === c.profissional_id);
    const up = db.usuarios.find((x) => x.id === p.usuario_id);
    const pa = db.usuarios.find((x) => x.id === c.usuario_id) || { nome: '(removido)' };
    return {
      id: c.id, data: c.data, horario: c.horario, duracao: c.duracao, status: c.status, motivo: c.motivo,
      observacao: c.observacao, pagamento: c.pagamento, convenio: c.convenio, valor: c.valor ?? null,
      profissional_id: p.id, usuario_id: c.usuario_id, profissional_nome: up.nome, especialidade: p.especialidade,
      foto: p.foto, paciente_nome: pa.nome, paciente_telefone: pa.telefone, paciente_email: pa.email,
      paciente_nascimento: pa.data_nascimento,
    };
  }
  const ordenarDesc = (a, b) => (b.data + b.horario).localeCompare(a.data + a.horario);
  const ordenarAsc = (a, b) => (a.data + a.horario).localeCompare(b.data + b.horario);
  const bloqueiosDe = (profId) => db.bloqueios.filter((b) => b.profissional_id === null || b.profissional_id === profId);
  const futurasDoPaciente = (id) => db.consultas.filter((c) => c.usuario_id === id && c.status === 'agendada' && c.data >= agora().data);

  function situacaoDoDia(p, data, ignorar = null) {
    if (!dataValida(data)) throw new ErroDemo(400, 'Data inválida.');
    const { data: hoje, hora } = agora();
    if (data < hoje || data > somarDias(hoje, db.config.antecedencia_maxima_dias)) {
      return { atende: false, motivo: 'Data fora do período de agendamento.', horarios: [] };
    }
    if (!p.dias_atendimento.includes(String(diaSemana(data)))) {
      return { atende: false, motivo: 'O profissional não atende neste dia da semana.', horarios: [] };
    }
    if (R.bloqueioDoDia(bloqueiosDe(p.id), data)) {
      return { atende: false, motivo: 'Agenda fechada nesta data.', horarios: [] };
    }
    const marcadas = db.consultas.filter((c) => c.profissional_id === p.id && c.data === data
      && c.status !== 'cancelada' && c.id !== ignorar);
    const dur = Number(p.duracao_consulta);
    return {
      atende: true,
      duracao: dur,
      horarios: R.gerarHorarios(p).map((h) => ({
        horario: h,
        disponivel: !(data === hoje && h <= hora) && !marcadas.some((c) => R.sobrepoe(h, dur, c.horario, c.duracao)),
      })),
    };
  }
  function verificarHorario(p, data, horario, ignorar = null) {
    const dia = situacaoDoDia(p, data, ignorar);
    if (!dia.atende) throw new ErroDemo(400, dia.motivo);
    const vaga = dia.horarios.find((h) => h.horario === horario);
    if (!vaga) throw new ErroDemo(400, 'Horário inválido para este profissional.');
    if (!vaga.disponivel) throw new ErroDemo(409, 'Este horário acabou de ser reservado. Escolha outro.');
  }
  function conferirPrazo(c, acao) {
    const horas = db.config.prazo_cancelamento_horas;
    if (horas > 0 && R.minutosAte(c.data, c.horario, agora()) < horas * 60) {
      throw new ErroDemo(400, `Pelo site só é possível ${acao} até ${horas}h antes da consulta. Entre em contato com a clínica.`);
    }
  }
  function carregarParaAlterar(u, id) {
    const c = db.consultas.find((x) => x.id === Number(id));
    if (!c) throw new ErroDemo(404, 'Consulta não encontrada.');
    let papel = null;
    if (EQUIPE.includes(u.tipo)) papel = 'equipe';
    else if (u.tipo === 'paciente' && c.usuario_id === u.id) papel = 'paciente';
    else if (u.tipo === 'profissional' && profDoUsuario(u)?.id === c.profissional_id) papel = 'profissional';
    if (!papel) throw new ErroDemo(403, 'Você não tem permissão para alterar esta consulta.');
    if (c.status !== 'agendada') throw new ErroDemo(400, 'Só é possível alterar consultas que ainda estão agendadas.');
    return { c, papel };
  }
  function novaConta(corpo, tipo) {
    const email = String(corpo.email || '').trim().toLowerCase();
    const nome = texto(corpo.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
    if (!emailValido(email)) throw new ErroDemo(400, 'Informe um e-mail válido.');
    validarSenha(corpo.senha);
    if (db.usuarios.some((u) => u.email === email)) throw new ErroDemo(409, 'Já existe uma conta com este e-mail.');
    const u = {
      id: novoId('usuarios'), nome, email, senha: corpo.senha, tipo, telefone: texto(corpo.telefone),
      data_nascimento: null, data_cadastro: new Date().toISOString(),
    };
    db.usuarios.push(u);
    return u;
  }

  /* ---------- Rotas ---------- */
  const rotas = [];
  const rota = (metodo, padrao, fn) => rotas.push({ metodo, padrao, fn });

  /* Autenticação */
  rota('GET', /^\/auth\/eu$/, () => {
    const u = usuarioLogado();
    return u ? resposta(u) : { usuario: null, profissional: null };
  });

  rota('POST', /^\/auth\/login$/, (_, corpo) => {
    const email = String(corpo.email || '').trim().toLowerCase();
    const u = email && db.usuarios.find((x) => x.email === email);
    if (!u || u.senha !== corpo.senha) throw new ErroDemo(401, 'E-mail ou senha incorretos.');
    db.sessao = u.id;
    return resposta(u);
  });

  rota('POST', /^\/auth\/logout$/, () => { db.sessao = null; return { ok: true }; });

  rota('POST', /^\/auth\/cadastro$/, (_, corpo) => {
    const email = String(corpo.email || '').trim().toLowerCase();
    const nome = texto(corpo.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
    if (!emailValido(email)) throw new ErroDemo(400, 'Informe um e-mail válido.');
    validarSenha(corpo.senha);
    if (db.usuarios.some((u) => u.email === email)) throw new ErroDemo(409, 'Este e-mail já está cadastrado.');
    const u = {
      id: novoId('usuarios'), nome, email, senha: corpo.senha, tipo: 'paciente',
      telefone: texto(corpo.telefone), data_nascimento: corpo.data_nascimento || null,
      data_cadastro: new Date().toISOString(),
    };
    db.usuarios.push(u);
    db.sessao = u.id;
    return resposta(u);
  });

  rota('PUT', /^\/auth\/eu$/, (_, corpo) => {
    const u = exigir();
    u.nome = texto(corpo.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
    u.telefone = texto(corpo.telefone);
    u.data_nascimento = corpo.data_nascimento || null;
    return resposta(u);
  });

  rota('PUT', /^\/auth\/senha$/, (_, corpo) => {
    const u = exigir();
    if (corpo.senha_atual !== u.senha) throw new ErroDemo(400, 'A senha atual está incorreta.');
    validarSenha(corpo.nova_senha);
    u.senha = corpo.nova_senha;
    return { ok: true };
  });

  rota('POST', /^\/auth\/esqueci-senha$/, (_, corpo) => {
    const email = String(corpo.email || '').trim().toLowerCase();
    if (!emailValido(email)) throw new ErroDemo(400, 'Informe um e-mail válido.');
    const u = db.usuarios.find((x) => x.email === email);
    if (!u) return { ok: true };
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => pad(b.toString(16))).join('');
    db.redefinicoes = db.redefinicoes.filter((r) => r.usuario_id !== u.id);
    db.redefinicoes.push({ usuario_id: u.id, token, expira: Date.now() + 60 * 60 * 1000 });
    // No sistema real o link vai por e-mail; na demonstração ele é mostrado na tela.
    return { ok: true, link_demo: `${location.pathname}?redefinir=${token}` };
  });

  rota('POST', /^\/auth\/redefinir-senha$/, (_, corpo) => {
    validarSenha(corpo.senha);
    const pedido = db.redefinicoes.find((r) => r.token === corpo.token && r.expira > Date.now());
    if (!pedido) throw new ErroDemo(400, 'Este link expirou ou já foi usado. Peça um novo.');
    db.redefinicoes = db.redefinicoes.filter((r) => r !== pedido);
    const u = db.usuarios.find((x) => x.id === pedido.usuario_id);
    u.senha = corpo.senha;
    db.sessao = u.id;
    return resposta(u);
  });

  /* Profissionais (público) */
  const profAtivo = (id) => {
    const p = db.profissionais.find((x) => x.id === Number(id) && x.ativo);
    if (!p) throw new ErroDemo(404, 'Profissional não encontrado.');
    return p;
  };

  rota('GET', /^\/profissionais$/, () => db.profissionais.filter((p) => p.ativo).map(perfilPublico)
    .sort((a, b) => a.nome.localeCompare(b.nome)));

  rota('GET', /^\/profissionais\/(\d+)$/, ([id]) => perfilPublico(profAtivo(id)));

  rota('GET', /^\/profissionais\/(\d+)\/horarios$/, ([id], _, q) => (
    situacaoDoDia(profAtivo(id), q.get('data'), Number(q.get('ignorar')) || null)));

  rota('GET', /^\/profissionais\/(\d+)\/bloqueios$/, ([id]) => {
    const hoje = agora().data;
    return bloqueiosDe(profAtivo(id).id).filter((b) => b.data_fim >= hoje)
      .map((b) => ({ data_inicio: b.data_inicio, data_fim: b.data_fim }));
  });

  /* Área do profissional */
  rota('PUT', /^\/profissional\/perfil$/, (_, b) => {
    const u = exigir('profissional');
    const p = profDoUsuario(u);
    const foto = texto(b.foto, { max: 500 });
    if (foto && !/^https?:\/\//i.test(foto)) throw new ErroDemo(400, 'O link da foto deve começar com http:// ou https://.');
    if (!/^[0-6]{1,7}$/.test(b.dias_atendimento || '')) throw new ErroDemo(400, 'Selecione pelo menos um dia de atendimento.');
    const convenios = R.listaConvenios(b.convenios);
    let valor = null;
    if (b.valor_consulta !== '' && b.valor_consulta !== null && b.valor_consulta !== undefined) {
      valor = Math.round(Number(String(b.valor_consulta).replace(',', '.')) * 100);
      if (!Number.isFinite(valor) || valor < 0) throw new ErroDemo(400, 'Valor da consulta inválido.');
    }
    const novo = {
      especialidade: texto(b.especialidade, { obrigatorio: true, max: 80, nome: 'Especialidade' }),
      registro: texto(b.registro, { max: 40 }),
      descricao: texto(b.descricao, { max: 200 }),
      sobre: texto(b.sobre, { max: 2000 }),
      formacao: texto(b.formacao, { max: 2000 }),
      foto,
      dias_atendimento: [...new Set(b.dias_atendimento)].sort().join(''),
      hora_inicio: texto(b.hora_inicio),
      hora_fim: texto(b.hora_fim),
      pausa_inicio: texto(b.pausa_inicio),
      pausa_fim: texto(b.pausa_fim),
      duracao_consulta: Number(b.duracao_consulta),
      valor_consulta: valor,
      aceita_particular: b.aceita_particular !== false,
      convenios: convenios.join('\n') || null,
    };
    const erro = R.validarExpediente(novo);
    if (erro) throw new ErroDemo(400, erro);
    if (!novo.aceita_particular && !convenios.length) {
      throw new ErroDemo(400, 'Aceite consultas particulares ou informe pelo menos um convênio.');
    }
    u.nome = texto(b.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
    Object.assign(p, novo);
    return perfilPublico(p);
  });

  rota('GET', /^\/profissional\/agenda$/, (_, __, q) => {
    const p = profDoUsuario(exigir('profissional'));
    const hoje = agora().data;
    const periodo = q.get('periodo') || 'proximas';
    let lista = db.consultas.filter((c) => c.profissional_id === p.id);
    if (periodo === 'hoje') lista = lista.filter((c) => c.data === hoje).sort(ordenarAsc);
    else if (periodo === 'proximas') lista = lista.filter((c) => c.data >= hoje && c.status === 'agendada').sort(ordenarAsc);
    else if (periodo === 'anteriores') lista = lista.filter((c) => c.data < hoje).sort(ordenarDesc);
    else lista = lista.sort(ordenarDesc);
    return lista.map(detalhar);
  });

  /* Resumo e configurações */
  rota('GET', /^\/resumo$/, () => {
    const u = exigir();
    const hoje = agora().data;
    const futura = (c) => c.status === 'agendada' && c.data >= hoje;
    if (EQUIPE.includes(u.tipo)) {
      return {
        hoje: db.consultas.filter((c) => c.data === hoje && c.status !== 'cancelada').length,
        agendadas: db.consultas.filter(futura).length,
        pacientes: db.usuarios.filter((x) => x.tipo === 'paciente').length,
        profissionais: db.profissionais.filter((p) => p.ativo).length,
      };
    }
    if (u.tipo === 'profissional') {
      const p = profDoUsuario(u);
      const minhas = db.consultas.filter((c) => c.profissional_id === p.id);
      return {
        hoje: minhas.filter((c) => c.data === hoje && c.status === 'agendada').length,
        proximas: minhas.filter(futura).length,
        concluidas: minhas.filter((c) => c.status === 'concluida').length,
        faltas: minhas.filter((c) => c.status === 'faltou').length,
      };
    }
    const proximas = futurasDoPaciente(u.id).sort(ordenarAsc);
    return {
      profissionais: db.profissionais.filter((x) => x.ativo).length,
      proximas: proximas.length,
      proxima: proximas[0] ? detalhar(proximas[0]) : null,
    };
  });

  rota('GET', /^\/configuracoes$/, () => ({ ...db.config }));

  /* Consultas */
  rota('GET', /^\/consultas$/, () => {
    const u = exigir('paciente');
    return db.consultas.filter((c) => c.usuario_id === u.id).sort(ordenarDesc).map(detalhar);
  });

  rota('GET', /^\/agenda$/, (_, __, q) => {
    exigir(...EQUIPE);
    const data = q.get('data') || agora().data;
    const prof = Number(q.get('profissional_id')) || null;
    return db.consultas.filter((c) => c.data === data && (!prof || c.profissional_id === prof))
      .map(detalhar)
      .sort((a, b) => a.horario.localeCompare(b.horario) || a.profissional_nome.localeCompare(b.profissional_nome));
  });

  rota('POST', /^\/consultas$/, (_, corpo) => {
    const u = exigir('paciente', ...EQUIPE);
    const equipe = EQUIPE.includes(u.tipo);
    let pacienteId = u.id;
    if (equipe) {
      const pac = db.usuarios.find((x) => x.id === Number(corpo.paciente_id) && x.tipo === 'paciente');
      if (!pac) throw new ErroDemo(400, 'Escolha o paciente.');
      pacienteId = pac.id;
    }
    const p = profAtivo(corpo.profissional_id);

    const motivo = texto(corpo.motivo, { max: 40 });
    if (motivo && !R.MOTIVOS.includes(motivo)) throw new ErroDemo(400, 'Motivo inválido.');
    const pagamento = corpo.pagamento === 'convenio' ? 'convenio' : 'particular';
    let convenio = null;
    if (pagamento === 'particular' && !p.aceita_particular) throw new ErroDemo(400, 'Este profissional atende apenas por convênio.');
    if (pagamento === 'convenio') {
      convenio = texto(corpo.convenio, { obrigatorio: true, max: 80, nome: 'Convênio' });
      if (!R.listaConvenios(p.convenios).includes(convenio)) throw new ErroDemo(400, 'Este profissional não atende por esse convênio.');
    }

    if (!equipe) {
      const limite = db.config.limite_consultas_futuras;
      const futuras = futurasDoPaciente(pacienteId).length;
      if (limite > 0 && futuras >= limite) {
        throw new ErroDemo(400, `Você já tem ${futuras} consulta(s) marcada(s), que é o máximo permitido. `
          + 'Cancele uma ou fale com a clínica para agendar outra.');
      }
    }
    verificarHorario(p, corpo.data, corpo.horario);

    const c = {
      id: novoId('consultas'), usuario_id: pacienteId, profissional_id: p.id, data: corpo.data, horario: corpo.horario,
      duracao: Number(p.duracao_consulta), status: 'agendada', motivo, observacao: texto(corpo.observacao, { max: 500 }),
      pagamento, convenio, valor: pagamento === 'particular' ? p.valor_consulta ?? null : null,
      data_criacao: new Date().toISOString(),
    };
    db.consultas.push(c);
    return { id: c.id };
  });

  rota('PATCH', /^\/consultas\/(\d+)$/, ([id], corpo) => {
    const u = exigir();
    if (!['cancelada', 'concluida', 'faltou'].includes(corpo.status)) throw new ErroDemo(400, 'Status inválido.');
    const { c, papel } = carregarParaAlterar(u, id);
    if (papel === 'paciente') {
      if (corpo.status !== 'cancelada') throw new ErroDemo(403, 'Você não tem permissão para alterar esta consulta.');
      conferirPrazo(c, 'cancelar');
    }
    c.status = corpo.status;
    return { ok: true };
  });

  rota('PATCH', /^\/consultas\/(\d+)\/reagendar$/, ([id], corpo) => {
    const u = exigir();
    const { c, papel } = carregarParaAlterar(u, id);
    if (papel === 'paciente') conferirPrazo(c, 'remarcar');
    const p = profAtivo(c.profissional_id);
    verificarHorario(p, corpo.data, corpo.horario, c.id);
    Object.assign(c, { data: corpo.data, horario: corpo.horario, duracao: Number(p.duracao_consulta) });
    return { ok: true };
  });

  /* Pacientes (recepção) */
  rota('GET', /^\/pacientes$/, (_, __, q) => {
    exigir(...EQUIPE);
    const termo = String(q.get('busca') || '').trim().toLowerCase();
    return db.usuarios.filter((u) => u.tipo === 'paciente' && (!termo
      || [u.nome, u.email, u.telefone].some((v) => String(v || '').toLowerCase().includes(termo))))
      .sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 20).map(publico);
  });

  rota('POST', /^\/pacientes$/, (_, corpo) => {
    exigir(...EQUIPE);
    const nome = texto(corpo.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
    const telefone = texto(corpo.telefone, { max: 30 });
    const email = texto(corpo.email, { max: 160 })?.toLowerCase() || null;
    if (!telefone && !email) throw new ErroDemo(400, 'Informe pelo menos o telefone ou o e-mail do paciente.');
    if (email && !emailValido(email)) throw new ErroDemo(400, 'E-mail inválido.');
    if (email && db.usuarios.some((u) => u.email === email)) {
      throw new ErroDemo(409, 'Já existe uma conta com este e-mail. Busque o paciente pelo nome.');
    }
    const u = {
      id: novoId('usuarios'), nome, email, telefone, data_nascimento: corpo.data_nascimento || null,
      senha: Math.random().toString(36), tipo: 'paciente', data_cadastro: new Date().toISOString(),
    };
    db.usuarios.push(u);
    return publico(u);
  });

  /* Bloqueios */
  rota('GET', /^\/bloqueios$/, (_, __, q) => {
    const u = exigir('profissional', ...EQUIPE);
    const hoje = agora().data;
    const proprio = u.tipo === 'profissional' ? profDoUsuario(u) : null;
    const filtro = proprio ? proprio.id : Number(q.get('profissional_id')) || null;
    return db.bloqueios
      .filter((b) => b.data_fim >= hoje && (!filtro || b.profissional_id === null || b.profissional_id === filtro))
      .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio) || a.id - b.id)
      .map((b) => {
        const p = db.profissionais.find((x) => x.id === b.profissional_id);
        return {
          id: b.id, profissional_id: b.profissional_id, data_inicio: b.data_inicio, data_fim: b.data_fim,
          motivo: b.motivo, profissional_nome: p ? db.usuarios.find((x) => x.id === p.usuario_id).nome : null,
        };
      });
  });

  rota('POST', /^\/bloqueios$/, (_, corpo) => {
    const u = exigir('profissional', ...EQUIPE);
    const inicio = corpo.data_inicio;
    const fim = corpo.data_fim || inicio;
    const hoje = agora().data;
    if (!dataValida(inicio) || !dataValida(fim)) throw new ErroDemo(400, 'Informe as datas do bloqueio.');
    if (fim < inicio) throw new ErroDemo(400, 'A data final deve ser igual ou depois da inicial.');
    if (fim < hoje) throw new ErroDemo(400, 'O bloqueio precisa incluir hoje ou uma data futura.');
    const proprio = u.tipo === 'profissional' ? profDoUsuario(u) : null;
    let profissionalId = proprio ? proprio.id : null;
    if (!proprio && corpo.profissional_id) profissionalId = profAtivo(corpo.profissional_id).id;
    db.bloqueios.push({
      id: novoId('bloqueios'), profissional_id: profissionalId, data_inicio: inicio, data_fim: fim,
      motivo: texto(corpo.motivo, { max: 120 }), criado_por: u.id,
    });
    const de = inicio < hoje ? hoje : inicio;
    const afetadas = db.consultas.filter((c) => c.status === 'agendada' && c.data >= de && c.data <= fim
      && (!profissionalId || c.profissional_id === profissionalId)).length;
    return { id: db.seq.bloqueios, consultas_afetadas: afetadas };
  });

  rota('DELETE', /^\/bloqueios\/(\d+)$/, ([id]) => {
    const u = exigir('profissional', ...EQUIPE);
    const b = db.bloqueios.find((x) => x.id === Number(id));
    if (!b) throw new ErroDemo(404, 'Bloqueio não encontrado.');
    if (u.tipo === 'profissional' && b.profissional_id !== profDoUsuario(u).id) {
      throw new ErroDemo(403, 'Só a administração pode remover este bloqueio.');
    }
    db.bloqueios = db.bloqueios.filter((x) => x !== b);
    return { ok: true };
  });

  /* Administração */
  rota('GET', /^\/admin\/profissionais$/, () => {
    exigir('admin');
    return db.profissionais.map((p) => {
      const u = db.usuarios.find((x) => x.id === p.usuario_id);
      return { ...perfilPublico(p), email: u.email, telefone: u.telefone };
    }).sort((a, b) => a.nome.localeCompare(b.nome));
  });

  rota('POST', /^\/admin\/profissionais$/, (_, corpo) => {
    exigir('admin');
    const especialidade = texto(corpo.especialidade, { obrigatorio: true, max: 80, nome: 'Especialidade' });
    const u = novaConta(corpo, 'profissional');
    const p = {
      id: novoId('profissionais'), usuario_id: u.id, especialidade, registro: texto(corpo.registro),
      descricao: null, sobre: null, formacao: null, foto: null, dias_atendimento: '12345', ativo: true,
      hora_inicio: '08:00', hora_fim: '18:00', pausa_inicio: '12:00', pausa_fim: '14:00', duracao_consulta: 30,
      valor_consulta: null, aceita_particular: true, convenios: null,
    };
    db.profissionais.push(p);
    return { id: p.id };
  });

  rota('PATCH', /^\/admin\/profissionais\/(\d+)$/, ([id], corpo) => {
    exigir('admin');
    const p = db.profissionais.find((x) => x.id === Number(id));
    if (!p) throw new ErroDemo(404, 'Profissional não encontrado.');
    p.ativo = !!corpo.ativo;
    return { ok: true };
  });

  rota('GET', /^\/admin\/recepcao$/, () => {
    exigir('admin');
    return db.usuarios.filter((u) => u.tipo === 'recepcao').map(publico);
  });

  rota('POST', /^\/admin\/recepcao$/, (_, corpo) => {
    exigir('admin');
    return { id: novaConta(corpo, 'recepcao').id };
  });

  rota('DELETE', /^\/admin\/recepcao\/(\d+)$/, ([id]) => {
    exigir('admin');
    const antes = db.usuarios.length;
    db.usuarios = db.usuarios.filter((u) => !(u.id === Number(id) && u.tipo === 'recepcao'));
    if (db.usuarios.length === antes) throw new ErroDemo(404, 'Conta não encontrada.');
    return { ok: true };
  });

  rota('PUT', /^\/admin\/configuracoes$/, (_, corpo) => {
    exigir('admin');
    const inteiro = (v, nome, min, max) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw new ErroDemo(400, `${nome}: informe um número entre ${min} e ${max}.`);
      return n;
    };
    db.config = {
      limite_consultas_futuras: inteiro(corpo.limite_consultas_futuras, 'Limite de consultas', 0, 50),
      prazo_cancelamento_horas: inteiro(corpo.prazo_cancelamento_horas, 'Prazo para cancelar', 0, 168),
      antecedencia_maxima_dias: inteiro(corpo.antecedencia_maxima_dias, 'Antecedência máxima', 7, 730),
    };
    return { ...db.config };
  });

  /* ---------- "Servidor" ---------- */
  window.apiDemo = async function (caminho, { metodo = 'GET', corpo } = {}) {
    await new Promise((r) => setTimeout(r, 150)); // simula a rede
    const [rotaPath, qs] = caminho.split('?');
    const query = new URLSearchParams(qs || '');
    for (const r of rotas) {
      const m = r.metodo === metodo && rotaPath.match(r.padrao);
      if (!m) continue;
      const resultado = r.fn(m.slice(1), JSON.parse(JSON.stringify(corpo || {})), query);
      salvar();
      return JSON.parse(JSON.stringify(resultado));
    }
    throw new ErroDemo(404, 'Rota não encontrada.');
  };
}());
