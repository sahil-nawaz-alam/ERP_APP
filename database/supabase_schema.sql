-- ============================================================
--  Smart College ERP — Supabase / PostgreSQL Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--  Auth is handled by Supabase Auth (auth.users). This file only
--  creates the public schema + Row Level Security policies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILE TABLE (1-to-1 with auth.users)
-- ------------------------------------------------------------
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          varchar(120) not null,
  email         varchar(150) not null unique,
  role          text not null check (role in ('admin','teacher','student')),
  phone         varchar(20),
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Auto-create a public.users row whenever someone signs up via Supabase Auth.
-- Pass { name, role } in the signUp() "options.data" (user metadata).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: current user's role (used inside RLS policies)
create or replace function public.current_role()
returns text as $$
  select role from public.users where id = auth.uid();
$$ language sql stable security definer;

-- ------------------------------------------------------------
-- 2. ACADEMIC STRUCTURE
-- ------------------------------------------------------------
create table public.programs (
  id    serial primary key,
  code  varchar(20) unique,
  name  varchar(120) not null
);

create table public.batches (
  id          serial primary key,
  program_id  int not null references public.programs(id) on delete cascade,
  name        varchar(30) not null,
  start_year  int not null,
  end_year    int not null
);

create table public.subjects (
  id          serial primary key,
  program_id  int not null references public.programs(id) on delete cascade,
  code        varchar(20) unique,
  name        varchar(120) not null,
  semester    smallint not null check (semester between 1 and 8),
  credits     smallint default 3
);

-- ------------------------------------------------------------
-- 3. ROLE PROFILES
-- ------------------------------------------------------------
create table public.students (
  id                serial primary key,
  user_id           uuid not null unique references public.users(id) on delete cascade,
  roll_no           varchar(30) unique not null,
  registration_no   varchar(30) unique,
  program_id        int not null references public.programs(id),
  batch_id          int not null references public.batches(id),
  current_semester  smallint default 1,
  cgpa              decimal(3,2) default 0.00,
  dob               date,
  address           text,
  status            text default 'active' check (status in ('active','inactive','graduated'))
);

create table public.teachers (
  id            serial primary key,
  user_id       uuid not null unique references public.users(id) on delete cascade,
  employee_id   varchar(30) unique,
  department    varchar(100),
  designation   varchar(80)
);

create table public.teacher_subjects (
  id          serial primary key,
  teacher_id  int not null references public.teachers(id) on delete cascade,
  subject_id  int not null references public.subjects(id) on delete cascade,
  batch_id    int not null references public.batches(id) on delete cascade,
  unique (teacher_id, subject_id, batch_id)
);

create table public.enrollments (
  id          serial primary key,
  student_id  int not null references public.students(id) on delete cascade,
  subject_id  int not null references public.subjects(id) on delete cascade,
  semester    smallint not null,
  unique (student_id, subject_id, semester)
);

-- ------------------------------------------------------------
-- 4. ATTENDANCE
-- ------------------------------------------------------------
create table public.attendance (
  id          serial primary key,
  student_id  int not null references public.students(id) on delete cascade,
  subject_id  int not null references public.subjects(id) on delete cascade,
  date        date not null,
  status      text not null check (status in ('present','absent')),
  marked_by   int not null references public.teachers(id),
  created_at  timestamptz default now(),
  unique (student_id, subject_id, date)
);

-- ------------------------------------------------------------
-- 5. ASSIGNMENTS & SUBMISSIONS
-- ------------------------------------------------------------
create table public.assignments (
  id          serial primary key,
  subject_id  int not null references public.subjects(id) on delete cascade,
  teacher_id  int not null references public.teachers(id) on delete cascade,
  batch_id    int not null references public.batches(id) on delete cascade,
  title       varchar(200) not null,
  description text,
  file_url    varchar(500),
  deadline    timestamptz not null,
  status      text default 'active' check (status in ('active','closed')),
  created_at  timestamptz default now()
);

create table public.submissions (
  id             serial primary key,
  assignment_id  int not null references public.assignments(id) on delete cascade,
  student_id     int not null references public.students(id) on delete cascade,
  file_url       varchar(500),
  submitted_at   timestamptz default now(),
  is_late        boolean default false,
  marks          decimal(5,2),
  max_marks      decimal(5,2) default 100,
  grade          text check (grade in ('A','B','C','D','F')),
  status         text default 'submitted' check (status in ('submitted','reviewed','pending_review')),
  feedback       text,
  reviewed_by    int references public.teachers(id),
  reviewed_at    timestamptz,
  unique (assignment_id, student_id)
);

-- ------------------------------------------------------------
-- 6. LEAVE REQUESTS
-- ------------------------------------------------------------
create table public.leave_requests (
  id                serial primary key,
  student_id        int not null references public.students(id) on delete cascade,
  start_date        date not null,
  end_date          date not null,
  days              int not null,
  reason            text not null,
  status            text default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by       uuid references public.users(id),
  reviewed_at       timestamptz,
  rejection_reason  varchar(255),
  created_at        timestamptz default now()
);

create table public.leave_balances (
  id          serial primary key,
  student_id  int not null references public.students(id) on delete cascade,
  semester    smallint not null,
  total_days  int default 15,
  used_days   int default 0,
  unique (student_id, semester)
);

-- ------------------------------------------------------------
-- 7. NOTIFICATIONS
-- ------------------------------------------------------------
create table public.notifications (
  id          serial primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  message     varchar(255) not null,
  link        varchar(255),
  is_read     boolean default false,
  created_at  timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.users            enable row level security;
alter table public.programs         enable row level security;
alter table public.batches          enable row level security;
alter table public.subjects         enable row level security;
alter table public.students         enable row level security;
alter table public.teachers         enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.enrollments      enable row level security;
alter table public.attendance       enable row level security;
alter table public.assignments      enable row level security;
alter table public.submissions      enable row level security;
alter table public.leave_requests   enable row level security;
alter table public.leave_balances   enable row level security;
alter table public.notifications    enable row level security;

-- Everyone signed in can read reference data
create policy "read own profile or admin all" on public.users
  for select using (id = auth.uid() or public.current_role() = 'admin');
create policy "update own profile" on public.users
  for update using (id = auth.uid());

create policy "read programs" on public.programs for select using (auth.role() = 'authenticated');
create policy "read batches"  on public.batches  for select using (auth.role() = 'authenticated');
create policy "read subjects" on public.subjects for select using (auth.role() = 'authenticated');
create policy "admin write programs" on public.programs for all using (public.current_role() = 'admin');
create policy "admin write batches"  on public.batches  for all using (public.current_role() = 'admin');
create policy "admin write subjects" on public.subjects for all using (public.current_role() = 'admin');

-- Students: student sees own row, teacher/admin see all
create policy "students visibility" on public.students
  for select using (
    user_id = auth.uid() or public.current_role() in ('teacher','admin')
  );
create policy "admin manage students" on public.students
  for all using (public.current_role() = 'admin');

create policy "teachers visibility" on public.teachers
  for select using (auth.role() = 'authenticated');
create policy "admin manage teachers" on public.teachers
  for all using (public.current_role() = 'admin');

create policy "teacher_subjects visibility" on public.teacher_subjects
  for select using (auth.role() = 'authenticated');
create policy "admin manage teacher_subjects" on public.teacher_subjects
  for all using (public.current_role() = 'admin');

create policy "enrollments visibility" on public.enrollments
  for select using (
    public.current_role() in ('teacher','admin')
    or student_id in (select id from public.students where user_id = auth.uid())
  );
create policy "admin manage enrollments" on public.enrollments
  for all using (public.current_role() = 'admin');

-- Attendance: student reads own, teacher reads/writes all, admin all
create policy "attendance select" on public.attendance
  for select using (
    public.current_role() in ('teacher','admin')
    or student_id in (select id from public.students where user_id = auth.uid())
  );
create policy "attendance write teacher/admin" on public.attendance
  for all using (public.current_role() in ('teacher','admin'));

-- Assignments: visible to all authenticated; teacher/admin manage
create policy "assignments select" on public.assignments
  for select using (auth.role() = 'authenticated');
create policy "assignments write teacher/admin" on public.assignments
  for all using (public.current_role() in ('teacher','admin'));

-- Submissions: student sees/creates own, teacher/admin see & grade all
create policy "submissions select" on public.submissions
  for select using (
    public.current_role() in ('teacher','admin')
    or student_id in (select id from public.students where user_id = auth.uid())
  );
create policy "submissions insert own" on public.submissions
  for insert with check (
    student_id in (select id from public.students where user_id = auth.uid())
  );
create policy "submissions update teacher/admin" on public.submissions
  for update using (public.current_role() in ('teacher','admin'));

-- Leave requests: student sees/creates own, teacher/admin see & review all
create policy "leave select" on public.leave_requests
  for select using (
    public.current_role() in ('teacher','admin')
    or student_id in (select id from public.students where user_id = auth.uid())
  );
create policy "leave insert own" on public.leave_requests
  for insert with check (
    student_id in (select id from public.students where user_id = auth.uid())
  );
create policy "leave update teacher/admin" on public.leave_requests
  for update using (public.current_role() in ('teacher','admin'));

create policy "leave_balances select" on public.leave_balances
  for select using (
    public.current_role() in ('teacher','admin')
    or student_id in (select id from public.students where user_id = auth.uid())
  );
create policy "admin manage leave_balances" on public.leave_balances
  for all using (public.current_role() = 'admin');

create policy "notifications own" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications update own" on public.notifications
  for update using (user_id = auth.uid());
create policy "notifications insert system" on public.notifications
  for insert with check (public.current_role() in ('teacher','admin'));

-- ============================================================
-- SEED DATA (reference data only — create the 3 demo logins
-- from the Supabase Dashboard → Authentication → Add User, or
-- via supabase.auth.signUp() from index.html, using metadata
-- { name, role }. Then re-run the INSERTs below for students/
-- teachers, swapping in the real auth UUIDs.)
-- ============================================================
insert into public.programs (code, name) values ('BSC-DS', 'B.Sc Data Science');

insert into public.batches (program_id, name, start_year, end_year)
values (1, '2022-2025', 2022, 2025);

insert into public.subjects (program_id, code, name, semester, credits) values
  (1, 'CS301', 'Python Programming',      5, 4),
  (1, 'CS302', 'Database Systems',        5, 4),
  (1, 'AI301', 'Machine Learning',        5, 4),
  (1, 'ST301', 'Statistics',              5, 3),
  (1, 'DA301', 'Data Analytics',          5, 3);

-- After creating auth users for admin@college.com / teacher@college.com /
-- student@college.com in Supabase Auth, copy their UUIDs here:
-- insert into public.teachers (user_id, employee_id, department, designation)
--   values ('<teacher-auth-uuid>', 'EMP001', 'Computer Science', 'Assistant Professor');
-- insert into public.students (user_id, roll_no, registration_no, program_id, batch_id, current_semester, cgpa, dob, address)
--   values ('<student-auth-uuid>', 'CS2022045', 'REG2022045', 1, 1, 5, 8.50, '2005-03-15', '123 Main Street, New Delhi, 110001');
-- insert into public.teacher_subjects (teacher_id, subject_id, batch_id) values (1,1,1),(1,2,1),(1,3,1);
-- insert into public.enrollments (student_id, subject_id, semester) values (1,1,5),(1,2,5),(1,3,5);
-- insert into public.leave_balances (student_id, semester, total_days, used_days) values (1,5,15,5);
