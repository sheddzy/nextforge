const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireStaff, requireAdmin } = require('../middleware/auth');

// Store scheduled classes
router.post('/classes', requireAuth, (req, res) => {
  const { title, date, time, duration, course, notes, meetingUrl, instructor } = req.body;
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, date TEXT, time TEXT, duration INTEGER,
      course_id INTEGER, notes TEXT, meeting_url TEXT,
      instructor_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
    db.prepare('INSERT INTO scheduled_classes (title,date,time,duration,course_id,notes,meeting_url,instructor_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(title, date, time, duration || 90, course || null, notes || null, meetingUrl, req.user.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get all upcoming classes (for students)
router.get('/classes', requireAuth, (req, res) => {
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, date TEXT, time TEXT,
      duration INTEGER, course_id INTEGER, notes TEXT, meeting_url TEXT,
      instructor_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run();
    const classes = db.prepare("SELECT * FROM scheduled_classes WHERE date >= date('now') ORDER BY date, time").all();
    res.json(classes);
  } catch { res.json([]); }
});


// Dashboard stats
router.get('/stats', requireStaff, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const stats = {
    totalStudents: db.prepare("SELECT COUNT(*) as c FROM users WHERE role='student'").get().c,
    totalEnrollments: db.prepare('SELECT COUNT(*) as c FROM enrollments').get().c,
    totalCourses: db.prepare('SELECT COUNT(*) as c FROM courses').get().c,
    totalRevenue: db.prepare("SELECT COALESCE(SUM(amount),0) as c FROM payments WHERE status='success'").get().c,
    recentStudents: db.prepare(`
      SELECT u.id,u.full_name,u.email,u.track,u.created_at,
        COUNT(e.id) as enrollments
      FROM users u LEFT JOIN enrollments e ON e.user_id = u.id
      WHERE u.role='student'
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 10`).all(),
    recentPayments: db.prepare(`
      SELECT p.*,u.full_name,u.email,c.title as course_title
      FROM payments p JOIN users u ON p.user_id=u.id JOIN courses c ON p.course_id=c.id
      ORDER BY p.created_at DESC LIMIT 10`).all()
  };
  res.json(stats);
});

// All students
router.get('/students', requireStaff, (req, res) => {
  const students = db.prepare(`
    SELECT u.*,COUNT(e.id) as enrollments
    FROM users u LEFT JOIN enrollments e ON e.user_id=u.id
    WHERE u.role='student'
    GROUP BY u.id ORDER BY u.created_at DESC`).all();
  res.json(students);
});

// Student detail
router.get('/students/:id', requireStaff, (req, res) => {
  const student = db.prepare('SELECT id,full_name,email,track,phone,created_at,is_active FROM users WHERE id = ?').get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Not found' });
  student.enrollments = db.prepare(`
    SELECT c.title,c.thumbnail,e.enrolled_at,e.status,
      (SELECT COUNT(*) FROM progress p JOIN lessons l ON p.lesson_id=l.id WHERE l.course_id=c.id AND p.user_id=? AND p.completed=1) as completed,
      (SELECT COUNT(*) FROM lessons WHERE course_id=c.id) as total
    FROM enrollments e JOIN courses c ON e.course_id=c.id WHERE e.user_id=?`).all(req.params.id, req.params.id);
  student.assignments = db.prepare(`
    SELECT s.*,a.title as assignment_title,c.title as course_title
    FROM submissions s JOIN assignments a ON s.assignment_id=a.id JOIN courses c ON a.course_id=c.id
    WHERE s.user_id=? ORDER BY s.submitted_at DESC`).all(req.params.id);
  res.json(student);
});

// Toggle student status
router.post('/students/:id/toggle', requireAdmin, (req, res) => {
  const s = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(s.is_active ? 0 : 1, req.params.id);
  res.json({ success: true });
});

// All courses admin view
router.get('/courses', requireStaff, (req, res) => {
  const courses = db.prepare(`
    SELECT c.*,COUNT(e.id) as enrollments,
      u.full_name as instructor_name
    FROM courses c
    LEFT JOIN enrollments e ON e.course_id=c.id
    LEFT JOIN users u ON u.id=c.instructor_id
    GROUP BY c.id ORDER BY c.id`).all();
  res.json(courses);
});

// Create course
router.post('/courses', requireAdmin, (req, res) => {
  const { title, slug, description, category, duration, weeks, price, level, image_url, outcomes, tools } = req.body;
  if (!title || !slug) return res.status(400).json({ error: 'Title and slug required' });
  const r = db.prepare(`INSERT INTO courses (title,slug,description,category,duration,weeks,price,level,image_url,outcomes,tools)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(title, slug, description, category, duration, weeks || 6, price || 0, level || 'Beginner', image_url, outcomes, tools);
  res.json({ success: true, id: r.lastInsertRowid });
});

// Add module
router.post('/courses/:id/modules', requireStaff, (req, res) => {
  const { title, description, week_number } = req.body;
  const r = db.prepare('INSERT INTO modules (course_id,title,description,week_number,order_index) VALUES (?,?,?,?,?)').run(req.params.id, title, description, week_number || 1, week_number || 1);
  res.json({ success: true, id: r.lastInsertRowid });
});

// Add lesson
router.post('/modules/:id/lessons', requireStaff, (req, res) => {
  const { title, content, video_url, video_embed, resource_url, resource_name, lesson_type, duration_mins, course_id } = req.body;
  const r = db.prepare(`INSERT INTO lessons (module_id,course_id,title,content,video_url,video_embed,resource_url,resource_name,lesson_type,duration_mins)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.params.id, course_id, title, content, video_url, video_embed, resource_url, resource_name, lesson_type || 'video', duration_mins || 45);
  res.json({ success: true, id: r.lastInsertRowid });
});

// Add assignment
router.post('/courses/:id/assignments', requireStaff, (req, res) => {
  const { title, description, instructions, module_id, due_days, max_score } = req.body;
  const r = db.prepare(`INSERT INTO assignments (course_id,module_id,title,description,instructions,due_days,max_score)
    VALUES (?,?,?,?,?,?,?)`).run(req.params.id, module_id || null, title, description, instructions, due_days || 7, max_score || 100);
  res.json({ success: true, id: r.lastInsertRowid });
});

// Update course price
router.post('/courses/:id/price', requireAdmin, (req, res) => {
  const { price } = req.body;
  if (!price || isNaN(price)) return res.status(400).json({ error: 'Valid price required' });
  db.prepare('UPDATE courses SET price = ? WHERE id = ?').run(parseInt(price), req.params.id);
  res.json({ success: true });
});

// Post announcement
router.post('/announcements', requireStaff, (req, res) => {
  const { title, body, course_id, is_global } = req.body;
  db.prepare('INSERT INTO announcements (course_id,author_id,title,body,is_global) VALUES (?,?,?,?,?)')
    .run(course_id || null, req.user.id, title, body, is_global ? 1 : 0);

  // Notify relevant students
  if (is_global) {
    const students = db.prepare("SELECT id FROM users WHERE role='student' AND is_active=1").all();
    students.forEach(s => {
      db.prepare('INSERT INTO notifications (user_id,message,type) VALUES (?,?,?)').run(s.id, `📢 Announcement: ${title}`, 'info');
    });
  } else if (course_id) {
    const enrolled = db.prepare('SELECT user_id FROM enrollments WHERE course_id = ?').all(course_id);
    enrolled.forEach(e => {
      db.prepare('INSERT INTO notifications (user_id,message,type) VALUES (?,?,?)').run(e.user_id, `📢 New announcement in your course: ${title}`, 'info');
    });
  }
  res.json({ success: true });
});

// Mark attendance
router.post('/attendance', requireStaff, (req, res) => {
  const { user_id, course_id, session_label, session_date, status } = req.body;
  db.prepare(`INSERT INTO attendance (user_id,course_id,session_label,session_date,status,marked_by)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id,course_id,session_date) DO UPDATE SET status=excluded.status`)
    .run(user_id, course_id, session_label, session_date, status || 'present', req.user.id);
  res.json({ success: true });
});

// Attendance for a course
router.get('/attendance/:courseId', requireStaff, (req, res) => {
  const records = db.prepare(`
    SELECT a.*,u.full_name,u.email
    FROM attendance a JOIN users u ON a.user_id=u.id
    WHERE a.course_id=? ORDER BY a.session_date DESC,u.full_name`).all(req.params.courseId);
  res.json(records);
});

// Issue certificate manually
router.post('/certificates', requireAdmin, (req, res) => {
  const { user_id, course_id } = req.body;
  const crypto = require('crypto');
  const code = 'NF-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  try {
    db.prepare('INSERT INTO certificates (user_id,course_id,cert_code) VALUES (?,?,?)').run(user_id, course_id, code);
    db.prepare('INSERT INTO notifications (user_id,message,type,link) VALUES (?,?,?,?)')
      .run(user_id, '🎓 Your certificate has been issued!', 'success', `/student/certificate.html?course=${course_id}`);
    res.json({ success: true, cert_code: code });
  } catch(e) {
    res.status(409).json({ error: 'Certificate already issued' });
  }
});

// All payments
router.get('/payments', requireAdmin, (req, res) => {
  const payments = db.prepare(`
    SELECT p.*,u.full_name,u.email,c.title as course_title
    FROM payments p JOIN users u ON p.user_id=u.id JOIN courses c ON p.course_id=c.id
    ORDER BY p.created_at DESC`).all();
  res.json(payments);
});

// Get announcements
router.get('/announcements', requireStaff, (req, res) => {
  const announcements = db.prepare(`
    SELECT a.*,u.full_name as author_name,c.title as course_title
    FROM announcements a JOIN users u ON a.author_id=u.id
    LEFT JOIN courses c ON a.course_id=c.id
    ORDER BY a.created_at DESC LIMIT 50`).all();
  res.json(announcements);
});

// Instructor approval routes
router.get('/instructors/pending', requireAdmin, (req, res) => {
  const instructors = db.prepare("SELECT * FROM users WHERE role='instructor' AND is_approved=0 ORDER BY created_at DESC").all();
  res.json(instructors);
});

router.get('/instructors/active', requireAdmin, (req, res) => {
  const instructors = db.prepare("SELECT * FROM users WHERE role='instructor' AND is_approved=1 ORDER BY created_at DESC").all();
  res.json(instructors);
});

router.post('/instructors/:id/approve', requireAdmin, (req, res) => {
  const { approve } = req.body;
  db.prepare('UPDATE users SET is_approved=?, is_active=? WHERE id=?').run(approve?1:0, approve?1:0, req.params.id);
  if (approve) {
    db.prepare('INSERT INTO notifications (user_id,message,type) VALUES (?,?,?)').run(req.params.id, '🎉 Your instructor application has been approved! You can now log in.', 'success');
  } else {
    db.prepare('INSERT INTO notifications (user_id,message,type) VALUES (?,?,?)').run(req.params.id, 'Your instructor application was not approved. Please contact info@nextforgeacademy.online for more information.', 'info');
  }
  res.json({ success: true });
});

// Update course price
router.post('/courses/:id/price', requireAdmin, (req, res) => {
  const { price } = req.body;
  if (!price || isNaN(price)) return res.status(400).json({ error: 'Valid price required' });
  db.prepare('UPDATE courses SET price=? WHERE id=?').run(parseInt(price), req.params.id);
  res.json({ success: true });
});
// Deactivate / reactivate instructor
router.post('/instructors/:id/toggle', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'instructor');
  if (!user) return res.status(404).json({ error: 'Instructor not found' });
  const newStatus = user.is_active ? 0 : 1;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);
  const msg = newStatus
    ? 'Your instructor account has been reactivated. You can now log in to NextForge Academy.'
    : 'Your instructor account has been deactivated. Please contact info@nextforgeacademy.online for more information.';
  db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?,?,?)').run(req.params.id, msg, newStatus ? 'success' : 'warning');
  res.json({ success: true, is_active: newStatus });
});

// Get single instructor detail
router.get('/instructors/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const enrollments = db.prepare(`
    SELECT c.title, c.thumbnail, COUNT(e.id) as students
    FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id
    WHERE c.instructor_id = ? GROUP BY c.id
  `).all(req.params.id);
  res.json({ ...user, courses: enrollments });
});
module.exports = router;
