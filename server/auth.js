/* ==========================================================
   AUTENTICAÇÃO: senha (bcrypt) + sessão em cookie (JWT)
========================================================== */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { ErroHttp } = require('./util');

const COOKIE = 'medagenda_sessao';
const DURACAO_DIAS = 7;

let SEGREDO = process.env.JWT_SECRET;
if (!SEGREDO) {
  SEGREDO = crypto.randomBytes(32).toString('hex');
  console.warn('[aviso] JWT_SECRET não definido no .env — as sessões serão perdidas a cada reinício do servidor.');
}

function hashSenha(senha) {
  return bcrypt.hash(senha, 10);
}

function conferirSenha(senha, hash) {
  return bcrypt.compare(senha, hash);
}

/** Muda sempre que a senha muda, invalidando sessões antigas. */
function versaoSenha(senhaHash) {
  return crypto.createHash('sha256').update(senhaHash).digest('hex').slice(0, 16);
}

function iniciarSessao(res, usuario) {
  const token = jwt.sign(
    { sub: String(usuario.id), v: versaoSenha(usuario.senha_hash) },
    SEGREDO,
    { expiresIn: `${DURACAO_DIAS}d` },
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: DURACAO_DIAS * 24 * 60 * 60 * 1000,
  });
}

function encerrarSessao(res) {
  res.clearCookie(COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
  });
}

/** Carrega o usuário logado em req.usuario (ou null). */
async function carregarUsuario(req, res, next) {
  req.usuario = null;
  const token = req.cookies?.[COOKIE];
  if (!token) return next();

  try {
    const dados = jwt.verify(token, SEGREDO);
    const usuario = await db('usuarios').where({ id: Number(dados.sub) }).first();
    if (usuario && dados.v === versaoSenha(usuario.senha_hash)) {
      req.usuario = usuario;
    } else {
      encerrarSessao(res);
    }
  } catch {
    encerrarSessao(res);
  }
  next();
}

/** Exige login e, opcionalmente, um dos tipos de usuário informados. */
function exigir(...tipos) {
  return (req, res, next) => {
    if (!req.usuario) throw new ErroHttp(401, 'Faça login para continuar.');
    if (tipos.length && !tipos.includes(req.usuario.tipo)) {
      throw new ErroHttp(403, 'Você não tem permissão para isso.');
    }
    next();
  };
}

function usuarioPublico(u) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    telefone: u.telefone,
    data_nascimento: u.data_nascimento,
    tipo: u.tipo,
    data_cadastro: u.data_cadastro,
  };
}

module.exports = {
  hashSenha,
  conferirSenha,
  iniciarSessao,
  encerrarSessao,
  carregarUsuario,
  exigir,
  usuarioPublico,
};
