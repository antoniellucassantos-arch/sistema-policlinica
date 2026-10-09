/* ==========================================================
   AGENDA AVANÇADA
   - expediente, duração, valor e convênios por profissional
   - motivo, observação, pagamento e lembrete por consulta
   - bloqueios de agenda (férias, feriados, folgas)
   - configurações da clínica
   - e-mail opcional (paciente cadastrado pela recepção)
========================================================== */

exports.up = async function (knex) {
  await knex.schema.alterTable('usuarios', (t) => {
    t.string('email', 160).nullable().alter();
  });

  await knex.schema.alterTable('profissionais', (t) => {
    t.string('hora_inicio', 5).notNullable().defaultTo('08:00');
    t.string('hora_fim', 5).notNullable().defaultTo('18:00');
    t.string('pausa_inicio', 5).defaultTo('12:00');
    t.string('pausa_fim', 5).defaultTo('14:00');
    t.integer('duracao_consulta').notNullable().defaultTo(30);
    // Em centavos (R$ 150,00 = 15000), para não ter problema de arredondamento
    t.integer('valor_consulta');
    t.boolean('aceita_particular').notNullable().defaultTo(true);
    // Um convênio por linha
    t.text('convenios');
  });

  await knex.schema.alterTable('consultas', (t) => {
    t.integer('duracao').notNullable().defaultTo(30);
    t.string('motivo', 40);
    t.text('observacao');
    // particular | convenio
    t.string('pagamento', 20).notNullable().defaultTo('particular');
    t.string('convenio', 80);
    t.integer('valor');
    t.boolean('lembrete_enviado').notNullable().defaultTo(false);
    t.integer('agendado_por').unsigned().references('id').inTable('usuarios').onDelete('SET NULL');
  });

  await knex.schema.createTable('bloqueios', (t) => {
    t.increments('id').primary();
    // Vazio = vale para a clínica toda (ex.: feriado)
    t.integer('profissional_id').unsigned()
      .references('id').inTable('profissionais').onDelete('CASCADE');
    t.string('data_inicio', 10).notNullable();
    t.string('data_fim', 10).notNullable();
    t.string('motivo', 120);
    t.integer('criado_por').unsigned().references('id').inTable('usuarios').onDelete('SET NULL');
    t.string('data_criacao', 30).notNullable();
    t.index(['data_fim']);
  });

  await knex.schema.createTable('configuracoes', (t) => {
    t.string('chave', 60).primary();
    t.string('valor', 200).notNullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('configuracoes');
  await knex.schema.dropTableIfExists('bloqueios');
  await knex.schema.alterTable('consultas', (t) => {
    t.dropForeign(['agendado_por']);
  });
  await knex.schema.alterTable('consultas', (t) => {
    t.dropColumns('duracao', 'motivo', 'observacao', 'pagamento', 'convenio', 'valor', 'lembrete_enviado', 'agendado_por');
  });
  await knex.schema.alterTable('profissionais', (t) => {
    t.dropColumns(
      'hora_inicio', 'hora_fim', 'pausa_inicio', 'pausa_fim', 'duracao_consulta',
      'valor_consulta', 'aceita_particular', 'convenios',
    );
  });
  // Contas sem e-mail impediriam voltar o campo para obrigatório.
  await knex('usuarios').whereNull('email').del();
  await knex.schema.alterTable('usuarios', (t) => {
    t.string('email', 160).notNullable().alter();
  });
};
