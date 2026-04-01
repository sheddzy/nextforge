const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');

// ── SEND OTP ──────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered. Please sign in.' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 10 * 60 * 1000;

  db.prepare(`
    INSERT INTO otp_store (email, otp, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET otp = excluded.otp, expires_at = excluded.expires_at
  `).run(email, otp, expires);

  // Try to send email — but don't block registration if it fails
  try {
    const nodemailer = require('nodemailer');

    // Try Namecheap first, fall back to Gmail
    let transporter;
    if (process.env.NAMECHEAP_EMAIL && process.env.NAMECHEAP_PASS) {
      transporter = nodemailer.createTransport({
        host: 'mail.privateemail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.NAMECHEAP_EMAIL, pass: process.env.NAMECHEAP_PASS }
      });
    } else {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
      });
    }

    const FROM = process.env.NAMECHEAP_EMAIL || process.env.GMAIL_USER;

    await transporter.sendMail({
      from: `"NextForge Academy" <${FROM}>`,
      to: email,
      subject: `${otp} — Your NextForge Verification Code`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#0a1628;color:#cbd5e1;max-width:520px;margin:0 auto;padding:40px 32px;border-radius:16px">
          <h2 style="color:#c9a84c;margin-bottom:8px">NextForge Academy</h2>
          <p>Hi ${name || 'there'}, here is your email verification code:</p>
          <div style="background:#0f1f3d;border:2px solid #c9a84c;border-radius:12px;padding:32px;text-align:center;margin:24px 0">
            <div style="font-size:3rem;font-weight:800;letter-spacing:12px;color:#ffffff">${otp}</div>
            <div style="font-size:0.82rem;color:#64748b;margin-top:8px">Expires in 10 minutes</div>
          </div>
          <p style="color:#64748b;font-size:0.85rem">If you did not request this, please ignore this email.</p>
          <p style="color:#64748b;font-size:0.85rem;margin-top:16px">— NextForge Academy Team</p>
        </div>
      `
    });

    console.log(`OTP sent to ${email}: ${otp}`);
    res.json({ success: true });

  } catch (e) {
    console.error('OTP email error:', e.message);
    // Still return success but include OTP in dev mode for testing
    if (process.env.NODE_ENV !== 'production') {
      res.json({ success: true, debug_otp: otp, warning: 'Email failed — use this OTP for testing: ' + otp });
    } else {
      res.status(500).json({ error: `Failed to send verification email. Please contact us on WhatsApp: +2349060914286` });
    }
  }
});

// ── REGISTER ──────────────────────────────────────
router.post('/register', async (req, res) => {
  const { full_name, email, password, track, role, otp } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: 'All fields required' });

  const otpRecord = db.prepare('SELECT * FROM otp_store WHERE email = ?').get(email);
  if (!otpRecord) return res.status(400).json({ error: 'Please request a verification code first' });
  if (otpRecord.otp !== otp) return res.status(400).json({ error: 'Invalid verification code' });
  if (Date.now() > otpRecord.expires_at) return res.status(400).json({ error: 'Code expired. Please request a new one.' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const userRole = role === 'staff' ? 'staff' : 'student';

  const result = db.prepare(`
    INSERT INTO users (full_name, email, password, role, track, is_verified)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(full_name, email, hash, userRole, track || null);

  db.prepare('DELETE FROM otp_store WHERE email = ?').run(email);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  if (track && userRole === 'student') {
    const course = db.prepare('SELECT * FROM courses WHERE title LIKE ?').get(`%${track.split(' ')[0]}%`);
    if (course) {
      try {
        db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(user.id, course.id);
      } catch (e) { console.error('Enrollment error:', e.message); }
    }
  }

  db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
    user.id, `Welcome to NextForge Academy, ${full_name}!`
  );

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, token, role: user.role, name: user.full_name });
});

// ── LOGIN ──────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!user.is_active) return res.status(403).json({ error: 'Account suspended. Contact support.' });
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, token, role: user.role, name: user.full_name });
});

// ── FORGOT PASSWORD ────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No account found with this email' });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
  `).run(email, token, expires);

  const resetLink = `https://nextforgeacademy.online/login.html?reset_token=${token}`;

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport(
      process.env.NAMECHEAP_EMAIL && process.env.NAMECHEAP_PASS
        ? { host: 'mail.privateemail.com', port: 465, secure: true, auth: { user: process.env.NAMECHEAP_EMAIL, pass: process.env.NAMECHEAP_PASS } }
        : { service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS } }
    );
    const FROM = process.env.NAMECHEAP_EMAIL || process.env.GMAIL_USER;
    await transporter.sendMail({
      from: `"NextForge Academy" <${FROM}>`,
      to: email,
      subject: 'Reset your NextForge Academy password',
      html: `
        <div style="font-family:Arial,sans-serif;background:#0a1628;color:#cbd5e1;max-width:520px;margin:0 auto;padding:40px 32px;border-radius:16px">
          <h2 style="color:#c9a84c">Password Reset</h2>
          <p>Hi ${user.full_name}, click the button below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetLink}" style="display:inline-block;margin:24px 0;background:#c9a84c;color:#0a1628;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none">Reset My Password →</a>
          <p style="color:#64748b;font-size:0.82rem">If you did not request this, ignore this email.</p>
        </div>
      `
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Reset email error:', e.message);
    res.status(500).json({ error: 'Failed to send reset email. Please contact support.' });
  }
});

// ── RESET PASSWORD ─────────────────────────────────
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  const record = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
  if (!record) return res.status(400).json({ error: 'Invalid or expired reset link' });
  if (Date.now() > record.expires_at) return res.status(400).json({ error: 'Reset link expired. Request a new one.' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hash, record.email);
  db.prepare('DELETE FROM password_resets WHERE token = ?').run(token);
  res.json({ success: true });
});

// ── LOGOUT ────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// ── ME ────────────────────────────────────────────
router.get('/me', (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id,full_name,email,role,track,avatar,created_at,is_verified FROM users WHERE id = ?').get(decoded.id);
    res.json(user);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
