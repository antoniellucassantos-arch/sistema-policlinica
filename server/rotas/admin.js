const express = require('express');
const { db, inserir, agoraISO } = require('../db');
const { exigir, hashSenha } = require('../auth');
const { consultaProfissionais, perfilPublico } = require('../profissionais');
const {
  ErroHttp, texto, emailValido, validarSenha,
} = require('../util');

const rotas = express.Router();
rotas.use(exigir('admin'));

/* ---------- Lista todos os profissionais (inclusive inativos) ---------- */
rotas.get('/profissionais', async (req, res) => {
  const lista = await consultaProfissionais()
    .select('u.email', 'u.telefone')
    .orderBy('u.nome');
  res.json(lista.map((p) => ({ ...perfilPublico(p), email: p.email, telefone: p.telefone })));
});

/* ---------- Cadastra um profissional com acesso ao sistema ---------- */
rotas.post('/profissionais', async (req, res) => {
  const nome = texto(req.body.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const especialidade = texto(req.body.especialidade, { obrigatorio: true, max: 80, nome: 'Especialidade' });
  const registro = texto(req.body.registro, { max: 40, nome: 'Registro profissional' });
  const telefone = texto(req.body.telefone, { max: 30, nome: 'Telefone' });
  const { senha } = req.body;

  if (!emailValido(email)) throw new ErroHttp(400, 'Informe um e-mail válido.');
  validarSenha(senha);

  if (await db('usuarios').where({ email }).first()) {
    throw new ErroHttp(409, 'Já existe uma conta com este e-mail.');
  }

  const senhaHash = await hashSenha(senha);
  const id = await db.transaction(async (trx) => {
    const usuarioId = await inserir(trx, 'usuarios', {
      nome,
      email,
      telefone,
      senha_hash: senhaHash,
      tipo: 'profissional',
      data_cadastro: agoraISO(),
    });
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

module.exports = rotas;
