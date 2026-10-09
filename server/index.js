/* ==========================================================
   MEDAGENDA — SERVIDOR
========================================================== */
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { db, inserir, agoraISO } = require('./db');
const { carregarUsuario, hashSenha } = require('./auth');
const { ErroHttp, emailValido } = require('./util');

const app = express();
const PORTA = Number(process.env.PORT || 3000);

if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(carregarUsuario);

const api = express.Router();
api.use('/auth', require('./rotas/auth'));
api.use('/admin', require('./rotas/admin'));
api.use(require('./rotas/profissionais'));
api.use(require('./rotas/consultas'));
api.use(() => {
  throw new ErroHttp(404, 'Rota não encontrada.');
});
app.use('/api', api);

app.use(express.static(path.join(__dirname, '..', 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ErroHttp) {
    return res.status(err.status).json({ erro: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Requisição inválida.' });
  }
  console.error(err);
  res.status(500).json({ erro: 'Erro interno. Tente novamente em instantes.' });
});

/** Cria o primeiro administrador a partir do .env, se ainda não existir nenhum. */
async function garantirAdmin() {
  const admin = await db('usuarios').where({ tipo: 'admin' }).first();
  if (admin) return;

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA || '';
  if (!emailValido(email) || senha.length < 6) {
    console.warn('[aviso] Nenhum administrador cadastrado. Defina ADMIN_EMAIL e ADMIN_SENHA no .env e reinicie.');
    return;
  }
  if (await db('usuarios').where({ email }).first()) {
    console.warn(`[aviso] ADMIN_EMAIL (${email}) já pertence a outra conta. Use outro e-mail para o administrador.`);
    return;
  }

  await inserir(db, 'usuarios', {
    nome: process.env.ADMIN_NOME || 'Administrador',
    email,
    senha_hash: await hashSenha(senha),
    tipo: 'admin',
    data_cadastro: agoraISO(),
  });
  console.log(`Administrador criado: ${email}`);
}

async function iniciar() {
  await db.migrate.latest();
  await garantirAdmin();
  app.listen(PORTA, () => {
    console.log(`MedAgenda rodando em http://localhost:${PORTA}`);
  });
}

if (require.main === module) {
  iniciar().catch((err) => {
    console.error('Não foi possível iniciar o servidor:', err);
    process.exit(1);
  });
}

module.exports = app;
