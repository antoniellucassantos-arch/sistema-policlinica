/* ==========================================================
   LEMBRETES POR E-MAIL
   Na véspera da consulta (a partir de HORA_LEMBRETE, padrão 9h),
   envia um e-mail ao paciente. Roda a cada 10 minutos.
========================================================== */
const { db } = require('./db');
const correio = require('./email');
const { agoraNoFuso, somarDias } = require('./util');

const HORA_LEMBRETE = Number(process.env.HORA_LEMBRETE || 9);
const INTERVALO_MS = 10 * 60 * 1000;

function dataPorExtenso(data) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

const escaparHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** Envia os lembretes pendentes de amanhã. Devolve quantos foram enviados. */
async function processarLembretes(agora = agoraNoFuso()) {
  if (Number(agora.hora.slice(0, 2)) < HORA_LEMBRETE) return 0;
  const amanha = somarDias(agora.data, 1);

  const pendentes = await db('consultas as c')
    .join('usuarios as pa', 'pa.id', 'c.usuario_id')
    .join('profissionais as p', 'p.id', 'c.profissional_id')
    .join('usuarios as up', 'up.id', 'p.usuario_id')
    .where({ 'c.data': amanha, 'c.status': 'agendada', 'c.lembrete_enviado': false })
    .whereNotNull('pa.email')
    .select('c.id', 'c.data', 'c.horario', 'pa.nome as paciente', 'pa.email',
      'up.nome as profissional', 'p.especialidade');

  const base = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  let enviados = 0;

  for (const c of pendentes) {
    const primeiroNome = c.paciente.split(' ')[0];
    const quando = `${dataPorExtenso(c.data)}, às ${c.horario}`;
    try {
      await correio.enviarEmail({
        para: c.email,
        assunto: `Lembrete: sua consulta é amanhã às ${c.horario}`,
        texto: `Olá, ${primeiroNome}!\n\nLembramos que você tem consulta amanhã:\n\n`
          + `${c.profissional} (${c.especialidade})\n${quando}\n\n`
          + 'Chegue com 15 minutos de antecedência.\n'
          + `Se não puder comparecer, cancele ou remarque em ${base}.`,
        html: `<p>Olá, ${escaparHtml(primeiroNome)}!</p>`
          + '<p>Lembramos que você tem consulta <strong>amanhã</strong>:</p>'
          + `<p><strong>${escaparHtml(c.profissional)}</strong> (${escaparHtml(c.especialidade)})<br>${escaparHtml(quando)}</p>`
          + '<p>Chegue com 15 minutos de antecedência.</p>'
          + `<p>Se não puder comparecer, <a href="${base}">cancele ou remarque pelo site</a>.</p>`,
      });
      await db('consultas').where({ id: c.id }).update({ lembrete_enviado: true });
      enviados += 1;
    } catch (err) {
      // Tenta de novo na próxima rodada.
      console.error(`Falha ao enviar lembrete da consulta ${c.id}:`, err.message);
    }
  }
  return enviados;
}

function iniciarLembretes() {
  if (process.env.LEMBRETES === 'false') return;
  const rodar = () => processarLembretes().catch((err) => console.error('Erro nos lembretes:', err));
  rodar();
  setInterval(rodar, INTERVALO_MS).unref();
}

module.exports = { processarLembretes, iniciarLembretes };
