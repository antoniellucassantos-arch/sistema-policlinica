/* ==========================================================
   MODO DEMONSTRAÇÃO
   Simula a API do servidor dentro do navegador (localStorage),
   para mostrar o sistema em hospedagens estáticas como o
   GitHub Pages. Os dados ficam só no navegador de quem acessa.
   Ativado automaticamente em *.github.io, ao abrir o arquivo
   direto (file://) ou com ?demo na URL.
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

  const CHAVE = 'medagenda_demo_v1';
  const HORARIOS = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
    '11:00', '11:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30',
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const diaSemana = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).getDay(); };
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
      { id: 1, nome: 'Administrador', email: 'admin@demo.com', senha: 'demo123', tipo: 'admin' },
      { id: 2, nome: 'Dra. Ana Beatriz Lima', email: 'ana.lima@demo.com', senha: 'demo123', tipo: 'profissional' },
      { id: 3, nome: 'Dr. Carlos Eduardo Souza', email: 'carlos.souza@demo.com', senha: 'demo123', tipo: 'profissional' },
      { id: 4, nome: 'Dra. Juliana Martins', email: 'juliana.martins@demo.com', senha: 'demo123', tipo: 'profissional' },
      { id: 5, nome: 'Rafael Oliveira', email: 'rafael.oliveira@demo.com', senha: 'demo123', tipo: 'profissional' },
      { id: 6, nome: 'Maria Paciente', email: 'paciente@demo.com', senha: 'demo123', tipo: 'paciente', telefone: '(11) 98888-7777', data_nascimento: '1990-05-20' },
      { id: 7, nome: 'João Pereira', email: 'joao@demo.com', senha: 'demo123', tipo: 'paciente', telefone: '(11) 97777-1234', data_nascimento: '1978-11-02' },
      { id: 8, nome: 'Luiza Fernandes', email: 'luiza@demo.com', senha: 'demo123', tipo: 'paciente', telefone: '(11) 96666-4321', data_nascimento: '2001-03-15' },
    ].map((u) => ({ telefone: null, data_nascimento: null, data_cadastro: hoje, ...u }));

    const profissionais = [
      {
        id: 1, usuario_id: 2, especialidade: 'Clínica Geral', registro: 'CRM 12345-SP',
        descricao: 'Atendimento humanizado para adultos e idosos.',
        sobre: 'Médica clínica com foco em prevenção e acompanhamento de doenças crônicas, como hipertensão e diabetes.',
        formacao: 'Medicina — USP\nResidência em Clínica Médica — Hospital das Clínicas', dias_atendimento: '12345',
      },
      {
        id: 2, usuario_id: 3, especialidade: 'Cardiologia', registro: 'CRM 23456-SP',
        descricao: 'Check-up cardiológico e acompanhamento de arritmias.',
        sobre: 'Cardiologista com mais de 15 anos de experiência em prevenção cardiovascular.',
        formacao: 'Medicina — UNIFESP\nResidência em Cardiologia — InCor', dias_atendimento: '135',
      },
      {
        id: 3, usuario_id: 4, especialidade: 'Pediatria', registro: 'CRM 34567-SP',
        descricao: 'Cuidado com a saúde de bebês, crianças e adolescentes.',
        sobre: 'Pediatra apaixonada por acompanhar o crescimento e desenvolvimento dos pequenos.',
        formacao: 'Medicina — UNICAMP\nResidência em Pediatria — Hospital Infantil Sabará', dias_atendimento: '246',
      },
      {
        id: 4, usuario_id: 5, especialidade: 'Psicologia', registro: 'CRP 06/98765',
        descricao: 'Terapia cognitivo-comportamental para adultos.',
        sobre: 'Psicólogo clínico com atuação em ansiedade, depressão e orientação profissional.',
        formacao: 'Psicologia — PUC-SP\nEspecialização em Terapia Cognitivo-Comportamental', dias_atendimento: '1234',
      },
    ].map((p) => ({ foto: null, ativo: true, ...p }));

    const ana = profissionais[0].dias_atendimento;
    const carlos = profissionais[1].dias_atendimento;
    const consultas = [
      { usuario_id: 6, profissional_id: 1, data: diaDeAtendimento(ana, 1, 0), horario: '09:00', status: 'agendada' },
      { usuario_id: 7, profissional_id: 1, data: diaDeAtendimento(ana, 1, 0), horario: '10:30', status: 'agendada' },
      { usuario_id: 8, profissional_id: 1, data: diaDeAtendimento(ana, 1, 1), horario: '14:00', status: 'agendada' },
      { usuario_id: 7, profissional_id: 1, data: diaDeAtendimento(ana, -1, 0), horario: '11:00', status: 'concluida' },
      { usuario_id: 6, profissional_id: 2, data: diaDeAtendimento(carlos, -1, 1), horario: '15:30', status: 'concluida' },
      { usuario_id: 6, profissional_id: 2, data: diaDeAtendimento(carlos, 1, 1), horario: '16:00', status: 'agendada' },
    ].map((c, i) => ({ id: i + 1, data_criacao: hoje, ...c }));

    return { usuarios, profissionais, consultas, redefinicoes: [], sessao: null, seq: { usuarios: 8, profissionais: 4, consultas: consultas.length } };
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
  function resposta(u) {
    const p = u.tipo === 'profissional' ? db.profissionais.find((x) => x.usuario_id === u.id) : null;
    return { usuario: publico(u), profissional: p ? { ...p } : null };
  }
  function perfilPublico(p) {
    const u = db.usuarios.find((x) => x.id === p.usuario_id);
    return {
      id: p.id, nome: u.nome, especialidade: p.especialidade, registro: p.registro, descricao: p.descricao,
      sobre: p.sobre, formacao: p.formacao, foto: p.foto, dias_atendimento: p.dias_atendimento, ativo: p.ativo,
    };
  }
  const nomeDoProf = (p) => db.usuarios.find((u) => u.id === p.usuario_id).nome;
  const ordenarDesc = (a, b) => (b.data + b.horario).localeCompare(a.data + a.horario);
  const ordenarAsc = (a, b) => (a.data + a.horario).localeCompare(b.data + b.horario);
  const ocupado = (profId, data, horario, ignorarId) => db.consultas.some((c) => (
    c.profissional_id === profId && c.data === data && c.horario === horario
    && c.status !== 'cancelada' && c.id !== ignorarId
  ));

  /* ---------- Rotas ---------- */
  const rotas = [];
  const rota = (metodo, padrao, fn) => rotas.push({ metodo, padrao, fn });

  rota('GET', /^\/auth\/eu$/, () => {
    const u = usuarioLogado();
    return u ? resposta(u) : { usuario: null, profissional: null };
  });

  rota('POST', /^\/auth\/login$/, (_, corpo) => {
    const email = String(corpo.email || '').trim().toLowerCase();
    const u = db.usuarios.find((x) => x.email === email);
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

  rota('GET', /^\/profissionais$/, () => db.profissionais.filter((p) => p.ativo).map(perfilPublico)
    .sort((a, b) => a.nome.localeCompare(b.nome)));

  rota('GET', /^\/profissionais\/(\d+)$/, ([id]) => {
    const p = db.profissionais.find((x) => x.id === Number(id) && x.ativo);
    if (!p) throw new ErroDemo(404, 'Profissional não encontrado.');
    return perfilPublico(p);
  });

  rota('GET', /^\/profissionais\/(\d+)\/horarios$/, ([id], _, query) => {
    const p = db.profissionais.find((x) => x.id === Number(id) && x.ativo);
    if (!p) throw new ErroDemo(404, 'Profissional não encontrado.');
    const data = query.get('data');
    const { data: hoje, hora } = agora();
    if (data < hoje || data > somarDias(hoje, 180)) {
      return { atende: false, motivo: 'Data fora do período de agendamento.', horarios: [] };
    }
    if (!p.dias_atendimento.includes(String(diaSemana(data)))) {
      return { atende: false, motivo: 'O profissional não atende neste dia da semana.', horarios: [] };
    }
    return {
      atende: true,
      horarios: HORARIOS.map((h) => ({
        horario: h,
        disponivel: !ocupado(p.id, data, h) && !(data === hoje && h <= hora),
      })),
    };
  });

  rota('PUT', /^\/profissional\/perfil$/, (_, corpo) => {
    const u = exigir('profissional');
    const p = db.profissionais.find((x) => x.usuario_id === u.id);
    const foto = texto(corpo.foto, { max: 500 });
    if (foto && !/^https?:\/\//i.test(foto)) throw new ErroDemo(400, 'O link da foto deve começar com http:// ou https://.');
    if (!/^[0-6]{1,7}$/.test(corpo.dias_atendimento || '')) throw new ErroDemo(400, 'Selecione pelo menos um dia de atendimento.');
    u.nome = texto(corpo.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
    Object.assign(p, {
      especialidade: texto(corpo.especialidade, { obrigatorio: true, max: 80, nome: 'Especialidade' }),
      registro: texto(corpo.registro, { max: 40 }),
      descricao: texto(corpo.descricao, { max: 200 }),
      sobre: texto(corpo.sobre, { max: 2000 }),
      formacao: texto(corpo.formacao, { max: 2000 }),
      foto,
      dias_atendimento: [...new Set(corpo.dias_atendimento)].sort().join(''),
    });
    return perfilPublico(p);
  });

  rota('GET', /^\/profissional\/agenda$/, (_, __, query) => {
    const u = exigir('profissional');
    const p = db.profissionais.find((x) => x.usuario_id === u.id);
    const hoje = agora().data;
    const periodo = query.get('periodo') || 'proximas';
    let lista = db.consultas.filter((c) => c.profissional_id === p.id);
    if (periodo === 'hoje') lista = lista.filter((c) => c.data === hoje).sort(ordenarAsc);
    else if (periodo === 'proximas') lista = lista.filter((c) => c.data >= hoje && c.status === 'agendada').sort(ordenarAsc);
    else if (periodo === 'anteriores') lista = lista.filter((c) => c.data < hoje).sort(ordenarDesc);
    else lista = lista.sort(ordenarDesc);
    return lista.map((c) => {
      const pac = db.usuarios.find((x) => x.id === c.usuario_id);
      return {
        id: c.id, data: c.data, horario: c.horario, status: c.status,
        paciente_nome: pac.nome, paciente_telefone: pac.telefone,
        paciente_email: pac.email, paciente_nascimento: pac.data_nascimento,
      };
    });
  });

  rota('GET', /^\/resumo$/, () => {
    const u = exigir();
    const hoje = agora().data;
    const futura = (c) => c.status === 'agendada' && c.data >= hoje;
    if (u.tipo === 'admin') {
      return {
        pacientes: db.usuarios.filter((x) => x.tipo === 'paciente').length,
        profissionais: db.profissionais.filter((p) => p.ativo).length,
        agendadas: db.consultas.filter(futura).length,
      };
    }
    if (u.tipo === 'profissional') {
      const p = db.profissionais.find((x) => x.usuario_id === u.id);
      const minhas = db.consultas.filter((c) => c.profissional_id === p.id);
      return {
        hoje: minhas.filter((c) => c.data === hoje && c.status === 'agendada').length,
        proximas: minhas.filter(futura).length,
        concluidas: minhas.filter((c) => c.status === 'concluida').length,
      };
    }
    const proximas = db.consultas.filter((c) => c.usuario_id === u.id && futura(c)).sort(ordenarAsc);
    const c = proximas[0];
    const p = c && db.profissionais.find((x) => x.id === c.profissional_id);
    return {
      profissionais: db.profissionais.filter((x) => x.ativo).length,
      proximas: proximas.length,
      proxima: c ? { id: c.id, data: c.data, horario: c.horario, profissional_nome: nomeDoProf(p), especialidade: p.especialidade } : null,
    };
  });

  rota('GET', /^\/consultas$/, () => {
    const u = exigir('paciente');
    return db.consultas.filter((c) => c.usuario_id === u.id).sort(ordenarDesc).map((c) => {
      const p = db.profissionais.find((x) => x.id === c.profissional_id);
      return {
        id: c.id, data: c.data, horario: c.horario, status: c.status, profissional_id: p.id,
        profissional_nome: nomeDoProf(p), especialidade: p.especialidade, foto: p.foto,
      };
    });
  });

  rota('POST', /^\/consultas$/, (_, corpo) => {
    const u = exigir('paciente');
    const p = db.profissionais.find((x) => x.id === Number(corpo.profissional_id) && x.ativo);
    if (!p) throw new ErroDemo(404, 'Profissional não encontrado.');
    const { data, horario } = corpo;
    const { data: hoje, hora } = agora();
    if (!HORARIOS.includes(horario)) throw new ErroDemo(400, 'Horário inválido.');
    if (data < hoje || (data === hoje && horario <= hora)) throw new ErroDemo(400, 'Escolha uma data e horário futuros.');
    if (!p.dias_atendimento.includes(String(diaSemana(data)))) throw new ErroDemo(400, 'O profissional não atende neste dia da semana.');
    if (ocupado(p.id, data, horario)) throw new ErroDemo(409, 'Este horário acabou de ser reservado. Escolha outro.');
    const c = {
      id: novoId('consultas'), usuario_id: u.id, profissional_id: p.id, data, horario,
      status: 'agendada', data_criacao: new Date().toISOString(),
    };
    db.consultas.push(c);
    return { id: c.id };
  });

  rota('PATCH', /^\/consultas\/(\d+)$/, ([id], corpo) => {
    const u = exigir();
    if (!['cancelada', 'concluida'].includes(corpo.status)) throw new ErroDemo(400, 'Status inválido.');
    const c = db.consultas.find((x) => x.id === Number(id));
    if (!c) throw new ErroDemo(404, 'Consulta não encontrada.');
    let permitido = u.tipo === 'admin';
    if (u.tipo === 'paciente') permitido = c.usuario_id === u.id && corpo.status === 'cancelada';
    if (u.tipo === 'profissional') {
      const p = db.profissionais.find((x) => x.usuario_id === u.id);
      permitido = c.profissional_id === p.id;
    }
    if (!permitido) throw new ErroDemo(403, 'Você não tem permissão para alterar esta consulta.');
    if (c.status !== 'agendada') throw new ErroDemo(400, 'Só é possível alterar consultas que ainda estão agendadas.');
    c.status = corpo.status;
    return { ok: true };
  });

  rota('GET', /^\/admin\/profissionais$/, () => {
    exigir('admin');
    return db.profissionais.map((p) => {
      const u = db.usuarios.find((x) => x.id === p.usuario_id);
      return { ...perfilPublico(p), email: u.email, telefone: u.telefone };
    }).sort((a, b) => a.nome.localeCompare(b.nome));
  });

  rota('POST', /^\/admin\/profissionais$/, (_, corpo) => {
    exigir('admin');
    const email = String(corpo.email || '').trim().toLowerCase();
    const nome = texto(corpo.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
    const especialidade = texto(corpo.especialidade, { obrigatorio: true, max: 80, nome: 'Especialidade' });
    if (!emailValido(email)) throw new ErroDemo(400, 'Informe um e-mail válido.');
    validarSenha(corpo.senha);
    if (db.usuarios.some((u) => u.email === email)) throw new ErroDemo(409, 'Já existe uma conta com este e-mail.');
    const u = {
      id: novoId('usuarios'), nome, email, senha: corpo.senha, tipo: 'profissional',
      telefone: texto(corpo.telefone), data_nascimento: null, data_cadastro: new Date().toISOString(),
    };
    db.usuarios.push(u);
    const p = {
      id: novoId('profissionais'), usuario_id: u.id, especialidade, registro: texto(corpo.registro),
      descricao: null, sobre: null, formacao: null, foto: null, dias_atendimento: '12345', ativo: true,
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
