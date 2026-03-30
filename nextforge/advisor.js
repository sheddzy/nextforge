// ── Nextforge AI Course Advisor ──

const COURSES = [
  { name: "Cyber Security", price: "₦850,000", icon: "🛡️", desc: "Ethical hacking, cloud security, incident response", tags: ["security","hacking","network","protect","cyber","IT security"] },
  { name: "Product Management", price: "₦500,000", icon: "🧭", desc: "Build and launch successful digital products", tags: ["product","PM","startup","strategy","roadmap","launch","business"] },
  { name: "Project Management", price: "₦350,000", icon: "📋", desc: "Agile, budgeting and real project delivery", tags: ["project","agile","scrum","management","PMP","team","lead"] },
  { name: "UI/UX Design", price: "₦300,000", icon: "🎨", desc: "Design user-friendly digital products", tags: ["design","UI","UX","figma","creative","visual","user","app"] },
  { name: "Data Analysis", price: "₦300,000", icon: "📊", desc: "Excel, SQL and Power BI for business insights", tags: ["data","excel","sql","analysis","analytics","powerbi","report","business intelligence"] },
  { name: "Data Science", price: "₦300,000", icon: "🤖", desc: "Python, machine learning and AI fundamentals", tags: ["data science","python","ML","machine learning","AI","statistics","model"] },
  { name: "Graphics Design", price: "₦250,000", icon: "✏️", desc: "Branding, print and digital visual design", tags: ["graphic","brand","logo","visual","creative","photoshop","illustrator","poster"] }
];

const SYSTEM_PROMPT = `You are the friendly and knowledgeable course advisor at Nextforge Academy, a Nigerian tech training school. Your role is to help visitors find the right course for their career goals.

Available courses:
${COURSES.map(c => `- ${c.name} (${c.price}): ${c.desc}`).join('\n')}

Guidelines:
- Ask about the user's background, interests, and career goals if not already stated
- Recommend the most relevant 1-2 courses with clear reasons why
- Be warm, encouraging, and specific — no generic advice
- Keep replies concise (2-4 sentences) unless a detailed breakdown is needed
- Always mention the course price when recommending
- You can answer general questions about the academy: all courses are 4 months, live instructor-led, include real projects and career support
- If asked about enrollment, direct them to contact hello@nextforgeacademy.com
- Never make up facts not listed above`;

const quickReplies = [
  "I want to change careers to tech",
  "I'm interested in design",
  "Which course pays the most?",
  "I love working with data",
  "I'm a complete beginner",
];

let conversationHistory = [];
let isLoading = false;

function initAdvisor() {
  const messagesEl = document.getElementById('chat-messages');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const quickRepliesEl = document.getElementById('quick-replies');

  // Welcome message
  appendMessage('bot', "Hi there! 👋 I'm your Nextforge course advisor. Tell me about your career goals or what you're passionate about — I'll help you find the perfect course to get started.");

  // Quick replies
  quickReplies.forEach(text => {
    const btn = document.createElement('button');
    btn.className = 'quick-reply';
    btn.textContent = text;
    btn.onclick = () => {
      inputEl.value = text;
      sendMessage();
    };
    quickRepliesEl.appendChild(btn);
  });

  // Send handlers
  sendBtn.onclick = sendMessage;
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function appendMessage(role, text) {
  const messagesEl = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'bot' ? '✦' : '👤';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatText(text);

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function showTyping() {
  const messagesEl = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = 'msg bot';
  msg.id = 'typing-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '✦';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

function formatText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function sendMessage() {
  if (isLoading) return;

  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const quickRepliesEl = document.getElementById('quick-replies');
  const text = inputEl.value.trim();
  if (!text) return;

  // Clear quick replies after first use
  quickRepliesEl.innerHTML = '';

  appendMessage('user', text);
  inputEl.value = '';
  isLoading = true;
  sendBtn.disabled = true;

  conversationHistory.push({ role: 'user', content: text });

  showTyping();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: conversationHistory
      })
    });

    const data = await response.json();
    removeTyping();

    const reply = data?.content?.[0]?.text || "I'm sorry, I couldn't process that. Please try again or email us at hello@nextforgeacademy.com.";
    appendMessage('bot', reply);
    conversationHistory.push({ role: 'assistant', content: reply });

  } catch (err) {
    removeTyping();
    appendMessage('bot', "Sorry, I'm having trouble connecting right now. Please reach out to us at hello@nextforgeacademy.com and we'll help you directly.");
    console.error('Advisor error:', err);
  }

  isLoading = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

document.addEventListener('DOMContentLoaded', initAdvisor);
