const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireStaff } = require('../middleware/auth');

// Dashboard stats
router.get('/stats', requireStaff, (req, res) => {
  const totalStudents = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get();
  const totalEnrollments = db.prepare('SELECT COUNT(*) as count FROM enrollments').get();
  const totalCourses = db.prepare('SELECT COUNT(*) as count FROM courses').get();
  const recentStudents = db.prepare(`
    SELECT u.full_name, u.email, u.track, u.created_at, c.title as course
    FROM users u
    LEFT JOIN enrollments e ON e.user_id = u.id
    LEFT JOIN courses c ON c.id = e.course_id
    WHERE u.role = 'student'
    ORDER BY u.created_at DESC LIMIT 10
  `).all();

  res.json({
    totalStudents: totalStudents.count,
    totalEnrollments: totalEnrollments.count,
    totalCourses: totalCourses.count,
    recentStudents
  });
});

// All students
router.get('/students', requireStaff, (req, res) => {
  const students = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.track, u.created_at, u.is_active,
      COUNT(e.id) as enrollments
    FROM users u
    LEFT JOIN enrollments e ON e.user_id = u.id
    WHERE u.role = 'student'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(students);
});

// Toggle student active status
router.post('/students/:id/toggle', requireStaff, (req, res) => {
  const student = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(student.is_active ? 0 : 1, req.params.id);
  res.json({ success: true });
});

// All courses (admin view)
router.get('/courses', requireStaff, (req, res) => {
  const courses = db.prepare(`
    SELECT c.*, COUNT(e.id) as enrollments
    FROM courses c
    LEFT JOIN enrollments e ON e.course_id = c.id
    GROUP BY c.id
  `).all();
  res.json(courses);
});

// Add course
router.post('/courses', requireStaff, (req, res) => {
  const { title, description, category, instructor, duration, price, level, thumbnail } = req.body;
  const result = db.prepare(`
    INSERT INTO courses (title, description, category, instructor, duration, price, level, thumbnail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description, category, instructor, duration, price, level, thumbnail || '📋');
  res.json({ success: true, id: result.lastInsertRowid });
});

// Add lesson
router.post('/courses/:id/lessons', requireStaff, (req, res) => {
  const { title, content, week_number, duration_mins } = req.body;
  db.prepare(`
    INSERT INTO lessons (course_id, title, content, week_number, duration_mins)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, title, content, week_number || 1, duration_mins || 30);
  res.json({ success: true });
});

module.exports = router;
