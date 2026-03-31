const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail, sendStaffNewStudentEmail } = require('../emails/templates');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC_KEY;

// Get Paystack public key (safe to expose)
router.get('/config', (req, res) => {
  res.json({ publicKey: PAYSTACK_PUBLIC });
});

// Initialize payment
router.post('/initialize', requireAuth, async (req, res) => {
  const { course_id } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        amount: course.price * 100, // Paystack uses kobo
        currency: 'NGN',
        reference: `NF-${Date.now()}-${req.user.id}-${course_id}`,
        metadata: {
          user_id: req.user.id,
          course_id: course_id,
          course_name: course.title,
          student_name: user.full_name
        },
        callback_url: `https://nextforgeacademy.online/payment-success.html`
      })
    });
    const data = await response.json();
    if (!data.status) return res.status(400).json({ error: data.message });
    res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
  } catch (e) {
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

// Verify payment + enroll
router.post('/verify', requireAuth, async (req, res) => {
  const { reference } = req.body;
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
    });
    const data = await response.json();
    if (!data.status || data.data.status !== 'success') return res.status(400).json({ error: 'Payment not successful' });

    const { user_id, course_id } = data.data.metadata;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id);

    // Enroll student
    db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(user_id, course_id);

    // Record payment
    db.prepare(`
      INSERT OR IGNORE INTO payments (user_id, course_id, reference, amount, status)
      VALUES (?, ?, ?, ?, 'success')
    `).run(user_id, course_id, reference, data.data.amount / 100);

    // Add notification
    db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
      user_id, `Payment confirmed! You're enrolled in "${course.title}" 🎓`
    );

    // Send emails
    try {
      await sendWelcomeEmail(user, course);
      const staff = db.prepare("SELECT * FROM users WHERE role = 'staff'").all();
      for (const s of staff) await sendStaffNewStudentEmail(s, user, course);
    } catch (e) { console.error('Email error:', e.message); }

    res.json({ success: true, course });
  } catch (e) {
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Paystack webhook
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(req.body).digest('hex');
  if (hash !== req.headers['x-paystack-signature']) return res.status(400).send('Invalid signature');

  const event = JSON.parse(req.body);
  if (event.event === 'charge.success') {
    const { user_id, course_id } = event.data.metadata;
    if (user_id && course_id) {
      db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(user_id, course_id);
    }
  }
  res.sendStatus(200);
});

module.exports = router;
