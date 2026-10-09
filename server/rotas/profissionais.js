const express = require('express');
const { db } = require('../db');
const { exigir } = require('../auth');
const { consultaProfissionais, perfilPublico, buscarProfissional } = require('../profissionais');
const {
  situacaoDoDia, bloqueiosDoProfissional, consultaDetalhada, formatarConsulta,
} = require('../agenda');
const {
  ErroHttp, agoraNoFuso, somarDias, texto, validarFoto, validarDias, lerValor,
} = require('../util');
const { validarExpediente, listaConvenios } = require('../../shared/agenda');

const rotas = express.Router();

async function profissionalAtivo(id) {
  const p = await buscarProfissional(id);
  if (!p || !p.ativo) throw new ErroHttp(404, 'Profissional não encontrado.');
  return p;
}

/* ---------- Lista pública de profissionais ativos ---------- */
rotas.get('/profissionais', async (req, res) => {
  const lista = await consultaProfissionais().where('p.ativo', true).orderBy('u.nome');
  res.json(lista.map(perfilPublico));
});

/* ---------- Perfil público de um profissional ---------- */
rotas.get('/profissionais/:id', async (req, res) => {
  res.json(perfilPublico(await profissionalAtivo(req.params.id)));
});

/* ---------- Horários disponíveis em uma data ---------- */
rotas.get('/profissionais/:id/horarios', async (req, res) => {
  const p = await profissionalAtivo(req.params.id);
  // Ao reagendar, o horário atual da própria consulta conta como livre.
  const ignorar = Number(req.query.ignorar) || null;
  res.json(await situacaoDoDia(p, req.query.data, { ignorarConsultaId: ignorar }));
});

/* ---------- Dias bloqueados (férias, feriados...) — só as datas ---------- */
rotas.get('/profissionais/:id/bloqueios', async (req, res) => {
  const p = await profissionalAtivo(req.params.id);
  const hoje = agoraNoFuso().data;
  const lista = await bloqueiosDoProfissional(p.id, hoje, somarDias(hoje, 400));
  res.json(lista.map((b) => ({ data_inicio: b.data_inicio, data_fim: b.data_fim })));
});

/* ==========================================================
   ÁREA DO PROFISSIONAL
========================================================== */
async function profissionalDoUsuario(usuarioId) {
  const p = await db('profissionais').where({ usuario_id: usuarioId }).first();
  if (!p) throw new ErroHttp(404, 'Perfil profissional não encontrado.');
  return p;
}

/* ---------- Editar o próprio perfil, expediente e valores ---------- */
rotas.put('/profissional/perfil', exigir('profissional'), async (req, res) => {
  const p = await profissionalDoUsuario(req.usuario.id);
  const b = req.body;
  const nome = texto(b.nome, { obrigatorio: true, max: 120, nome: 'Nome' });

  const convenios = listaConvenios(Array.isArray(b.convenios) ? b.convenios.join('\n') : b.convenios);
  if (convenios.some((c) => c.length > 80)) throw new ErroHttp(400, 'Nome de convênio muito longo.');

  const dados = {
    especialidade: texto(b.especialidade, { obrigatorio: true, max: 80, nome: 'Especialidade' }),
    registro: texto(b.registro, { max: 40, nome: 'Registro profissional' }),
    descricao: texto(b.descricao, { max: 200, nome: 'Resumo' }),
    sobre: texto(b.sobre, { max: 2000, nome: 'Sobre' }),
    formacao: texto(b.formacao, { max: 2000, nome: 'Formação' }),
    foto: validarFoto(texto(b.foto, { max: 500, nome: 'Foto' })),
    dias_atendimento: validarDias(b.dias_atendimento),
    hora_inicio: texto(b.hora_inicio, { max: 5 }),
    hora_fim: texto(b.hora_fim, { max: 5 }),
    pausa_inicio: texto(b.pausa_inicio, { max: 5 }),
    pausa_fim: texto(b.pausa_fim, { max: 5 }),
    duracao_consulta: Number(b.duracao_consulta),
    valor_consulta: lerValor(b.valor_consulta),
    aceita_particular: b.aceita_particular !== false,
    convenios: convenios.join('\n') || null,
  };

  const erroExpediente = validarExpediente(dados);
  if (erroExpediente) throw new ErroHttp(400, erroExpediente);
  if (!dados.aceita_particular && !convenios.length) {
    throw new ErroHttp(400, 'Aceite consultas particulares ou informe pelo menos um convênio.');
  }

  await db.transaction(async (trx) => {
    await trx('usuarios').where({ id: req.usuario.id }).update({ nome });
    await trx('profissionais').where({ id: p.id }).update(dados);
  });

  res.json(perfilPublico(await buscarProfissional(p.id)));
});

/* ---------- Agenda do profissional ---------- */
rotas.get('/profissional/agenda', exigir('profissional'), async (req, res) => {
  const p = await profissionalDoUsuario(req.usuario.id);
  const hoje = agoraNoFuso().data;
  const periodo = req.query.periodo || 'proximas';

  const consulta = consultaDetalhada().where('c.profissional_id', p.id);
  const asc = [{ column: 'c.data' }, { column: 'c.horario' }];
  const desc = [{ column: 'c.data', order: 'desc' }, { column: 'c.horario', order: 'desc' }];

  if (periodo === 'hoje') {
    consulta.where('c.data', hoje).orderBy('c.horario');
  } else if (periodo === 'proximas') {
    consulta.where('c.data', '>=', hoje).where('c.status', 'agendada').orderBy(asc);
  } else if (periodo === 'anteriores') {
    consulta.where('c.data', '<', hoje).orderBy(desc);
  } else {
    consulta.orderBy(desc);
  }

  res.json((await consulta.limit(500)).map(formatarConsulta));
});

module.exports = rotas;
