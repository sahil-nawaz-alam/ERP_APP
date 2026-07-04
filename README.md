# Smart College ERP — Supabase Edition

Three role-based dashboards (**Admin**, **Teacher**, **Student**) sharing one
Supabase (Postgres) database, one login page, and one `APIService` JS layer.

```
erp/
├── index.html                 ← shared login (Supabase Auth)
├── admin/dashboard.html       ← overview, students, teachers, subjects, leaves
├── teacher/
│   ├── dashboard.html
│   ├── attendance.html        ← mark attendance
│   ├── assignments.html       ← create/delete assignments
│   ├── submissions.html       ← grade submissions
│   └── leave-approval.html    ← approve/reject leave
├── student/
│   ├── dashboard.html
│   ├── attendance.html        ← view attendance %
│   ├── assignments.html       ← submit assignments
│   ├── leave-request.html     ← apply for leave
│   └── profile.html
├── assets/
│   ├── css/style.css          ← shared dark glass-morphism theme
│   └── js/
│       ├── supabase-config.js ← ⚠️ put your Project URL + anon key here
│       └── api.js             ← every Supabase call lives in here
└── database/
    └── supabase_schema.sql    ← run this once in Supabase
```

## 1. Create a Supabase project
Go to [supabase.com](https://supabase.com) → New Project (free tier is fine).

## 2. Run the schema
Dashboard → **SQL Editor** → New query → paste the entire contents of
`database/supabase_schema.sql` → **Run**.

This creates every table (`users`, `students`, `teachers`, `subjects`,
`attendance`, `assignments`, `submissions`, `leave_requests`, etc.), a
trigger that auto-creates a `public.users` profile row whenever someone
signs up, and Row Level Security policies so students only ever see their
own data while teachers/admins see everything.

## 3. Plug in your API keys
Dashboard → **Settings → API** → copy:
- **Project URL**
- **anon public** key

Paste both into `assets/js/supabase-config.js`:
```js
const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

## 4. Create the 3 demo accounts
Dashboard → **Authentication → Users → Add user** (do this 3 times):

| Email | Password | User Metadata (raw JSON) |
|---|---|---|
| admin@college.com | anything ≥6 chars | `{"name":"Admin User","role":"admin"}` |
| teacher@college.com | anything ≥6 chars | `{"name":"Dr. Priya Singh","role":"teacher"}` |
| student@college.com | anything ≥6 chars | `{"name":"Rahul Sharma","role":"student"}` |

The trigger from step 2 automatically copies each of these into
`public.users` with the right role the moment the account is created.

## 5. Link the teacher & student profile rows
Copy each new user's UUID from the Authentication page, then in the SQL
Editor run (uncomment/edit the block at the bottom of `supabase_schema.sql`):
```sql
insert into public.teachers (user_id, employee_id, department, designation)
values ('<teacher-auth-uuid>', 'EMP001', 'Computer Science', 'Assistant Professor');

insert into public.students (user_id, roll_no, registration_no, program_id, batch_id, current_semester, cgpa, dob, address)
values ('<student-auth-uuid>', 'CS2022045', 'REG2022045', 1, 1, 5, 8.50, '2005-03-15', '123 Main Street, New Delhi, 110001');

insert into public.teacher_subjects (teacher_id, subject_id, batch_id) values (1,1,1),(1,2,1),(1,3,1);
insert into public.enrollments (student_id, subject_id, semester) values (1,1,5),(1,2,5),(1,3,5);
insert into public.leave_balances (student_id, semester, total_days, used_days) values (1,5,15,5);
```
(Admin doesn't need a profile row beyond `public.users` — it already has full access.)

## 6. Open the app
Just open `index.html` in a browser (or serve the folder with any static
host — Netlify, Vercel, GitHub Pages, or `npx serve`). Log in with any of
the 3 accounts above and you'll land on the matching dashboard:
- `admin/dashboard.html`
- `teacher/dashboard.html`
- `student/dashboard.html`

## How the pieces connect
- **Auth** — `index.html` calls `APIService.login()`, which uses
  `supabase.auth.signInWithPassword()`, then reads the user's row from
  `public.users` to get their `role` and redirects to `<role>/dashboard.html`.
- **Data** — every dashboard calls one or more `APIService.*` functions
  (`getStudentDashboard`, `getTeacherAssignments`, `getAdminStats`, etc.)
  which run real Supabase queries — no mock data anywhere.
- **Security** — Row Level Security policies (in the schema file) enforce
  who can read/write what, directly in the database, so even if someone
  inspects the frontend JS they can't read another student's records.
- **File uploads** — assignment briefs and student submissions currently
  take a pasted URL. For real file uploads, enable **Storage** in Supabase,
  create a bucket (e.g. `submissions`), and swap the URL `<input>` in
  `student/assignments.html` / `teacher/assignments.html` for
  `supabaseClient.storage.from('submissions').upload(...)`.

## Notes / things to review before going to production
- The `anon` key is public by design — security comes from RLS, not from
  hiding the key. Double-check the policies in `supabase_schema.sql` match
  your real privacy requirements before launching.
- Creating new users as an **admin** (from inside the app) normally
  requires Supabase's service-role key, which must never be exposed to the
  browser. For now, new accounts are created via Supabase Auth directly
  (Dashboard, or a self-serve sign-up form) — wire up an admin "create
  user" button via a Supabase **Edge Function** if you need that from the
  Admin dashboard itself.
