# Nextforge Academy — Website Setup Guide

## File Structure
```
nextforge/
├── index.html          ← Homepage
├── courses.html        ← All 7 courses with filter
├── enroll.html         ← Enrollment form (sends emails)
├── success.html        ← Post-enrollment confirmation
├── login.html          ← Student portal login
├── dashboard.html      ← Student dashboard (auth-protected)
├── about.html          ← About page with team
├── contact.html        ← Contact form
├── assets/
│   ├── css/styles.css  ← Full stylesheet
│   └── js/main.js      ← Shared logic, course data, email functions
└── README.md           ← This file
```

---

## EMAIL SETUP (Required — EmailJS)

All enrollment and contact emails are handled via **EmailJS** (free tier: 200 emails/month).

### Step 1: Create EmailJS Account
1. Go to https://www.emailjs.com and sign up free
2. Add an **Email Service** (Gmail, Outlook, or SMTP)
   - Service ID: use `nextforge_service` (or update in `main.js`)

### Step 2: Create Email Templates

**Template 1 — Student Confirmation** (ID: `student_confirmation`)
```
Subject: Your Nextforge Academy Enrollment is Confirmed — {{ref_number}}

Hi {{to_name}},

Thank you for enrolling in the {{course_name}} programme at Nextforge Academy!

Your enrollment reference: {{ref_number}}
Course: {{course_name}}
Programme Fee: {{course_price}}
Cohort: {{cohort}}

Our admissions team will contact you within 24–48 hours with:
- Payment instructions
- Your cohort start date
- LMS portal access details

If you have any questions, reply to this email or contact us at {{admin_email}}.

Welcome to Nextforge!

The Nextforge Academy Team
```

**Template 2 — Admin Notification** (ID: `admin_notification`)
```
Subject: New Enrollment — {{student_name}} — {{course_name}}

New enrollment received:

Reference: {{ref_number}}
Date/Time: {{timestamp}}
Student: {{student_name}}
Email: {{student_email}}
Phone: {{student_phone}}
Course: {{course_name}}
Fee: {{course_price}}
Background: {{experience}}
Goals: {{goals}}

Action required: Send payment instructions to {{student_email}}
```

**Template 3 — Contact Form** (ID: `contact_form`)
```
Subject: Website Enquiry — {{subject}} — {{from_name}}

New contact form submission:

From: {{from_name}}
Email: {{from_email}}
Phone: {{phone}}
Subject: {{subject}}

Message:
{{message}}
```

### Step 3: Update main.js
Replace `YOUR_EMAILJS_PUBLIC_KEY` in `/assets/js/main.js` with your actual EmailJS Public Key (found in Account → API Keys).

Also update:
- `serviceId: 'nextforge_service'` → your actual service ID
- `studentTemplateId: 'student_confirmation'` → your template ID
- `adminTemplateId: 'admin_notification'` → your template ID

---

## DEPLOYMENT

### Option A: Upload to Hosting (Recommended)
1. Upload the entire `nextforge/` folder to your web host (cPanel, Namecheap, etc.)
2. Point `nextforgeacademy.online` to the folder
3. Ensure `index.html` is the default document

### Option B: Netlify (Free)
1. Drag the `nextforge/` folder to https://app.netlify.com/drop
2. Set custom domain to `nextforgeacademy.online`

---

## STUDENT LOGIN

### Demo Credentials
- Email: `demo@nextforgeacademy.online`
- Password: `nextforge2026`

### Adding Real Students
Currently uses demo authentication. For production, integrate with:
- Firebase Authentication (free, recommended)
- Supabase (free tier available)
- Or a backend (Node.js/PHP)

When a student enrolls and pays, manually create their account or connect the enrollment form to your auth system.

---

## FIXES FROM PREVIOUS VERSION

✅ All 12 errors corrected:
1. Login/enrollment forms now functional with EmailJS
2. Dashboard shows real dynamic data from session
3. Enroll buttons go to real enrollment flow with payment info
4. AI advisor replaced with real contact form
5. "Nigeria's #1" claim removed; replaced with factual stats
6. Statistics clarified (7 tracks not "7+")
7. Instructor profiles added to About page
8. Alumni/testimonial placeholder removed; honest messaging
9. "Graphic Design" correctly spelled throughout
10. Student Login navigates to real login.html page
11. Payment handled via bank transfer with instructions via email
12. Footer © 2026 correct

---

## NOTES
- All pages use relative paths — works locally and on any hosting
- Mobile responsive at 600px and 900px breakpoints
- No external dependencies except Google Fonts and EmailJS CDN
