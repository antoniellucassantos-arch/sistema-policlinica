/* ==========================================================
   ROTAS DA EQUIPE: pacientes (recepção) e bloqueios de agenda
========================================================== */
const crypto = require('crypto');
const express = require('express');
const { db, inserir, agoraISO } = require('../db');
const { exigir, hashSenha, usuarioPublico } = require('../auth');
const {
  ErroHttp, agoraNoFuso, dataValida, somarDias, texto, emailValido,
} = require('../util');

const rotas = express.Router();

const EQUIPE = ['admin', 'recepcao'];

/* ==========================================================
   PACIENTES (para a recepção agendar em nome de alguém)
========================================================== */
rotas.get('/pacientes', exigir(...EQUIPE), async (req, res) => {
  const termo = String(req.query.busca || '').trim().toLowerCase();
  const consulta = db('usuarios').where({ tipo: 'paciente' }).orderBy('nome').limit(20);
  if (termo) {
    const like = `%${termo}%`;
    consulta.where((q) => q
      .whereRaw('lower(nome) like ?', [like])
      .orWhereRaw('lower(email) like ?', [like])
      .orWhere('telefone', 'like', like));
  }
  res.json((await consulta).map(usuarioPublico));
});

rotas.post('/pacientes', exigir(...EQUIPE), async (req, res) => {
  const nome = texto(req.body.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
  const telefone = texto(req.body.telefone, { max: 30, nome: 'Telefone' });
  const email = texto(req.body.email, { max: 160 })?.toLowerCase() || null;
  const nascimento = req.body.data_nascimento || null;

  if (!telefone && !email) throw new ErroHttp(400, 'Informe pelo menos o telefone ou o e-mail do paciente.');
  if (email && !emailValido(email)) throw new ErroHttp(400, 'E-mail inválido.');
  if (nascimento && !dataValida(nascimento)) throw new ErroHttp(400, 'Data de nascimento inválida.');
  if (email && await db('usuarios').where({ email }).first()) {
    throw new ErroHttp(409, 'Já existe uma conta com este e-mail. Busque o paciente pelo nome.');
  }

  // Senha aleatória: se tiver e-mail, o paciente cria a dele em "Esqueci minha senha".
  const id = await inserir(db, 'usuarios', {
    nome,
    email,
    telefone,
    data_nascimento: nascimento,
    senha_hash: await hashSenha(crypto.randomBytes(24).toString('hex')),
    tipo: 'paciente',
    data_cadastro: agoraISO(),
  });
  res.status(201).json(usuarioPublico(await db('usuarios').where({ id }).first()));
});

/* ==========================================================
   BLOQUEIOS DE AGENDA (férias, feriados, folgas)
========================================================== */
async function profissionalDoUsuario(usuario) {
  if (usuario.tipo !== 'profissional') return null;
  const p = await db('profissionais').where({ usuario_id: usuario.id }).first();
  if (!p) throw new ErroHttp(404, 'Perfil profissional não encontrado.');
  return p;
}

rotas.get('/bloqueios', exigir('profissional', ...EQUIPE), async (req, res) => {
  const hoje = agoraNoFuso().data;
  const consulta = db('bloqueios as b')
    .leftJoin('profissionais as p', 'p.id', 'b.profissional_id')
    .leftJoin('usuarios as u', 'u.id', 'p.usuario_id')
    .where('b.data_fim', '>=', hoje)
    .orderBy([{ column: 'b.data_inicio' }, { column: 'b.id' }])
    .select('b.id', 'b.profissional_id', 'b.data_inicio', 'b.data_fim', 'b.motivo', 'u.nome as profissional_nome');

  const p = await profissionalDoUsuario(req.usuario);
  if (p) {
    consulta.where((q) => q.whereNull('b.profissional_id').orWhere('b.profissional_id', p.id));
  } else if (req.query.profissional_id) {
    const id = Number(req.query.profissional_id) || 0;
    consulta.where((q) => q.whereNull('b.profissional_id').orWhere('b.profissional_id', id));
  }
  res.json(await consulta);
});

rotas.post('/bloqueios', exigir('profissional', ...EQUIPE), async (req, res) => {
  const { data_inicio: inicio } = req.body;
  const fim = req.body.data_fim || inicio;
  const motivo = texto(req.body.motivo, { max: 120, nome: 'Motivo' });
  const hoje = agoraNoFuso().data;

  if (!dataValida(inicio) || !dataValida(fim)) throw new ErroHttp(400, 'Informe as datas do bloqueio.');
  if (fim < inicio) throw new ErroHttp(400, 'A data final deve ser igual ou depois da inicial.');
  if (fim < hoje) throw new ErroHttp(400, 'O bloqueio precisa incluir hoje ou uma data futura.');
  if (fim > somarDias(inicio, 366)) throw new ErroHttp(400, 'O bloqueio pode ter no máximo 1 ano.');

  // Profissional bloqueia a própria agenda; a equipe escolhe o profissional ou a clínica toda.
  const proprio = await profissionalDoUsuario(req.usuario);
  let profissionalId = proprio ? proprio.id : null;
  if (!proprio && req.body.profissional_id) {
    const p = await db('profissionais').where({ id: Number(req.body.profissional_id) || 0 }).first();
    if (!p) throw new ErroHttp(404, 'Profissional não encontrado.');
    profissionalId = p.id;
  }

  const id = await inserir(db, 'bloqueios', {
    profissional_id: profissionalId,
    data_inicio: inicio,
    data_fim: fim,
    motivo,
    criado_por: req.usuario.id,
    data_criacao: agoraISO(),
  });

  // Avisa quantas consultas já marcadas caem no período (não são canceladas automaticamente).
  const afetadas = db('consultas')
    .where({ status: 'agendada' })
    .whereBetween('data', [inicio < hoje ? hoje : inicio, fim]);
  if (profissionalId) afetadas.where({ profissional_id: profissionalId });
  const linha = await afetadas.count({ total: '*' }).first();

  res.status(201).json({ id, consultas_afetadas: Number(linha?.total || 0) });
});

rotas.delete('/bloqueios/:id', exigir('profissional', ...EQUIPE), async (req, res) => {
  const bloqueio = await db('bloqueios').where({ id: Number(req.params.id) || 0 }).first();
  if (!bloqueio) throw new ErroHttp(404, 'Bloqueio não encontrado.');

  const proprio = await profissionalDoUsuario(req.usuario);
  if (proprio && bloqueio.profissional_id !== proprio.id) {
    throw new ErroHttp(403, 'Só a administração pode remover este bloqueio.');
  }
  await db('bloqueios').where({ id: bloqueio.id }).del();
  res.json({ ok: true });
});

module.exports = rotas;
