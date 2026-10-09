/* ==========================================================
   CONFIGURAÇÃO DO BANCO DE DADOS
   O mesmo código funciona com SQLite, PostgreSQL ou MySQL.
   Escolha o banco pela variável DB_CLIENT no arquivo .env.
========================================================== */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const cliente = (process.env.DB_CLIENT || 'sqlite').toLowerCase();

const base = {
  migrations: { directory: path.join(__dirname, 'db', 'migrations') },
  seeds: { directory: path.join(__dirname, 'db', 'seeds') },
};

function configurar() {
  if (cliente === 'postgres' || cliente === 'postgresql' || cliente === 'pg') {
    return { ...base, client: 'pg', connection: process.env.DATABASE_URL };
  }

  if (cliente === 'mysql' || cliente === 'mariadb') {
    return { ...base, client: 'mysql2', connection: process.env.DATABASE_URL };
  }

  if (cliente !== 'sqlite') {
    throw new Error(`DB_CLIENT inválido: "${cliente}". Use sqlite, postgres ou mysql.`);
  }

  const arquivo = path.resolve(__dirname, process.env.SQLITE_FILE || 'data/medagenda.sqlite');
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });

  return {
    ...base,
    client: 'better-sqlite3',
    connection: { filename: arquivo },
    useNullAsDefault: true,
    pool: {
      afterCreate(conn, done) {
        conn.pragma('foreign_keys = ON');
        done();
      },
    },
  };
}

module.exports = configurar();
