
require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'nextforge.db'));
db.pragma('journal_mode = WAL');

// ── TABLES ────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    track TEXT,
    avatar TEXT DEFAULT '👤',
    is_verified INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    instructor TEXT,
    duration TEXT,
    price INTEGER,
    level TEXT DEFAULT 'Beginner',
    thumbnail TEXT DEFAULT '📋',
    image_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    video_url TEXT,
    week_number INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    duration_mins INTEGER DEFAULT 30,
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    UNIQUE(user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );

  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lesson_id INTEGER NOT NULL,
    completed INTEGER DEFAULT 0,
    completed_at DATETIME,
    UNIQUE(user_id, lesson_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (lesson_id) REFERENCES lessons(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS otp_store (
    email TEXT PRIMARY KEY,
    otp TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    email TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    reference TEXT UNIQUE NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
`);

// ── SEED COURSES ──────────────────────────────────
const courseCount = db.prepare('SELECT COUNT(*) as count FROM courses').get();
if (courseCount.count === 0) {
  const insertCourse = db.prepare(`
    INSERT INTO courses (title, description, category, instructor, duration, price, level, thumbnail, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLesson = db.prepare(`
    INSERT INTO lessons (course_id, title, content, week_number, order_index, duration_mins)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const courses = [
    ['PM Foundations — 14-Week Professional Programme', 'A structured, cohort-based programme covering project initiation, planning, execution, and closure using industry-standard frameworks.', 'Project Management', 'Shedrack Ebete', '14 weeks', 45000, 'Intermediate', '📋', 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80'],
    ['Notion OS Mastery — 30-Day Second Brain Challenge', 'Build a complete personal and professional operating system in Notion. Templates, databases, and workflows included.', 'Notion & Productivity', 'Shedrack Ebete', '30 days', 18000, 'Beginner', '🗂', 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=600&q=80'],
    ['Operations Systems Design — SOPs, Workflows & Automation', 'Learn to design, document, and deploy operational systems from scratch using Lark, Notion, and ClickUp.', 'Operations & Systems', 'Shedrack Ebete', '8 weeks', 35000, 'Intermediate', '⚙️', 'https://images.unsplash.com/photo-1664575602554-2087b04935a5?w=600&q=80'],
    ['Agile & Scrum for Non-Tech Teams', 'Apply Agile frameworks in non-technical environments. Sprints, retrospectives, and Kanban for operations teams.', 'Project Management', 'Shedrack Ebete', '6 weeks', 22000, 'Beginner', '📊', 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=600&q=80'],
    ['Notion for Freelancers — Client CRM & Project Tracker', 'Build a complete freelance business OS in Notion. Client management, invoicing tracker, and project pipeline.', 'Notion & Productivity', 'Shedrack Ebete', '2 weeks', 9500, 'Beginner', '🔧', 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&q=80'],
    ['Business Communication & Stakeholder Management', 'Master written and verbal communication for professional environments. Reports, presentations, and meeting management.', 'Professional Skills', 'Shedrack Ebete', '4 weeks', 12000, 'Beginner', '💡', 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&q=80'],
  ];

  courses.forEach((course) => {
    const result = insertCourse.run(...course);
    const courseId = result.lastInsertRowid;
    const lessons = [
      ['Introduction & Overview', `Welcome to ${course[0]}. In this lesson we cover what you will learn, how the course is structured, and what tools you will need.`, 1, 1, 45],
      ['Core Frameworks & Concepts', 'Deep dive into the foundational frameworks that underpin this entire programme. Theory meets practice from lesson one.', 1, 2, 60],
      ['Hands-On Project Brief', 'Your first hands-on assignment. Apply what you have learned to a real-world scenario with guided support.', 2, 3, 90],
      ['Assessment & Progress Check', 'Week-end assessment. Review your work, get feedback, and prepare for the next module.', 2, 4, 30],
    ];
    lessons.forEach(lesson => insertLesson.run(courseId, ...lesson));
  });
}

// ── SEED ADMIN ────────────────────────────────────
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'staff'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (full_name, email, password, role, avatar, is_verified)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run('Shedrack Ebete', 'admin@nextforgeacademy.online', hash, 'staff', '👨🏿');
}

module.exports = db;
```

