// mailer.js
const nodemailer = require("nodemailer");

function createTransporter() {
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM } = process.env;

  if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASS || !MAIL_FROM) {
    throw new Error(
      "Konfigurasi SMTP tidak lengkap. Pastikan MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM terisi."
    );
  }

  const transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: Number(MAIL_PORT),
    secure: Number(MAIL_PORT) === 465, // true untuk 465 (SSL), false untuk 587 (STARTTLS)
    auth: {
      user: MAIL_USER,
      pass: MAIL_PASS,
    },
  });

  return { transporter, defaultFrom: MAIL_FROM };
}

module.exports = { createTransporter };
