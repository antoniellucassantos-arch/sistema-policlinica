/* Configurações da clínica, editáveis pelo administrador. */
const { db } = require('./db');
const { CONFIG_PADRAO } = require('../shared/agenda');

async function lerConfiguracoes(executor = db) {
  const cfg = { ...CONFIG_PADRAO };
  const linhas = await executor('configuracoes').select();
  linhas.forEach((l) => {
    if (l.chave in cfg) cfg[l.chave] = Number(l.valor);
  });
  return cfg;
}

async function salvarConfiguracoes(valores) {
  await db.transaction(async (trx) => {
    for (const [chave, valor] of Object.entries(valores)) {
      const alterados = await trx('configuracoes').where({ chave }).update({ valor: String(valor) });
      if (!alterados) await trx('configuracoes').insert({ chave, valor: String(valor) });
    }
  });
}

module.exports = { lerConfiguracoes, salvarConfiguracoes };
