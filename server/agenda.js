/* ==========================================================
   DISPONIBILIDADE DE HORÁRIOS E CONSULTAS
========================================================== */
const { db } = require('./db');
const { lerConfiguracoes } = require('./config');
const {
  ErroHttp, agoraNoFuso, dataValida, diaDaSemana, somarDias,
} = require('./util');
const {
  gerarHorarios, sobrepoe, bloqueioDoDia,
} = require('../shared/agenda');

/** Bloqueios (do profissional ou da clínica toda) que tocam o período. */
function bloqueiosDoProfissional(profissionalId, de, ate, executor = db) {
  return executor('bloqueios')
    .where((q) => q.whereNull('profissional_id').orWhere('profissional_id', profissionalId))
    .where('data_fim', '>=', de)
    .where('data_inicio', '<=', ate)
    .select('id', 'profissional_id', 'data_inicio', 'data_fim', 'motivo');
}

/** Consultas que ocupam a agenda do profissional no dia. */
function ocupadas(profissionalId, data, executor = db) {
  return executor('consultas')
    .where({ profissional_id: profissionalId, data })
    .whereNot('status', 'cancelada')
    .select('id', 'horario', 'duracao');
}

/**
 * Situação de um dia na agenda do profissional.
 * Devolve { atende, motivo?, horarios: [{ horario, disponivel }] }.
 */
async function situacaoDoDia(p, data, { ignorarConsultaId = null, executor = db } = {}) {
  if (!dataValida(data)) throw new ErroHttp(400, 'Data inválida.');

  const agora = agoraNoFuso();
  const cfg = await lerConfiguracoes(executor);
  if (data < agora.data || data > somarDias(agora.data, cfg.antecedencia_maxima_dias)) {
    return { atende: false, motivo: 'Data fora do período de agendamento.', horarios: [] };
  }
  if (!p.dias_atendimento.includes(String(diaDaSemana(data)))) {
    return { atende: false, motivo: 'O profissional não atende neste dia da semana.', horarios: [] };
  }
  const bloqueio = bloqueioDoDia(await bloqueiosDoProfissional(p.id, data, data, executor), data);
  if (bloqueio) {
    return { atende: false, motivo: 'Agenda fechada nesta data.', horarios: [] };
  }

  const marcadas = (await ocupadas(p.id, data, executor)).filter((c) => c.id !== ignorarConsultaId);
  const duracao = Number(p.duracao_consulta) || 30;

  return {
    atende: true,
    duracao,
    horarios: gerarHorarios(p).map((h) => ({
      horario: h,
      disponivel: !(data === agora.data && h <= agora.hora)
        && !marcadas.some((c) => sobrepoe(h, duracao, c.horario, c.duracao)),
    })),
  };
}

/** Garante que o horário pode ser reservado; senão lança o erro adequado. */
async function verificarHorario(p, data, horario, opcoes = {}) {
  const dia = await situacaoDoDia(p, data, opcoes);
  if (!dia.atende) throw new ErroHttp(400, dia.motivo);
  const vaga = dia.horarios.find((h) => h.horario === horario);
  if (!vaga) throw new ErroHttp(400, 'Horário inválido para este profissional.');
  if (!vaga.disponivel) {
    const agora = agoraNoFuso();
    if (data === agora.data && horario <= agora.hora) throw new ErroHttp(400, 'Escolha um horário futuro.');
    throw new ErroHttp(409, 'Este horário acabou de ser reservado. Escolha outro.');
  }
}

/** Consulta com nomes do paciente e do profissional. */
function consultaDetalhada(executor = db) {
  return executor('consultas as c')
    .join('profissionais as p', 'p.id', 'c.profissional_id')
    .join('usuarios as up', 'up.id', 'p.usuario_id')
    .join('usuarios as pa', 'pa.id', 'c.usuario_id')
    .select(
      'c.id', 'c.data', 'c.horario', 'c.duracao', 'c.status', 'c.motivo', 'c.observacao',
      'c.pagamento', 'c.convenio', 'c.valor', 'c.profissional_id', 'c.usuario_id',
      'up.nome as profissional_nome', 'p.especialidade', 'p.foto',
      'pa.nome as paciente_nome', 'pa.telefone as paciente_telefone',
      'pa.email as paciente_email', 'pa.data_nascimento as paciente_nascimento',
    );
}

function formatarConsulta(c) {
  return {
    ...c,
    duracao: Number(c.duracao),
    valor: c.valor === null || c.valor === undefined ? null : Number(c.valor),
  };
}

/** Violação de índice único em SQLite, PostgreSQL ou MySQL. */
function ehDuplicado(err) {
  return err && (
    err.code === '23505'
    || err.code === 'ER_DUP_ENTRY'
    || err.code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

module.exports = {
  bloqueiosDoProfissional,
  situacaoDoDia,
  verificarHorario,
  consultaDetalhada,
  formatarConsulta,
  ehDuplicado,
};
