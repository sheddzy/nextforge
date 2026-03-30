require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const app = express();

// ── MIDDLEWARE ─────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ── ROUTES ─────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/admin', require('./routes/admin'));

// ── AI ADVISOR ─────────────────────────────────────
app.post('/api/ai/advisor', async (req, res) => {
  const { message, history } = req.body;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are the NextForge Academy AI Advisor. Help prospective and current students choose courses, understand the curriculum, and plan their learning journey. NextForge Academy offers: PM Foundations (14 weeks, ₦45,000), Notion OS Mastery (30 days, ₦18,000), Operations Systems Design (8 weeks, ₦35,000), Agile & Scrum (6 weeks, ₦22,000), Notion for Freelancers (2 weeks, ₦9,500), Business Communication (4 weeks, ₦12,000). Be concise, helpful, and encouraging.`,
        messages: [...(history || []), { role: 'user', content: message }]
      })
    });
    const data = await response.json();
    res.json({ reply: data.content[0].text });
  } catch (e) {
    res.status(500).json({ error: 'AI advisor unavailable' });
  }
});

// ── SPA FALLBACK ───────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`NextForge Academy running on port ${PORT}`));
