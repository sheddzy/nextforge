const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');
const { sendOTP, sendWelcome, sendAdminNewEnrollment, sendPasswordReset } = require('../emails');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Send OTP
router.post('/send-otp', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Email and name required' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'This email is already registered. Please sign in.' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 10 * 60 * 1000;
  db.prepare(`INSERT INTO otp_store (email,otp,expires_at) VALUES (?,?,?)
    ON CONFLICT(email) DO UPDATE SET otp=excluded.otp,expires_at=excluded.expires_at`)
    .run(email, otp, expires);
  const sent = await sendOTP(email, name, otp);
  if (!sent) {
    // Still return success in dev, show OTP in logs
    console.log(`[DEV] OTP for ${email}: ${otp}`);
  }
  res.json({ success: true });
});

// Register
router.post('/register', async (req, res) => {
  const { full_name, email, password, track, phone, role, otp } = req.body;
  if (!full_name || !email || !password || !otp) {
    return res.status(400).json({ error: 'All fields required' });
  }
  const record = db.prepare('SELECT * FROM otp_store WHERE email = ?').get(email);
  if (!record) return res.status(400).json({ error: 'Please request a verification code first' });
  if (record.otp !== otp) return res.status(400).json({ error: 'Incorrect verification code' });
  if (Date.now() > record.expires_at) return res.status(400).json({ error: 'Code expired. Please request a new one.' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const userRole = ['admin','instructor'].includes(role) ? role : 'student';
  const result = db.prepare(`INSERT INTO users (full_name,email,password,role,track,phone,is_verified)
    VALUES (?,?,?,?,?,?,1)`).run(full_name, email, hash, userRole, track || null, phone || null);

  db.prepare('DELETE FROM otp_store WHERE email = ?').run(email);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  // Auto-enroll in selected course
  if (track && userRole === 'student') {
    const course = db.prepare('SELECT * FROM courses WHERE slug = ? OR title LIKE ?').get(track, `%${track}%`);
    if (course) {
      try {
        db.prepare('INSERT OR IGNORE INTO enrollments (user_id,course_id) VALUES (?,?)').run(user.id, course.id);
        await sendWelcome(user, course);
        const admin = db.prepare("SELECT email FROM users WHERE role = 'admin'").get();
        if (admin) await sendAdminNewEnrollment(admin.email, user, course);
      } catch(e) { console.error('Post-register error:', e.message); }
    }
  }

  db.prepare('INSERT INTO notifications (user_id,message,type) VALUES (?,?,?)')
    .run(user.id, `Welcome to NextForge Academy, ${full_name}! 🎉`, 'success');

  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.json({ success: true, token, role: user.role, name: user.full_name });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (!user.is_active) return res.status(403).json({ error: 'Account suspended. Contact support.' });
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.json({ success: true, token, role: user.role, name: user.full_name, id: user.id });
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Me
router.get('/me', (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id,full_name,email,role,track,phone,bio,avatar_url,created_at FROM users WHERE id = ?').get(decoded.id);
    res.json(user);
  } catch { res.status(401).json({ error: 'Invalid token' }); }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'No account found with this email' });
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000;
  db.prepare(`INSERT INTO password_resets (email,token,expires_at) VALUES (?,?,?)
    ON CONFLICT(email) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at`)
    .run(email, token, expires);
  const resetLink = `https://nextforgeacademy.online/login.html?reset_token=${token}`;
  await sendPasswordReset(user, resetLink);
  res.json({ success: true });
});

// Reset password
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  const record = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
  if (!record || Date.now() > record.expires_at) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(bcrypt.hashSync(password, 10), record.email);
  db.prepare('DELETE FROM password_resets WHERE token = ?').run(token);
  res.json({ success: true });

// Add this route to routes/auth.js (before module.exports)

const { requireAuth } = require('../middleware/auth');

// Update profile
router.post('/profile', requireAuth, (req, res) => {
  const { full_name, phone, bio } = req.body;
  if (!full_name) return res.status(400).json({ error: 'Full name required' });
  db.prepare('UPDATE users SET full_name=?, phone=?, bio=? WHERE id=?')
    .run(full_name, phone || null, bio || null, req.user.id);
  res.json({ success: true });
  });
module.exports = router;
