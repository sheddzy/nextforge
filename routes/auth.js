const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');
const { sendOTP, sendWelcome, sendAdminNewEnrollment, sendPasswordReset } = require('../emails');
const { requireAuth } = require('../middleware/auth');

// JWT helper
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ===================== OTP =====================
router.post('/send-otp', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Email and name required' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'This email is already registered. Please sign in.' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 10 * 60 * 1000;

  // Clean old OTPs
  db.prepare('DELETE FROM otp_store WHERE expires_at < ?').run(Date.now());

  db.prepare(`INSERT INTO otp_store (email,otp,expires_at) VALUES (?,?,?)
    ON CONFLICT(email) DO UPDATE SET otp=excluded.otp,expires_at=excluded.expires_at`)
    .run(email, otp, expires);

  const sent = await sendOTP(email, name, otp);
  if (!sent) console.log(`[DEV] OTP for ${email}: ${otp}`);

  res.json({ success: true });
});

// ===================== Register =====================
router.post('/register', async (req, res) => {
  const { full_name, email, password, track, phone, role, otp } = req.body;
  if (!full_name || !email || !password || !otp)
    return res.status(400).json({ error: 'All fields required' });

  const record = db.prepare('SELECT * FROM otp_store WHERE email = ?').get(email);
  if (!record) return res.status(400).json({ error: 'Please request a verification code first' });
  if (record.otp !== otp) return res.status(400).json({ error: 'Incorrect verification code' });
  if (Date.now() > record.expires_at) return res.status(400).json({ error: 'Code expired. Please request a new one.' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const userRole = ['admin','instructor'].includes(role) ? role : 'student';
  const result = db.prepare(`INSERT INTO users (full_name,email,password,role,track,phone,is_verified)
    VALUES (?,?,?,?,?,?,1)`).run(full_name, email, hash, userRole, track || null, phone || null);

  db.prepare('DELETE FROM otp_store WHERE email = ?').run(email);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  // Auto-enroll in selected course
  if (track && userRole === 'student') {
    const course = db.prepare('SELECT * FROM courses WHERE slug = ? OR title LIKE ?').get(track, `%${track}%`);
    if (course) {
      try {
        db.prepare('INSERT OR IGNORE INTO enrollments (user_id,course_id) VALUES (?,?)').run(user.id, course.id);
        await sendWelcome(user, course);
        const admins = db.prepare("SELECT email FROM users WHERE role='admin'").all();
        for (const admin of admins) await sendAdminNewEnrollment(admin.email, user, course);
      } catch(e) { console.error('Post-register error:', e.message); }
    }
  }
// After inserting new user, generate unique_id
const prefix = userRole === 'admin' ? 'NFA' : userRole === 'instructor' ? 'NFI' : 'NFS';
const uniqueId = `${prefix}-${String(result.lastInsertRowid).padStart(4,'0')}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
db.prepare('UPDATE users SET unique_id = ? WHERE id = ?').run(uniqueId, result.lastInsertRowid);
  
  db.prepare('INSERT INTO notifications (user_id,message,type) VALUES (?,?,?)')
    .run(user.id, `Welcome to NextForge Academy, ${full_name}! 🎉`, 'success');

  const token = signToken(user);
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ success: true, token, role: user.role, name: user.full_name });
});

// ===================== Login =====================
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Incorrect email or password' });
  if (!user.is_active) return res.status(403).json({ error: 'Account suspended. Contact support.' });

  const token = signToken(user);
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ success: true, token, role: user.role, name: user.full_name, id: user.id });
});

// ===================== Logout =====================
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// ===================== Me =====================
router.get('/me', (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id,full_name,email,role,track,phone,bio,avatar_url,created_at FROM users WHERE id = ?').get(decoded.id);
    res.json(user);
  } catch { res.status(401).json({ error: 'Invalid token' }); }
});

// ===================== Forgot password =====================
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 60 * 60 * 1000;
    db.prepare(`INSERT INTO password_resets (email,token,expires_at) VALUES (?,?,?)
      ON CONFLICT(email) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at`)
      .run(email, token, expires);

    const resetLink = `https://nextforgeacademy.online/login.html?reset_token=${token}`;
    await sendPasswordReset(user, resetLink);
  }

  res.json({ success: true }); // always success to avoid enumeration
});

// ===================== Reset password =====================
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;

  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const record = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
  if (!record || Date.now() > record.expires_at)
    return res.status(400).json({ error: 'Invalid or expired reset link' });

  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(bcrypt.hashSync(password, 10), record.email);
  db.prepare('DELETE FROM password_resets WHERE token = ?').run(token);

  res.json({ success: true });
});

// ===================== Update profile =====================
router.put('/profile', requireAuth, (req, res) => {
  let { full_name, phone, bio } = req.body;

  if (!full_name || full_name.trim().length < 2)
    return res.status(400).json({ error: 'Valid full name required' });

  if (bio && bio.length > 500)
    return res.status(400).json({ error: 'Bio too long (max 500 chars)' });

  if (phone && phone.length > 20)
    return res.status(400).json({ error: 'Invalid phone number' });

  db.prepare(`
    UPDATE users
    SET full_name=?, phone=?, bio=?
    WHERE id=?
  `).run(
    full_name.trim(),
    phone?.trim() || null,
    bio?.trim() || null,
    req.user.id
  );

  const user = db.prepare(`
    SELECT id,full_name,email,role,track,phone,bio,avatar_url,created_at
    FROM users WHERE id=?
  `).get(req.user.id);

  res.json({ success: true, user });
});
// ===================== Student Enrollment (from dashboard) =====================
router.post('/student/enroll', requireAuth, async (req, res) => {
  const { course_id, payment_option, amount, promo_code, discount } = req.body;
  
  if (!course_id) {
    return res.status(400).json({ error: 'Course ID is required' });
  }
  
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can enroll in courses' });
  }
  
  try {
    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND is_active = 1').get(course_id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const existingEnrollment = db.prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?').get(req.user.id, course_id);
    if (existingEnrollment) {
      return res.status(409).json({ error: 'You are already enrolled in this course' });
    }
    
    let finalAmount = amount || course.price;
    
    if (promo_code) {
      const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? AND is_active = 1').get(promo_code.toUpperCase());
      if (!promo) {
        return res.status(400).json({ error: 'Invalid promo code' });
      }
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Promo code has expired' });
      }
      const discountAmount = Math.floor(course.price * promo.discount_percent / 100);
      finalAmount = course.price - discountAmount;
      db.prepare('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?').run(promo.id);
    }
    
    const enrollmentStatus = payment_option === 'later' ? 'pending_payment' : 'active';
    const reference = `NF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    db.prepare(`
      INSERT INTO enrollments (user_id, course_id, status, payment_reference)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, course_id, enrollmentStatus, reference);
    
    const enrollmentId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    
    res.json({
      success: true,
      message: payment_option === 'later' 
        ? 'Enrollment successful! You can complete payment later.'
        : 'Enrollment successful! Please complete payment.',
      enrollment_id: enrollmentId,
      status: enrollmentStatus,
      course_title: course.title,
      amount_paid: finalAmount
    });
    
  } catch (error) {
    console.error('Enrollment error:', error.message);
    res.status(500).json({ error: 'Failed to process enrollment' });
  }
});

// Get student enrollments
router.get('/student/enrollments', requireAuth, (req, res) => {
  try {
    const enrollments = db.prepare(`
      SELECT e.*, c.title as course_title, c.thumbnail, c.slug, c.price
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.user_id = ?
      ORDER BY e.enrolled_at DESC
    `).all(req.user.id);
    
    res.json(enrollments);
  } catch (error) {
    console.error('Error fetching enrollments:', error.message);
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// Check if email exists
router.post('/check-email', (req, res) => {
  const { email } = req.body;
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  res.json({ exists: !!exists });
});

// Update register to handle instructor approval + payment verification
router.post('/register', async (req, res) => {
  const { full_name, email, password, phone, role, otp, course_id, payment_reference, avatar_base64, bio } = req.body;
  if (!full_name || !email || !password || !otp) return res.status(400).json({ error: 'All fields required' });

  const record = db.prepare('SELECT * FROM otp_store WHERE email = ?').get(email);
  if (!record) return res.status(400).json({ error: 'Please request a verification code first' });
  if (record.otp !== otp) return res.status(400).json({ error: 'Incorrect verification code' });
  if (Date.now() > record.expires_at) return res.status(400).json({ error: 'Code expired. Please request a new one.' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const userRole = role === 'instructor' ? 'instructor' : 'student';
  // Instructors start as pending approval
  const isActive = userRole === 'instructor' ? 0 : 1;
  const isApproved = userRole === 'instructor' ? 0 : 1;

  const result = db.prepare(`
    INSERT INTO users (full_name, email, password, role, phone, bio, avatar_url, is_verified, is_active, is_approved)
    VALUES (?,?,?,?,?,?,?,1,?,?)
  `).run(full_name, email, hash, userRole, phone || null, bio || null, avatar_base64 || null, isActive, isApproved);

  db.prepare('DELETE FROM otp_store WHERE email = ?').run(email);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  // If student with payment — verify payment and enroll
  if (userRole === 'student' && course_id && payment_reference) {
    try {
      const payRes = await fetch(`https://api.paystack.co/transaction/verify/${payment_reference}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      });
      const payData = await payRes.json();
      if (payData.status && payData.data.status === 'success') {
        db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id, payment_reference) VALUES (?,?,?)').run(user.id, course_id, payment_reference);
        db.prepare('INSERT OR IGNORE INTO payments (user_id, course_id, reference, amount, status) VALUES (?,?,?,?,?)').run(user.id, course_id, payment_reference, payData.data.amount / 100, 'success');
      }
    } catch(e) { console.error('Payment verify error:', e.message); }
  }

  db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?,?,?)').run(user.id, `Welcome to NextForge Academy, ${full_name}! 🎉`, 'success');

  // Notify admin of instructor application
  if (userRole === 'instructor') {
    const admin = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
    if (admin) {
      db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?,?,?)').run(admin.id, `New instructor application from ${full_name} — awaiting your approval.`, 'info');
    }
    return res.json({ success: true, pending: true, role: 'instructor' });
  }

  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.json({ success: true, token, role: user.role, name: user.full_name });
});

//Seed test accounts — remove after use
router.post('/seed-test-accounts', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const accounts = [
    {
      full_name: 'Amaka Obi (Test Student)',
      email: 'student.test@nextforgeacademy.online',
      password: 'TestStudent2026!',
      role: 'student',
      phone: '+2348012345678',
      is_active: 1,
      is_approved: 1,
      is_verified: 1,
      bio: JSON.stringify({
        occupation: 'Admin Officer',
        location: 'Lagos, Nigeria',
        reason: 'I want to transition into tech and get a PM role within 6 months.',
        goal: 'Land a Project Management role at a fintech company',
        source: 'LinkedIn'
      })
    },
    {
      full_name: 'Chukwudi Eze (Test Instructor)',
      email: 'instructor.test@nextforgeacademy.online',
      password: 'TestInstructor2026!',
      role: 'instructor',
      phone: '+2348087654321',
      is_active: 1,
      is_approved: 1,
      is_verified: 1,
      bio: JSON.stringify({
        title: 'Senior Product Manager',
        exp: '5–10 years',
        skills: 'Product Management, Agile, User Research, Roadmapping',
        certs: 'PMP, Google PM Certificate',
        bank: 'GTBank',
        account: '0123456789',
        acctname: 'Chukwudi Eze',
        why: 'I want to share my 8 years of experience building products in Nigerian tech with the next generation.'
      })
    }
  ];

  const results = [];
  for (const acc of accounts) {
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(acc.email);
    if (!exists) {
      const hash = bcrypt.hashSync(acc.password, 10);
      const r = db.prepare(`
        INSERT INTO users (full_name, email, password, role, phone, bio, is_active, is_approved, is_verified)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(acc.full_name, acc.email, hash, acc.role, acc.phone, acc.bio, acc.is_active, acc.is_approved, acc.is_verified);

      // Enroll test student in first course
      if (acc.role === 'student') {
        db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?,?)').run(r.lastInsertRowid, 1);
        db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?,?)').run(r.lastInsertRowid, 2);
        // Add some progress
        const lessons = db.prepare('SELECT id FROM lessons WHERE course_id = 1 LIMIT 3').all();
        lessons.forEach(l => {
          db.prepare('INSERT OR IGNORE INTO progress (user_id, lesson_id, completed, watch_percent) VALUES (?,?,1,100)').run(r.lastInsertRowid, l.id);
        });
      }

      results.push({ email: acc.email, password: acc.password, created: true });
    } else {
      results.push({ email: acc.email, created: false, note: 'Already exists' });
    }
  }

  res.json({ success: true, accounts: results });
});
module.exports = router;
