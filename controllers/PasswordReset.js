const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const User = require('../models/user');
const ResetToken = require('../models/reset_password_token');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function requestResetController(req, res) {
  try {
    const { email } = req.body || {};
    console.log('[passwordReset] payload email:', email);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      console.log('[passwordReset] invalid email pattern, returning ok');
      return res.status(200).json({ ok: true });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      console.log('[passwordReset] no user found, returning ok');
      return res.status(200).json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString('hex');
  const token_hash = hashToken(token);
    const minutesToAdd = 15 * 60 * 1000; // 15 minute în milisecunde
    // const expires_at = roDate() + minutesToAdd;
    const expires_at = new Date(Date.now() + minutesToAdd);
    console.log("expires_at--------------------------------", expires_at);
    // Upsert-ish: overwrite any existing active token
    await ResetToken.upsert({ user_id: user.id, token_hash, expires_at, used: false });


  const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
  // IMPORTANT: send RAW token in the link; DB stores only the hash
  const resetUrl = `${appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
        <p>Salut,</p>
        <p>Ai solicitat resetarea parolei. Linkul este valabil 15 minute:</p>
        <p><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">Resetează parola</a></p>
        <p>Dacă nu ai cerut tu această acțiune, ignoră acest mesaj.</p>
      </div>
    `;

    if (!req.app?.locals?.mailer) {
      console.error('[passwordReset] mailer not attached to app.locals');
    } else {
      console.log('[passwordReset] sending email via mailer');
      await req.app.locals.mailer.sendPasswordReset({ to: email, html });
      console.log('[passwordReset] email send invoked');
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[passwordReset] request error', err);
    return res.status(200).json({ ok: true });
  }
}

async function confirmResetController(req, res) {
  try {
    const { token, newPassword } = req.body || {};
    console.log('[passwordReset] confirm payload token length:', token?.length);
    if (!token || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const token_hash = hashToken(token);
    const rec = await ResetToken.findOne({ where: { token_hash, used: false } });
    if (!rec) return res.status(400).json({ message: 'Invalid token' });

    // expires_at is stored as DATE; normalize before comparing
    if (new Date(rec.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Token expired' });
    }

    const user = await User.findByPk(rec.user_id);
    if (!user) return res.status(400).json({ message: 'Invalid token user' });

    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;
    await user.save();

    rec.used = true;
    await rec.save();

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[passwordReset] confirm error', err);
    return res.status(400).json({ message: 'Invalid token error' });
  }
}

module.exports = { requestResetController, confirmResetController };
