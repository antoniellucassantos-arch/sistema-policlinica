/* ==========================================================
   TESTES DA API — npm test
   Usa um banco SQLite temporário. Para testar em PostgreSQL ou
   MySQL, defina TEST_DB_CLIENT e TEST_DATABASE_URL apontando
   para um banco VAZIO (as tabelas são apagadas e recriadas).
========================================================== */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'medagenda-'));
if (process.env.TEST_DB_CLIENT) {
  process.env.DB_CLIENT = process.env.TEST_DB_CLIENT;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.DB_CLIENT = 'sqlite';
  process.env.SQLITE_FILE = path.join(pasta, 'teste.sqlite');
}
process.env.JWT_SECRET = 'segredo-de-teste';

const app = require('../server/index');
const { db, inserir, agoraISO } = require('../server/db');
const { hashSenha } = require('../server/auth');
const correio = require('../server/email');
const { agoraNoFuso, somarDias, diaDaSemana } = require('../server/util');

const emails = [];
correio.enviarEmail = async (msg) => { emails.push(msg); };

let servidor;
let base;

/** Cliente HTTP simples que guarda o cookie de sessão. */
function cliente() {
  let cookie = '';
  return async function chamar(metodo, caminho, corpo) {
    const resp = await fetch(base + caminho, {
      method: metodo,
      headers: {
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const setCookie = resp.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: resp.status, corpo: await resp.json().catch(() => null) };
  };
}

/** Próxima data (a partir de amanhã) em que o profissional atende. */
function proximoDiaDeAtendimento(dias, aPartirDe = 1) {
  let data = somarDias(agoraNoFuso().data, aPartirDe);
  while (!dias.includes(String(diaDaSemana(data)))) data = somarDias(data, 1);
  return data;
}

before(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await inserir(db, 'usuarios', {
    nome: 'Admin',
    email: 'admin@teste.com',
    senha_hash: await hashSenha('admin123'),
    tipo: 'admin',
    data_cadastro: agoraISO(),
  });
  await new Promise((ok) => { servidor = app.listen(0, ok); });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(async () => {
  servidor.close();
  await db.destroy();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('fluxo completo: cadastro, recuperação de senha, perfis e agendamento', async () => {
  const paciente = cliente();
  const outroPaciente = cliente();
  const admin = cliente();
  const medico = cliente();

  /* ----- Cadastro e login ----- */
  let r = await paciente('POST', '/auth/cadastro', {
    nome: 'Maria Teste', email: 'Maria@Teste.com', telefone: '1199999', data_nascimento: '1990-01-01', senha: 'senha123',
  });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.usuario.email, 'maria@teste.com');
  assert.equal(r.corpo.usuario.tipo, 'paciente');

  r = await paciente('POST', '/auth/cadastro', { nome: 'X', email: 'maria@teste.com', senha: 'senha123' });
  assert.equal(r.status, 409);

  r = await cliente()('POST', '/auth/login', { email: 'maria@teste.com', senha: 'errada' });
  assert.equal(r.status, 401);

  r = await paciente('GET', '/auth/eu');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.usuario.nome, 'Maria Teste');

  /* ----- Esqueci minha senha ----- */
  r = await cliente()('POST', '/auth/esqueci-senha', { email: 'ninguem@teste.com' });
  assert.equal(r.status, 200);
  assert.equal(emails.length, 0);

  r = await cliente()('POST', '/auth/esqueci-senha', { email: 'maria@teste.com' });
  assert.equal(r.status, 200);
  assert.equal(emails.length, 1);
  const token = emails[0].texto.match(/redefinir=([a-f0-9]{64})/)[1];

  const recuperando = cliente();
  r = await recuperando('POST', '/auth/redefinir-senha', { token, senha: 'novaSenha1' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.usuario.email, 'maria@teste.com');

  r = await cliente()('POST', '/auth/redefinir-senha', { token, senha: 'outra123' });
  assert.equal(r.status, 400, 'o link não pode ser usado duas vezes');

  r = await paciente('GET', '/auth/eu');
  assert.equal(r.corpo.usuario, null, 'sessões antigas caem quando a senha muda');
  r = await paciente('GET', '/consultas');
  assert.equal(r.status, 401);

  r = await paciente('POST', '/auth/login', { email: 'maria@teste.com', senha: 'senha123' });
  assert.equal(r.status, 401);
  r = await paciente('POST', '/auth/login', { email: 'maria@teste.com', senha: 'novaSenha1' });
  assert.equal(r.status, 200);

  /* ----- Admin cadastra um profissional ----- */
  r = await paciente('POST', '/admin/profissionais', {});
  assert.equal(r.status, 403);

  r = await admin('POST', '/auth/login', { email: 'admin@teste.com', senha: 'admin123' });
  assert.equal(r.status, 200);
  r = await admin('POST', '/admin/profissionais', {
    nome: 'Dr. João', email: 'joao@teste.com', senha: 'medico123', especialidade: 'Cardiologia', registro: 'CRM 1',
  });
  assert.equal(r.status, 201);
  const profissionalId = r.corpo.id;

  /* ----- Profissional edita o próprio perfil ----- */
  r = await medico('POST', '/auth/login', { email: 'joao@teste.com', senha: 'medico123' });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.usuario.tipo, 'profissional');
  assert.equal(r.corpo.profissional.id, profissionalId);

  r = await medico('PUT', '/profissional/perfil', {
    nome: 'Dr. João Silva',
    especialidade: 'Cardiologia',
    registro: 'CRM 12345',
    descricao: 'Cuidando do seu coração',
    sobre: 'Mais de 10 anos de experiência.',
    formacao: 'Medicina — USP',
    foto: 'javascript:alert(1)',
    dias_atendimento: '135',
  });
  assert.equal(r.status, 400, 'link de foto precisa ser http(s)');

  r = await medico('PUT', '/profissional/perfil', {
    nome: 'Dr. João Silva',
    especialidade: 'Cardiologia',
    registro: 'CRM 12345',
    descricao: 'Cuidando do seu coração',
    sobre: 'Mais de 10 anos de experiência.',
    formacao: 'Medicina — USP',
    foto: '',
    dias_atendimento: '531',
  });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.dias_atendimento, '135');

  r = await paciente('GET', `/profissionais/${profissionalId}`);
  assert.equal(r.corpo.nome, 'Dr. João Silva');
  assert.equal(r.corpo.sobre, 'Mais de 10 anos de experiência.');
  assert.equal(r.corpo.email, undefined, 'e-mail do profissional não é público');

  /* ----- Horários e agendamento ----- */
  const data = proximoDiaDeAtendimento('135');
  const diaSemAtendimento = proximoDiaDeAtendimento('0246');

  r = await paciente('GET', `/profissionais/${profissionalId}/horarios?data=${diaSemAtendimento}`);
  assert.equal(r.corpo.atende, false);

  r = await paciente('GET', `/profissionais/${profissionalId}/horarios?data=${data}`);
  assert.equal(r.corpo.atende, true);
  assert.ok(r.corpo.horarios.every((h) => h.disponivel));

  r = await paciente('POST', '/consultas', { profissional_id: profissionalId, data: diaSemAtendimento, horario: '09:00' });
  assert.equal(r.status, 400);

  r = await paciente('POST', '/consultas', { profissional_id: profissionalId, data, horario: '09:15' });
  assert.equal(r.status, 400, 'só horários da grade');

  r = await paciente('POST', '/consultas', { profissional_id: profissionalId, data, horario: '09:00' });
  assert.equal(r.status, 201);
  const consultaId = r.corpo.id;

  r = await outroPaciente('POST', '/auth/cadastro', { nome: 'Pedro', email: 'pedro@teste.com', senha: 'senha123' });
  assert.equal(r.status, 201);
  r = await outroPaciente('POST', '/consultas', { profissional_id: profissionalId, data, horario: '09:00' });
  assert.equal(r.status, 409, 'horário já ocupado');

  r = await outroPaciente('GET', `/profissionais/${profissionalId}/horarios?data=${data}`);
  assert.equal(r.corpo.horarios.find((h) => h.horario === '09:00').disponivel, false);

  r = await outroPaciente('PATCH', `/consultas/${consultaId}`, { status: 'cancelada' });
  assert.equal(r.status, 403, 'paciente não cancela consulta de outro');

  /* ----- Agenda do profissional ----- */
  r = await medico('GET', '/profissional/agenda?periodo=proximas');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.length, 1);
  assert.equal(r.corpo[0].paciente_nome, 'Maria Teste');

  r = await medico('GET', '/resumo');
  assert.equal(r.corpo.proximas, 1);

  r = await paciente('PATCH', `/consultas/${consultaId}`, { status: 'concluida' });
  assert.equal(r.status, 403, 'paciente não marca como concluída');

  r = await paciente('PATCH', `/consultas/${consultaId}`, { status: 'cancelada' });
  assert.equal(r.status, 200);

  r = await outroPaciente('POST', '/consultas', { profissional_id: profissionalId, data, horario: '09:00' });
  assert.equal(r.status, 201, 'cancelar libera o horário');

  r = await medico('PATCH', `/consultas/${r.corpo.id}`, { status: 'concluida' });
  assert.equal(r.status, 200);

  r = await outroPaciente('GET', '/consultas');
  assert.equal(r.corpo[0].status, 'concluida');
  assert.equal(r.corpo[0].profissional_nome, 'Dr. João Silva');

  /* ----- Admin desativa o profissional ----- */
  r = await admin('PATCH', `/admin/profissionais/${profissionalId}`, { ativo: false });
  assert.equal(r.status, 200);
  r = await paciente('GET', '/profissionais');
  assert.equal(r.corpo.length, 0);
  r = await admin('GET', '/admin/profissionais');
  assert.equal(r.corpo.length, 1);
  assert.equal(r.corpo[0].ativo, false);

  /* ----- Alterar senha logado ----- */
  r = await paciente('PUT', '/auth/senha', { senha_atual: 'errada', nova_senha: 'abcdef' });
  assert.equal(r.status, 400);
  r = await paciente('PUT', '/auth/senha', { senha_atual: 'novaSenha1', nova_senha: 'abcdef1' });
  assert.equal(r.status, 200);
  r = await paciente('GET', '/auth/eu');
  assert.equal(r.corpo.usuario.email, 'maria@teste.com', 'a sessão atual continua válida após trocar a senha');
});
