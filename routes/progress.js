const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

// Mark lesson complete
router.post('/complete/:lessonId', requireAuth, (req, res) => {
  db.prepare(`
    INSERT INTO progress (user_id, lesson_id, completed, completed_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET completed = 1, completed_at = CURRENT_TIMESTAMP
  `).run(req.user.id, req.params.lessonId);

  res.json({ success: true });
});

// Get progress for a course
router.get('/course/:courseId', requireAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM lessons WHERE course_id = ?').get(req.params.courseId);
  const completed = db.prepare(`
    SELECT COUNT(*) as count FROM progress p
    JOIN lessons l ON p.lesson_id = l.id
    WHERE l.course_id = ? AND p.user_id = ? AND p.completed = 1
  `).get(req.params.courseId, req.user.id);

  const percent = total.count > 0 ? Math.round((completed.count / total.count) * 100) : 0;
  res.json({ total: total.count, completed: completed.count, percent });
});

// Get notifications
router.get('/notifications', requireAuth, (req, res) => {
  const notifications = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.user.id);
  res.json(notifications);
});

// Mark notification read
router.post('/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

module.exports = router;
