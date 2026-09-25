let students = [];
let selectedClasses = [];
const state = { saved: [], user: null, isAdmin: false, requests: [] };
const grid = document.querySelector('#cardGrid');
const empty = document.querySelector('#emptyState');
const searchInput = document.querySelector('#searchInput');
const courseFilter = document.querySelector('#courseFilter');
const yearFilter = document.querySelector('#yearFilter');
const timeSlotFilter = document.querySelector('#timeSlotFilter');
const styleFilter = document.querySelector('#styleFilter');
const savedCount = document.querySelector('#savedCount');
const authButton = document.querySelector('#authButton');
const adminNav = document.querySelector('#adminNav');
const requestCount = document.querySelector('#requestCount');
const toast = document.querySelector('#toast');

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function profileFromRow(profile) {
  return {
    id: profile.id,
    ownerId: profile.user_id,
    name: profile.first_name,
    courseSpecialization: profile.course_specialization,
    yearLevel: profile.year_level,
    term: profile.term,
    goal: profile.goal,
    style: profile.work_style,
    classes: Array.isArray(profile.classes) ? profile.classes : [],
    timeSlot: profile.time_slot || ''
  };
}

function timeSlotLabel(slot) {
  return ({ A: 'A - Morning', H: 'H - Afternoon', S: 'S - Evening' })[slot] || slot;
}

function classTimeSlot(course) {
  return course.match(/ - ([AHS])$/)?.[1] || '';
}

function classNameWithoutSlot(course) {
  return course.replace(/ - [AHS]$/, '');
}

function programLine(student) {
  return `${student.courseSpecialization} · Year ${student.yearLevel}${student.term ? ` · Term ${student.term}` : ''}`;
}

function requestForProfile(profileId) {
  return state.requests.find(request => request.other_profile_id === profileId && request.request_status !== 'declined');
}

function gmailComposeUrl(email) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
}

function buddyContact(student) {
  const request = requestForProfile(student.id);
  if (request?.request_status !== 'accepted' || !request.other_email) return '';
  const email = escapeHtml(request.other_email);
  return `<div class="buddy-contact"><span>MMDC email</span><a href="${escapeHtml(gmailComposeUrl(request.other_email))}" target="_blank" rel="noopener noreferrer">${email}</a></div>`;
}

function buddyAction(student) {
  const request = requestForProfile(student.id);
  if (request?.request_status === 'accepted' && request.other_email) {
    return `<a class="button button-primary buddy-message" href="${escapeHtml(gmailComposeUrl(request.other_email))}" target="_blank" rel="noopener noreferrer">Message</a>`;
  }
  if (request?.request_status === 'pending' && request.direction === 'outgoing') {
    return '<button class="button button-secondary buddy-button" type="button" disabled>Request sent</button>';
  }
  if (request?.request_status === 'pending' && request.direction === 'incoming') {
    return '<button class="button button-primary request-button" type="button">Respond</button>';
  }
  return '<button class="button button-primary buddy-button" type="button">BuddyUp</button>';
}

function studentCard(student) {
  const saved = state.saved.includes(student.id);
  const isOwnProfile = state.user?.id === student.ownerId;
  return `<article class="buddy-card" data-id="${escapeHtml(student.id)}">
    <div class="card-top">
      <div class="card-avatar" style="background:#dbeafe">${escapeHtml(initials(student.name))}</div>
      <div class="card-name"><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(programLine(student))}</p></div>
    </div>
    <p class="card-note">${escapeHtml(student.goal)}</p>
    <div class="card-tags"><span>${escapeHtml(student.style)}</span>${student.timeSlot ? `<span>${escapeHtml(timeSlotLabel(student.timeSlot))}</span>` : ''}${student.classes.map(course => `<span class="class-tag">${escapeHtml(course)}</span>`).join('')}</div>
