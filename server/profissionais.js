/* Consultas reutilizáveis sobre profissionais. */
const { db } = require('./db');

function consultaProfissionais(executor = db) {
  return executor('profissionais as p')
    .join('usuarios as u', 'u.id', 'p.usuario_id')
    .select(
      'p.id', 'p.usuario_id', 'u.nome', 'p.especialidade', 'p.registro', 'p.descricao',
      'p.sobre', 'p.formacao', 'p.foto', 'p.dias_atendimento', 'p.ativo',
    );
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
  };
}

module.exports = { consultaProfissionais, perfilPublico };
