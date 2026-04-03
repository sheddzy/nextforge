const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

// Ensure fetch works (Node 18+ OR install node-fetch)
const fetch = global.fetch || require('node-fetch');
const SECRET = () => process.env.PAYSTACK_SECRET_KEY.replace(/"/g, '').trim();
// const SECRET = () => process.env.PAYSTACK_SECRET_KEY;
const PUBLIC = () => process.env.PAYSTACK_PUBLIC_KEY;
const CALLBACK_URL = () => process.env.PAYMENT_CALLBACK_URL;

// ================= CONFIG =================
router.get('/config', (req, res) => {
  res.json({ publicKey: PUBLIC() });
});

// ================= INITIALIZE PAYMENT =================
router.post('/initialize', requireAuth, async (req, res) => {
  const { course_id } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id);

  if (!course) return res.status(404).json({ error: 'Course not found' });

  const already = db.prepare(
    'SELECT id FROM enrollments WHERE user_id=? AND course_id=?'
  ).get(req.user.id, course_id);

  if (already) {
    return res.status(409).json({ error: 'Already enrolled in this course' });
  }

  const reference = `NF-${Date.now()}-${req.user.id}-${course_id}`;

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SECRET()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: course.price * 100,
        currency: 'NGN',
        reference,
        metadata: {
          user_id: req.user.id,
          course_id,
          student_name: user.full_name,
          course_title: course.title,
        },
        callback_url: CALLBACK_URL(),
      }),
    });

    const data = await response.json();

    if (!data.status) {
      return res.status(400).json({ error: data.message });
    }

    db.prepare(
      'INSERT OR IGNORE INTO payments (user_id,course_id,reference,amount,status) VALUES (?,?,?,?,?)'
    ).run(req.user.id, course_id, reference, course.price, 'pending');

    res.json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

// ================= VERIFY PAYMENT =================
router.post('/verify', requireAuth, async (req, res) => {
  const { reference } = req.body;

  try {
    const existing = db.prepare(
      'SELECT * FROM payments WHERE reference=?'
    ).get(reference);

    if (!existing) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Prevent duplicate processing
    if (existing.status === 'success') {
      return res.json({ success: true });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${SECRET()}` },
      }
    );

    const data = await response.json();

    if (!data.status || data.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful' });
    }

    // Validate amount
    if (existing.amount * 100 !== data.data.amount) {
      return res.status(400).json({ error: 'Amount mismatch' });
    }

    const { user_id, course_id } = data.data.metadata;

    db.prepare(
      `UPDATE payments SET status='success',channel=?,paid_at=CURRENT_TIMESTAMP WHERE reference=?`
    ).run(data.data.channel, reference);

    db.prepare(
      'INSERT OR IGNORE INTO enrollments (user_id,course_id,payment_reference) VALUES (?,?,?)'
    ).run(user_id, course_id, reference);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id);

    // Emails
    try {
      const { sendWelcome, sendAdminNewEnrollment } = require('../emails');
      await sendWelcome(user, course);

      const admin = db.prepare("SELECT email FROM users WHERE role='admin'").get();
      if (admin) {
        await sendAdminNewEnrollment(admin.email, user, course);
      }
    } catch (e) {
      console.error('Email error:', e.message);
    }

    // Notification
    db.prepare(
      'INSERT INTO notifications (user_id,message,type,link) VALUES (?,?,?,?)'
    ).run(
      user_id,
      `Payment confirmed! You are enrolled in "${course.title}" 🎓`,
      'success',
      `/student/lesson.html?course=${course_id}`
    );

    res.json({ success: true, course });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ================= WEBHOOK =================
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const hash = crypto
      .createHmac('sha512', SECRET())
      .update(req.body)
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.sendStatus(400);
    }

    const event = JSON.parse(req.body.toString());

    if (event.event === 'charge.success') {
      const { reference, metadata } = event.data;
      const { user_id, course_id } = metadata || {};

      const existing = db.prepare(
        'SELECT status FROM payments WHERE reference=?'
      ).get(reference);

      if (!existing || existing.status === 'success') {
        return res.sendStatus(200);
      }

      db.prepare(
        'UPDATE payments SET status="success",paid_at=CURRENT_TIMESTAMP WHERE reference=?'
      ).run(reference);

      if (user_id && course_id) {
        db.prepare(
          'INSERT OR IGNORE INTO enrollments (user_id,course_id,payment_reference) VALUES (?,?,?)'
        ).run(user_id, course_id, reference);
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error('Webhook error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
