/* Consultas reutilizáveis sobre profissionais. */
const { db } = require('./db');
const { listaConvenios } = require('../shared/agenda');

function consultaProfissionais(executor = db) {
  return executor('profissionais as p')
    .join('usuarios as u', 'u.id', 'p.usuario_id')
    .select('p.*', 'u.nome');
}

/** Dados que qualquer visitante pode ver (sem e-mail ou telefone pessoal). */
function perfilPublico(p) {
  return {
    id: p.id,
    nome: p.nome,
    especialidade: p.especialidade,
    registro: p.registro,
    descricao: p.descricao,
    sobre: p.sobre,
    formacao: p.formacao,
    foto: p.foto,
    dias_atendimento: p.dias_atendimento,
    ativo: !!p.ativo,
    hora_inicio: p.hora_inicio,
    hora_fim: p.hora_fim,
    pausa_inicio: p.pausa_inicio || null,
    pausa_fim: p.pausa_fim || null,
    duracao_consulta: Number(p.duracao_consulta),
    valor_consulta: p.valor_consulta === null || p.valor_consulta === undefined ? null : Number(p.valor_consulta),
    aceita_particular: !!p.aceita_particular,
    convenios: listaConvenios(p.convenios),
  };
}

async function buscarProfissional(id, executor = db) {
  return consultaProfissionais(executor).where('p.id', Number(id) || 0).first();
}

module.exports = { consultaProfissionais, perfilPublico, buscarProfissional };
