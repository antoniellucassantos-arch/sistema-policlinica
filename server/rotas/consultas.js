const express = require('express');
const { db, inserir, agoraISO } = require('../db');
const { exigir } = require('../auth');
const {
  ErroHttp, HORARIOS, agoraNoFuso, dataValida, diaDaSemana, somarDias,
} = require('../util');

const rotas = express.Router();

const DIAS_ANTECEDENCIA_MAX = 180;

/** Violação de índice único em SQLite, PostgreSQL ou MySQL. */
function ehDuplicado(err) {
  return err && (
    err.code === '23505'
    || err.code === 'ER_DUP_ENTRY'
    || err.code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

async function contar(consulta) {
  const linha = await consulta.count({ total: '*' }).first();
  return Number(linha?.total || 0);
}

/* ---------- Resumo para a tela inicial ---------- */
rotas.get('/resumo', exigir(), async (req, res) => {
  const hoje = agoraNoFuso().data;
  const { tipo, id } = req.usuario;

  if (tipo === 'admin') {
    return res.json({
      pacientes: await contar(db('usuarios').where({ tipo: 'paciente' })),
      profissionais: await contar(db('profissionais').where({ ativo: true })),
      agendadas: await contar(db('consultas').where({ status: 'agendada' }).where('data', '>=', hoje)),
    });
  }

  if (tipo === 'profissional') {
    const p = await db('profissionais').where({ usuario_id: id }).first();
    const minhas = () => db('consultas').where({ profissional_id: p ? p.id : 0 });
    return res.json({
      hoje: await contar(minhas().where({ data: hoje, status: 'agendada' })),
      proximas: await contar(minhas().where({ status: 'agendada' }).where('data', '>=', hoje)),
      concluidas: await contar(minhas().where({ status: 'concluida' })),
    });
  }

  const proxima = await db('consultas as c')
    .join('profissionais as p', 'p.id', 'c.profissional_id')
    .join('usuarios as u', 'u.id', 'p.usuario_id')
    .where({ 'c.usuario_id': id, 'c.status': 'agendada' })
    .where('c.data', '>=', hoje)
    .orderBy([{ column: 'c.data' }, { column: 'c.horario' }])
    .select('c.id', 'c.data', 'c.horario', 'u.nome as profissional_nome', 'p.especialidade')
    .first();

  res.json({
    profissionais: await contar(db('profissionais').where({ ativo: true })),
    proximas: await contar(db('consultas').where({ usuario_id: id, status: 'agendada' }).where('data', '>=', hoje)),
    proxima: proxima || null,
  });
});

/* ---------- Consultas do paciente ---------- */
rotas.get('/consultas', exigir('paciente'), async (req, res) => {
  const lista = await db('consultas as c')
    .join('profissionais as p', 'p.id', 'c.profissional_id')
    .join('usuarios as u', 'u.id', 'p.usuario_id')
    .where('c.usuario_id', req.usuario.id)
    .orderBy([{ column: 'c.data', order: 'desc' }, { column: 'c.horario', order: 'desc' }])
    .select(
      'c.id', 'c.data', 'c.horario', 'c.status', 'c.profissional_id',
      'u.nome as profissional_nome', 'p.especialidade', 'p.foto',
    )
    .limit(500);
  res.json(lista);
});

/* ---------- Agendar ---------- */
rotas.post('/consultas', exigir('paciente'), async (req, res) => {
  const profissionalId = Number(req.body.profissional_id) || 0;
  const { data, horario } = req.body;

  const p = await db('profissionais').where({ id: profissionalId, ativo: true }).first();
  if (!p) throw new ErroHttp(404, 'Profissional não encontrado.');
  if (!dataValida(data)) throw new ErroHttp(400, 'Data inválida.');
  if (!HORARIOS.includes(horario)) throw new ErroHttp(400, 'Horário inválido.');

  const agora = agoraNoFuso();
  if (data < agora.data || (data === agora.data && horario <= agora.hora)) {
    throw new ErroHttp(400, 'Escolha uma data e horário futuros.');
  }
  if (data > somarDias(agora.data, DIAS_ANTECEDENCIA_MAX)) {
    throw new ErroHttp(400, 'Só é possível agendar com até 6 meses de antecedência.');
  }
  if (!p.dias_atendimento.includes(String(diaDaSemana(data)))) {
    throw new ErroHttp(400, 'O profissional não atende neste dia da semana.');
  }

  let id;
  try {
    id = await inserir(db, 'consultas', {
      usuario_id: req.usuario.id,
      profissional_id: p.id,
      data,
      horario,
      status: 'agendada',
      chave_reserva: `${p.id}|${data}|${horario}`,
      data_criacao: agoraISO(),
    });
  } catch (err) {
    if (ehDuplicado(err)) throw new ErroHttp(409, 'Este horário acabou de ser reservado. Escolha outro.');
    throw err;
  }

  res.status(201).json({ id });
});

/* ---------- Cancelar / concluir ---------- */
rotas.patch('/consultas/:id', exigir(), async (req, res) => {
  const { status } = req.body;
  if (!['cancelada', 'concluida'].includes(status)) throw new ErroHttp(400, 'Status inválido.');

  const consulta = await db('consultas').where({ id: Number(req.params.id) || 0 }).first();
  if (!consulta) throw new ErroHttp(404, 'Consulta não encontrada.');

  const { tipo, id } = req.usuario;
  let permitido = tipo === 'admin';
  if (tipo === 'paciente') {
    permitido = consulta.usuario_id === id && status === 'cancelada';
  } else if (tipo === 'profissional') {
    const p = await db('profissionais').where({ usuario_id: id }).first();
    permitido = !!p && consulta.profissional_id === p.id;
  }
  if (!permitido) throw new ErroHttp(403, 'Você não tem permissão para alterar esta consulta.');

  if (consulta.status !== 'agendada') {
    throw new ErroHttp(400, 'Só é possível alterar consultas que ainda estão agendadas.');
  }

  const dados = { status };
  // Cancelar libera o horário para outro paciente.
  if (status === 'cancelada') dados.chave_reserva = null;

  await db('consultas').where({ id: consulta.id }).update(dados);
  res.json({ ok: true });
});

module.exports = rotas;
