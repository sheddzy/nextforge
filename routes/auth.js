const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { sendWelcomeEmail, sendStaffNewStudentEmail } = require('../emails/templates');

// ── REGISTER ──────────────────────────────────────
router.post('/register', async (req, res) => {
  const { full_name, email, password, track, role } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const userRole = role === 'staff' ? 'staff' : 'student';

  const result = db.prepare(`
    INSERT INTO users (full_name, email, password, role, track)
    VALUES (?, ?, ?, ?, ?)
  `).run(full_name, email, hash, userRole, track || null);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  // Auto-enroll in selected track course
  if (track && userRole === 'student') {
    const course = db.prepare('SELECT * FROM courses WHERE title LIKE ?').get(`%${track}%`);
    if (course) {
      try {
        db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(user.id, course.id);
        await sendWelcomeEmail(user, course);

        // Notify all staff
        const staff = db.prepare("SELECT * FROM users WHERE role = 'staff'").all();
        for (const s of staff) {
          await sendStaffNewStudentEmail(s, user, course);
        }
      } catch (e) {
        console.error('Email error:', e.message);
      }
    }
  }

  // Add welcome notification
  db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
    user.id, `Welcome to NextForge Academy, ${full_name}! 🎉`
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
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, token, role: user.role, name: user.full_name });
});

// ── LOGOUT ──────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// ── ME ──────────────────────────────────────────────
router.get('/me', (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, full_name, email, role, track, avatar, created_at FROM users WHERE id = ?').get(decoded.id);
    res.json(user);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
