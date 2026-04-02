const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

const SECRET = () => process.env.PAYSTACK_SECRET_KEY;
const PUBLIC = () => process.env.PAYSTACK_PUBLIC_KEY;

router.get('/config', (req, res) => {
  res.json({ publicKey: PUBLIC() });
});

router.post('/initialize', requireAuth, async (req, res) => {
  const { course_id } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const already = db.prepare('SELECT id FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id, course_id);
  if (already) return res.status(409).json({ error: 'Already enrolled in this course' });

  const reference = `NF-${Date.now()}-${req.user.id}-${course_id}`;
  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: course.price * 100,
        currency: 'NGN',
        reference,
        metadata: { user_id: req.user.id, course_id, student_name: user.full_name, course_title: course.title },
        callback_url: `https://nextforgeacademy.online/payment-success.html`
      })
    });
    const data = await response.json();
    if (!data.status) return res.status(400).json({ error: data.message });

    db.prepare('INSERT OR IGNORE INTO payments (user_id,course_id,reference,amount) VALUES (?,?,?,?)')
      .run(req.user.id, course_id, reference, course.price);

    res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
  } catch(e) {
    res.status(500).json({ error: 'Payment initialization failed. Please try again.' });
  }
});

router.post('/verify', requireAuth, async (req, res) => {
  const { reference } = req.body;
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${SECRET()}` }
    });
    const data = await response.json();
    if (!data.status || data.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment was not successful' });
    }

    const { user_id, course_id } = data.data.metadata;
    db.prepare(`UPDATE payments SET status='success',channel=?,paid_at=CURRENT_TIMESTAMP WHERE reference=?`)
      .run(data.data.channel, reference);

    db.prepare('INSERT OR IGNORE INTO enrollments (user_id,course_id,payment_reference) VALUES (?,?,?)').run(user_id, course_id, reference);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id);

    const { sendWelcome, sendAdminNewEnrollment } = require('../emails');
    try {
      await sendWelcome(user, course);
      const admin = db.prepare("SELECT email FROM users WHERE role='admin'").get();
      if (admin) await sendAdminNewEnrollment(admin.email, user, course);
    } catch(e) { console.error('Payment email error:', e.message); }

    db.prepare('INSERT INTO notifications (user_id,message,type,link) VALUES (?,?,?,?)')
      .run(user_id, `Payment confirmed! You are enrolled in "${course.title}" 🎓`, 'success', `/student/lesson.html?course=${course_id}`);

    res.json({ success: true, course });
  } catch(e) {
    res.status(500).json({ error: 'Verification failed. Contact support.' });
  }
});

// Paystack webhook
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const hash = crypto.createHmac('sha512', SECRET()).update(req.body).digest('hex');
  if (hash !== req.headers['x-paystack-signature']) return res.sendStatus(400);
  const event = JSON.parse(req.body);
  if (event.event === 'charge.success') {
    const { user_id, course_id } = event.data.metadata || {};
    if (user_id && course_id) {
      db.prepare('UPDATE payments SET status="success",paid_at=CURRENT_TIMESTAMP WHERE reference=?').run(event.data.reference);
      db.prepare('INSERT OR IGNORE INTO enrollments (user_id,course_id,payment_reference) VALUES (?,?,?)').run(user_id, course_id, event.data.reference);
    }
  }
  res.sendStatus(200);
});

module.exports = router;
