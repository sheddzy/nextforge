require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join('/app/data', 'nectforge.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    track TEXT,
    phone TEXT,
    bio TEXT,
    avatar_url TEXT,
    is_verified INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    is_approved INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    about TEXT,
    category TEXT,
    instructor_id INTEGER,
    duration TEXT,
    weeks INTEGER DEFAULT 6,
    price INTEGER DEFAULT 0,
    level TEXT DEFAULT 'Beginner',
    thumbnail TEXT DEFAULT '📋',
    image_url TEXT,
    outcomes TEXT,
    tools TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instructor_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    week_number INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    video_url TEXT,
    video_embed TEXT,
    resource_url TEXT,
    resource_name TEXT,
    lesson_type TEXT DEFAULT 'video',
    duration_mins INTEGER DEFAULT 30,
    order_index INTEGER DEFAULT 0,
    is_free_preview INTEGER DEFAULT 0,
    FOREIGN KEY (module_id) REFERENCES modules(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    module_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    due_days INTEGER DEFAULT 7,
    max_score INTEGER DEFAULT 100,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT,
    file_url TEXT,
    score INTEGER,
    feedback TEXT,
    status TEXT DEFAULT 'pending',
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    graded_at DATETIME,
    UNIQUE(assignment_id, user_id),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    payment_reference TEXT,
    UNIQUE(user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lesson_id INTEGER NOT NULL,
    completed INTEGER DEFAULT 0,
    watch_percent INTEGER DEFAULT 0,
    last_position INTEGER DEFAULT 0,
    completed_at DATETIME,
    UNIQUE(user_id, lesson_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (lesson_id) REFERENCES lessons(id)
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    session_label TEXT NOT NULL,
    session_date TEXT NOT NULL,
    status TEXT DEFAULT 'present',
    marked_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id, session_date),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    author_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_global INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    cert_code TEXT UNIQUE NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    reference TEXT UNIQUE NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    channel TEXT,
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
  CREATE TABLE IF NOT EXISTS otp_store (
    email TEXT PRIMARY KEY,
    otp TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
    CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_percent INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER DEFAULT 0,
    used_count INTEGER DEFAULT 0,
    expires_at TEXT,
    course_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    email TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

const courseCount = db.prepare('SELECT COUNT(*) as count FROM courses').get();
if (courseCount.count === 0) {
  const ic = db.prepare(`INSERT INTO courses
    (title,slug,description,about,category,duration,weeks,price,level,thumbnail,image_url,outcomes,tools)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const im = db.prepare(`INSERT INTO modules (course_id,title,description,week_number,order_index) VALUES (?,?,?,?,?)`);
  const il = db.prepare(`INSERT INTO lessons (module_id,course_id,title,content,lesson_type,duration_mins,order_index) VALUES (?,?,?,?,?,?,?)`);
  const ia = db.prepare(`INSERT INTO assignments (course_id,module_id,title,description,instructions,due_days) VALUES (?,?,?,?,?,?)`);

  const courses = [
    {
      title:'Project Management',slug:'project-management',
      desc:'Go from zero to job-ready project manager in 12 weeks. Learn Agile, Waterfall, scheduling, risk management and real project delivery.',
      about:'This programme is designed for beginners and career switchers who want to break into project management. You will learn both Agile and Waterfall methodologies, work with industry-standard tools, and complete a real project simulation that goes directly into your portfolio.',
      cat:'Project Management',dur:'12 weeks',weeks:12,price:250000,level:'Beginner',thumb:'📋',
      img:'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80',
      outcomes:'Manage real projects end-to-end|Apply Agile and Waterfall frameworks|Use Trello, Jira and ClickUp professionally|Build a PM portfolio|Prepare for PMP certification',
      tools:'Trello|Jira|ClickUp|Microsoft Project|Notion',
      modules:[
        {title:'Week 1–2: Foundations of Project Management',desc:'Introduction to PM concepts, methodologies and the PM lifecycle.',lessons:['What is Project Management?','The PM Role and Career Path','Project Lifecycle Overview','Stakeholders and Communication','Project Charter Workshop']},
        {title:'Week 3–4: Planning and Scheduling',desc:'Learn to build project plans, Gantt charts and work breakdown structures.',lessons:['Scope Definition and WBS','Gantt Charts and Scheduling','Resource Planning','Budget Estimation','Risk Identification']},
        {title:'Week 5–6: Agile and Scrum',desc:'Master Agile frameworks including Scrum and Kanban for modern teams.',lessons:['Introduction to Agile','Scrum Framework Deep Dive','Sprint Planning and Execution','Kanban Boards','Agile vs Waterfall Comparison']},
        {title:'Week 7–8: Tools and Execution',desc:'Hands-on work with PM tools used in real organisations.',lessons:['Trello for Task Management','Jira for Agile Teams','ClickUp Advanced Features','Meeting Management','Status Reports and Documentation']},
        {title:'Week 9–10: Risk and Quality',desc:'Learn to identify, assess and mitigate project risks.',lessons:['Risk Register and Assessment','Risk Response Planning','Quality Management','Change Management','Stakeholder Conflict Resolution']},
        {title:'Week 11–12: Real Project + Career Prep',desc:'Complete a full project simulation and prepare your portfolio.',lessons:['Project Simulation Kickoff','Mid-Project Review','Project Closure Report','Portfolio Building','Interview Prep and CV Review']},
      ]
    },
    {
      title:'Product Management',slug:'product-management',
      desc:'Learn to define, build and launch digital products. User research, roadmaps, stakeholder management and go-to-market strategy in 13 weeks.',
      about:'This programme takes you through the complete product management lifecycle — from idea validation to product launch. You will work on real case studies, build product roadmaps, and develop the skills that tech companies are actively hiring for.',
      cat:'Product Management',dur:'13 weeks',weeks:13,price:250000,level:'Beginner',thumb:'🧭',
      img:'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&q=80',
      outcomes:'Define and validate product ideas|Build product roadmaps|Conduct user research|Write PRDs and user stories|Launch a real product case study',
      tools:'Figma|Notion|Miro|Jira|Google Analytics',
      modules:[
        {title:'Week 1–2: Product Thinking',desc:'Understanding what product management is and how PMs think.',lessons:['What is Product Management?','The PM vs PM vs PMO Difference','Product Thinking Framework','Customer Problem Identification','Product Vision and Strategy']},
        {title:'Week 3–4: User Research',desc:'Learn to conduct and synthesise user research.',lessons:['User Research Methods','Conducting User Interviews','Survey Design and Analysis','Creating User Personas','Jobs To Be Done Framework']},
        {title:'Week 5–6: Product Strategy',desc:'Build product strategy and prioritisation frameworks.',lessons:['Product Strategy Fundamentals','OKRs and Product Goals','Prioritisation Frameworks','Competitive Analysis','Market Sizing']},
        {title:'Week 7–9: Building and Collaboration',desc:'Work with designers and engineers to build products.',lessons:['Working with Engineering Teams','PRD Writing Workshop','User Story Mapping','Wireframing with Figma','Sprint Planning for PMs']},
        {title:'Week 10–11: Real Case Study',desc:'Apply everything to a real product case study.',lessons:['Case Study Brief','Discovery Phase','Solution Design','Go-To-Market Planning','Case Study Presentation']},
        {title:'Week 12–13: Career Prep',desc:'Prepare your PM portfolio and land your first role.',lessons:['PM Portfolio Building','Product Metrics and Analytics','PM Interview Preparation','Salary Negotiation','Networking in Tech']},
      ]
    },
    {
      title:'Data Analysis',slug:'data-analysis',
      desc:'Master Excel, SQL and Power BI to transform raw data into business insights. One of the most in-demand skills across every industry in Nigeria.',
      about:'This programme takes complete beginners through the full data analysis workflow. You will learn to collect, clean, analyse and visualise data using the tools that Nigerian businesses actually use — and graduate with a portfolio of real projects.',
      cat:'Data Analysis',dur:'12 weeks',weeks:12,price:300000,level:'Beginner',thumb:'📊',
      img:'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
      outcomes:'Master Microsoft Excel for data analysis|Write SQL queries with confidence|Build Power BI dashboards|Clean and analyse real datasets|Present data stories to stakeholders',
      tools:'Microsoft Excel|SQL|Power BI|Google Sheets|Python (basics)',
      modules:[
        {title:'Week 1–2: Foundations and Excel',desc:'Start from zero and build Excel proficiency for data work.',lessons:['Introduction to Data Analysis','Excel Fundamentals','Excel Functions for Analysis','Pivot Tables and Charts','Data Cleaning in Excel']},
        {title:'Week 3–4: Data Cleaning',desc:'Learn to clean and prepare messy real-world data.',lessons:['Why Data Cleaning Matters','Handling Missing Data','Removing Duplicates','Data Validation Techniques','Real Dataset Cleaning Workshop']},
        {title:'Week 5–7: SQL',desc:'Write SQL queries to extract and analyse data from databases.',lessons:['Introduction to Databases','Basic SQL Queries','Filtering and Sorting','Joins and Relationships','Aggregate Functions','Subqueries and CTEs']},
        {title:'Week 8–10: Power BI',desc:'Build professional dashboards and visualisations in Power BI.',lessons:['Introduction to Power BI','Connecting Data Sources','Building Your First Dashboard','DAX Formulas Basics','Advanced Visualisations','Dashboard Design Best Practices']},
        {title:'Week 11–12: Capstone Project',desc:'Apply everything to a real business dataset and present your findings.',lessons:['Capstone Brief and Dataset','Data Cleaning Phase','Analysis and Insights','Dashboard Build','Stakeholder Presentation']},
      ]
    },
    {
      title:'Notion Mastery',slug:'notion-mastery',
      desc:'Build your complete second brain and professional operating system in Notion. Learn to design templates, databases and systems that clients will pay for.',
      about:'In 6 weeks you will go from Notion beginner to Notion professional. You will build your own personal OS, design client-ready systems, and learn how to monetise your Notion skills as a freelancer or consultant.',
      cat:'Notion & Productivity',dur:'6 weeks',weeks:6,price:160000,level:'Beginner',thumb:'🗂',
      img:'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800&q=80',
      outcomes:'Build a complete Notion OS|Design professional templates|Create client CRM systems|Build project trackers|Monetise your Notion skills',
      tools:'Notion|Zapier|Loom|Google Drive',
      modules:[
        {title:'Week 1: Notion Fundamentals',desc:'Master the building blocks of Notion.',lessons:['Notion Interface Overview','Pages, Blocks and Databases','Database Properties and Views','Linked Databases','Templates Basics']},
        {title:'Week 2: Personal OS',desc:'Build your complete personal operating system.',lessons:['Second Brain Framework','Task Management System','Goals and Habits Tracker','Reading and Learning System','Daily Dashboard Setup']},
        {title:'Week 3: Advanced Systems',desc:'Build advanced Notion systems for professional use.',lessons:['CRM Database Design','Project Management in Notion','Content Calendar System','Meeting Notes System','Team Workspace Setup']},
        {title:'Week 4–5: Client Systems',desc:'Design and deliver Notion systems for clients.',lessons:['Client Onboarding System','Business Dashboard Design','Invoice and Finance Tracker','Client Delivery Process','Notion Templates for Sale']},
        {title:'Week 6: Portfolio and Monetisation',desc:'Package your skills and start earning from Notion.',lessons:['Building Your Notion Portfolio','Pricing Your Services','Finding First Clients','Notion Freelance Platforms','Passive Income with Notion Templates']},
      ]
    },
    {
      title:'Operations Systems Design',slug:'operations-systems',
      desc:'Learn to design, document and deploy operational systems from scratch. SOPs, workflows and automation using tools like Notion, Lark and ClickUp.',
      about:'This intermediate programme is built for professionals who want to systematise how organisations work. You will design real SOPs, build workflow systems, and deploy operational infrastructure that scales — using tools deployed in actual Nigerian businesses.',
      cat:'Operations & Systems',dur:'8 weeks',weeks:8,price:200000,level:'Intermediate',thumb:'⚙️',
      img:'https://images.unsplash.com/photo-1664575602554-2087b04935a5?w=800&q=80',
      outcomes:'Design complete SOP systems|Build operational workflows|Automate repetitive processes|Deploy systems in real organisations|Create operations documentation',
      tools:'Notion|Lark|ClickUp|Zapier|Google Workspace',
      modules:[
        {title:'Week 1–2: Operations Fundamentals',desc:'Understand what operations systems are and why they matter.',lessons:['What Are Operations Systems?','The Operations Design Framework','Mapping Existing Processes','Identifying Operational Gaps','Operations Audit Workshop']},
        {title:'Week 3–4: SOP Design',desc:'Learn to write and deploy Standard Operating Procedures.',lessons:['What Makes a Great SOP','SOP Writing Framework','SOP Templates and Formats','Getting Team Buy-In','SOP Review and Maintenance']},
        {title:'Week 5–6: Tools and Automation',desc:'Deploy operations tools and automate workflows.',lessons:['Notion for Operations','Lark for Team Communication','ClickUp for Task Management','Zapier Automation Basics','Integrating Your Tool Stack']},
        {title:'Week 7–8: Real Deployment',desc:'Deploy a complete operations system in a real context.',lessons:['Client Brief and Scoping','System Design Workshop','Deployment and Testing','Team Training','Operations Handover Documentation']},
      ]
    },
    {
      title:'Business Communication',slug:'business-communication',
      desc:'Master professional written and verbal communication, stakeholder management, report writing and presentations in 8 weeks.',
      about:'Communication is the skill that separates good professionals from great ones. This programme covers every form of business communication — from emails and reports to board presentations and difficult stakeholder conversations.',
      cat:'Professional Skills',dur:'8 weeks',weeks:8,price:200000,level:'Beginner',thumb:'💡',
      img:'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&q=80',
      outcomes:'Write professional reports and proposals|Present confidently to executives|Manage difficult stakeholder conversations|Run effective meetings|Build executive presence',
      tools:'Microsoft Word|PowerPoint|Google Docs|Loom|Zoom',
      modules:[
        {title:'Week 1–2: Written Communication',desc:'Master professional writing for business contexts.',lessons:['Principles of Business Writing','Email Writing Mastery','Report Writing Framework','Proposals and Briefs','Editing and Proofreading']},
        {title:'Week 3–4: Presentations',desc:'Design and deliver compelling presentations.',lessons:['Presentation Structure','PowerPoint Design Principles','Data Storytelling','Delivery and Confidence','Executive Presentations']},
        {title:'Week 5–6: Stakeholder Management',desc:'Communicate effectively with different stakeholders.',lessons:['Stakeholder Mapping','Managing Up','Difficult Conversations','Negotiation Basics','Meeting Management']},
        {title:'Week 7–8: Executive Presence',desc:'Build the presence and reputation of a trusted professional.',lessons:['Personal Branding at Work','Networking Professionally','LinkedIn for Professionals','Career Communication Strategy','Final Presentation']},
      ]
    },
  ];

  courses.forEach(c => {
    const r = ic.run(
      c.title, c.slug, c.desc, c.about, c.cat,
      c.dur, c.weeks, c.price, c.level, c.thumb,
      c.img, c.outcomes, c.tools
    );
    const cid = r.lastInsertRowid;
    c.modules.forEach((mod, mi) => {
      const mr = im.run(cid, mod.title, mod.desc, mi + 1, mi + 1);
      const mid = mr.lastInsertRowid;
      mod.lessons.forEach((lesson, li) => {
        il.run(mid, cid, lesson, `This lesson covers: ${lesson}. Watch the video, take notes, and complete the practice exercise before moving on.`, 'video', 45, li + 1);
      });
      ia.run(cid, mid, `${mod.title} — Assignment`, `Submit your work for ${mod.title}`, `Complete all lessons in this module, then submit your assignment. Your instructor will review and provide feedback within 48 hours.`, 7);
    });
  });
}

const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('NextForge@2025!', 10);
  db.prepare(`INSERT INTO users (full_name,email,password,role,is_verified,is_active) VALUES (?,?,?,?,1,1)`)
    .run('Shedrack Ebete', 'admin@nextforgeacademy.online', hash, 'admin');
}
// Safe migrations — run on every startup
try { db.exec('ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT'); } catch {}
try { db.exec('UPDATE users SET is_approved = 1 WHERE is_approved IS NULL'); } catch {}
// Generate unique IDs for existing users who don't have one
try { db.exec('ALTER TABLE users ADD COLUMN unique_id TEXT'); } catch {}

// Auto-generate IDs on startup for users missing them
const usersWithoutId = db.prepare("SELECT id, role FROM users WHERE unique_id IS NULL").all();
usersWithoutId.forEach(u => {
  const prefix = u.role === 'admin' ? 'NFA' : u.role === 'instructor' ? 'NFI' : 'NFS';
  const uniqueId = `${prefix}-${String(u.id).padStart(4,'0')}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
  db.prepare('UPDATE users SET unique_id = ? WHERE id = ?').run(uniqueId, u.id);
});
module.exports = db;
