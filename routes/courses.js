const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail, sendStaffNewStudentEmail } = require('../emails/templates');

// Get all courses
router.get('/', (req, res) => {
  const courses = db.prepare('SELECT * FROM courses WHERE is_active = 1').all();
  res.json(courses);
});

// Get single course
router.get('/:id', (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const lessons = db.prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY week_number, order_index').all(req.params.id);
  res.json({ ...course, lessons });
});

// Enroll in course
router.post('/:id/enroll', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  try {
    db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(req.user.id, course.id);
  } catch {
    return res.status(409).json({ error: 'Already enrolled' });
  }

  db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(
    req.user.id, `You enrolled in "${course.title}" 🎓`
  );

  try {
    await sendWelcomeEmail(user, course);
    const staff = db.prepare("SELECT * FROM users WHERE role = 'staff'").all();
    for (const s of staff) await sendStaffNewStudentEmail(s, user, course);
  } catch (e) {
    console.error('Email error:', e.message);
  }

  res.json({ success: true });
});

// Get my enrollments
router.get('/my/enrollments', requireAuth, (req, res) => {
  const enrollments = db.prepare(`
    SELECT c.*, e.enrolled_at, e.status,
      COUNT(l.id) as total_lessons,
      COUNT(p.id) as completed_lessons
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    LEFT JOIN lessons l ON l.course_id = c.id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ? AND p.completed = 1
    WHERE e.user_id = ?
    GROUP BY c.id
  `).all(req.user.id, req.user.id);
  res.json(enrollments);
});

module.exports = router;
