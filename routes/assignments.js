const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireStaff } = require('../middleware/auth');

// Get assignments for a course
router.get('/course/:courseId', requireAuth, (req, res) => {
  const assignments = db.prepare(`
    SELECT a.*,
      s.status as submission_status,
      s.score,
      s.submitted_at,
      s.feedback
    FROM assignments a
    LEFT JOIN submissions s ON s.assignment_id = a.id AND s.user_id = ?
    WHERE a.course_id = ? AND a.is_active = 1
    ORDER BY a.id`).all(req.user.id, req.params.courseId);
  res.json(assignments);
});

// Submit assignment
router.post('/:id/submit', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Submission content required' });
  db.prepare(`INSERT INTO submissions (assignment_id,user_id,content,status)
    VALUES (?,?,?,'submitted')
    ON CONFLICT(assignment_id,user_id) DO UPDATE SET
      content=excluded.content, status='submitted', submitted_at=CURRENT_TIMESTAMP`)
    .run(req.params.id, req.user.id, content);
  db.prepare('INSERT INTO notifications (user_id,message,type) VALUES (?,?,?)')
    .run(req.user.id, 'Assignment submitted successfully! Your instructor will review it soon.', 'info');
  res.json({ success: true });
});

// Grade assignment (instructor/admin)
router.post('/:id/grade/:userId', requireStaff, (req, res) => {
  const { score, feedback } = req.body;
  db.prepare(`UPDATE submissions SET score=?,feedback=?,status='graded',graded_at=CURRENT_TIMESTAMP
    WHERE assignment_id=? AND user_id=?`).run(score, feedback, req.params.id, req.params.userId);

  const assignment = db.prepare('SELECT title FROM assignments WHERE id = ?').get(req.params.id);
  db.prepare('INSERT INTO notifications (user_id,message,type) VALUES (?,?,?)')
    .run(req.params.userId, `Your assignment "${assignment?.title}" has been graded. Score: ${score}/100`, 'success');

  res.json({ success: true });
});

// Get all submissions for a course (instructor)
router.get('/submissions/:courseId', requireStaff, (req, res) => {
  const submissions = db.prepare(`
    SELECT s.*,u.full_name,u.email,a.title as assignment_title
    FROM submissions s
    JOIN users u ON s.user_id = u.id
    JOIN assignments a ON s.assignment_id = a.id
    WHERE a.course_id = ?
    ORDER BY s.submitted_at DESC`).all(req.params.courseId);
  res.json(submissions);
});

module.exports = router;
