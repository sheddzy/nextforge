const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');
const { sendWelcomeEmail, sendStaffNewStudentEmail, sendOTPEmail, sendPasswordResetEmail } = require('../emails/templates');

// ── SEND OTP ──────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered. Please sign in.' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Store OTP temporarily
  db.prepare(`
    INSERT INTO otp_store (email, otp, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET otp = ?, expires_at = ?
  `).run(email, otp, expires, otp, expires);

  try {
    await sendOTPEmail({ email, full_name: name }, otp);
    res.json({ success: true });
  } catch (e) {
    console.error('OTP email error:', e.message);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// ── REGISTER ──────────────────────────────────────
router.post('/register', async (req, res) => {
  const { full_name, email, password, track, role, otp } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: 'All fields required' });

  // Verify OTP
  const otpRecord = db.prepare('SELECT * FROM otp_store WHERE email = ?').get(email);
  if (!otpRecord) return res.status(400).json({ error: 'Please request a verification code first' });
  if (otpRecord.otp !== otp) return res.status(400).json({ error: 'Invalid verification code' });
  if (Date.now() > otpRecord.expires_at) return res.status(400).json({ error: 'Verification code expired. Request a new one.' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const userRole = role === 'staff' ? 'staff' : 'student';

  const result = db.prepare(`
    INSERT INTO users (full_name, email, password, role, track, is_verified)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(full_name, email, hash, userRole, track || null);

  // Clean up OTP
  db.prepare('DELETE FROM otp_store WHERE email = ?').run(email);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  if (track && userRole === 'student') {
    const course = db.prepare('SELECT * FROM courses WHERE title LIKE ?').get(`%${track.split(' ')[0]}%`);
    if (course) {
      try {
        db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(user.id, course.id);
        await sendWelcomeEmail(user, course);
        const staff = db.prepare("SELECT * FROM users WHERE role = 'staff'").all();
        for (const s of staff) await sendStaffNewStudentEmail(s, user, course);
      } catch (e) { console.error('Email error:', e.message); }
    }
  }

  db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(user.id, `Welcome to NextForge Academy, ${full_name}! 🎉`);

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.full_name }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, token, role: user.role, name: user.full_name });
});

// ── LOGIN ──────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid email or password' });
  if (!user.is_active) return res.status(403).json({ error: 'Account suspended. Contact support.' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.full_name }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, token, role: user.role, name: user.full_name });
});

// ── FORGOT PASSWORD ────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No account found with this email' });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000; // 1 hour

  db.prepare(`
    INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET token = ?, expires_at = ?
  `).run(email, token, expires, token, expires);

  const resetLink = `https://nextforgeacademy.online/login.html?reset_token=${token}`;
  try {
    await sendPasswordResetEmail(user, resetLink);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send reset email' });
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
router.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ success: true }); });

// ── ME ────────────────────────────────────────────
router.get('/me', (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, full_name, email, role, track, avatar, created_at, is_verified FROM users WHERE id = ?').get(decoded.id);
    res.json(user);
  } catch { res.status(401).json({ error: 'Invalid token' }); }
});

module.exports = router;
