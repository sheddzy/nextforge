const nodemailer = require('nodemailer');

// Gmail transporter
const gmailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Namecheap private email transporter
const namecheapTransporter = nodemailer.createTransport({
  host: process.env.NAMECHEAP_SMTP || 'mail.privateemail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.NAMECHEAP_EMAIL,
    pass: process.env.NAMECHEAP_PASS,
  },
});

const transporter = process.env.NAMECHEAP_EMAIL ? namecheapTransporter : gmailTransporter;
const FROM = process.env.NAMECHEAP_EMAIL || process.env.GMAIL_USER;

const baseStyle = `
  font-family: 'Segoe UI', sans-serif;
  background: #0e0e0f;
  color: #d8d7d4;
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 32px;
  border-radius: 12px;
`;

const accentStyle = `color: #f5a623; font-weight: 700;`;

async function sendWelcomeEmail(user, course) {
  await transporter.sendMail({
    from: `"NextForge Academy" <${FROM}>`,
    to: user.email,
    subject: `🎓 You're enrolled in ${course.title}!`,
    html: `
      <div style="${baseStyle}">
        <h1 style="font-size:1.6rem;margin-bottom:8px">Welcome to <span style="${accentStyle}">NextForge Academy</span></h1>
        <p style="color:#8a8a96;margin-bottom:24px">Hi ${user.full_name}, your enrollment is confirmed.</p>
        <div style="background:#161618;border:1px solid #2a2a2e;border-radius:10px;padding:24px;margin-bottom:24px">
          <div style="font-size:2rem;margin-bottom:10px">${course.thumbnail}</div>
          <h2 style="font-size:1.1rem;color:#f4f3f0;margin-bottom:6px">${course.title}</h2>
          <p style="color:#8a8a96;font-size:0.9rem">Instructor: ${course.instructor} · ${course.duration}</p>
        </div>
        <a href="https://nextforgeacademy.online/student/dashboard.html"
           style="display:inline-block;background:#f5a623;color:#0e0e0f;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none">
          Go to My Dashboard →
        </a>
        <p style="margin-top:32px;color:#8a8a96;font-size:0.8rem">
          Questions? Reply to this email or contact hello@nextforgeacademy.online
        </p>
      </div>
    `,
  });
}

async function sendStaffNewStudentEmail(staff, student, course) {
  await transporter.sendMail({
    from: `"NextForge Academy" <${FROM}>`,
    to: staff.email,
    subject: `👤 New enrollment: ${student.full_name}`,
    html: `
      <div style="${baseStyle}">
        <h2 style="${accentStyle}">New Student Enrolled</h2>
        <p>A new student has enrolled in <strong>${course.title}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px;color:#8a8a96">Name</td><td style="padding:8px;color:#f4f3f0">${student.full_name}</td></tr>
          <tr><td style="padding:8px;color:#8a8a96">Email</td><td style="padding:8px;color:#f4f3f0">${student.email}</td></tr>
          <tr><td style="padding:8px;color:#8a8a96">Course</td><td style="padding:8px;color:#f4f3f0">${course.title}</td></tr>
          <tr><td style="padding:8px;color:#8a8a96">Date</td><td style="padding:8px;color:#f4f3f0">${new Date().toLocaleDateString()}</td></tr>
        </table>
        <a href="https://nextforgeacademy.online/admin/dashboard.html"
           style="display:inline-block;margin-top:20px;background:#f5a623;color:#0e0e0f;padding:10px 24px;border-radius:8px;font-weight:700;text-decoration:none">
          View Admin Dashboard →
        </a>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(user, resetLink) {
  await transporter.sendMail({
    from: `"NextForge Academy" <${FROM}>`,
    to: user.email,
    subject: `🔑 Reset your NextForge password`,
    html: `
      <div style="${baseStyle}">
        <h2 style="${accentStyle}">Password Reset Request</h2>
        <p>Hi ${user.full_name}, click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetLink}"
           style="display:inline-block;margin-top:16px;background:#f5a623;color:#0e0e0f;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none">
          Reset My Password →
        </a>
        <p style="margin-top:24px;color:#8a8a96;font-size:0.8rem">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}
async function sendOTPEmail(user, otp) {
  await transporter.sendMail({
    from: `"NextForge Academy" <${FROM}>`,
    to: user.email,
    subject: `${otp} — Your NextForge Verification Code`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;background:#0a1628;color:#cbd5e1;max-width:520px;margin:0 auto;padding:40px 32px;border-radius:16px">
        <h2 style="color:#c9a84c;margin-bottom:8px">NextForge Academy</h2>
        <p style="margin-bottom:24px">Hi ${user.full_name}, here is your verification code:</p>
        <div style="background:#0f1f3d;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:32px;text-align:center;margin-bottom:24px">
          <div style="font-size:3rem;font-weight:800;letter-spacing:12px;color:#ffffff">${otp}</div>
          <div style="font-size:0.82rem;color:#64748b;margin-top:8px">Expires in 10 minutes</div>
        </div>
        <p style="color:#64748b;font-size:0.85rem">If you didn't request this, please ignore this email.</p>
      </div>
    `
  });
}

// Add to module.exports:
module.exports = { sendWelcomeEmail, sendStaffNewStudentEmail, sendPasswordResetEmail, sendOTPEmail };

module.exports = { sendWelcomeEmail, sendStaffNewStudentEmail, sendPasswordResetEmail };
