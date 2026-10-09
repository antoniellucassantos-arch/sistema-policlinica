/* ==========================================================
   UTILITÁRIOS: erros, validação e datas
========================================================== */

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const FUSO = process.env.FUSO_HORARIO || 'America/Sao_Paulo';

const HORARIOS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30',
];

/** Data (AAAA-MM-DD) e hora (HH:MM) atuais no fuso da clínica. */
function agoraNoFuso() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: FUSO,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}

function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 0 = domingo ... 6 = sábado */
function diaDaSemana(data) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

function somarDias(data, dias) {
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Lê um texto do corpo da requisição, aplicando trim e limite de tamanho. */
function texto(valor, { obrigatorio = false, max = 200, nome = 'Campo' } = {}) {
  const v = typeof valor === 'string' ? valor.trim() : '';
  if (obrigatorio && !v) throw new ErroHttp(400, `${nome} é obrigatório.`);
  if (v.length > max) throw new ErroHttp(400, `${nome} deve ter no máximo ${max} caracteres.`);
  return v || null;
}

function emailValido(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
}

function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 6) {
    throw new ErroHttp(400, 'A senha deve ter pelo menos 6 caracteres.');
  }
  if (Buffer.byteLength(senha) > 72) {
    throw new ErroHttp(400, 'A senha é longa demais (máximo de 72 caracteres).');
  }
}

function validarFoto(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new ErroHttp(400, 'O link da foto não é válido.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new ErroHttp(400, 'O link da foto deve começar com http:// ou https://.');
  }
  return u.toString();
}

function validarDias(dias) {
  if (typeof dias !== 'string' || !/^[0-6]{1,7}$/.test(dias)) {
    throw new ErroHttp(400, 'Selecione pelo menos um dia de atendimento.');
  }
  return [...new Set(dias.split(''))].sort().join('');
}

module.exports = {
  ErroHttp,
  HORARIOS,
  agoraNoFuso,
  dataValida,
  diaDaSemana,
  somarDias,
  texto,
  emailValido,
  validarSenha,
  validarFoto,
  validarDias,
};
