const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.MAIL_FROM || 'onboarding@resend.dev';

function createMailer() {
  console.log('Mailer initialized with FROM:', FROM);
  return {
    async sendPasswordReset({ to, html }) {
      if (!to) throw new Error('Missing recipient');
      const subject = 'Resetare parolă';

      const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });

      if (error) {
        console.error('[mailer] resend error', error);
        throw error;
      }

      console.log('[mailer] sent password reset email', { to, id: data?.id });
      return data;
    },
  };
}

module.exports = { createMailer };
