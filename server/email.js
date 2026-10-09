/* ==========================================================
   ENVIO DE E-MAIL
   Com SMTP configurado no .env, envia de verdade.
   Sem SMTP, mostra o e-mail no terminal (útil para testes).
========================================================== */
const nodemailer = require('nodemailer');

const transporte = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
  : null;

async function enviarEmail({ para, assunto, texto, html }) {
  if (!transporte) {
    console.log('\n──────── E-MAIL (SMTP não configurado) ────────');
    console.log(`Para: ${para}\nAssunto: ${assunto}\n\n${texto}`);
    console.log('───────────────────────────────────────────────\n');
    return;
  }

  await transporte.sendMail({
    from: process.env.EMAIL_REMETENTE || process.env.SMTP_USER,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });
}

module.exports = { enviarEmail };
