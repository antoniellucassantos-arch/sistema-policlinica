const knex = require('knex');
const config = require('../knexfile');

const db = knex(config);

/** Insere uma linha e devolve o id gerado (funciona em SQLite, PostgreSQL e MySQL). */
async function inserir(executor, tabela, dados) {
  if (config.client === 'mysql2') {
    const [id] = await executor(tabela).insert(dados);
    return id;
  }
  const [linha] = await executor(tabela).insert(dados).returning('id');
  return typeof linha === 'object' ? linha.id : linha;
}

function agoraISO() {
  return new Date().toISOString();
}

module.exports = { db, inserir, agoraISO };
