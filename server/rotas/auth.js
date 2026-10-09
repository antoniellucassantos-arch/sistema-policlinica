const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { db, inserir, agoraISO } = require('../db');
const {
  hashSenha, conferirSenha, iniciarSessao, encerrarSessao, exigir, usuarioPublico,
} = require('../auth');
const correio = require('../email');
const { consultaProfissionais, perfilPublico } = require('../profissionais');
const { limitar } = require('../limite');
const {
  ErroHttp, texto, emailValido, validarSenha, dataValida,
} = require('../util');

const rotas = express.Router();

const MSG_LIMITE = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
const limiteLogin = limitar({ max: 20, janelaMin: 15, mensagem: MSG_LIMITE });
const limiteCadastro = limitar({ max: 10, janelaMin: 15, mensagem: MSG_LIMITE });
const limiteSenha = limitar({ max: 10, janelaMin: 15, mensagem: MSG_LIMITE });
const limiteEmail = limitar({
  max: 5, janelaMin: 15, mensagem: 'Muitos pedidos de recuperação. Aguarde alguns minutos.',
});

// Usado para o login demorar o mesmo tempo quando o e-mail não existe.
const HASH_FALSO = bcrypt.hashSync('senha-que-nao-existe', 10);

function normalizarEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function lerNascimento(valor) {
  if (!valor) return null;
  if (!dataValida(valor)) throw new ErroHttp(400, 'Data de nascimento inválida.');
  return valor;
}

async function respostaUsuario(usuario) {
  const resposta = { usuario: usuarioPublico(usuario), profissional: null };
  if (usuario.tipo === 'profissional') {
    const p = await consultaProfissionais().where('p.usuario_id', usuario.id).first();
    resposta.profissional = p ? perfilPublico(p) : null;
  }
  return resposta;
}

/* ---------- Cadastro de paciente ---------- */
rotas.post('/cadastro', limiteCadastro, async (req, res) => {
  const nome = texto(req.body.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
  const email = normalizarEmail(req.body.email);
  const telefone = texto(req.body.telefone, { max: 30, nome: 'Telefone' });
  const nascimento = lerNascimento(req.body.data_nascimento);
  const { senha } = req.body;

  if (!emailValido(email)) throw new ErroHttp(400, 'Informe um e-mail válido.');
  validarSenha(senha);

  const existente = await db('usuarios').where({ email }).first();
  if (existente) throw new ErroHttp(409, 'Este e-mail já está cadastrado.');

  const id = await inserir(db, 'usuarios', {
    nome,
    email,
    telefone,
    data_nascimento: nascimento,
    senha_hash: await hashSenha(senha),
    tipo: 'paciente',
    data_cadastro: agoraISO(),
  });

  const usuario = await db('usuarios').where({ id }).first();
  iniciarSessao(res, usuario);
  res.status(201).json(await respostaUsuario(usuario));
});

/* ---------- Login ---------- */
rotas.post('/login', limiteLogin, async (req, res) => {
  const email = normalizarEmail(req.body.email);
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';

  const usuario = email ? await db('usuarios').where({ email }).first() : null;
  const ok = await conferirSenha(senha, usuario ? usuario.senha_hash : HASH_FALSO);
  if (!usuario || !ok) throw new ErroHttp(401, 'E-mail ou senha incorretos.');

  iniciarSessao(res, usuario);
  res.json(await respostaUsuario(usuario));
});

/* ---------- Logout ---------- */
rotas.post('/logout', (req, res) => {
  encerrarSessao(res);
  res.json({ ok: true });
});

/* ---------- Usuário logado ---------- */
rotas.get('/eu', async (req, res) => {
  if (!req.usuario) return res.json({ usuario: null, profissional: null });
  res.json(await respostaUsuario(req.usuario));
});

rotas.put('/eu', exigir(), async (req, res) => {
  const dados = {
    nome: texto(req.body.nome, { obrigatorio: true, max: 120, nome: 'Nome' }),
    telefone: texto(req.body.telefone, { max: 30, nome: 'Telefone' }),
    data_nascimento: lerNascimento(req.body.data_nascimento),
  };
  await db('usuarios').where({ id: req.usuario.id }).update(dados);
  const usuario = await db('usuarios').where({ id: req.usuario.id }).first();
  res.json(await respostaUsuario(usuario));
});

/* ---------- Alterar senha (logado) ---------- */
rotas.put('/senha', exigir(), limiteSenha, async (req, res) => {
  const { senha_atual: senhaAtual, nova_senha: novaSenha } = req.body;
  if (!(await conferirSenha(String(senhaAtual || ''), req.usuario.senha_hash))) {
    throw new ErroHttp(400, 'A senha atual está incorreta.');
  }
  validarSenha(novaSenha);

  const senhaHash = await hashSenha(novaSenha);
  await db('usuarios').where({ id: req.usuario.id }).update({ senha_hash: senhaHash });
  // Renova a sessão atual; sessões abertas em outros aparelhos deixam de valer.
  iniciarSessao(res, { ...req.usuario, senha_hash: senhaHash });
  res.json({ ok: true });
});

/* ---------- Esqueci minha senha ---------- */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

rotas.post('/esqueci-senha', limiteEmail, async (req, res) => {
  const email = normalizarEmail(req.body.email);
  if (!emailValido(email)) throw new ErroHttp(400, 'Informe um e-mail válido.');

  const usuario = await db('usuarios').where({ email }).first();
  if (usuario) {
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await db('redefinicoes_senha').where({ usuario_id: usuario.id, usado: false }).update({ usado: true });
    await inserir(db, 'redefinicoes_senha', {
      usuario_id: usuario.id,
      token_hash: hashToken(token),
      expira_em: expira,
      usado: false,
    });

    const base = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
    const link = `${base}/?redefinir=${token}`;
    const primeiroNome = usuario.nome.split(' ')[0];

    correio.enviarEmail({
      para: usuario.email,
      assunto: 'MedAgenda — redefinição de senha',
      texto: `Olá, ${primeiroNome}!\n\nRecebemos um pedido para redefinir a sua senha.\n`
        + `Para criar uma nova senha, acesse o link abaixo (válido por 1 hora):\n\n${link}\n\n`
        + 'Se não foi você, ignore este e-mail — sua senha continua a mesma.',
      html: `<p>Olá, ${primeiroNome.replace(/[<>&"]/g, '')}!</p>`
        + '<p>Recebemos um pedido para redefinir a sua senha.</p>'
        + `<p><a href="${link}">Clique aqui para criar uma nova senha</a> (válido por 1 hora).</p>`
        + '<p>Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>',
    }).catch((err) => console.error('Falha ao enviar e-mail de redefinição:', err));
  }

  // Mesma resposta exista ou não o e-mail, para não revelar quem tem cadastro.
  res.json({ ok: true });
});

rotas.post('/redefinir-senha', limiteSenha, async (req, res) => {
  const { token, senha } = req.body;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new ErroHttp(400, 'Link de redefinição inválido.');
  }
  validarSenha(senha);

  const pedido = await db('redefinicoes_senha')
    .where({ token_hash: hashToken(token), usado: false })
    .andWhere('expira_em', '>', agoraISO())
    .first();
  if (!pedido) throw new ErroHttp(400, 'Este link expirou ou já foi usado. Peça um novo.');

  const senhaHash = await hashSenha(senha);
  await db.transaction(async (trx) => {
    await trx('usuarios').where({ id: pedido.usuario_id }).update({ senha_hash: senhaHash });
    await trx('redefinicoes_senha').where({ id: pedido.id }).update({ usado: true });
  });

  const usuario = await db('usuarios').where({ id: pedido.usuario_id }).first();
  iniciarSessao(res, usuario);
  res.json(await respostaUsuario(usuario));
});

module.exports = rotas;
