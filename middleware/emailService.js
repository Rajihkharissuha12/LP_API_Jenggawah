// emailService.js
const { createTransporter } = require("./mailer");

// htmlToText.js
function htmlToText(html) {
  if (!html) return "";
  // Sederhana: buang tag dan decode dasar beberapa entitas
  let text = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

async function sendEmail({ to, subject, html, from }) {
  if (!to || !subject || !html) {
    const missing = [
      !to ? "to" : null,
      !subject ? "subject" : null,
      !html ? "html" : null,
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Parameter email wajib: ${missing}`);
  }

  const { transporter, defaultFrom } = createTransporter();
  const text = htmlToText(html);

  const info = await transporter.sendMail({
    from: from || defaultFrom,
    to,
    subject,
    html,
    text, // fallback text
  });

  // Opsi: kembalikan informasi messageId/response untuk audit
  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  };
}

module.exports = { sendEmail };
