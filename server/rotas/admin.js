const express = require('express');
const { db, inserir, agoraISO } = require('../db');
const { exigir, hashSenha, usuarioPublico } = require('../auth');
const { consultaProfissionais, perfilPublico } = require('../profissionais');
const { lerConfiguracoes, salvarConfiguracoes } = require('../config');
const {
  ErroHttp, texto, emailValido, validarSenha,
} = require('../util');

const rotas = express.Router();
rotas.use(exigir('admin'));

/** Lê nome, e-mail, telefone e senha para criar uma conta da equipe. */
async function dadosDeConta(body) {
  const nome = texto(body.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const telefone = texto(body.telefone, { max: 30, nome: 'Telefone' });
  if (!emailValido(email)) throw new ErroHttp(400, 'Informe um e-mail válido.');
  validarSenha(body.senha);
  if (await db('usuarios').where({ email }).first()) {
    throw new ErroHttp(409, 'Já existe uma conta com este e-mail.');
  }
  return {
    nome, email, telefone, senha_hash: await hashSenha(body.senha), data_cadastro: agoraISO(),
  };
}

/* ---------- Lista todos os profissionais (inclusive inativos) ---------- */
rotas.get('/profissionais', async (req, res) => {
  const lista = await consultaProfissionais()
    .select('u.email', 'u.telefone')
    .orderBy('u.nome');
  res.json(lista.map((p) => ({ ...perfilPublico(p), email: p.email, telefone: p.telefone })));
});

/* ---------- Cadastra um profissional com acesso ao sistema ---------- */
rotas.post('/profissionais', async (req, res) => {
  const especialidade = texto(req.body.especialidade, { obrigatorio: true, max: 80, nome: 'Especialidade' });
  const registro = texto(req.body.registro, { max: 40, nome: 'Registro profissional' });
  const conta = await dadosDeConta(req.body);

  const id = await db.transaction(async (trx) => {
    const usuarioId = await inserir(trx, 'usuarios', { ...conta, tipo: 'profissional' });
    return inserir(trx, 'profissionais', {
      usuario_id: usuarioId,
      especialidade,
      registro,
      dias_atendimento: '12345',
      ativo: true,
    });
  });

  res.status(201).json({ id });
});

/* ---------- Ativa / desativa um profissional ---------- */
rotas.patch('/profissionais/:id', async (req, res) => {
  if (typeof req.body.ativo !== 'boolean') throw new ErroHttp(400, 'Informe se o profissional está ativo.');
  const alterados = await db('profissionais')
    .where({ id: Number(req.params.id) || 0 })
    .update({ ativo: req.body.ativo });
  if (!alterados) throw new ErroHttp(404, 'Profissional não encontrado.');
  res.json({ ok: true });
});

/* ---------- Contas da recepção ---------- */
rotas.get('/recepcao', async (req, res) => {
  const lista = await db('usuarios').where({ tipo: 'recepcao' }).orderBy('nome');
  res.json(lista.map(usuarioPublico));
});

rotas.post('/recepcao', async (req, res) => {
  const id = await inserir(db, 'usuarios', { ...(await dadosDeConta(req.body)), tipo: 'recepcao' });
  res.status(201).json({ id });
});

rotas.delete('/recepcao/:id', async (req, res) => {
  const removidos = await db('usuarios').where({ id: Number(req.params.id) || 0, tipo: 'recepcao' }).del();
  if (!removidos) throw new ErroHttp(404, 'Conta não encontrada.');
  res.json({ ok: true });
});

/* ---------- Configurações da clínica ---------- */
function inteiro(valor, nome, min, max) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErroHttp(400, `${nome}: informe um número entre ${min} e ${max}.`);
  }
  return n;
}

rotas.put('/configuracoes', async (req, res) => {
  const b = req.body;
  await salvarConfiguracoes({
    limite_consultas_futuras: inteiro(b.limite_consultas_futuras, 'Limite de consultas', 0, 50),
    prazo_cancelamento_horas: inteiro(b.prazo_cancelamento_horas, 'Prazo para cancelar', 0, 168),
    antecedencia_maxima_dias: inteiro(b.antecedencia_maxima_dias, 'Antecedência máxima', 7, 730),
  });
  res.json(await lerConfiguracoes());
});

module.exports = rotas;
