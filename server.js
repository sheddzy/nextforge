require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));

// Contact form
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const { sendOTPEmail } = require('./emails/templates');
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.NAMECHEAP_SMTP || 'mail.privateemail.com',
      port: 465, secure: true,
      auth: { user: process.env.NAMECHEAP_EMAIL, pass: process.env.NAMECHEAP_PASS }
    });
    await transporter.sendMail({
      from: `"NextForge Website" <${process.env.NAMECHEAP_EMAIL}>`,
      to: process.env.NAMECHEAP_EMAIL,
      replyTo: email,
      subject: `Website Enquiry — ${subject || 'General'} — ${name}`,
      html: `<div style="font-family:sans-serif;padding:24px"><h3>New Contact Form Submission</h3><table><tr><td><b>Name:</b></td><td>${name}</td></tr><tr><td><b>Email:</b></td><td>${email}</td></tr><tr><td><b>Phone:</b></td><td>${phone||'N/A'}</td></tr><tr><td><b>Subject:</b></td><td>${subject||'N/A'}</td></tr><tr><td><b>Message:</b></td><td>${message}</td></tr></table></div>`
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Contact email error:', e.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// AI Advisor
app.post('/api/ai/advisor', async (req, res) => {
  const { message, history } = req.body;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are the NextForge Academy AI Advisor. Help prospective and current students choose courses and plan their learning journey. NextForge Academy offers: PM Foundations (14 weeks, ₦45,000), Notion OS Mastery (30 days, ₦18,000), Operations Systems Design (8 weeks, ₦35,000), Agile & Scrum (6 weeks, ₦22,000), Notion for Freelancers (2 weeks, ₦9,500), Business Communication (4 weeks, ₦12,000). Be concise, warm, and specific. Always end with a call to action to enroll.`,
        messages: [...(history || []), { role: 'user', content: message }]
      })
    });
    const data = await response.json();
    res.json({ reply: data.content[0].text });
  } catch (e) { res.status(500).json({ error: 'AI advisor unavailable' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`NextForge Academy running on port ${PORT}`));
```

---

## Add to Northflank Environment Variables

Add these two new ones alongside the existing ones:
```
PAYSTACK_PUBLIC_KEY=pk_test_55f401306378cea0e66d1d6044ba3cce8ed23482
PAYSTACK_SECRET_KEY=sk_test_YOUR_SECRET_KEY_FROM_PAYSTACK_DASHBOARD
