const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { sendWelcome, sendAdminNewEnrollment } = require('../emails');

// All courses
router.get('/', (req, res) => {
  const courses = db.prepare('SELECT * FROM courses WHERE is_active = 1 ORDER BY id').all();
  res.json(courses);
});

// Single course by id or slug
router.get('/:idOrSlug', (req, res) => {
  const { idOrSlug } = req.params;
  const course = isNaN(idOrSlug)
    ? db.prepare('SELECT * FROM courses WHERE slug = ?').get(idOrSlug)
    : db.prepare('SELECT * FROM courses WHERE id = ?').get(idOrSlug);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const modules = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY order_index').all(course.id);
  modules.forEach(mod => {
    mod.lessons = db.prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY order_index').all(mod.id);
    mod.assignments = db.prepare('SELECT id,title,description,due_days FROM assignments WHERE module_id = ? AND is_active = 1').all(mod.id);
  });

  const instructor = course.instructor_id
    ? db.prepare('SELECT id,full_name,bio,avatar_url FROM users WHERE id = ?').get(course.instructor_id)
    : null;

  res.json({ ...course, modules, instructor });
});

// Enroll (after payment)
router.post('/:id/enroll', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const already = db.prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?').get(req.user.id, course.id);
  if (already) return res.json({ success: true, already: true });

  db.prepare('INSERT INTO enrollments (user_id,course_id,payment_reference) VALUES (?,?,?)')
    .run(req.user.id, course.id, req.body.reference || null);

  db.prepare('INSERT INTO notifications (user_id,message,type,link) VALUES (?,?,?,?)')
    .run(req.user.id, `You are now enrolled in ${course.title}!`, 'success', `/student/lesson.html?course=${course.id}`);

  try {
    await sendWelcome(user, course);
    const admin = db.prepare("SELECT email FROM users WHERE role = 'admin'").get();
    if (admin) await sendAdminNewEnrollment(admin.email, user, course);
  } catch(e) { console.error('Enroll email error:', e.message); }

  res.json({ success: true });
});

// My enrollments
router.get('/my/enrollments', requireAuth, (req, res) => {
  const enrollments = db.prepare(`
    SELECT c.*,e.enrolled_at,e.status,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) as total_lessons,
      (SELECT COUNT(*) FROM progress p JOIN lessons l ON p.lesson_id = l.id
       WHERE l.course_id = c.id AND p.user_id = ? AND p.completed = 1) as completed_lessons
    FROM enrollments e JOIN courses c ON e.course_id = c.id
    WHERE e.user_id = ? ORDER BY e.enrolled_at DESC
  `).all(req.user.id, req.user.id);
  res.json(enrollments);
});

// Check enrollment
router.get('/:id/enrolled', requireAuth, (req, res) => {
  const e = db.prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?').get(req.user.id, req.params.id);
  res.json({ enrolled: !!e });
});

module.exports = router;
