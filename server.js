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

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));

// Contact form
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email and message required' });
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport(
      process.env.NAMECHEAP_EMAIL
        ? { host: 'mail.privateemail.com', port: 465, secure: true, auth: { user: process.env.NAMECHEAP_EMAIL, pass: process.env.NAMECHEAP_PASS } }
        : { service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS } }
    );
    await t.sendMail({
      from: `"NextForge Website" <${process.env.NAMECHEAP_EMAIL || process.env.GMAIL_USER}>`,
      to: process.env.NAMECHEAP_EMAIL || process.env.GMAIL_USER,
      replyTo: email,
      subject: `Website Enquiry — ${subject || 'General'} — ${name}`,
      html: `<div style="font-family:sans-serif;padding:24px;background:#f8fafc"><h3>New Contact Form Submission</h3><p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Phone:</b> ${phone||'N/A'}</p><p><b>Subject:</b> ${subject||'N/A'}</p><p><b>Message:</b><br>${message}</p></div>`
    });
    res.json({ success: true });
  } catch(e) {
    console.error('Contact error:', e.message);
    res.status(500).json({ error: 'Failed to send. Please WhatsApp us directly.' });
  }
});

// AI Advisor
app.post('/api/ai/advisor', async (req, res) => {
  const { message, history } = req.body;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' 
               'x-api-key': process.env.ANTHROPIC_API_KEY ,
               'anthropic-version' : '2023-06-01'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: `You are the NextForge Academy AI Advisor — a friendly, knowledgeable assistant helping people in Nigeria choose the right tech training programme.

NextForge Academy is a Lagos-based academy offering mentor-led, small-cohort programmes:
1. Project Management — 12 weeks, ₦250,000. Agile, Waterfall, Trello, Jira, ClickUp. Beginners welcome.
2. Product Management — 13 weeks, ₦250,000. User research, roadmaps, PRDs, product strategy. Beginners welcome.
3. Data Analysis — 12 weeks, ₦300,000. Excel, SQL, Power BI. Complete beginners welcome.
4. Notion Mastery — 6 weeks, ₦160,000. Build a second brain, client systems, monetise Notion. Self-paced option.
5. Operations Systems Design — 8 weeks, ₦200,000. SOPs, workflows, automation. Intermediate level.
6. Business Communication — 8 weeks, ₦200,000. Reports, presentations, stakeholder management. Beginners welcome.

Key benefits: Small cohorts, live instruction, real projects, career guidance, certificates at 80% completion.
Contact: WhatsApp +2349060914286 | info@nextforgeacademy.online | Lagos, Nigeria.

Be warm, concise and specific. If someone seems unsure, ask one clarifying question. Always end with a clear next step.`,
        messages: [...(history || []), { role: 'user', content: message }]
      })
    });
    const data = await response.json();
    res.json({ reply: data.content?.[0]?.text || 'Sorry, I could not get a response. Please try again.' });
  } catch(e) {
    res.status(500).json({ error: 'AI advisor temporarily unavailable.' });
  }
});

// Verify certificate publicly
app.get('/api/verify-certificate/:code', (req, res) => {
  const db = require('./database');
  const cert = db.prepare(`
    SELECT c.*,u.full_name,co.title as course_title,co.duration
    FROM certificates c
    JOIN users u ON c.user_id=u.id
    JOIN courses co ON c.course_id=co.id
    WHERE c.cert_code=?`).get(req.params.code);
  if (!cert) return res.status(404).json({ error: 'Certificate not found' });
  res.json(cert);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ NextForge Academy running on port ${PORT}`));
