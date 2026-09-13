let students = [];
const state = { saved: [], user: null, isAdmin: false };
const grid = document.querySelector('#cardGrid');
const empty = document.querySelector('#emptyState');
const searchInput = document.querySelector('#searchInput');
const courseFilter = document.querySelector('#courseFilter');
const yearFilter = document.querySelector('#yearFilter');
const styleFilter = document.querySelector('#styleFilter');
const savedCount = document.querySelector('#savedCount');
const authButton = document.querySelector('#authButton');
const adminNav = document.querySelector('#adminNav');
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
    name: profile.first_name,
    courseSpecialization: profile.course_specialization,
    yearLevel: profile.year_level,
    goal: profile.goal,
    style: profile.work_style
  };
}

function studentCard(student) {
  const saved = state.saved.includes(student.id);
  return `<article class="buddy-card" data-id="${escapeHtml(student.id)}">
    <div class="card-top">
      <div class="card-avatar" style="background:#dbeafe">${escapeHtml(initials(student.name))}</div>
      <div class="card-name"><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.courseSpecialization)} · Year ${escapeHtml(student.yearLevel)}</p></div>
    </div>
    <p class="card-note">${escapeHtml(student.goal)}</p>
    <div class="card-tags"><span>${escapeHtml(student.style)}</span></div>
    <div class="card-footer"><button class="button button-secondary save-button ${saved ? 'saved' : ''}" type="button">${saved ? 'Saved' : 'Save profile'}</button></div>
  </article>`;
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const course = courseFilter.value;
  const year = yearFilter.value;
  const style = styleFilter.value;
  const results = students.filter(student => {
    const text = [student.name, student.courseSpecialization, student.style, student.goal].join(' ').toLowerCase();
    return (!query || text.includes(query)) &&
      (course === 'all' || student.courseSpecialization === course) &&
      (year === 'all' || String(student.yearLevel) === year) &&
      (style === 'all' || student.style === style);
  });
  grid.innerHTML = results.map(studentCard).join('');
  document.querySelector('#resultCount').textContent = results.length;
  empty.hidden = results.length > 0;
  grid.hidden = results.length === 0;
  savedCount.textContent = state.saved.length;
  authButton.textContent = state.user ? 'Sign out' : 'Sign in';
  adminNav.hidden = !state.isAdmin;
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
  if (window.mbuddyDb.configured) return true;
  showToast('Add your Supabase URL and publishable key in config.js');
  return false;
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
    render();
    return;
  }
  const [profiles, savedIds, isAdmin] = await Promise.all([
    window.mbuddyDb.listProfiles(),
    window.mbuddyDb.listSavedProfileIds(),
    window.mbuddyDb.isAdmin()
  ]);
  students = profiles.map(profileFromRow);
  state.saved = savedIds;
  state.isAdmin = isAdmin;
  render();
}

function renderAdminList() {
  const adminList = document.querySelector('#adminList');
  adminList.innerHTML = students.length
    ? students.map(student => `<div class="saved-item"><div class="card-avatar" style="background:#dbeafe">${escapeHtml(initials(student.name))}</div><div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.courseSpecialization)} · Year ${escapeHtml(student.yearLevel)}</p></div><button class="danger-button" type="button" data-delete-profile="${escapeHtml(student.id)}">Delete</button></div>`).join('')
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

function resetFilters() {
  searchInput.value = '';
  courseFilter.value = 'all';
  yearFilter.value = 'all';
  styleFilter.value = 'all';
  render();
}

grid.addEventListener('click', event => {
  const card = event.target.closest('.buddy-card');
  if (card && event.target.closest('.save-button')) void toggleSave(card.dataset.id);
});

[searchInput, courseFilter, yearFilter, styleFilter].forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', render));
document.querySelector('#resetButton').addEventListener('click', resetFilters);
document.querySelector('#emptyReset').addEventListener('click', resetFilters);
document.querySelector('#filterButton').addEventListener('click', render);

const profileDialog = document.querySelector('#profileDialog');
document.querySelector('#profileButton').addEventListener('click', () => {
  if (!requireConfiguration()) return;
  if (!state.user) return openAuthDialog();
  profileDialog.showModal();
});
document.querySelector('#closeProfileDialog').addEventListener('click', () => profileDialog.close());
profileDialog.addEventListener('click', event => {
  if (event.target === profileDialog) profileDialog.close();
});

document.querySelector('#profileForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity() || !state.user) return;
  const form = event.currentTarget;
  const profile = {
    first_name: document.querySelector('#profileName').value.trim(),
    course_specialization: document.querySelector('#profileCourse').value,
    year_level: Number(document.querySelector('#profileYear').value),
    goal: document.querySelector('#profileGoal').value.trim(),
    work_style: new FormData(form).get('workstyle')
  };
  try {
    const created = await window.mbuddyDb.createProfile(profile);
    const normalized = profileFromRow(created);
    students = [normalized, ...students.filter(student => student.id !== normalized.id)];
    profileDialog.close();
    form.reset();
    render();
    showToast('Profile saved');
  } catch (error) {
    showError(error, 'Could not save profile');
  }
});

document.querySelector('#savedNav').addEventListener('click', () => {
  if (!state.user) return openAuthDialog();
  const savedStudents = students.filter(student => state.saved.includes(student.id));
  document.querySelector('#savedList').innerHTML = savedStudents.length
    ? savedStudents.map(student => `<div class="saved-item"><div class="card-avatar" style="background:#dbeafe">${escapeHtml(initials(student.name))}</div><div><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.courseSpecialization)} · Year ${escapeHtml(student.yearLevel)}</p></div><button type="button" data-remove="${escapeHtml(student.id)}">Remove</button></div>`).join('')
    : '<div class="saved-empty">No saved profiles</div>';
  document.querySelector('#savedDialog').showModal();
});

document.querySelector('#savedList').addEventListener('click', async event => {
  if (!event.target.dataset.remove) return;
  await toggleSave(event.target.dataset.remove);
  event.target.closest('.saved-item')?.remove();
  if (!state.saved.length) document.querySelector('#savedList').innerHTML = '<div class="saved-empty">No saved profiles</div>';
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
      const result = await window.mbuddyDb.signUp(email, password);
      if (!result.session) {
        authDialog.close();
        form.reset();
        showToast('Check your email to confirm your account');
        return;
      }
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
  if (!window.mbuddyDb.configured) return;
  try {
    const result = await window.mbuddyDb.init();
    state.user = result.user;
    await refreshAccountData();
  } catch (error) {
    showError(error, 'Could not connect to Supabase');
  }
}

function registerAgentTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const report = error => console.warn('MBuddy tool registration failed', error);
  const tool = {
    name:'search_buddies', title:'Search buddies',
    description:'Filter visible MBuddy profiles by search text, course and specialization, year, and preferred work time.',
    inputSchema:{type:'object',properties:{query:{type:'string'},courseSpecialization:{type:'string'},year:{type:'integer',minimum:1,maximum:4},style:{type:'string'}},additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:true},
    execute(input = {}) {
      searchInput.value = String(input.query || '');
      courseFilter.value = input.courseSpecialization || 'all';
      yearFilter.value = input.year ? String(input.year) : 'all';
      styleFilter.value = input.style || 'all';
      render();
      return { profileCount: Number(document.querySelector('#resultCount').textContent) };
    }
  };
  try { Promise.resolve(context.registerTool(tool)).catch(report); } catch (error) { report(error); }
}

void start();
registerAgentTools();
