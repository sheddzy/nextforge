// ── COURSE DATA ──────────────────────────────────────────────────────────────
const COURSES = [
  {
    id: 'cyber-security',
    icon: '🛡️',
    tag: 'Hot',
    tagClass: 'tag-hot',
    name: 'Cyber Security',
    desc: 'Ethical hacking, cloud security, network defence and incident response. One of the fastest-growing fields in tech globally.',
    price: 850000,
    priceFormatted: '₦850,000',
    duration: '4 months',
    mode: 'Live',
    outcomes: ['Ethical Hacking', 'Cloud Security', 'Network Defence', 'Incident Response', 'Security Certifications'],
    includes: ['Live weekly classes', 'Hands-on lab access', 'Career coaching', 'Certificate of completion', 'Alumni community']
  },
  {
    id: 'product-management',
    icon: '🧭',
    tag: 'Popular',
    tagClass: 'tag-popular',
    name: 'Product Management',
    desc: 'Define, build and launch successful digital products. User research, roadmaps, stakeholder management and go-to-market strategy.',
    price: 500000,
    priceFormatted: '₦500,000',
    duration: '4 months',
    mode: 'Live',
    outcomes: ['Product Strategy', 'User Research', 'Roadmapping', 'Stakeholder Management', 'Go-to-Market'],
    includes: ['Live weekly classes', 'Real product briefs', 'Career coaching', 'Certificate of completion', 'Alumni community']
  },
  {
    id: 'project-management',
    icon: '📋',
    tag: 'Popular',
    tagClass: 'tag-popular',
    name: 'Project Management',
    desc: 'Agile, Scrum, budgeting and real project delivery. Prepare for PMP and industry certifications with live practice.',
    price: 350000,
    priceFormatted: '₦350,000',
    duration: '4 months',
    mode: 'Live',
    outcomes: ['Agile & Scrum', 'Project Planning', 'Budget Management', 'PMP Prep', 'Risk Management'],
    includes: ['Live weekly classes', 'Simulation projects', 'Career coaching', 'Certificate of completion', 'Alumni community']
  },
  {
    id: 'ui-ux-design',
    icon: '🎨',
    tag: 'New',
    tagClass: 'tag-new',
    name: 'UI/UX Design',
    desc: 'Design beautiful, user-friendly digital products in Figma. From wireframes to polished, interactive prototypes.',
    price: 300000,
    priceFormatted: '₦300,000',
    duration: '4 months',
    mode: 'Live',
    outcomes: ['Figma Mastery', 'User Research', 'Wireframing', 'Prototyping', 'Design Systems'],
    includes: ['Live weekly classes', 'Portfolio projects', 'Career coaching', 'Certificate of completion', 'Alumni community']
  },
  {
    id: 'data-analysis',
    icon: '📊',
    tag: 'Popular',
    tagClass: 'tag-popular',
    name: 'Data Analysis',
    desc: 'Excel, SQL and Power BI to transform raw data into business insights. In demand across every industry in Nigeria.',
    price: 300000,
    priceFormatted: '₦300,000',
    duration: '4 months',
    mode: 'Live',
    outcomes: ['Excel Advanced', 'SQL Queries', 'Power BI Dashboards', 'Data Storytelling', 'Business Insights'],
    includes: ['Live weekly classes', 'Real datasets', 'Career coaching', 'Certificate of completion', 'Alumni community']
  },
  {
    id: 'data-science',
    icon: '🤖',
    tag: 'Hot',
    tagClass: 'tag-hot',
    name: 'Data Science',
    desc: 'Python, statistics and machine learning fundamentals. Build predictive models that solve real business problems.',
    price: 300000,
    priceFormatted: '₦300,000',
    duration: '4 months',
    mode: 'Live',
    outcomes: ['Python Programming', 'Statistics', 'Machine Learning', 'Model Building', 'Data Visualisation'],
    includes: ['Live weekly classes', 'Kaggle projects', 'Career coaching', 'Certificate of completion', 'Alumni community']
  },
  {
    id: 'graphic-design',
    icon: '✏️',
    tag: 'New',
    tagClass: 'tag-new',
    name: 'Graphic Design',
    desc: 'Branding, print and digital visual design. Build a creative portfolio that wins clients from day one.',
    price: 250000,
    priceFormatted: '₦250,000',
    duration: '4 months',
    mode: 'Live',
    outcomes: ['Brand Identity', 'Adobe Suite', 'Print Design', 'Digital Design', 'Portfolio Building'],
    includes: ['Live weekly classes', 'Client briefs', 'Career coaching', 'Certificate of completion', 'Alumni community']
  }
];

// ── NAV ACTIVE STATE ──────────────────────────────────────────────────────────
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.remove('active');
    const href = a.getAttribute('href');
    if (href && path.endsWith(href)) a.classList.add('active');
    if (path === '/' && href === 'index.html') a.classList.add('active');
  });
}

// ── EMAIL SERVICE (EmailJS) ───────────────────────────────────────────────────
const EMAIL_CONFIG = {
  serviceId: 'nextforge_service',
  studentTemplateId: 'student_confirmation',
  adminTemplateId: 'admin_notification',
  publicKey: 'YOUR_EMAILJS_PUBLIC_KEY' // Replace with actual EmailJS key
};

async function sendEnrollmentEmails(data) {
  // Using EmailJS for client-side email sending
  // Replace the publicKey, serviceId, and templateIds with your actual EmailJS credentials
  
  const adminEmail = 'info@nextforgeacademy.online';
  const refNum = 'NFA-' + Date.now().toString().slice(-8);
  const timestamp = new Date().toLocaleString('en-NG', { dateStyle: 'long', timeStyle: 'short' });

  try {
    // Check if EmailJS is loaded
    if (typeof emailjs !== 'undefined') {
      // Student confirmation email
      await emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.studentTemplateId, {
        to_email: data.email,
        to_name: data.firstName + ' ' + data.lastName,
        course_name: data.courseName,
        course_price: data.coursePrice,
        ref_number: refNum,
        cohort: 'Cohort 5',
        start_info: 'You will receive your cohort start date and LMS access details within 24–48 hours.',
        admin_email: adminEmail
      }, EMAIL_CONFIG.publicKey);

      // Admin notification email
      await emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.adminTemplateId, {
        to_email: adminEmail,
        student_name: data.firstName + ' ' + data.lastName,
        student_email: data.email,
        student_phone: data.phone,
        course_name: data.courseName,
        course_price: data.coursePrice,
        ref_number: refNum,
        timestamp: timestamp,
        experience: data.experience || 'Not specified',
        goals: data.goals || 'Not specified'
      }, EMAIL_CONFIG.publicKey);

      return { success: true, refNumber: refNum };
    } else {
      // Fallback: store locally and return success for demo
      console.warn('EmailJS not loaded — storing enrollment locally.');
      storeEnrollmentLocally(data, refNum, timestamp);
      return { success: true, refNumber: refNum, fallback: true };
    }
  } catch (err) {
    console.error('Email send error:', err);
    storeEnrollmentLocally(data, refNum, timestamp);
    return { success: true, refNumber: refNum, fallback: true };
  }
}

function storeEnrollmentLocally(data, refNum, timestamp) {
  const enrollments = JSON.parse(localStorage.getItem('nfa_enrollments') || '[]');
  enrollments.push({
    refNumber: refNum,
    timestamp: timestamp,
    ...data
  });
  localStorage.setItem('nfa_enrollments', JSON.stringify(enrollments));
  localStorage.setItem('nfa_last_enrollment', JSON.stringify({ refNumber: refNum, ...data }));
}

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────
function getCurrentUser() {
  const u = sessionStorage.getItem('nfa_user');
  return u ? JSON.parse(u) : null;
}

function requireAuth() {
  if (!getCurrentUser()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function logout() {
  sessionStorage.removeItem('nfa_user');
  window.location.href = 'login.html';
}

// ── URL PARAM HELPER ─────────────────────────────────────────────────────────
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

// ── FORMAT CURRENCY ───────────────────────────────────────────────────────────
function formatNaira(n) {
  return '₦' + n.toLocaleString('en-NG');
}

// ── RENDER NAV ────────────────────────────────────────────────────────────────
function renderNav(activePage) {
  const user = getCurrentUser();
  return `
  <nav class="nav">
    <div class="nav-inner">
      <a href="index.html" class="nav-logo">
        <div class="logo-mark">N</div>
        Nextforge Academy
      </a>
      <div class="nav-links">
        <a href="index.html" ${activePage==='home'?'class="active"':''}>Home</a>
        <a href="courses.html" ${activePage==='courses'?'class="active"':''}>Courses</a>
        <a href="about.html" ${activePage==='about'?'class="active"':''}>About</a>
        <a href="contact.html" ${activePage==='contact'?'class="active"':''}>Contact</a>
      </div>
      <div class="nav-actions">
        ${user
          ? `<a href="dashboard.html" class="btn-ghost">Dashboard</a>
             <button onclick="logout()" class="btn-primary">Sign Out</button>`
          : `<a href="login.html" class="btn-ghost">Sign In</a>
             <a href="courses.html" class="btn-primary">Enroll Now</a>`
        }
      </div>
    </div>
  </nav>`;
}

// ── RENDER FOOTER ─────────────────────────────────────────────────────────────
function renderFooter() {
  return `
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <div class="logo">Nextforge Academy</div>
        <p>Closing the gap between ambition and opportunity for Nigerians ready to build high-income tech careers.</p>
      </div>
      <div class="footer-col">
        <h5>Courses</h5>
        <a href="courses.html">Cyber Security</a>
        <a href="courses.html">Product Management</a>
        <a href="courses.html">Project Management</a>
        <a href="courses.html">UI/UX Design</a>
        <a href="courses.html">Data Analysis</a>
        <a href="courses.html">Data Science</a>
        <a href="courses.html">Graphic Design</a>
      </div>
      <div class="footer-col">
        <h5>Company</h5>
        <a href="about.html">About Us</a>
        <a href="courses.html">All Courses</a>
        <a href="contact.html">Contact</a>
        <a href="login.html">Student Login</a>
      </div>
      <div class="footer-col">
        <h5>Contact</h5>
        <a href="mailto:info@nextforgeacademy.online">info@nextforgeacademy.online</a>
        <a href="contact.html">Send a Message</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 Nextforge Academy · Nigeria</span>
      <span>Building Africa's Next Tech Leaders</span>
    </div>
  </footer>`;
}
