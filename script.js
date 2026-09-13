let students = [];
const state = { saved: [] };
const grid = document.querySelector('#cardGrid');
const empty = document.querySelector('#emptyState');
const searchInput = document.querySelector('#searchInput');
const courseFilter = document.querySelector('#courseFilter');
const yearFilter = document.querySelector('#yearFilter');
const styleFilter = document.querySelector('#styleFilter');
const savedCount = document.querySelector('#savedCount');
const toast = document.querySelector('#toast');

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
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
    return (!query || text.includes(query)) && (course === 'all' || student.courseSpecialization === course) && (year === 'all' || String(student.yearLevel) === year) && (style === 'all' || student.style === style);
  });
  grid.innerHTML = results.map(studentCard).join('');
  document.querySelector('#resultCount').textContent = results.length;
  empty.hidden = results.length > 0;
  grid.hidden = results.length === 0;
  savedCount.textContent = state.saved.length;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function requireConfiguration() {
  if (window.mbuddyDb.configured) return true;
  showToast('Add your Supabase URL and anon key in config.js');
  return false;
}

async function toggleSave(id) {
  if (!requireConfiguration()) return;
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
    console.error(error);
    showToast('Could not update saved profiles');
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
document.querySelector('#profileButton').addEventListener('click', () => profileDialog.showModal());
document.querySelector('#closeProfileDialog').addEventListener('click', () => profileDialog.close());
profileDialog.addEventListener('click', event => {
  if (event.target === profileDialog) profileDialog.close();
});

document.querySelector('#profileForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity() || !requireConfiguration()) return;
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
    students.unshift({ id: created.id, name: created.first_name, courseSpecialization: created.course_specialization, yearLevel: created.year_level, goal: created.goal, style: created.work_style });
    profileDialog.close();
    form.reset();
    render();
    showToast('Profile created');
  } catch (error) {
    console.error(error);
    showToast('Could not create profile');
  }
});

document.querySelector('#savedNav').addEventListener('click', () => {
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

async function start() {
  render();
  if (!window.mbuddyDb.configured) return;
  try {
    await window.mbuddyDb.init();
    const [profiles, savedIds] = await Promise.all([
      window.mbuddyDb.listProfiles(),
      window.mbuddyDb.listSavedProfileIds()
    ]);
    students = profiles.map(profile => ({
      id: profile.id,
      name: profile.first_name,
      courseSpecialization: profile.course_specialization,
      yearLevel: profile.year_level,
      goal: profile.goal,
      style: profile.work_style
    }));
    state.saved = savedIds;
    render();
  } catch (error) {
    console.error(error);
    showToast('Could not connect to Supabase');
  }
}

function registerAgentTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const report = error => console.warn('MBuddy tool registration failed', error);
  const tools = [{
    name:'search_buddies', title:'Search buddies',
    description:'Filter the visible MBuddy student profiles by search text, course and specialization, year, and preferred work time.',
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
  }];
  tools.forEach(tool => { try { Promise.resolve(context.registerTool(tool)).catch(report); } catch (error) { report(error); } });
}

void start();
registerAgentTools();
