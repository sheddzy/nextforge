const nodemailer = require('nodemailer');

function createTransporter() {
  if (process.env.NAMECHEAP_EMAIL && process.env.NAMECHEAP_PASS) {
    return nodemailer.createTransport({
      host: 'mail.privateemail.com',
      port: 465, secure: true,
      auth: { user: process.env.NAMECHEAP_EMAIL, pass: process.env.NAMECHEAP_PASS }
    });
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
  });
}

const FROM = () => process.env.NAMECHEAP_EMAIL || process.env.GMAIL_USER;

const base = (content) => `
<div style="font-family:'Segoe UI',Arial,sans-serif;background:#0a1628;max-width:580px;margin:0 auto;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0f1f3d,#1a3560);padding:32px 36px;border-bottom:2px solid #c9a84c">
    <div style="font-size:1.3rem;font-weight:800;color:#ffffff">Next<span style="color:#c9a84c">Forge</span> Academy</div>
    <div style="font-size:0.78rem;color:#94a3b8;margin-top:4px">nextforgeacademy.online</div>
  </div>
  <div style="padding:36px;color:#cbd5e1">${content}</div>
  <div style="padding:20px 36px;background:#0f1f3d;border-top:1px solid rgba(255,255,255,0.08);font-size:0.78rem;color:#64748b;text-align:center">
    © 2025 NextForge Academy · Lagos, Nigeria · <a href="mailto:info@nextforgeacademy.online" style="color:#c9a84c">info@nextforgeacademy.online</a>
  </div>
</div>`;

async function sendOTP(email, name, otp) {
  try {
    await createTransporter().sendMail({
      from: `"NextForge Academy" <${FROM()}>`,
      to: email,
      subject: `${otp} — Your NextForge Verification Code`,
      html: base(`
        <h2 style="color:#ffffff;margin-bottom:8px">Verify Your Email</h2>
        <p style="margin-bottom:24px">Hi ${name}, here is your 6-digit verification code:</p>
        <div style="background:#0f1f3d;border:2px solid #c9a84c;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px">
          <div style="font-size:2.8rem;font-weight:800;letter-spacing:14px;color:#ffffff">${otp}</div>
          <div style="font-size:0.8rem;color:#64748b;margin-top:8px">Expires in 10 minutes</div>
        </div>
        <p style="color:#64748b;font-size:0.85rem">If you did not request this, please ignore this email.</p>
      `)
    });
    return true;
  } catch(e) {
    console.error('OTP email error:', e.message);
    return false;
  }
}

async function sendWelcome(user, course) {
  try {
    await createTransporter().sendMail({
      from: `"NextForge Academy" <${FROM()}>`,
      to: user.email,
      subject: `🎓 Welcome to ${course.title} — NextForge Academy`,
      html: base(`
        <h2 style="color:#ffffff;margin-bottom:6px">You're In! 🎉</h2>
        <p style="margin-bottom:20px">Hi ${user.full_name}, your enrollment in <strong style="color:#c9a84c">${course.title}</strong> is confirmed.</p>
        <div style="background:#0f1f3d;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:20px;margin-bottom:24px">
          <div style="font-size:1.6rem;margin-bottom:8px">${course.thumbnail}</div>
          <div style="font-weight:700;color:#ffffff;margin-bottom:4px">${course.title}</div>
          <div style="font-size:0.85rem;color:#94a3b8">${course.duration} · ${course.level}</div>
        </div>
        <p style="margin-bottom:20px">Your next steps:</p>
        <ol style="padding-left:20px;color:#cbd5e1;line-height:2">
          <li>Log in to your dashboard</li>
          <li>Complete your profile</li>
          <li>Start your first lesson</li>
          <li>Join the student WhatsApp community</li>
        </ol>
        <a href="https://nextforgeacademy.online/student/dashboard.html" style="display:inline-block;margin-top:24px;background:#c9a84c;color:#0a1628;padding:13px 28px;border-radius:8px;font-weight:700;text-decoration:none">Go to My Dashboard →</a>
        <p style="margin-top:20px;font-size:0.82rem;color:#64748b">Questions? WhatsApp us: <a href="https://wa.me/2349060914286" style="color:#c9a84c">+234 906 091 4286</a></p>
      `)
    });
  } catch(e) { console.error('Welcome email error:', e.message); }
}

async function sendPasswordReset(user, resetLink) {
  try {
    await createTransporter().sendMail({
      from: `"NextForge Academy" <${FROM()}>`,
      to: user.email,
      subject: 'Reset your NextForge Academy password',
      html: base(`
        <h2 style="color:#ffffff;margin-bottom:8px">Password Reset</h2>
        <p style="margin-bottom:20px">Hi ${user.full_name}, click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetLink}" style="display:inline-block;background:#c9a84c;color:#0a1628;padding:13px 28px;border-radius:8px;font-weight:700;text-decoration:none">Reset My Password →</a>
        <p style="margin-top:20px;color:#64748b;font-size:0.82rem">If you did not request this, ignore this email. Your password will not change.</p>
      `)
    });
  } catch(e) { console.error('Reset email error:', e.message); }
}

async function sendAdminNewEnrollment(adminEmail, student, course) {
  try {
    await createTransporter().sendMail({
      from: `"NextForge Academy" <${FROM()}>`,
      to: adminEmail,
      subject: `New Enrollment: ${student.full_name} — ${course.title}`,
      html: base(`
        <h2 style="color:#c9a84c">New Student Enrolled</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:10px 0;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.06)">Name</td><td style="padding:10px 0;color:#ffffff;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06)">${student.full_name}</td></tr>
          <tr><td style="padding:10px 0;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.06)">Email</td><td style="padding:10px 0;color:#ffffff;border-bottom:1px solid rgba(255,255,255,0.06)">${student.email}</td></tr>
          <tr><td style="padding:10px 0;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.06)">Course</td><td style="padding:10px 0;color:#ffffff;border-bottom:1px solid rgba(255,255,255,0.06)">${course.title}</td></tr>
          <tr><td style="padding:10px 0;color:#94a3b8">Amount Paid</td><td style="padding:10px 0;color:#c9a84c;font-weight:700">₦${Number(course.price).toLocaleString()}</td></tr>
        </table>
        <a href="https://nextforgeacademy.online/admin/dashboard.html" style="display:inline-block;margin-top:24px;background:#1a56db;color:#ffffff;padding:11px 24px;border-radius:8px;font-weight:600;text-decoration:none">View Admin Dashboard →</a>
      `)
    });
  } catch(e) { console.error('Admin notification error:', e.message); }
}

module.exports = { sendOTP, sendWelcome, sendPasswordReset, sendAdminNewEnrollment };
