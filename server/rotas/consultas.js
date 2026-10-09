const express = require('express');
const { db, inserir, agoraISO } = require('../db');
const { exigir } = require('../auth');
const { buscarProfissional } = require('../profissionais');
const { lerConfiguracoes } = require('../config');
const {
  verificarHorario, consultaDetalhada, formatarConsulta, ehDuplicado,
} = require('../agenda');
const {
  ErroHttp, agoraNoFuso, dataValida, texto,
} = require('../util');
const { MOTIVOS, minutosAte, listaConvenios } = require('../../shared/agenda');

const rotas = express.Router();

const EQUIPE = ['admin', 'recepcao'];

async function contar(consulta) {
  const linha = await consulta.count({ total: '*' }).first();
  return Number(linha?.total || 0);
}

function chaveReserva(profissionalId, data, horario) {
  return `${profissionalId}|${data}|${horario}`;
}

/* ---------- Resumo para a tela inicial ---------- */
rotas.get('/resumo', exigir(), async (req, res) => {
  const hoje = agoraNoFuso().data;
  const { tipo, id } = req.usuario;
  const futuras = () => db('consultas').where({ status: 'agendada' }).where('data', '>=', hoje);

  if (EQUIPE.includes(tipo)) {
    return res.json({
      hoje: await contar(db('consultas').where({ data: hoje }).whereNot('status', 'cancelada')),
      agendadas: await contar(futuras()),
      pacientes: await contar(db('usuarios').where({ tipo: 'paciente' })),
      profissionais: await contar(db('profissionais').where({ ativo: true })),
    });
  }

  if (tipo === 'profissional') {
    const p = await db('profissionais').where({ usuario_id: id }).first();
    const minhas = () => db('consultas').where({ profissional_id: p ? p.id : 0 });
    return res.json({
      hoje: await contar(minhas().where({ data: hoje, status: 'agendada' })),
      proximas: await contar(minhas().where({ status: 'agendada' }).where('data', '>=', hoje)),
      concluidas: await contar(minhas().where({ status: 'concluida' })),
      faltas: await contar(minhas().where({ status: 'faltou' })),
    });
  }

  const proxima = await consultaDetalhada()
    .where({ 'c.usuario_id': id, 'c.status': 'agendada' })
    .where('c.data', '>=', hoje)
    .orderBy([{ column: 'c.data' }, { column: 'c.horario' }])
    .first();

  res.json({
    profissionais: await contar(db('profissionais').where({ ativo: true })),
    proximas: await contar(futuras().where({ usuario_id: id })),
    proxima: proxima ? formatarConsulta(proxima) : null,
  });
});

/* ---------- Configurações que o paciente precisa conhecer ---------- */
rotas.get('/configuracoes', async (req, res) => {
  res.json(await lerConfiguracoes());
});

/* ---------- Consultas do paciente ---------- */
rotas.get('/consultas', exigir('paciente'), async (req, res) => {
  const lista = await consultaDetalhada()
    .where('c.usuario_id', req.usuario.id)
    .orderBy([{ column: 'c.data', order: 'desc' }, { column: 'c.horario', order: 'desc' }])
    .limit(500);
  res.json(lista.map(formatarConsulta));
});

/* ---------- Agenda geral (recepção e administração) ---------- */
rotas.get('/agenda', exigir(...EQUIPE), async (req, res) => {
  const data = req.query.data || agoraNoFuso().data;
  if (!dataValida(data)) throw new ErroHttp(400, 'Data inválida.');
  const consulta = consultaDetalhada().where('c.data', data)
    .orderBy([{ column: 'c.horario' }, { column: 'up.nome' }]);
  if (req.query.profissional_id) consulta.where('c.profissional_id', Number(req.query.profissional_id) || 0);
  res.json((await consulta).map(formatarConsulta));
});

/* ---------- Agendar ---------- */
function lerDetalhes(body, p) {
  const motivo = texto(body.motivo, { max: 40, nome: 'Motivo' });
  if (motivo && !MOTIVOS.includes(motivo)) throw new ErroHttp(400, 'Motivo inválido.');
  const observacao = texto(body.observacao, { max: 500, nome: 'Observação' });

  const pagamento = body.pagamento === 'convenio' ? 'convenio' : 'particular';
  let convenio = null;
  if (pagamento === 'particular' && !p.aceita_particular) {
    throw new ErroHttp(400, 'Este profissional atende apenas por convênio.');
  }
  if (pagamento === 'convenio') {
    convenio = texto(body.convenio, { obrigatorio: true, max: 80, nome: 'Convênio' });
    if (!listaConvenios(p.convenios).includes(convenio)) {
      throw new ErroHttp(400, 'Este profissional não atende por esse convênio.');
    }
  }
  return {
    motivo,
    observacao,
    pagamento,
    convenio,
    valor: pagamento === 'particular' ? p.valor_consulta : null,
  };
}

rotas.post('/consultas', exigir('paciente', ...EQUIPE), async (req, res) => {
  const ehEquipe = EQUIPE.includes(req.usuario.tipo);
  const { data, horario } = req.body;

  // A recepção agenda em nome de um paciente; o paciente agenda para si mesmo.
  let pacienteId = req.usuario.id;
  if (ehEquipe) {
    const paciente = await db('usuarios').where({ id: Number(req.body.paciente_id) || 0, tipo: 'paciente' }).first();
    if (!paciente) throw new ErroHttp(400, 'Escolha o paciente.');
    pacienteId = paciente.id;
  }

  const p = await buscarProfissional(req.body.profissional_id);
  if (!p || !p.ativo) throw new ErroHttp(404, 'Profissional não encontrado.');
  const detalhes = lerDetalhes(req.body, p);

  if (!ehEquipe) {
    const cfg = await lerConfiguracoes();
    const futuras = await contar(db('consultas')
      .where({ usuario_id: pacienteId, status: 'agendada' })
      .where('data', '>=', agoraNoFuso().data));
    if (cfg.limite_consultas_futuras > 0 && futuras >= cfg.limite_consultas_futuras) {
      throw new ErroHttp(400, `Você já tem ${futuras} consulta(s) marcada(s), que é o máximo permitido. `
        + 'Cancele uma ou fale com a clínica para agendar outra.');
    }
  }

  await verificarHorario(p, data, horario);

  let id;
  try {
    id = await inserir(db, 'consultas', {
      usuario_id: pacienteId,
      profissional_id: p.id,
      data,
      horario,
      duracao: Number(p.duracao_consulta),
      status: 'agendada',
      chave_reserva: chaveReserva(p.id, data, horario),
      agendado_por: req.usuario.id,
      data_criacao: agoraISO(),
      ...detalhes,
    });
  } catch (err) {
    if (ehDuplicado(err)) throw new ErroHttp(409, 'Este horário acabou de ser reservado. Escolha outro.');
    throw err;
  }

  res.status(201).json({ id });
});

/* ---------- Permissões sobre uma consulta ---------- */
async function carregarParaAlterar(req) {
  const consulta = await db('consultas').where({ id: Number(req.params.id) || 0 }).first();
  if (!consulta) throw new ErroHttp(404, 'Consulta não encontrada.');

  const { tipo, id } = req.usuario;
  let papel = null;
  if (EQUIPE.includes(tipo)) papel = 'equipe';
  else if (tipo === 'paciente' && consulta.usuario_id === id) papel = 'paciente';
  else if (tipo === 'profissional') {
    const p = await db('profissionais').where({ usuario_id: id }).first();
    if (p && consulta.profissional_id === p.id) papel = 'profissional';
  }
  if (!papel) throw new ErroHttp(403, 'Você não tem permissão para alterar esta consulta.');
  if (consulta.status !== 'agendada') {
    throw new ErroHttp(400, 'Só é possível alterar consultas que ainda estão agendadas.');
  }
  return { consulta, papel };
}

/** O paciente só cancela/reagenda com a antecedência mínima configurada. */
async function conferirPrazoDoPaciente(consulta, acao) {
  const cfg = await lerConfiguracoes();
  const horas = cfg.prazo_cancelamento_horas;
  if (horas > 0 && minutosAte(consulta.data, consulta.horario, agoraNoFuso()) < horas * 60) {
    throw new ErroHttp(400, `Pelo site só é possível ${acao} até ${horas}h antes da consulta. `
      + 'Entre em contato com a clínica.');
  }
}

/* ---------- Cancelar / concluir / faltou ---------- */
rotas.patch('/consultas/:id', exigir(), async (req, res) => {
  const { status } = req.body;
  if (!['cancelada', 'concluida', 'faltou'].includes(status)) throw new ErroHttp(400, 'Status inválido.');

  const { consulta, papel } = await carregarParaAlterar(req);
  if (papel === 'paciente') {
    if (status !== 'cancelada') throw new ErroHttp(403, 'Você não tem permissão para alterar esta consulta.');
    await conferirPrazoDoPaciente(consulta, 'cancelar');
  }

  const dados = { status };
  // Cancelar libera o horário para outro paciente.
  if (status === 'cancelada') dados.chave_reserva = null;

  await db('consultas').where({ id: consulta.id }).update(dados);
  res.json({ ok: true });
});

/* ---------- Reagendar (mesmo profissional, nova data/horário) ---------- */
rotas.patch('/consultas/:id/reagendar', exigir(), async (req, res) => {
  const { consulta, papel } = await carregarParaAlterar(req);
  if (papel === 'paciente') await conferirPrazoDoPaciente(consulta, 'remarcar');

  const { data, horario } = req.body;
  const p = await buscarProfissional(consulta.profissional_id);
  if (!p || !p.ativo) throw new ErroHttp(400, 'Este profissional não está mais disponível para agendamento.');

  await verificarHorario(p, data, horario, { ignorarConsultaId: consulta.id });

  try {
    await db('consultas').where({ id: consulta.id }).update({
      data,
      horario,
      duracao: Number(p.duracao_consulta),
      chave_reserva: chaveReserva(p.id, data, horario),
      lembrete_enviado: false,
    });
  } catch (err) {
    if (ehDuplicado(err)) throw new ErroHttp(409, 'Este horário acabou de ser reservado. Escolha outro.');
    throw err;
  }
  res.json({ ok: true });
});

module.exports = rotas;
