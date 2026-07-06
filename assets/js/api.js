// ============================================================
//  APIService — one wrapper around Supabase for every page.
//  Include after supabase-config.js:
//    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//    <script src="../assets/js/supabase-config.js"></script>
//    <script src="../assets/js/api.js"></script>
// ============================================================

const APIService = {

  // ---------------------------------------------------------
  // AUTH
  // ---------------------------------------------------------

  async login(email, password) {
  // Sign in with Supabase
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new Error(error.message);
  }

  // Load user profile from the 'users' table
  const profile = await this._loadProfile(data.user.id);

  // Store user information
  localStorage.setItem("userEmail", profile.email || "");
  localStorage.setItem("userRole", profile.role || "");
  localStorage.setItem("userId", profile.id || "");
  localStorage.setItem("userName", profile.name || "");
  localStorage.setItem("isLoggedIn", "true");

  return {
    success: true,
    user: profile
  };
},
  
  async signup(email, password, name, role) {
    const { data, error } = await supabaseClient.auth.signUp({
      email, password,
      options: { data: { name, role } }
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async logout() {
    await supabaseClient.auth.signOut();
    localStorage.clear();
    window.location.href = '/index.html';
  },

  async getCurrentUser() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    const profile = await this._loadProfile(session.user.id);
    return { user: profile };
  },

  async _loadProfile(userId) {
    const { data, error } = await supabaseClient
      .from('users').select('*').eq('id', userId).single();
    if (error) throw new Error(error.message);
    return data;
  },

  // Redirect to login if not authenticated, or if role doesn't match.
  // Usage: await APIService.requireRole(['student']);
  async requireRole(allowedRoles) {
    try {
      const { user } = await this.getCurrentUser();
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        window.location.href = `/${user.role}/dashboard.html`;
        return null;
      }
      return user;
    } catch (e) {
      window.location.href = '/index.html';
      return null;
    }
  },

  async _studentRow(userId) {
    const { data, error } = await supabaseClient
      .from('students').select('*').eq('user_id', userId).single();
    if (error) throw new Error(error.message);
    return data;
  },

  async _teacherRow(userId) {
    const { data, error } = await supabaseClient
      .from('teachers').select('*').eq('user_id', userId).single();
    if (error) throw new Error(error.message);
    return data;
  },

  // ---------------------------------------------------------
  // STUDENT
  // ---------------------------------------------------------
  async getStudentDashboard() {
    const { user } = await this.getCurrentUser();
    const student = await this._studentRow(user.id);

    const [{ data: attendance }, { data: assignments }, { data: leaves }] = await Promise.all([
      supabaseClient.from('attendance').select('status, subject_id, subjects(name)').eq('student_id', student.id),
      supabaseClient.from('assignments').select('id, title, deadline, status').eq('batch_id', student.batch_id),
      supabaseClient.from('leave_requests').select('id, status').eq('student_id', student.id)
    ]);

    const total = attendance?.length || 0;
    const present = attendance?.filter(a => a.status === 'present').length || 0;
    const overallAttendance = total ? Math.round((present / total) * 100) : 0;

    return {
      student, overallAttendance,
      totalAssignments: assignments?.length || 0,
      leavesTaken: leaves?.filter(l => l.status === 'approved').length || 0
    };
  },

  async getMyAttendance() {
    const { user } = await this.getCurrentUser();
    const student = await this._studentRow(user.id);
    const { data, error } = await supabaseClient
      .from('attendance')
      .select('date, status, subjects(name)')
      .eq('student_id', student.id)
      .order('date', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async getMyAssignments() {
    const { user } = await this.getCurrentUser();
    const student = await this._studentRow(user.id);
    const { data: assignments, error } = await supabaseClient
      .from('assignments')
      .select('*, subjects(name), submissions(id, student_id, status, marks, grade)')
      .eq('batch_id', student.batch_id)
      .order('deadline', { ascending: true });
    if (error) throw new Error(error.message);
    return assignments.map(a => ({
      ...a,
      mySubmission: a.submissions?.find(s => s.student_id === student.id) || null
    }));
  },

  async submitAssignment(assignmentId, fileUrl) {
    const { user } = await this.getCurrentUser();
    const student = await this._studentRow(user.id);
    const { data: assignment } = await supabaseClient
      .from('assignments').select('deadline').eq('id', assignmentId).single();
    const isLate = assignment && new Date() > new Date(assignment.deadline);

    const { error } = await supabaseClient.from('submissions').upsert({
      assignment_id: assignmentId,
      student_id: student.id,
      file_url: fileUrl,
      is_late: isLate,
      status: 'submitted'
    }, { onConflict: 'assignment_id,student_id' });
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async getMyLeaveRequests() {
    const { user } = await this.getCurrentUser();
    const student = await this._studentRow(user.id);
    const { data, error } = await supabaseClient
      .from('leave_requests').select('*').eq('student_id', student.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async getMyLeaveBalance() {
    const { user } = await this.getCurrentUser();
    const student = await this._studentRow(user.id);
    const { data, error } = await supabaseClient
      .from('leave_balances').select('*').eq('student_id', student.id)
      .order('semester', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data || { total_days: 15, used_days: 0 };
  },

  async applyLeave(startDate, endDate, days, reason) {
    const { user } = await this.getCurrentUser();
    const student = await this._studentRow(user.id);
    const { error } = await supabaseClient.from('leave_requests').insert({
      student_id: student.id, start_date: startDate, end_date: endDate, days, reason
    });
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async updateMyProfile(fields) {
    const { user } = await this.getCurrentUser();
    const student = await this._studentRow(user.id);
    await supabaseClient.from('users').update({ name: fields.name, phone: fields.phone }).eq('id', user.id);
    if (fields.address !== undefined) {
      await supabaseClient.from('students').update({ address: fields.address }).eq('id', student.id);
    }
    return { success: true };
  },

  async changePassword(newPassword) {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    return { success: true };
  },

  // ---------------------------------------------------------
  // TEACHER
  // ---------------------------------------------------------
  async getTeacherSubjects() {
    const { user } = await this.getCurrentUser();
    const teacher = await this._teacherRow(user.id);
    const { data, error } = await supabaseClient
      .from('teacher_subjects').select('subject_id, batch_id, subjects(name), batches(name)')
      .eq('teacher_id', teacher.id);
    if (error) throw new Error(error.message);
    return data;
  },

  async getTeacherAssignments(filters = {}) {
    const { user } = await this.getCurrentUser();
    const teacher = await this._teacherRow(user.id);
    let q = supabaseClient.from('assignments')
      .select('*, subjects(name), submissions(id, status)')
      .eq('teacher_id', teacher.id);
    if (filters.subjectId) q = q.eq('subject_id', filters.subjectId);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async createAssignment({ subjectId, batchId, title, description, deadline, fileUrl }) {
    const { user } = await this.getCurrentUser();
    const teacher = await this._teacherRow(user.id);
    const { error } = await supabaseClient.from('assignments').insert({
      subject_id: subjectId, teacher_id: teacher.id, batch_id: batchId,
      title, description, deadline, file_url: fileUrl
    });
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async deleteAssignment(id) {
    const { error } = await supabaseClient.from('assignments').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async getSubmissionsForReview(filters = {}) {
    let q = supabaseClient.from('submissions')
      .select('*, students(roll_no, users(name)), assignments(title, max_marks:id)');
    if (filters.assignmentId) q = q.eq('assignment_id', filters.assignmentId);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q.order('submitted_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async gradeSubmission(submissionId, marks, grade, feedback) {
    const { user } = await this.getCurrentUser();
    const teacher = await this._teacherRow(user.id);
    const { error } = await supabaseClient.from('submissions').update({
      marks, grade, feedback, status: 'reviewed',
      reviewed_by: teacher.id, reviewed_at: new Date().toISOString()
    }).eq('id', submissionId);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async markAttendance(subjectId, date, records) {
    // records = [{ student_id, status: 'present' | 'absent' }, ...]
    const { user } = await this.getCurrentUser();
    const teacher = await this._teacherRow(user.id);
    const rows = records.map(r => ({
      student_id: r.student_id, subject_id: subjectId, date,
      status: r.status, marked_by: teacher.id
    }));
    const { error } = await supabaseClient.from('attendance')
      .upsert(rows, { onConflict: 'student_id,subject_id,date' });
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async getPendingLeaves() {
    const { data, error } = await supabaseClient
      .from('leave_requests')
      .select('*, students(roll_no, users(name, email))')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async getAllLeaves() {
    const { data, error } = await supabaseClient
      .from('leave_requests')
      .select('*, students(roll_no, users(name, email))')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async approveLeave(leaveId) {
    const { user } = await this.getCurrentUser();
    const { error } = await supabaseClient.from('leave_requests').update({
      status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString()
    }).eq('id', leaveId);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async rejectLeave(leaveId, reason) {
    const { user } = await this.getCurrentUser();
    const { error } = await supabaseClient.from('leave_requests').update({
      status: 'rejected', rejection_reason: reason,
      reviewed_by: user.id, reviewed_at: new Date().toISOString()
    }).eq('id', leaveId);
    if (error) throw new Error(error.message);
    return { success: true };
  },

  // ---------------------------------------------------------
  // ADMIN
  // ---------------------------------------------------------
  async getAdminStats() {
    const [{ count: students }, { count: teachers }, { count: subjects },
      { count: pendingLeaves }, { count: assignments }] = await Promise.all([
      supabaseClient.from('students').select('*', { count: 'exact', head: true }),
      supabaseClient.from('teachers').select('*', { count: 'exact', head: true }),
      supabaseClient.from('subjects').select('*', { count: 'exact', head: true }),
      supabaseClient.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseClient.from('assignments').select('*', { count: 'exact', head: true })
    ]);
    return { students, teachers, subjects, pendingLeaves, assignments };
  },

  async getAllUsers() {
    const { data, error } = await supabaseClient.from('users').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async getAllStudents() {
    const { data, error } = await supabaseClient
      .from('students').select('*, users(name, email, phone), programs(name), batches(name)');
    if (error) throw new Error(error.message);
    return data;
  },

  async getAllTeachers() {
    const { data, error } = await supabaseClient
      .from('teachers').select('*, users(name, email, phone)');
    if (error) throw new Error(error.message);
    return data;
  },

  async createProgram(code, name) {
    const { error } = await supabaseClient.from('programs').insert({ code, name });
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async createSubject(programId, code, name, semester, credits) {
    const { error } = await supabaseClient.from('subjects').insert({
      program_id: programId, code, name, semester, credits
    });
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async assignTeacherToSubject(teacherId, subjectId, batchId) {
    const { error } = await supabaseClient.from('teacher_subjects').insert({
      teacher_id: teacherId, subject_id: subjectId, batch_id: batchId
    });
    if (error) throw new Error(error.message);
    return { success: true };
  },

  async deactivateUser(userId) {
    const { error } = await supabaseClient.from('users').update({ is_active: false }).eq('id', userId);
    if (error) throw new Error(error.message);
    return { success: true };
  }
};
