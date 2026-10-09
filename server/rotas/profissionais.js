const express = require('express');
const { db } = require('../db');
const { exigir } = require('../auth');
const { consultaProfissionais, perfilPublico } = require('../profissionais');
const {
  ErroHttp, HORARIOS, agoraNoFuso, dataValida, diaDaSemana, somarDias,
  texto, validarFoto, validarDias,
} = require('../util');

const rotas = express.Router();

const DIAS_ANTECEDENCIA_MAX = 180;

/* ---------- Lista pública de profissionais ativos ---------- */
rotas.get('/profissionais', async (req, res) => {
  const lista = await consultaProfissionais().where('p.ativo', true).orderBy('u.nome');
  res.json(lista.map(perfilPublico));
});

/* ---------- Perfil público de um profissional ---------- */
rotas.get('/profissionais/:id', async (req, res) => {
  const p = await consultaProfissionais().where('p.id', Number(req.params.id) || 0).first();
  if (!p || !p.ativo) throw new ErroHttp(404, 'Profissional não encontrado.');
  res.json(perfilPublico(p));
});

/* ---------- Horários disponíveis em uma data ---------- */
rotas.get('/profissionais/:id/horarios', async (req, res) => {
  const p = await db('profissionais').where({ id: Number(req.params.id) || 0, ativo: true }).first();
  if (!p) throw new ErroHttp(404, 'Profissional não encontrado.');

  const { data } = req.query;
  if (!dataValida(data)) throw new ErroHttp(400, 'Data inválida.');

  const agora = agoraNoFuso();
  if (data < agora.data || data > somarDias(agora.data, DIAS_ANTECEDENCIA_MAX)) {
    return res.json({ atende: false, motivo: 'Data fora do período de agendamento.', horarios: [] });
  }
  if (!p.dias_atendimento.includes(String(diaDaSemana(data)))) {
    return res.json({ atende: false, motivo: 'O profissional não atende neste dia da semana.', horarios: [] });
  }

  const ocupados = new Set(
    (await db('consultas')
      .where({ profissional_id: p.id, data, status: 'agendada' })
      .select('horario')).map((c) => c.horario),
  );

  res.json({
    atende: true,
    horarios: HORARIOS.map((h) => ({
      horario: h,
      disponivel: !ocupados.has(h) && !(data === agora.data && h <= agora.hora),
    })),
  });
});

/* ==========================================================
   ÁREA DO PROFISSIONAL
========================================================== */
async function profissionalDoUsuario(usuarioId) {
  const p = await db('profissionais').where({ usuario_id: usuarioId }).first();
  if (!p) throw new ErroHttp(404, 'Perfil profissional não encontrado.');
  return p;
}

/* ---------- Editar o próprio perfil público ---------- */
rotas.put('/profissional/perfil', exigir('profissional'), async (req, res) => {
  const p = await profissionalDoUsuario(req.usuario.id);
  const nome = texto(req.body.nome, { obrigatorio: true, max: 120, nome: 'Nome' });
  const dados = {
    especialidade: texto(req.body.especialidade, { obrigatorio: true, max: 80, nome: 'Especialidade' }),
    registro: texto(req.body.registro, { max: 40, nome: 'Registro profissional' }),
    descricao: texto(req.body.descricao, { max: 200, nome: 'Resumo' }),
    sobre: texto(req.body.sobre, { max: 2000, nome: 'Sobre' }),
    formacao: texto(req.body.formacao, { max: 2000, nome: 'Formação' }),
    foto: validarFoto(texto(req.body.foto, { max: 500, nome: 'Foto' })),
    dias_atendimento: validarDias(req.body.dias_atendimento),
  };

  await db.transaction(async (trx) => {
    await trx('usuarios').where({ id: req.usuario.id }).update({ nome });
    await trx('profissionais').where({ id: p.id }).update(dados);
  });

  const atualizado = await consultaProfissionais().where('p.id', p.id).first();
  res.json(perfilPublico(atualizado));
});

/* ---------- Agenda do profissional ---------- */
rotas.get('/profissional/agenda', exigir('profissional'), async (req, res) => {
  const p = await profissionalDoUsuario(req.usuario.id);
  const hoje = agoraNoFuso().data;
  const periodo = req.query.periodo || 'proximas';

  const consulta = db('consultas as c')
    .join('usuarios as u', 'u.id', 'c.usuario_id')
    .where('c.profissional_id', p.id)
    .select(
      'c.id', 'c.data', 'c.horario', 'c.status',
      'u.nome as paciente_nome', 'u.telefone as paciente_telefone',
      'u.email as paciente_email', 'u.data_nascimento as paciente_nascimento',
    );

  if (periodo === 'hoje') {
    consulta.where('c.data', hoje).orderBy('c.horario');
  } else if (periodo === 'proximas') {
    consulta.where('c.data', '>=', hoje).where('c.status', 'agendada')
      .orderBy([{ column: 'c.data' }, { column: 'c.horario' }]);
  } else if (periodo === 'anteriores') {
    consulta.where('c.data', '<', hoje)
      .orderBy([{ column: 'c.data', order: 'desc' }, { column: 'c.horario', order: 'desc' }]);
  } else {
    consulta.orderBy([{ column: 'c.data', order: 'desc' }, { column: 'c.horario', order: 'desc' }]);
  }

  res.json(await consulta.limit(500));
});

module.exports = rotas;
