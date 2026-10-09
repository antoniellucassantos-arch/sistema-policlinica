/* Limite simples de tentativas por IP (em memória), contra força bruta. */
const { ErroHttp } = require('./util');

function limitar({ max, janelaMin, mensagem }) {
  const tentativas = new Map();
  const janela = janelaMin * 60 * 1000;

  setInterval(() => {
    const agora = Date.now();
    for (const [ip, info] of tentativas) {
      if (info.reinicia <= agora) tentativas.delete(ip);
    }
  }, janela).unref();

  return (req, res, next) => {
    const agora = Date.now();
    const info = tentativas.get(req.ip);
    if (!info || info.reinicia <= agora) {
      tentativas.set(req.ip, { total: 1, reinicia: agora + janela });
      return next();
    }
    info.total += 1;
    if (info.total > max) throw new ErroHttp(429, mensagem);
    next();
  };
}

module.exports = { limitar };
