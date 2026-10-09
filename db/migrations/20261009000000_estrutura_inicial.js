/* ==========================================================
   ESTRUTURA INICIAL DO BANCO
   Datas e horários ficam como texto (AAAA-MM-DD / HH:MM) para
   funcionar igual em SQLite, PostgreSQL e MySQL.
========================================================== */

exports.up = async function (knex) {
  await knex.schema.createTable('usuarios', (t) => {
    t.increments('id').primary();
    t.string('nome', 120).notNullable();
    t.string('email', 160).notNullable().unique();
    t.string('senha_hash', 100).notNullable();
    t.string('telefone', 30);
    t.string('data_nascimento', 10);
    // paciente | profissional | admin
    t.string('tipo', 20).notNullable().defaultTo('paciente');
    t.string('data_cadastro', 30).notNullable();
  });

  await knex.schema.createTable('profissionais', (t) => {
    t.increments('id').primary();
    t.integer('usuario_id').unsigned().notNullable().unique()
      .references('id').inTable('usuarios').onDelete('CASCADE');
    t.string('especialidade', 80).notNullable();
    // CRM, CRP, CREFITO, CRN...
    t.string('registro', 40);
    t.string('descricao', 200);
    t.text('sobre');
    t.text('formacao');
    t.string('foto', 500);
    // Dias da semana em que atende: 0 = domingo ... 6 = sábado
    t.string('dias_atendimento', 7).notNullable().defaultTo('12345');
    t.boolean('ativo').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('consultas', (t) => {
    t.increments('id').primary();
    t.integer('usuario_id').unsigned().notNullable()
      .references('id').inTable('usuarios').onDelete('CASCADE');
    t.integer('profissional_id').unsigned().notNullable()
      .references('id').inTable('profissionais').onDelete('CASCADE');
    t.string('data', 10).notNullable();
    t.string('horario', 5).notNullable();
    // agendada | concluida | cancelada
    t.string('status', 20).notNullable().defaultTo('agendada');
    // Preenchida enquanto o horário está ocupado; o índice único
    // impede dois agendamentos no mesmo horário com o mesmo profissional.
    t.string('chave_reserva', 40).unique();
    t.string('data_criacao', 30).notNullable();
    t.index(['profissional_id', 'data']);
    t.index(['usuario_id']);
  });

  await knex.schema.createTable('redefinicoes_senha', (t) => {
    t.increments('id').primary();
    t.integer('usuario_id').unsigned().notNullable()
      .references('id').inTable('usuarios').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.string('expira_em', 30).notNullable();
    t.boolean('usado').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('redefinicoes_senha');
  await knex.schema.dropTableIfExists('consultas');
  await knex.schema.dropTableIfExists('profissionais');
  await knex.schema.dropTableIfExists('usuarios');
};
