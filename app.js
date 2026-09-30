/**
 * app.js - HUSTBot Main Application Logic
 * Version 2.0
 */

// ============================================================
// STATE
// ============================================================
const State = {
  assignments: [],
  notifications: [],
  settings: {
    notifyNewAssignment: true,
    notifyDeadline: true,
    deadlineWarningDays: [1, 3],
    notifyEvents: false,
  },
  currentPage: 'home',
  prevPage: null,
  activeFilter: 'all',
  activeFilter2: 'all',
  currentDetailId: null,
  // First-visit animation flags
  firstVisitAssignments: true,
  firstVisitHome: true,
};

// ============================================================
// UTILS
// ============================================================
function nowDate() { return new Date(); }

function showToast(msg, duration) {
  if (!duration) duration = 2800;
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%) translateY(20px)',
      'background:rgba(40,40,60,.92)', 'color:#fff', 'padding:10px 18px',
      'border-radius:24px', 'font-size:.82rem', 'font-weight:600',
      'z-index:9999', 'pointer-events:none', 'opacity:0',
      'transition:opacity .25s, transform .25s', 'white-space:nowrap',
      'max-width:85vw', 'text-align:center', 'box-shadow:0 4px 16px rgba(0,0,0,.25)'
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  clearTimeout(toast._timer);
  requestAnimationFrame(function () {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  toast._timer = setTimeout(function () {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, duration);
}

function diffMs(deadline) {
  return new Date(deadline) - nowDate();
}

function formatCountdown(deadline, status) {
  if (status === 'submitted' || status === 'graded') return 'Đã nộp';
  const diff = diffMs(deadline);
  if (diff < 0) {
    const h = Math.abs(Math.floor(diff / 36e5));
    if (h < 24) return 'Quá hạn ' + h + 'g';
    return 'Quá hạn ' + Math.floor(h / 24) + 'n';
  }
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return 'Còn ' + mins + ' phút';
  const hours = Math.floor(diff / 36e5);
  if (hours < 24) return 'Còn ' + hours + ' giờ';
  const days = Math.floor(diff / 864e5);
  return 'Còn ' + days + ' ngày';
}

function urgencyClass(deadline, status) {
  if (status === 'submitted' || status === 'graded') return 'done';
  const diff = diffMs(deadline);
  if (diff < 0) return 'urgent';
  if (diff < 864e5) return 'urgent';
  if (diff < 3 * 864e5) return 'warning';
  return 'normal';
}

function formatDeadline(iso) {
  const d = new Date(iso);
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return days[d.getDay()] + ' ' +
    String(d.getDate()).padStart(2, '0') + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    d.getFullYear() + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

function sourceLabel(source) {
  if (source === 'teams') return 'MS Teams';
  if (source === 'fami') return 'FAMI';
  return 'LMS BK';
}

function sourceEmoji(source) {
  if (source === 'teams') return '\uD83D\uDFE6';
  if (source === 'fami') return '\uD83D\uDFE9';
  return '\uD83D\uDFE7';
}

function submissionIcon(type) {
  const map = { file: '\uD83D\uDCC4', quiz: '\uD83D\uDCDD', code: '\uD83D\uDCBB', online: '\uD83C\uDF10' };
  return map[type] || '\uD83D\uDCCB';
}

function submissionTypeLabel(type) {
  const map = { file: 'Nộp file', quiz: 'Bài trắc nghiệm', code: 'Bài lập trình', online: 'Bài online' };
  return map[type] || type;
}

function greetingText() {
  const h = nowDate().getHours();
  if (h < 5) return '\uD83C\uDF19 Thức khuya vậy, không tốt đâu nha ＞﹏＜';
  if (h < 11) return '\uD83D\uDC4B Chào buổi sáng! （￣︶￣）↗';
  if (h < 13) return '\uD83C\uDF1E Buổi trưa rồi! （づ￣3￣）づ╭～';
  if (h < 18) return '\uD83D\uDC4B Buổi chiều vui! （*＾-＾*）';
  return '\uD83C\uDF19 Buổi tối tốt lành! （づ￣3￣）づ╭～';
}

// Build submission URL for each source
function getSubmissionUrl(a) {
  if (a.source === 'teams') {
    // MS Teams deep link to assignments tab
    return 'https://teams.microsoft.com/l/entity/66aeee93-507d-479a-a3ef-8f494af43945/classroom?context=%7B%22subEntityId%22%3A%22' + encodeURIComponent(a.id) + '%22%7D';
  }
  if (a.source === 'fami') {
    return 'https://famisohoa.hust.edu.vn/course/view.php?name=' + encodeURIComponent(a.famiCourseId || '');
  }
  if (a.source === 'lms') {
    return a.lmsCourseUrl || 'https://lms.hust.edu.vn';
  }
  return null;
}

// ============================================================
// STATS
// ============================================================
function computeStats(list) {
  const n = nowDate();
  const endOfToday = new Date(n); endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(n); endOfWeek.setDate(n.getDate() + 7); endOfWeek.setHours(23, 59, 59, 999);
  let overdue = 0, today = 0, week = 0, done = 0;
  list.forEach(function (a) {
    if (a.status === 'submitted' || a.status === 'graded') { done++; return; }
    const dl = new Date(a.deadline);
    if (dl < n) { overdue++; return; }
    if (dl <= endOfToday) { today++; return; }
    if (dl <= endOfWeek) { week++; }
  });
  return { overdue: overdue, today: today, week: week, done: done };
}

// ============================================================
// NOTIFICATIONS BUILDER
// ============================================================
function buildNotifications(list) {
  const now = nowDate();
  const notifs = [];

  list.forEach(function (a) {
    if (a.status === 'submitted' || a.status === 'graded') return;
    const dl = new Date(a.deadline);
    const diff = dl - now;
    const diffDays = diff / 864e5;

    // New assignment (assigned within last 2 days)
    const assigned = new Date(a.assignedDate);
    const sinceAssigned = (now - assigned) / 864e5;
    if (sinceAssigned <= 2 && State.settings.notifyNewAssignment) {
      notifs.push({
        id: 'new_' + a.id,
        type: 'new',
        assignmentId: a.id,
        title: 'Bài tập mới: ' + a.title,
        body: sourceLabel(a.source) + ' \u2022 ' + a.subject,
        source: a.source,
        time: assigned,
        emoji: '\uD83D\uDCE2',
      });
    }

    // Deadline warnings
    if (State.settings.notifyDeadline) {
      State.settings.deadlineWarningDays.forEach(function (warnDays) {
        if (diffDays > 0 && diffDays <= warnDays + 0.5 && diffDays >= warnDays - 0.5) {
          notifs.push({
            id: 'warn_' + warnDays + '_' + a.id,
            type: 'deadline',
            assignmentId: a.id,
            title: ' Sắp hết hạn: ' + a.title,
            body: 'Còn ' + warnDays + ' ngày \u2022 ' + formatDeadline(a.deadline),
            source: a.source,
            time: now,
            emoji: '\u23F0',
          });
        }
      });
      // Overdue
      if (diff < 0) {
        notifs.push({
          id: 'over_' + a.id,
          type: 'overdue',
          assignmentId: a.id,
          title: ' Đã quá hạn: ' + a.title,
          body: formatCountdown(a.deadline, a.status) + ' \u2022 ' + a.subject,
          source: a.source,
          time: dl,
          emoji: '\uD83D\uDD25',
        });
      }
      // Due today/urgent (<24h)
      if (diff > 0 && diff < 864e5) {
        notifs.push({
          id: 'today_' + a.id,
          type: 'urgent',
          assignmentId: a.id,
          title: ' Hết hạn hôm nay: ' + a.title,
          body: formatCountdown(a.deadline, a.status) + ' \u2022 ' + sourceLabel(a.source),
          source: a.source,
          time: now,
          emoji: '\u26A1',
        });
      }
    }
  });

  // Sort newest first
  notifs.sort(function (a, b) { return b.time - a.time; });
  return notifs;
}

// ============================================================
// RENDER: UPCOMING CARDS (home page)
// ============================================================
function renderUpcoming(list) {
  const container = document.getElementById('upcoming-list');
  const pending = list
    .filter(function (a) { return a.status === 'pending' || a.status === 'overdue'; })
    .sort(function (a, b) { return new Date(a.deadline) - new Date(b.deadline); })
    .slice(0, 3);

  if (!pending.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83C\uDF89</div><div class="empty-text">Không có bài tập nào sắp đến hạn!</div></div>';
    return;
  }

  const shouldAnimate = State.firstVisitHome;

  container.innerHTML = pending.map(function (a, i) {
    const urg = urgencyClass(a.deadline, a.status);
    const cnt = formatCountdown(a.deadline, a.status);
    const urgLabel = urg === 'urgent' ? 'Khẩn cấp' : urg === 'warning' ? 'Sắp đến hạn' : 'Bình thường';
    const animClass = shouldAnimate ? ' anim-in' : '';
    const animDelay = shouldAnimate ? ' style="animation-delay:' + (i * 0.07) + 's"' : '';
    return '<div class="upcoming-card ' + urg + animClass + '"' + animDelay + ' data-id="' + a.id + '" role="listitem" tabindex="0">' +
      '<div class="card-source-icon ' + a.source + '">' + sourceEmoji(a.source) + '</div>' +
      '<div class="card-body">' +
      '<div class="card-subject">' + a.subject + '</div>' +
      '<div class="card-title">' + a.title + '</div>' +
      '<div class="card-meta">' +
      '<span class="card-badge ' + a.source + '">' + sourceLabel(a.source) + '</span>' +
      '<span class="card-badge ' + urg + '">' + urgLabel + '</span>' +
      '<span class="card-deadline">\u23F0 ' + formatDeadline(a.deadline) + '</span>' +
      '</div>' +
      '</div>' +
      '<div class="card-countdown ' + urg + '">' + cnt + '</div>' +
      '</div>';
  }).join('');
}

// ============================================================
// RENDER: ASSIGNMENTS LIST
// Smart update: only animate on first visit, otherwise update in-place
// ============================================================
function renderAssignments(list, containerId, filter, forceAnimate) {
  const container = document.getElementById(containerId);
  let filtered = list.slice();
  if (filter === 'teams') filtered = list.filter(function (a) { return a.source === 'teams'; });
  else if (filter === 'fami') filtered = list.filter(function (a) { return a.source === 'fami'; });
  else if (filter === 'lms') filtered = list.filter(function (a) { return a.source === 'lms'; });
  else if (filter === 'done') filtered = list.filter(function (a) { return a.status === 'submitted' || a.status === 'graded'; });

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCC2</div><div class="empty-text">Không có bài tập nào.</div></div>';
    return;
  }

  filtered = filtered.sort(function (a, b) {
    const dA = a.status === 'submitted' || a.status === 'graded';
    const dB = b.status === 'submitted' || b.status === 'graded';
    if (dA && !dB) return 1;
    if (!dA && dB) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  // Determine if we should animate (only on first visit or explicit force)
  const shouldAnimate = forceAnimate ||
    (containerId === 'assignments-list' && State.firstVisitHome) ||
    (containerId === 'all-assignments-list' && State.firstVisitAssignments);

  container.innerHTML = filtered.map(function (a, i) {
    const isDone = a.status === 'submitted' || a.status === 'graded';
    const urg = urgencyClass(a.deadline, a.status);
    const cnt = formatCountdown(a.deadline, a.status);
    const animClass = shouldAnimate ? ' anim-in' : '';
    const animDelay = shouldAnimate ? ' style="animation-delay:' + (i * 0.04) + 's"' : '';
    return '<div class="assign-card' + (isDone ? ' done' : '') + animClass + '"' + animDelay + ' data-id="' + a.id + '" role="listitem" tabindex="0">' +
      '<div class="assign-check' + (isDone ? ' checked' : '') + '" data-check="' + a.id + '" role="checkbox" aria-checked="' + isDone + '" tabindex="0"></div>' +
      '<div class="assign-info">' +
      '<div class="assign-subject">' + sourceEmoji(a.source) + ' ' + a.subject + '</div>' +
      '<div class="assign-title' + (isDone ? ' done-text' : '') + '">' + submissionIcon(a.submissionType) + ' ' + a.title + '</div>' +
      '</div>' +
      '<div class="assign-right">' +
      '<span class="card-badge ' + a.source + '">' + sourceLabel(a.source) + '</span>' +
      '<span class="assign-time ' + (isDone ? '' : urg) + '">' + cnt + '</span>' +
      '</div>' +
      '</div>';
  }).join('');
}

// Update a single assignment card in-place without re-rendering the whole list
function updateAssignmentCard(id) {
  const a = State.assignments.find(function (x) { return x.id === id; });
  if (!a) return;
  const isDone = a.status === 'submitted' || a.status === 'graded';
  const urg = urgencyClass(a.deadline, a.status);
  const cnt = formatCountdown(a.deadline, a.status);

  // Update all matching cards (home and all-assignments page)
  document.querySelectorAll('[data-id="' + id + '"].assign-card').forEach(function (card) {
    card.classList.toggle('done', isDone);
    const check = card.querySelector('[data-check]');
    if (check) {
      check.classList.toggle('checked', isDone);
      check.setAttribute('aria-checked', isDone);
    }
    const titleEl = card.querySelector('.assign-title');
    if (titleEl) titleEl.classList.toggle('done-text', isDone);
    const timeEl = card.querySelector('.assign-time');
    if (timeEl) {
      timeEl.textContent = cnt;
      timeEl.className = 'assign-time ' + (isDone ? '' : urg);
    }
  });
}

// ============================================================
// RENDER: DETAIL
// ============================================================
function renderDetail(a) {
  const isDone = a.status === 'submitted' || a.status === 'graded';
  const urg = urgencyClass(a.deadline, a.status);
  const cnt = formatCountdown(a.deadline, a.status);
  const urgEmoji = { urgent: '\uD83D\uDD25', warning: '\u26A0\uFE0F', normal: '\u23F0', done: '\u2705' };
  const deadlineLabel = isDone ? 'Đã nộp' : (diffMs(a.deadline) < 0 ? 'Đã quá hạn!' : 'Deadline');

  const submissionUrl = getSubmissionUrl(a);

  let extraInfo = '';
  if (a.source === 'teams') {
    extraInfo = '<div class="detail-info-row"><span class="label">Team / Lớp</span><span class="value">' + (a.teamName || '') + '</span></div>';
  } else if (a.source === 'fami') {
    extraInfo = '<div class="detail-info-row"><span class="label">FAMI Course ID</span><span class="value">' + (a.famiCourseId || '') + '</span></div>';
    if (a.quizAttempts) {
      const attText = a.quizAttempts >= 999 ? 'Không giới hạn' : a.quizAttempts + ' lần';
      extraInfo += '<div class="detail-info-row"><span class="label">Số lần làm</span><span class="value">' + attText + '</span></div>';
      extraInfo += '<div class="detail-info-row"><span class="label">Thời gian</span><span class="value">' + a.quizDuration + ' phút</span></div>';
    }
  } else {
    extraInfo = '<div class="detail-info-row"><span class="label">LMS Course ID</span><span class="value">' + (a.lmsCourseId || '') + '</span></div>';
    if (a.quizAttempts) {
      const attText = a.quizAttempts >= 999 ? 'Không giới hạn' : a.quizAttempts + ' lần';
      extraInfo += '<div class="detail-info-row"><span class="label">Số lần làm</span><span class="value">' + attText + '</span></div>';
      extraInfo += '<div class="detail-info-row"><span class="label">Thời gian</span><span class="value">' + a.quizDuration + ' phút</span></div>';
    }
  }

  let gradeRow = '';
  if (a.grade !== undefined) {
    gradeRow = '<div class="detail-info-row"><span class="label">Điểm</span><span class="value" style="color:#38A169;font-weight:800">' + a.grade + ' / ' + a.points + '</span></div>';
  }

  document.getElementById('detail-page-title').textContent =
    a.source === 'teams' ? 'Teams Assignment' :
      a.source === 'fami' ? 'FAMI Exercise' : 'LMS Bách Khoa';

  const re = a.reminderEnabled || { oneDay: false, threeDays: false, oneWeek: false };

  const submitBtnHtml = submissionUrl
    ? '<a href="' + submissionUrl + '" target="_blank" rel="noopener" class="detail-submit-link">\uD83D\uDD17 Mở trang nộp bài</a>'
    : '';

  document.getElementById('detail-content').innerHTML =
    '<div class="detail-hero">' +
    '<div class="detail-source-badge ' + a.source + '">' + sourceEmoji(a.source) + ' ' + sourceLabel(a.source) + '</div>' +
    '<div class="detail-title">' + a.title + '</div>' +
    '<div class="detail-subject">' + submissionIcon(a.submissionType) + ' ' + a.subject + ' &bull; ' + a.instructor + '</div>' +
    '<div class="detail-deadline-box ' + urg + '">' +
    '<div class="detail-deadline-emoji">' + urgEmoji[urg] + '</div>' +
    '<div class="detail-deadline-text">' +
    '<div class="label">' + deadlineLabel + '</div>' +
    '<div class="value">' + formatDeadline(a.deadline) + '</div>' +
    '</div>' +
    '<div class="detail-countdown ' + urg + '">' + cnt + '</div>' +
    '</div>' +
    '</div>' +
    '<div class="detail-info-card">' +
    '<h3>Thông tin</h3>' +
    '<div class="detail-info-row"><span class="label">Giảng viên</span><span class="value">' + a.instructor + '</span></div>' +
    '<div class="detail-info-row"><span class="label">Loại bài tập</span><span class="value">' + submissionIcon(a.submissionType) + ' ' + submissionTypeLabel(a.submissionType) + '</span></div>' +
    '<div class="detail-info-row"><span class="label">Điểm tối đa</span><span class="value">' + a.points + ' điểm</span></div>' +
    extraInfo + gradeRow +
    '<div class="detail-info-row"><span class="label">Ngày giao</span><span class="value">' + formatDeadline(a.assignedDate) + '</span></div>' +
    '</div>' +
    '<div class="detail-info-card">' +
    '<h3>Mô tả bài tập</h3>' +
    '<div class="detail-desc">' + (a.description || 'Không có mô tả.').replace(/\n/g, '<br>') + '</div>' +
    '</div>' +
    (submitBtnHtml ? '<div class="detail-submit-wrap">' + submitBtnHtml + '</div>' : '') +
    '<div class="detail-info-card">' +
    '<h3>Nhắc nhở</h3>' +
    '<div class="reminder-row"><span class="label">\uD83D\uDD14 Trước 1 ngày</span><button class="toggle ' + (re.oneDay ? 'on' : '') + '" data-reminder="oneDay" data-id="' + a.id + '"></button></div>' +
    '<div class="reminder-row"><span class="label">\uD83D\uDD14 Trước 3 ngày</span><button class="toggle ' + (re.threeDays ? 'on' : '') + '" data-reminder="threeDays" data-id="' + a.id + '"></button></div>' +
    '<div class="reminder-row"><span class="label">\uD83D\uDD14 Trước 1 tuần</span><button class="toggle ' + (re.oneWeek ? 'on' : '') + '" data-reminder="oneWeek" data-id="' + a.id + '"></button></div>' +
    '</div>' +
    '<button class="detail-action-btn' + (isDone ? ' done' : '') + '" id="detail-mark-btn" data-id="' + a.id + '">' +
    (isDone ? '\u2705 Đã nộp / Hoàn thành' : '\u2714\uFE0F Đánh dấu đã nộp') +
    '</button>';
}

// ============================================================
// RENDER: NOTIFICATIONS PAGE
// ============================================================
function renderNotifications() {
  const container = document.getElementById('notif-list');
  const notifs = buildNotifications(State.assignments);

  if (!notifs.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDD14</div><div class="empty-text">Chưa có thông báo nào.</div></div>';
    return;
  }

  const typeLabel = { new: 'Mới', deadline: 'Sắp hết hạn', overdue: 'Quá hạn', urgent: 'Khẩn cấp' };
  const typeBadge = { new: 'info', deadline: 'warning', overdue: 'urgent', urgent: 'urgent' };

  container.innerHTML = notifs.map(function (n) {
    return '<div class="notif-item" data-assignment-id="' + n.assignmentId + '">' +
      '<div class="notif-emoji">' + n.emoji + '</div>' +
      '<div class="notif-body">' +
      '<div class="notif-title">' + n.title + '</div>' +
      '<div class="notif-meta">' +
      '<span class="card-badge ' + n.source + '">' + sourceLabel(n.source) + '</span>' +
      '<span class="card-badge ' + typeBadge[n.type] + '">' + typeLabel[n.type] + '</span>' +
      '<span class="notif-body-text">' + n.body + '</span>' +
      '</div>' +
      '</div>' +
      '</div>';
  }).join('');

  // Update notif dot count
  const dot = document.getElementById('notif-dot');
  const urgentCount = notifs.filter(function (n) { return n.type === 'overdue' || n.type === 'urgent'; }).length;
  dot.classList.toggle('hidden', urgentCount === 0);
}

// ============================================================
// RENDER: SETTINGS PAGE
// ============================================================
function renderSettings() {
  const s = State.settings;
  document.getElementById('setting-notify-new').classList.toggle('on', s.notifyNewAssignment);
  document.getElementById('setting-notify-deadline').classList.toggle('on', s.notifyDeadline);
  document.getElementById('setting-warn-1d').classList.toggle('on', s.deadlineWarningDays.indexOf(1) !== -1);
  document.getElementById('setting-warn-3d').classList.toggle('on', s.deadlineWarningDays.indexOf(3) !== -1);
  document.getElementById('setting-warn-7d').classList.toggle('on', s.deadlineWarningDays.indexOf(7) !== -1);
  document.getElementById('setting-notify-events').classList.toggle('on', s.notifyEvents);
}

function toggleWarnDay(day) {
  const idx = State.settings.deadlineWarningDays.indexOf(day);
  if (idx === -1) {
    State.settings.deadlineWarningDays.push(day);
  } else {
    State.settings.deadlineWarningDays.splice(idx, 1);
  }
  saveSettings();
  renderSettings();
}

function saveSettings() {
  try {
    sessionStorage.setItem('hustbot_settings', JSON.stringify(State.settings));
  } catch (e) { }
}

function loadSettings() {
  try {
    const saved = sessionStorage.getItem('hustbot_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      State.settings = Object.assign(State.settings, parsed);
    }
  } catch (e) { }
}

// ============================================================
// NAVIGATION
// ============================================================
function goToPage(pageId, fromBack) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(function (n) {
    n.classList.toggle('active', n.dataset.page === pageId);
  });

  State.prevPage = fromBack ? null : State.currentPage;
  State.currentPage = pageId;

  if (pageId === 'home') renderHome();
  if (pageId === 'assignments') {
    // Only animate on first visit
    renderAssignments(State.assignments, 'all-assignments-list', State.activeFilter2, State.firstVisitAssignments);
    if (State.firstVisitAssignments) State.firstVisitAssignments = false;
  }
  if (pageId === 'notifications') renderNotifications();
  if (pageId === 'settings') renderSettings();
  if (pageId === 'chat') {
    // initChat is defined in chat.js — defer so module has time to register
    setTimeout(function () {
      if (typeof initChat === 'function') initChat();
    }, 50);
  }
}

function goToDetail(id) {
  const a = State.assignments.find(function (x) { return x.id === id; });
  if (!a) return;
  State.currentDetailId = id;
  State.prevPage = State.currentPage;
  renderDetail(a);
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  const target = document.getElementById('page-detail');
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
  State.currentPage = 'detail';
}

// ============================================================
// HOME RENDER
// ============================================================
function renderHome() {
  const list = State.assignments;
  const stats = computeStats(list);
  document.getElementById('count-overdue').textContent = stats.overdue;
  document.getElementById('count-today').textContent = stats.today;
  document.getElementById('count-week').textContent = stats.week;
  document.getElementById('count-done').textContent = stats.done;
  renderUpcoming(list);

  // Only animate home assignments on first home visit
  renderAssignments(list, 'assignments-list', State.activeFilter, State.firstVisitHome);
  if (State.firstVisitHome) State.firstVisitHome = false;

  // Update notification dot
  const notifs = buildNotifications(list);
  const urgentCount = notifs.filter(function (n) { return n.type === 'overdue' || n.type === 'urgent'; }).length;
  const dot = document.getElementById('notif-dot');
  dot.classList.toggle('hidden', urgentCount === 0);
  if (urgentCount > 0) {
    dot.textContent = urgentCount > 9 ? '9+' : urgentCount;
  }
}

function renderAllPage() {
  renderAssignments(State.assignments, 'all-assignments-list', State.activeFilter2, false);
}

// ============================================================
// PUSH + TOAST
// ============================================================
function requestPush() {
  if (!('Notification' in window)) { showToast('Trình duyệt không hỗ trợ thông báo.'); return; }
  Notification.requestPermission().then(function (perm) {
    if (perm === 'granted') {
      document.getElementById('push-banner').classList.add('hidden');
      showToast('\uD83D\uDD14 Đã bật thông báo!');
    } else {
      showToast('Bạn đã từ chối thông báo.');
    }
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1A202C;color:white;padding:10px 20px;border-radius:99px;font-size:.82rem;font-weight:600;z-index:9999;animation:fadeInUp .3s ease;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.2)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 2800);
}

function toggleDone(id) {
  const a = State.assignments.find(function (x) { return x.id === id; });
  if (!a) return;
  if (a.status === 'submitted' || a.status === 'graded') {
    a.status = 'pending';
    showToast('Đã đánh dấu là chưa nộp');
  } else {
    a.status = 'submitted';
    showToast('\u2705 Đã đánh dấu là đã nộp!');
  }
  // Smart update: only update the toggled card, then refresh stats + upcoming
  updateAssignmentCard(id);
  // Refresh stats and upcoming section (they're small, full re-render is fine)
  const list = State.assignments;
  const stats = computeStats(list);
  document.getElementById('count-overdue').textContent = stats.overdue;
  document.getElementById('count-today').textContent = stats.today;
  document.getElementById('count-week').textContent = stats.week;
  document.getElementById('count-done').textContent = stats.done;
  renderUpcoming(list);
  // Update notif dot
  const notifs = buildNotifications(list);
  const urgentCount = notifs.filter(function (n) { return n.type === 'overdue' || n.type === 'urgent'; }).length;
  const dot = document.getElementById('notif-dot');
  dot.classList.toggle('hidden', urgentCount === 0);
}

// ============================================================
// EVENT BINDINGS
// ============================================================
function bindEvents() {
  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () { goToPage(btn.dataset.page); });
  });

  // Bell → notifications
  document.getElementById('notif-btn').addEventListener('click', function () { goToPage('notifications'); });
  // Gear → settings
  document.getElementById('settings-btn').addEventListener('click', function () { goToPage('settings'); });

  document.getElementById('see-all-btn').addEventListener('click', function () { goToPage('assignments'); });
  document.getElementById('back-from-all').addEventListener('click', function () { goToPage(State.prevPage || 'home', true); });
  document.getElementById('back-from-detail').addEventListener('click', function () { goToPage(State.prevPage || 'home', true); });
  document.getElementById('back-from-notif').addEventListener('click', function () { goToPage(State.prevPage || 'home', true); });
  document.getElementById('back-from-settings').addEventListener('click', function () { goToPage(State.prevPage || 'home', true); });

  // Home filter tabs
  document.querySelectorAll('[data-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-filter]').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
      State.activeFilter = btn.dataset.filter;
      renderAssignments(State.assignments, 'assignments-list', State.activeFilter, false);
    });
  });

  // All-page filter tabs
  document.querySelectorAll('[data-filter2]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-filter2]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      State.activeFilter2 = btn.dataset.filter2;
      renderAllPage();
    });
  });

  // Upcoming list clicks
  document.getElementById('upcoming-list').addEventListener('click', function (e) {
    const card = e.target.closest('[data-id]');
    if (card) goToDetail(card.dataset.id);
  });

  // Home assignments list clicks
  document.getElementById('assignments-list').addEventListener('click', function (e) {
    const check = e.target.closest('[data-check]');
    if (check) { e.stopPropagation(); toggleDone(check.dataset.check); return; }
    const card = e.target.closest('[data-id]');
    if (card) goToDetail(card.dataset.id);
  });

  // All assignments list clicks
  document.getElementById('all-assignments-list').addEventListener('click', function (e) {
    const check = e.target.closest('[data-check]');
    if (check) { e.stopPropagation(); toggleDone(check.dataset.check); return; }
    const card = e.target.closest('[data-id]');
    if (card) goToDetail(card.dataset.id);
  });

  // Notification list clicks → go to detail
  document.getElementById('notif-list').addEventListener('click', function (e) {
    const item = e.target.closest('[data-assignment-id]');
    if (item) goToDetail(item.dataset.assignmentId);
  });

  // Detail page clicks (delegated)
  document.getElementById('detail-content').addEventListener('click', function (e) {
    const toggleBtn = e.target.closest('[data-reminder]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      const key = toggleBtn.dataset.reminder;
      const a = State.assignments.find(function (x) { return x.id === id; });
      if (a) {
        if (!a.reminderEnabled) a.reminderEnabled = {};
        a.reminderEnabled[key] = !a.reminderEnabled[key];
        toggleBtn.classList.toggle('on', a.reminderEnabled[key]);
        showToast(a.reminderEnabled[key] ? '\uD83D\uDD14 Đã bật nhắc nhở' : '\uD83D\uDD15 Đã tắt nhắc nhở');
      }
      return;
    }
    const markBtn = e.target.closest('#detail-mark-btn');
    if (markBtn) {
      toggleDone(markBtn.dataset.id);
      const a = State.assignments.find(function (x) { return x.id === markBtn.dataset.id; });
      if (a) renderDetail(a);
    }
  });

  // Settings toggles
  document.getElementById('setting-notify-new').addEventListener('click', function () {
    State.settings.notifyNewAssignment = !State.settings.notifyNewAssignment;
    saveSettings(); renderSettings();
  });
  document.getElementById('setting-notify-deadline').addEventListener('click', function () {
    State.settings.notifyDeadline = !State.settings.notifyDeadline;
    saveSettings(); renderSettings();
  });
  document.getElementById('setting-warn-1d').addEventListener('click', function () { toggleWarnDay(1); });
  document.getElementById('setting-warn-3d').addEventListener('click', function () { toggleWarnDay(3); });
  document.getElementById('setting-warn-7d').addEventListener('click', function () { toggleWarnDay(7); });
  document.getElementById('setting-notify-events').addEventListener('click', function () {
    State.settings.notifyEvents = !State.settings.notifyEvents;
    saveSettings(); renderSettings();
  });

  document.getElementById('enable-push-btn').addEventListener('click', requestPush);
  document.getElementById('dismiss-push-btn').addEventListener('click', function () {
    document.getElementById('push-banner').classList.add('hidden');
  });
}

// ============================================================
// INIT
// ============================================================
function init() {
  loadSettings();
  State.assignments = window.MOCK_ASSIGNMENTS || [];
  console.log('[HUSTBot] Đã tải ' + State.assignments.length + ' bài tập');

  document.getElementById('greeting-text').textContent = greetingText();
  const user = window.MOCK_USER || {};
  document.getElementById('username').textContent = user.name || 'Sinh viên';
  if (user.avatar) document.getElementById('user-avatar').src = user.avatar;

  bindEvents();
  renderHome();

  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
    setTimeout(function () {
      const banner = document.getElementById('push-banner');
      if (banner) banner.classList.remove('hidden');
    }, 3500);
  }
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('DOMContentLoaded', function () {
  const splash = document.getElementById('splash');
  const main = document.getElementById('main');
  setTimeout(function () {
    splash.classList.add('fade-out');
    main.classList.remove('hidden');
    init();
    setTimeout(function () { splash.style.display = 'none'; }, 500);
  }, 1800);
});

// Expose globals for chat.js inline event handlers
window.showToast = showToast;

