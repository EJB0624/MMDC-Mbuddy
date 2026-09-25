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
    ${buddyContact(student)}
    <div class="card-footer">${isOwnProfile
      ? '<button class="button button-secondary edit-profile-button" type="button">Edit profile</button>'
      : `<button class="button button-secondary save-button ${saved ? 'saved' : ''}" type="button">${saved ? 'Saved' : 'Save profile'}</button>${buddyAction(student)}`}
    </div>
  </article>`;
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const course = courseFilter.value;
  const year = yearFilter.value;
  const timeSlot = timeSlotFilter.value;
  const style = styleFilter.value;
  const results = students.filter(student => {
    const text = [student.name, student.courseSpecialization, student.style, student.goal, student.timeSlot, ...student.classes].join(' ').toLowerCase();
    return (!query || text.includes(query)) &&
      (course === 'all' || student.courseSpecialization === course) &&
      (year === 'all' || String(student.yearLevel) === year) &&
      (timeSlot === 'all' || student.timeSlot === timeSlot || student.classes.some(courseName => classTimeSlot(courseName) === timeSlot)) &&
      (style === 'all' || student.style === style);
  });
  grid.innerHTML = results.map(studentCard).join('');
  document.querySelector('#resultCount').textContent = results.length;
  empty.hidden = results.length > 0;
  grid.hidden = results.length === 0;
  savedCount.textContent = state.saved.length;
  const incomingRequestCount = state.requests.filter(request => request.request_status === 'pending' && request.direction === 'incoming').length;
  requestCount.textContent = incomingRequestCount;
  requestCount.classList.toggle('has-requests', incomingRequestCount > 0);
  authButton.textContent = state.user ? 'Sign out' : 'Sign in';
  adminNav.hidden = !state.isAdmin;
  document.querySelector('#profileButton').textContent = students.some(student => student.ownerId === state.user?.id) ? 'Edit profile' : 'Create profile';
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function showError(error, fallback) {
  console.error(error);
  showToast(error?.message || fallback);
}

function requireConfiguration() {
  return Boolean(window.mbuddyDb);
}

const authDialog = document.querySelector('#authDialog');
function openAuthDialog() {
  if (requireConfiguration()) authDialog.showModal();
}

async function refreshAccountData() {
  if (!state.user) {
    students = [];
    state.saved = [];
    state.isAdmin = false;
    state.requests = [];
    render();
    return;
  }
  const [profiles, savedIds, isAdmin, requests] = await Promise.all([
    window.mbuddyDb.listProfiles(),
    window.mbuddyDb.listSavedProfileIds(),
    window.mbuddyDb.isAdmin(),
    window.mbuddyDb.listBuddyRequests()
  ]);
  students = profiles.map(profileFromRow);
  state.saved = savedIds;
  state.isAdmin = isAdmin;
  state.requests = requests;
  render();
}

function renderAdminList() {
  const adminList = document.querySelector('#adminList');
  adminList.innerHTML = students.length
    ? students.map(student => `<div class="saved-item"><div class="card-avatar" style="background:#dbeafe">${escapeHtml(initials(student.name))}</div><div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(programLine(student))}</p></div><button class="danger-button" type="button" data-delete-profile="${escapeHtml(student.id)}">Delete</button></div>`).join('')
    : '<div class="saved-empty">No profiles</div>';
}

async function toggleSave(id) {
  if (!state.user) return openAuthDialog();
  const student = students.find(person => person.id === id);
  if (!student) return;
  try {
    if (state.saved.includes(id)) {
      await window.mbuddyDb.unsaveProfile(id);
      state.saved = state.saved.filter(savedId => savedId !== id);
    } else {
      await window.mbuddyDb.saveProfile(id);
      state.saved.push(id);
    }
    render();
  } catch (error) {
    showError(error, 'Could not update saved profiles');
  }
}

async function sendBuddyUp(profileId) {
  if (!state.user) return openAuthDialog();
  if (!students.some(student => student.ownerId === state.user.id)) {
    showToast('Create your profile before sending a BuddyUp request');
    return;
  }
  try {
    await window.mbuddyDb.sendBuddyRequest(profileId);
    await refreshAccountData();
    showToast('BuddyUp request sent');
  } catch (error) {
    showError(error, 'Could not send BuddyUp request');
  }
}

function resetFilters() {
  searchInput.value = '';
  courseFilter.value = 'all';
  yearFilter.value = 'all';
  timeSlotFilter.value = 'all';
  styleFilter.value = 'all';
  render();
}

grid.addEventListener('click', event => {
  const card = event.target.closest('.buddy-card');
  if (!card) return;
  if (event.target.closest('.save-button')) return void toggleSave(card.dataset.id);
  if (event.target.closest('.buddy-button')) return void sendBuddyUp(card.dataset.id);
  if (event.target.closest('.request-button')) return openRequestsDialog();
  const student = students.find(person => person.id === card.dataset.id);
  if (student?.ownerId === state.user?.id && !event.target.closest('a, button')) openProfileEditor(student);
  if (event.target.closest('.edit-profile-button') && student) openProfileEditor(student);
});

[searchInput, courseFilter, yearFilter, timeSlotFilter, styleFilter].forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', render));
document.querySelector('#resetButton').addEventListener('click', resetFilters);
document.querySelector('#emptyReset').addEventListener('click', resetFilters);
document.querySelector('#filterButton').addEventListener('click', render);

const profileDialog = document.querySelector('#profileDialog');
const profileForm = document.querySelector('#profileForm');
const profileDialogTitle = document.querySelector('#profileDialogTitle');
const profileSubmitButton = document.querySelector('#profileSubmitButton');
const profileClassSelect = document.querySelector('#profileClassSelect');
const profileClassTimeSlot = document.querySelector('#profileClassTimeSlot');
const selectedClassesElement = document.querySelector('#selectedClasses');
const profileCourse = document.querySelector('#profileCourse');
const profileYear = document.querySelector('#profileYear');
const profileTerm = document.querySelector('#profileTerm');
const profileAllClasses = document.querySelector('#profileAllClasses');
const addClassButton = document.querySelector('#addClassButton');

function availableProfileClasses() {
  const curriculum = window.MBUDDY_CURRICULA?.[profileCourse.value] || [];
  if (profileAllClasses.checked) return curriculum;
  return curriculum.filter(([, , year, term]) => String(year) === profileYear.value && String(term) === profileTerm.value);
}

function updateProfileClassOptions() {
  const hasCourse = Boolean(profileCourse.value);
  const hasYearAndTerm = Boolean(profileYear.value && profileTerm.value);
  const canChoose = hasCourse && (profileAllClasses.checked || hasYearAndTerm);
  const courses = canChoose ? availableProfileClasses() : [];
  let prompt = 'Choose a class';
  if (!hasCourse) prompt = 'Choose course & specialization first';
  else if (!profileAllClasses.checked && !profileYear.value) prompt = 'Choose year first';
  else if (!profileAllClasses.checked && !profileTerm.value) prompt = 'Choose term first';
  else if (!courses.length) prompt = 'No listed classes';

  profileClassSelect.replaceChildren(new Option(prompt, ''));
  profileClassTimeSlot.value = '';
  for (const [code, title] of courses) {
    const label = `${code} - ${title}`;
    profileClassSelect.append(new Option(label, label));
  }
  profileClassSelect.disabled = !courses.length;
  profileClassTimeSlot.disabled = !courses.length;
  addClassButton.disabled = !courses.length;

  const allowed = new Set(courses.map(([code, title]) => `${code} - ${title}`));
  const filtered = selectedClasses.filter(course => allowed.has(classNameWithoutSlot(course)));
  if (filtered.length !== selectedClasses.length) {
    selectedClasses = filtered;
    renderSelectedClasses();
  }
}

function renderSelectedClasses() {
  selectedClassesElement.innerHTML = selectedClasses.map((course, index) =>
    `<span class="selected-class">${escapeHtml(course)}<button type="button" data-remove-class="${index}" aria-label="Remove ${escapeHtml(course)}">×</button></span>`
  ).join('');
}

function openProfileEditor(student = null) {
  profileForm.reset();
  selectedClasses = [];
  profileDialogTitle.textContent = student ? 'Edit profile' : 'Create profile';
  profileSubmitButton.textContent = student ? 'Save changes' : 'Create profile';

  if (student) {
    document.querySelector('#profileName').value = student.name;
    profileYear.value = String(student.yearLevel || '');
    profileTerm.value = student.term ? String(student.term) : '';
    profileCourse.value = student.courseSpecialization;
    document.querySelector('#profileGoal').value = student.goal;
    const styleControl = profileForm.querySelector(`[name="workstyle"][value="${student.style}"]`);
    if (styleControl) styleControl.checked = true;

    const scheduled = new Set((window.MBUDDY_CURRICULA?.[student.courseSpecialization] || [])
      .filter(([, , year, term]) => year === Number(student.yearLevel) && term === Number(student.term))
      .map(([code, title]) => `${code} - ${title}`));
    profileAllClasses.checked = !student.term || student.classes.some(course => !scheduled.has(classNameWithoutSlot(course)));
  }

  updateProfileClassOptions();
  selectedClasses = student ? [...student.classes] : [];
  renderSelectedClasses();
  profileDialog.showModal();
}

addClassButton.addEventListener('click', () => {
  const course = profileClassSelect.value;
  const timeSlot = profileClassTimeSlot.value;
  if (!course) return;
  if (!timeSlot) {
    showToast('Choose a time slot for the class');
    profileClassTimeSlot.focus();
    return;
  }
  if (selectedClasses.some(selected => classNameWithoutSlot(selected) === course)) return showToast('Class already added');
  if (selectedClasses.length >= 8) return showToast('You can add up to 8 classes');
  selectedClasses.push(`${course} - ${timeSlot}`);
  profileClassSelect.value = '';
  profileClassTimeSlot.value = '';
  renderSelectedClasses();
});

[profileCourse, profileYear, profileTerm, profileAllClasses].forEach(control => {
  control.addEventListener('change', updateProfileClassOptions);
});

selectedClassesElement.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-class]');
  if (!button) return;
  selectedClasses.splice(Number(button.dataset.removeClass), 1);
  renderSelectedClasses();
});

document.querySelector('#profileButton').addEventListener('click', () => {
  if (!requireConfiguration()) return;
  if (!state.user) return openAuthDialog();
  openProfileEditor(students.find(student => student.ownerId === state.user.id) || null);
});
document.querySelector('#closeProfileDialog').addEventListener('click', () => profileDialog.close());
profileDialog.addEventListener('click', event => {
  if (event.target === profileDialog) profileDialog.close();
});

profileForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity() || !state.user) return;
  if (!selectedClasses.length) {
    showToast('Add at least one class');
    profileClassSelect.focus();
    return;
  }
  const profile = {
    first_name: document.querySelector('#profileName').value.trim(),
    course_specialization: document.querySelector('#profileCourse').value,
    year_level: Number(document.querySelector('#profileYear').value),
    term: Number(document.querySelector('#profileTerm').value),
    goal: document.querySelector('#profileGoal').value.trim(),
    work_style: new FormData(form).get('workstyle'),
    classes: [...selectedClasses],
    time_slot: null
  };
  try {
    const created = await window.mbuddyDb.createProfile(profile);
    const normalized = profileFromRow(created);
    profileDialog.close();
    form.reset();
    selectedClasses = [];
    renderSelectedClasses();
    updateProfileClassOptions();
    await refreshAccountData();
    showToast('Profile saved');
  } catch (error) {
    showError(error, 'Could not save profile');
  }
});

updateProfileClassOptions();

document.querySelector('#savedNav').addEventListener('click', () => {
  if (!state.user) return openAuthDialog();
  const savedStudents = students.filter(student => state.saved.includes(student.id));
  document.querySelector('#savedList').innerHTML = savedStudents.length
    ? savedStudents.map(student => `<div class="saved-item"><div class="card-avatar" style="background:#dbeafe">${escapeHtml(initials(student.name))}</div><div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(programLine(student))}</p></div><button type="button" data-remove="${escapeHtml(student.id)}">Remove</button></div>`).join('')
    : '<div class="saved-empty">No saved profiles</div>';
  document.querySelector('#savedDialog').showModal();
});

document.querySelector('#savedList').addEventListener('click', async event => {
  if (!event.target.dataset.remove) return;
  await toggleSave(event.target.dataset.remove);
  event.target.closest('.saved-item')?.remove();
  if (!state.saved.length) document.querySelector('#savedList').innerHTML = '<div class="saved-empty">No saved profiles</div>';
});

const requestsDialog = document.querySelector('#requestsDialog');
const requestsList = document.querySelector('#requestsList');

function renderRequestsList() {
  const requests = state.requests.filter(request => request.request_status !== 'declined');
  requestsList.innerHTML = requests.length ? requests.map(request => {
    let actions = '';
    if (request.request_status === 'pending' && request.direction === 'incoming') {
      actions = `<div class="request-actions"><button class="button button-primary" type="button" data-request-action="accept" data-request-id="${escapeHtml(request.request_id)}">Accept</button><button class="button button-secondary" type="button" data-request-action="decline" data-request-id="${escapeHtml(request.request_id)}">Decline</button></div>`;
    } else if (request.request_status === 'pending') {
      actions = '<span class="request-status">Waiting for response</span>';
    } else if (request.other_email) {
      actions = `<a class="buddy-email-link" href="${escapeHtml(gmailComposeUrl(request.other_email))}" target="_blank" rel="noopener noreferrer">${escapeHtml(request.other_email)}</a>`;
    }
    return `<div class="request-item"><div class="card-avatar" style="background:#dbeafe">${escapeHtml(initials(request.other_name))}</div><div class="request-details"><h3>${escapeHtml(request.other_name)}</h3><p>${request.request_status === 'accepted' ? 'Buddy' : request.direction === 'incoming' ? 'Wants to BuddyUp' : 'Request sent'}</p></div>${actions}</div>`;
  }).join('') : '<div class="saved-empty">No BuddyUp requests</div>';
}

function openRequestsDialog() {
  if (!state.user) return openAuthDialog();
  renderRequestsList();
  requestsDialog.showModal();
}

document.querySelector('#requestsNav').addEventListener('click', openRequestsDialog);
document.querySelector('#closeRequestsDialog').addEventListener('click', () => requestsDialog.close());
requestsDialog.addEventListener('click', event => {
  if (event.target === requestsDialog) requestsDialog.close();
});
requestsList.addEventListener('click', async event => {
  const button = event.target.closest('[data-request-action]');
  if (!button) return;
  button.disabled = true;
  try {
    await window.mbuddyDb.respondToBuddyRequest(button.dataset.requestId, button.dataset.requestAction === 'accept');
    await refreshAccountData();
    renderRequestsList();
    showToast(button.dataset.requestAction === 'accept' ? 'BuddyUp request accepted' : 'BuddyUp request declined');
  } catch (error) {
    button.disabled = false;
    showError(error, 'Could not update BuddyUp request');
  }
});

const adminDialog = document.querySelector('#adminDialog');
adminNav.addEventListener('click', () => {
  if (!state.isAdmin) return;
  renderAdminList();
  adminDialog.showModal();
});
document.querySelector('#closeAdminDialog').addEventListener('click', () => adminDialog.close());
adminDialog.addEventListener('click', event => {
  if (event.target === adminDialog) adminDialog.close();
});
document.querySelector('#adminList').addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-profile]');
  if (!button || !state.isAdmin) return;
  const profileId = button.dataset.deleteProfile;
  const student = students.find(person => person.id === profileId);
  if (!student || !window.confirm(`Delete ${student.name}'s profile?`)) return;
  button.disabled = true;
  try {
    await window.mbuddyDb.deleteProfile(profileId);
    students = students.filter(person => person.id !== profileId);
    state.saved = state.saved.filter(savedId => savedId !== profileId);
    render();
    renderAdminList();
    showToast('Profile deleted');
  } catch (error) {
    button.disabled = false;
    showError(error, 'Could not delete profile');
  }
});

authButton.addEventListener('click', async () => {
  if (!requireConfiguration()) return;
  if (!state.user) return openAuthDialog();
  try {
    await window.mbuddyDb.signOut();
    state.user = null;
    await refreshAccountData();
    showToast('Signed out');
  } catch (error) {
    showError(error, 'Could not sign out');
  }
});

document.querySelector('#closeAuthDialog').addEventListener('click', () => authDialog.close());
authDialog.addEventListener('click', event => {
  if (event.target === authDialog) authDialog.close();
});

document.querySelector('#authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const email = document.querySelector('#authEmail').value.trim();
  const password = document.querySelector('#authPassword').value;
  const action = event.submitter?.value;
  try {
    if (action === 'signup') {
      if (!/@mmdc\.mcl\.edu\.ph$/i.test(email)) {
        showToast('Use your MMDC email to create an account');
        return;
      }
      const result = await window.mbuddyDb.signUp(email, password);
      state.user = result.session.user;
      showToast('Account created');
    } else {
      state.user = await window.mbuddyDb.signIn(email, password);
      showToast('Signed in');
    }
    authDialog.close();
    form.reset();
    await refreshAccountData();
  } catch (error) {
    showError(error, 'Account request failed');
  }
});

async function start() {
  render();
  try {
    const result = await window.mbuddyDb.init();
    state.user = result.user;
    await refreshAccountData();
  } catch (error) {
    showError(error, 'Could not start MBuddy');
  }
}

function registerAgentTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const report = error => console.warn('MBuddy tool registration failed', error);
  const tool = {
    name:'search_buddies', title:'Search buddies',
    description:'Filter visible MBuddy profiles by search text, course and specialization, year, class time slot, and preferred work time.',
    inputSchema:{type:'object',properties:{query:{type:'string'},courseSpecialization:{type:'string'},year:{type:'integer',minimum:1,maximum:4},timeSlot:{type:'string',enum:['A','H','S']},style:{type:'string'}},additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:true},
    execute(input = {}) {
      searchInput.value = String(input.query || '');
      courseFilter.value = input.courseSpecialization || 'all';
      yearFilter.value = input.year ? String(input.year) : 'all';
      timeSlotFilter.value = input.timeSlot || 'all';
      styleFilter.value = input.style || 'all';
      render();
      return { profileCount: Number(document.querySelector('#resultCount').textContent) };
    }
  };
  try { Promise.resolve(context.registerTool(tool)).catch(report); } catch (error) { report(error); }
}

void start();
registerAgentTools();
