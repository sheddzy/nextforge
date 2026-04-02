const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

// Mark lesson complete
router.post('/complete/:lessonId', requireAuth, (req, res) => {
  const { watch_percent } = req.body;
  db.prepare(`INSERT INTO progress (user_id,lesson_id,completed,watch_percent,completed_at)
    VALUES (?,?,1,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,lesson_id) DO UPDATE SET
      completed=1, watch_percent=MAX(watch_percent,excluded.watch_percent), completed_at=CURRENT_TIMESTAMP`)
    .run(req.user.id, req.params.lessonId, watch_percent || 100);

  // Check certificate eligibility
  const lesson = db.prepare('SELECT course_id FROM lessons WHERE id = ?').get(req.params.lessonId);
  if (lesson) {
    const total = db.prepare('SELECT COUNT(*) as c FROM lessons WHERE course_id = ?').get(lesson.course_id);
    const done = db.prepare(`SELECT COUNT(*) as c FROM progress p
      JOIN lessons l ON p.lesson_id = l.id
      WHERE l.course_id = ? AND p.user_id = ? AND p.completed = 1`).get(lesson.course_id, req.user.id);
    const pct = total.c > 0 ? Math.round((done.c / total.c) * 100) : 0;

    if (pct >= 80) {
      const existing = db.prepare('SELECT id FROM certificates WHERE user_id = ? AND course_id = ?').get(req.user.id, lesson.course_id);
      if (!existing) {
        const code = 'NF-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        db.prepare('INSERT OR IGNORE INTO certificates (user_id,course_id,cert_code) VALUES (?,?,?)').run(req.user.id, lesson.course_id, code);
        db.prepare('INSERT INTO notifications (user_id,message,type,link) VALUES (?,?,?,?)')
          .run(req.user.id, `🎓 Certificate unlocked! You have completed 80% of this course.`, 'success', `/student/certificate.html?course=${lesson.course_id}`);
      }
    }
  }
  res.json({ success: true });
});

// Update watch progress
router.post('/watch/:lessonId', requireAuth, (req, res) => {
  const { percent, position } = req.body;
  db.prepare(`INSERT INTO progress (user_id,lesson_id,watch_percent,last_position)
    VALUES (?,?,?,?)
    ON CONFLICT(user_id,lesson_id) DO UPDATE SET
      watch_percent=MAX(watch_percent,excluded.watch_percent),
      last_position=excluded.last_position`)
    .run(req.user.id, req.params.lessonId, percent || 0, position || 0);
  res.json({ success: true });
});

// Course progress
router.get('/course/:courseId', requireAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM lessons WHERE course_id = ?').get(req.params.courseId);
  const done = db.prepare(`SELECT COUNT(*) as c FROM progress p
    JOIN lessons l ON p.lesson_id = l.id
    WHERE l.course_id = ? AND p.user_id = ? AND p.completed = 1`).get(req.params.courseId, req.user.id);
  const lessons = db.prepare(`SELECT l.id,p.completed,p.watch_percent
    FROM lessons l LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.course_id = ?`).all(req.user.id, req.params.courseId);
  const pct = total.c > 0 ? Math.round((done.c / total.c) * 100) : 0;
  res.json({ total: total.c, completed: done.c, percent: pct, lessons });
});

// Notifications
router.get('/notifications', requireAuth, (req, res) => {
  const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(req.user.id);
  res.json(notifs);
});

router.post('/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

// Certificate
router.get('/certificate/:courseId', requireAuth, (req, res) => {
  const cert = db.prepare('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?').get(req.user.id, req.params.courseId);
  res.json(cert || null);
});

module.exports = router;
