// ── Supabase ────────────────────────────────────────────────

const SUPABASE_URL = 'https://dcmlotdttxrkohehaiux.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjbWxvdGR0dHhya29oZWhhaXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODk0MzQsImV4cCI6MjA4NjQ2NTQzNH0.o32Oo2AZ1M3n2xBNkHmQfIZxeRpgENTOIXZrQOhmfYI';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ── Data Layer (localStorage) ───────────────────────────────

const MEALS_KEY = 'ibs_meals';
const SYMPTOMS_KEY = 'ibs_symptoms';
const BM_KEY = 'ibs_bm';

function getMeals() {
  return JSON.parse(localStorage.getItem(MEALS_KEY) || '[]');
}

function saveMeals(meals) {
  localStorage.setItem(MEALS_KEY, JSON.stringify(meals));
}

function getSymptoms() {
  return JSON.parse(localStorage.getItem(SYMPTOMS_KEY) || '[]');
}

function saveSymptoms(symptoms) {
  localStorage.setItem(SYMPTOMS_KEY, JSON.stringify(symptoms));
}

function getBMs() {
  return JSON.parse(localStorage.getItem(BM_KEY) || '[]');
}

function saveBMs(bms) {
  localStorage.setItem(BM_KEY, JSON.stringify(bms));
}

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function addMeal(meal) {
  meal.id = generateId();
  meal.type = 'meal';
  const meals = getMeals();
  meals.push(meal);
  saveMeals(meals);

  if (currentUser) {
    sb.from('meals').insert({
      id: meal.id, name: meal.name, tags: meal.tags, time: meal.time, notes: meal.notes || '',
    });
  }
  return meal;
}

function addSymptom(symptom) {
  symptom.id = generateId();
  symptom.type = 'symptom';
  const symptoms = getSymptoms();
  symptoms.push(symptom);
  saveSymptoms(symptoms);

  if (currentUser) {
    sb.from('symptoms').insert({
      id: symptom.id, symptom_type: symptom.symptomType, severity: symptom.severity,
      time: symptom.time, notes: symptom.notes || '',
    });
  }
  return symptom;
}

function addBM(bm) {
  bm.id = generateId();
  bm.type = 'bm';
  const bms = getBMs();
  bms.push(bm);
  saveBMs(bms);

  if (currentUser) {
    sb.from('bowel_movements').insert({
      id: bm.id, bristol_type: bm.bristolType, urgency: bm.urgency || 'none',
      time: bm.time, notes: bm.notes || '',
    });
  }
  return bm;
}

function deleteEntry(id, type) {
  if (type === 'meal') {
    saveMeals(getMeals().filter(m => m.id !== id));
    if (currentUser) sb.from('meals').delete().eq('id', id);
  } else if (type === 'bm') {
    saveBMs(getBMs().filter(b => b.id !== id));
    if (currentUser) sb.from('bowel_movements').delete().eq('id', id);
  } else {
    saveSymptoms(getSymptoms().filter(s => s.id !== id));
    if (currentUser) sb.from('symptoms').delete().eq('id', id);
  }
}

function getAllEntries() {
  const meals = getMeals().map(m => ({ ...m, type: 'meal' }));
  const symptoms = getSymptoms().map(s => ({ ...s, type: 'symptom' }));
  const bms = getBMs().map(b => ({ ...b, type: 'bm' }));
  return [...meals, ...symptoms, ...bms].sort((a, b) => new Date(b.time) - new Date(a.time));
}

// ── Supabase Sync ───────────────────────────────────────────

async function syncFromSupabase() {
  if (!currentUser) return;
  try {
    const [mealsRes, symptomsRes, bmsRes] = await Promise.all([
      sb.from('meals').select('*').order('time', { ascending: false }),
      sb.from('symptoms').select('*').order('time', { ascending: false }),
      sb.from('bowel_movements').select('*').order('time', { ascending: false }),
    ]);

    if (mealsRes.data) {
      saveMeals(mealsRes.data.map(m => ({
        id: m.id, type: 'meal', name: m.name, tags: m.tags || [],
        time: m.time, notes: m.notes || '',
      })));
    }
    if (symptomsRes.data) {
      saveSymptoms(symptomsRes.data.map(s => ({
        id: s.id, type: 'symptom', symptomType: s.symptom_type, severity: s.severity,
        time: s.time, notes: s.notes || '',
      })));
    }
    if (bmsRes.data) {
      saveBMs(bmsRes.data.map(b => ({
        id: b.id, type: 'bm', bristolType: b.bristol_type, urgency: b.urgency || 'none',
        time: b.time, notes: b.notes || '',
      })));
    }

    refreshDashboard();
  } catch (e) {
    console.error('Sync from Supabase failed:', e);
  }
}

async function migrateLocalToSupabase() {
  if (!currentUser) return;

  const meals = getMeals();
  const symptoms = getSymptoms();
  const bms = getBMs();

  const total = meals.length + symptoms.length + bms.length;
  if (total === 0) return;

  showToast('Migrating local data...');
  let migrated = 0;

  try {
    if (meals.length) {
      const { error } = await sb.from('meals').insert(meals.map(m => ({
        name: m.name, tags: m.tags || [], time: m.time, notes: m.notes || '',
      })));
      if (error) console.error('Meals migration error:', error);
      else migrated += meals.length;
    }
    if (symptoms.length) {
      const { error } = await sb.from('symptoms').insert(symptoms.map(s => ({
        symptom_type: s.symptomType, severity: s.severity, time: s.time, notes: s.notes || '',
      })));
      if (error) console.error('Symptoms migration error:', error);
      else migrated += symptoms.length;
    }
    if (bms.length) {
      const { error } = await sb.from('bowel_movements').insert(bms.map(b => ({
        bristol_type: b.bristolType, urgency: b.urgency || 'none', time: b.time, notes: b.notes || '',
      })));
      if (error) console.error('BM migration error:', error);
      else migrated += bms.length;
    }

    if (migrated > 0) {
      await syncFromSupabase();
      showToast(`Migrated ${migrated} entries`);
    } else {
      showToast('Migration failed - data kept locally');
    }
  } catch (e) {
    console.error('Migration failed:', e);
    showToast('Migration failed - data kept locally');
  }
}

// ── Auth ────────────────────────────────────────────────────

const authScreen = document.getElementById('auth-screen');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authToggle = document.getElementById('auth-toggle');
const authError = document.getElementById('auth-error');
const authSkip = document.getElementById('auth-skip');
const userInfo = document.getElementById('user-info');
const userEmail = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

let isSignUp = false;

authToggle.addEventListener('click', () => {
  isSignUp = !isSignUp;
  authSubmit.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  authToggle.textContent = isSignUp
    ? 'Already have an account? Sign in'
    : "Don't have an account? Sign up";
  authError.textContent = '';
});

authForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.textContent = '';
  authSubmit.disabled = true;
  authSubmit.textContent = isSignUp ? 'Signing up...' : 'Signing in...';

  const email = authEmail.value.trim();
  const password = authPassword.value;

  let result;
  if (isSignUp) {
    result = await sb.auth.signUp({ email, password });
  } else {
    result = await sb.auth.signInWithPassword({ email, password });
  }

  if (result.error) {
    authError.textContent = result.error.message;
    authSubmit.disabled = false;
    authSubmit.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  }
  // Success is handled by onAuthStateChange
});

authSkip.addEventListener('click', () => {
  authScreen.classList.add('hidden');
});

logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut();
  currentUser = null;
  updateAuthUI();
  showToast('Logged out');
});

function updateAuthUI() {
  if (currentUser) {
    authScreen.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userEmail.textContent = currentUser.email;
  } else {
    userInfo.classList.add('hidden');
  }
}

// Listen for auth changes
sb.auth.onAuthStateChange(async (event, session) => {
  const wasLoggedOut = !currentUser;
  currentUser = session?.user || null;
  updateAuthUI();

  if (currentUser && wasLoggedOut) {
    // Small delay to ensure auth token is fully propagated
    await new Promise(r => setTimeout(r, 500));

    // Save local data before any sync (so we don't lose it)
    const localMeals = getMeals();
    const localSymptoms = getSymptoms();
    const localBMs = getBMs();
    const localCount = localMeals.length + localSymptoms.length + localBMs.length;

    // Check if Supabase already has data
    const { count, error } = await sb.from('meals').select('*', { count: 'exact', head: true });

    if (localCount > 0 && !error && (count === 0 || count === null)) {
      await migrateLocalToSupabase();
    } else {
      await syncFromSupabase();

      // If sync returned nothing but we had local data, restore it
      const afterSync = getMeals().length + getSymptoms().length + getBMs().length;
      if (afterSync === 0 && localCount > 0) {
        saveMeals(localMeals);
        saveSymptoms(localSymptoms);
        saveBMs(localBMs);
        await migrateLocalToSupabase();
      }
    }
  }
});

// ── Navigation ──────────────────────────────────────────────

const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.view;
    navButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(target).classList.add('active');

    if (target === 'dashboard') refreshDashboard();
    if (target === 'patterns') refreshPatterns();
  });
});

// ── Toast ───────────────────────────────────────────────────

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

// ── Meal Form ───────────────────────────────────────────────

const mealForm = document.getElementById('meal-form');
const mealTimeInput = document.getElementById('meal-time');

function setDefaultTime(input) {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  input.value = now.toISOString().slice(0, 16);
}

setDefaultTime(mealTimeInput);

mealForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('meal-name').value.trim();
  const time = document.getElementById('meal-time').value;
  const tagsRaw = document.getElementById('meal-tags').value.trim();
  const notes = document.getElementById('meal-notes').value.trim();

  const tags = tagsRaw
    ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    : [];

  addMeal({ name, time, tags, notes });
  showToast('Meal logged');
  mealForm.reset();
  setDefaultTime(mealTimeInput);
});

// ── Symptom Form ────────────────────────────────────────────

const symptomForm = document.getElementById('symptom-form');
const symptomTimeInput = document.getElementById('symptom-time');
const severitySlider = document.getElementById('symptom-severity');
const severityValue = document.getElementById('severity-value');

setDefaultTime(symptomTimeInput);

severitySlider.addEventListener('input', () => {
  severityValue.textContent = severitySlider.value;
});

symptomForm.addEventListener('submit', e => {
  e.preventDefault();
  const symptomType = document.getElementById('symptom-type').value;
  const severity = parseInt(severitySlider.value);
  const time = document.getElementById('symptom-time').value;
  const notes = document.getElementById('symptom-notes').value.trim();

  addSymptom({ symptomType, severity, time, notes });
  showToast('Symptom logged');
  symptomForm.reset();
  severityValue.textContent = '5';
  severitySlider.value = 5;
  setDefaultTime(symptomTimeInput);
});

// ── BM Form ────────────────────────────────────────────────

const bmForm = document.getElementById('bm-form');
const bmTimeInput = document.getElementById('bm-time');

setDefaultTime(bmTimeInput);

bmForm.addEventListener('submit', e => {
  e.preventDefault();
  const bmTypeRadio = document.querySelector('input[name="bm-type"]:checked');
  if (!bmTypeRadio) return;
  const bristolType = parseInt(bmTypeRadio.value);
  const urgency = document.getElementById('bm-urgency').value;
  const time = document.getElementById('bm-time').value;
  const notes = document.getElementById('bm-notes').value.trim();

  addBM({ bristolType, urgency, time, notes });
  showToast('Bowel movement logged');
  bmForm.reset();
  setDefaultTime(bmTimeInput);
});

const BRISTOL_LABELS = {
  1: 'Type 1 - Hard lumps',
  2: 'Type 2 - Lumpy sausage',
  3: 'Type 3 - Cracked sausage',
  4: 'Type 4 - Smooth sausage',
  5: 'Type 5 - Soft blobs',
  6: 'Type 6 - Mushy',
  7: 'Type 7 - Liquid',
};

const URGENCY_LABELS = {
  none: 'No urgency',
  mild: 'Mild urgency',
  moderate: 'Moderate urgency',
  severe: 'Severe urgency',
};

// ── Symptom Labels ──────────────────────────────────────────

const SYMPTOM_LABELS = {
  pain: 'Abdominal Pain',
  bloating: 'Bloating',
  gas: 'Gas',
  diarrhea: 'Diarrhea',
  constipation: 'Constipation',
  nausea: 'Nausea',
  cramping: 'Cramping',
  urgency: 'Urgency',
  fatigue: 'Fatigue',
  other: 'Other',
};

function symptomLabel(key) {
  return SYMPTOM_LABELS[key] || key;
}

// ── Entry Card Rendering ────────────────────────────────────

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  }) + ' at ' + d.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit',
  });
}

function severityClass(s) {
  if (s <= 3) return 'severity-low';
  if (s <= 6) return 'severity-med';
  return 'severity-high';
}

function renderEntryCard(entry) {
  const card = document.createElement('div');
  card.className = `entry-card ${entry.type}`;

  const icon = document.createElement('div');
  icon.className = 'entry-icon';

  const body = document.createElement('div');
  body.className = 'entry-body';

  const title = document.createElement('div');
  title.className = 'entry-title';

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  meta.textContent = formatTime(entry.time);

  if (entry.type === 'meal') {
    icon.textContent = '\u{1F37D}';
    title.textContent = entry.name;

    if (entry.tags && entry.tags.length) {
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'entry-tags';
      entry.tags.forEach(t => {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t;
        tagsDiv.appendChild(tag);
      });
      body.appendChild(title);
      body.appendChild(meta);
      body.appendChild(tagsDiv);
    } else {
      body.appendChild(title);
      body.appendChild(meta);
    }
  } else if (entry.type === 'bm') {
    icon.textContent = '\u{1F4A9}';
    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap = '0.5rem';

    const label = document.createElement('span');
    label.textContent = BRISTOL_LABELS[entry.bristolType] || `Type ${entry.bristolType}`;
    label.className = 'entry-title';

    const badge = document.createElement('span');
    badge.className = 'bm-type-badge';
    badge.textContent = `BSS ${entry.bristolType}`;

    titleRow.appendChild(label);
    titleRow.appendChild(badge);
    body.appendChild(titleRow);
    body.appendChild(meta);

    if (entry.urgency && entry.urgency !== 'none') {
      const urgNote = document.createElement('div');
      urgNote.className = 'entry-meta';
      urgNote.textContent = URGENCY_LABELS[entry.urgency] || entry.urgency;
      body.appendChild(urgNote);
    }
  } else {
    icon.textContent = '\u{1FA7A}';
    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap = '0.5rem';

    const label = document.createElement('span');
    label.textContent = symptomLabel(entry.symptomType);
    label.className = 'entry-title';

    const badge = document.createElement('span');
    badge.className = `severity-badge ${severityClass(entry.severity)}`;
    badge.textContent = `${entry.severity}/10`;

    titleRow.appendChild(label);
    titleRow.appendChild(badge);
    body.appendChild(titleRow);
    body.appendChild(meta);
  }

  if (entry.notes) {
    const notes = document.createElement('div');
    notes.className = 'entry-notes';
    notes.textContent = entry.notes;
    body.appendChild(notes);
  }

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '\u00d7';
  del.title = 'Delete entry';
  del.addEventListener('click', () => {
    if (confirm('Delete this entry?')) {
      deleteEntry(entry.id, entry.type);
      refreshDashboard();
    }
  });

  card.appendChild(icon);
  card.appendChild(body);
  card.appendChild(del);
  return card;
}

// ── Dashboard ───────────────────────────────────────────────

let currentFilter = 'all';
let calendarDate = new Date();

const filterButtons = document.querySelectorAll('.filter-btn');
filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderRecentEntries();
  });
});

function renderRecentEntries() {
  const container = document.getElementById('recent-entries');
  container.innerHTML = '';

  let entries = getAllEntries();
  if (currentFilter !== 'all') {
    entries = entries.filter(e => e.type === currentFilter);
  }

  const recent = entries.slice(0, 30);

  if (!recent.length) {
    container.innerHTML = '<div class="empty-state">No entries yet. Start logging meals and symptoms!</div>';
    return;
  }

  recent.forEach(entry => container.appendChild(renderEntryCard(entry)));
}

// ── Calendar ────────────────────────────────────────────────

document.getElementById('prev-month').addEventListener('click', () => {
  calendarDate.setMonth(calendarDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
  calendarDate.setMonth(calendarDate.getMonth() + 1);
  renderCalendar();
});

document.getElementById('close-day-detail').addEventListener('click', () => {
  document.getElementById('day-detail').classList.add('hidden');
});

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  document.getElementById('calendar-month-year').textContent =
    new Date(year, month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const container = document.getElementById('calendar-days');
  container.innerHTML = '';

  const entries = getAllEntries();
  const dateMap = {};
  entries.forEach(e => {
    const key = dateKey(new Date(e.time));
    if (!dateMap[key]) dateMap[key] = { meals: 0, symptoms: 0, bms: 0 };
    if (e.type === 'meal') dateMap[key].meals++;
    else if (e.type === 'bm') dateMap[key].bms++;
    else dateMap[key].symptoms++;
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const today = new Date();
  const todayKey = dateKey(today);

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const cell = document.createElement('div');
    cell.className = 'calendar-day other-month';
    cell.textContent = day;
    container.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    const key = dateKey(new Date(year, month, d));
    if (key === todayKey) cell.classList.add('today');

    const num = document.createElement('span');
    num.textContent = d;
    cell.appendChild(num);

    if (dateMap[key]) {
      const dots = document.createElement('div');
      dots.className = 'day-dots';
      if (dateMap[key].meals) {
        const dot = document.createElement('div');
        dot.className = 'dot meal-dot';
        dots.appendChild(dot);
      }
      if (dateMap[key].symptoms) {
        const dot = document.createElement('div');
        dot.className = 'dot symptom-dot';
        dots.appendChild(dot);
      }
      if (dateMap[key].bms) {
        const dot = document.createElement('div');
        dot.className = 'dot bm-dot';
        dots.appendChild(dot);
      }
      cell.appendChild(dots);
    }

    cell.addEventListener('click', () => showDayDetail(year, month, d));
    container.appendChild(cell);
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day other-month';
    cell.textContent = i;
    container.appendChild(cell);
  }
}

function showDayDetail(year, month, day) {
  const key = dateKey(new Date(year, month, day));
  const entries = getAllEntries().filter(e => dateKey(new Date(e.time)) === key);

  const detail = document.getElementById('day-detail');
  const title = document.getElementById('day-detail-title');
  const container = document.getElementById('day-detail-entries');

  title.textContent = new Date(year, month, day).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  container.innerHTML = '';

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">No entries for this day.</div>';
  } else {
    entries.forEach(e => container.appendChild(renderEntryCard(e)));
  }

  detail.classList.remove('hidden');
}

// ── Patterns ────────────────────────────────────────────────

const patternRange = document.getElementById('pattern-range');
patternRange.addEventListener('change', refreshPatterns);

function refreshPatterns() {
  const rangeDays = patternRange.value;
  const now = new Date();
  let cutoff;

  if (rangeDays === 'all') {
    cutoff = new Date(0);
  } else {
    cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - parseInt(rangeDays));
  }

  const meals = getMeals().filter(m => new Date(m.time) >= cutoff);
  const symptoms = getSymptoms().filter(s => new Date(s.time) >= cutoff);

  renderPatternsSummary(meals, symptoms);
  renderPatternsDetail(meals, symptoms);
}

function renderPatternsSummary(meals, symptoms) {
  const container = document.getElementById('patterns-summary');
  const avgSeverity = symptoms.length
    ? (symptoms.reduce((sum, s) => sum + s.severity, 0) / symptoms.length).toFixed(1)
    : '---';

  const symptomDays = new Set(symptoms.map(s => dateKey(new Date(s.time))));
  const mealDays = new Set(meals.map(m => dateKey(new Date(m.time))));
  const allDays = new Set([...symptomDays, ...mealDays]);

  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${meals.length}</div>
      <div class="stat-label">Meals Logged</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${symptoms.length}</div>
      <div class="stat-label">Symptoms Logged</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${avgSeverity}</div>
      <div class="stat-label">Avg Severity</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${allDays.size - symptomDays.size}</div>
      <div class="stat-label">Symptom-Free Days</div>
    </div>
  `;
}

function renderPatternsDetail(meals, symptoms) {
  const container = document.getElementById('patterns-detail');
  container.innerHTML = '';

  if (!symptoms.length) {
    container.innerHTML = '<div class="empty-state">No symptoms logged in this period. Keep tracking!</div>';
    return;
  }

  if (!meals.length) {
    container.innerHTML = '<div class="empty-state">No meals logged in this period. Log meals to see food/symptom correlations.</div>';
    return;
  }

  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const tagSymptomMap = {};
  const foodSymptomMap = {};

  symptoms.forEach(symptom => {
    const symptomTime = new Date(symptom.time).getTime();
    const windowStart = symptomTime - WINDOW_MS;

    const precedingMeals = meals.filter(m => {
      const mealTime = new Date(m.time).getTime();
      return mealTime >= windowStart && mealTime <= symptomTime;
    });

    precedingMeals.forEach(meal => {
      const foodKey = meal.name.toLowerCase().trim();
      if (!foodSymptomMap[foodKey]) foodSymptomMap[foodKey] = { total: 0, byType: {}, avgSeverity: 0, severitySum: 0 };
      foodSymptomMap[foodKey].total++;
      foodSymptomMap[foodKey].byType[symptom.symptomType] = (foodSymptomMap[foodKey].byType[symptom.symptomType] || 0) + 1;
      foodSymptomMap[foodKey].severitySum += symptom.severity;

      if (meal.tags) {
        meal.tags.forEach(tag => {
          if (!tagSymptomMap[tag]) tagSymptomMap[tag] = { total: 0, byType: {}, avgSeverity: 0, severitySum: 0 };
          tagSymptomMap[tag].total++;
          tagSymptomMap[tag].byType[symptom.symptomType] = (tagSymptomMap[tag].byType[symptom.symptomType] || 0) + 1;
          tagSymptomMap[tag].severitySum += symptom.severity;
        });
      }
    });
  });

  for (const key in foodSymptomMap) {
    foodSymptomMap[key].avgSeverity = (foodSymptomMap[key].severitySum / foodSymptomMap[key].total).toFixed(1);
  }
  for (const key in tagSymptomMap) {
    tagSymptomMap[key].avgSeverity = (tagSymptomMap[key].severitySum / tagSymptomMap[key].total).toFixed(1);
  }

  const symptomCounts = {};
  symptoms.forEach(s => {
    symptomCounts[s.symptomType] = (symptomCounts[s.symptomType] || 0) + 1;
  });

  const maxSymptomCount = Math.max(...Object.values(symptomCounts));
  const symptomGroup = document.createElement('div');
  symptomGroup.className = 'pattern-group';
  symptomGroup.innerHTML = '<h3>Most Frequent Symptoms</h3>';

  Object.entries(symptomCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      symptomGroup.appendChild(renderBar(symptomLabel(type), count, maxSymptomCount, 'symptom-bar', `${count} occurrences`));
    });

  container.appendChild(symptomGroup);

  const tagEntries = Object.entries(tagSymptomMap).sort((a, b) => b[1].total - a[1].total);
  if (tagEntries.length) {
    const maxTag = Math.max(...tagEntries.map(e => e[1].total));
    const tagGroup = document.createElement('div');
    tagGroup.className = 'pattern-group';
    tagGroup.innerHTML = '<h3>Potential Triggers (by food tag)</h3>';

    tagEntries.slice(0, 10).forEach(([tag, data]) => {
      const detail = `${data.total} symptom links, avg severity ${data.avgSeverity}`;
      tagGroup.appendChild(renderBar(tag, data.total, maxTag, 'meal-bar', detail));
    });

    container.appendChild(tagGroup);
  }

  const foodEntries = Object.entries(foodSymptomMap).sort((a, b) => b[1].total - a[1].total);
  if (foodEntries.length) {
    const maxFood = Math.max(...foodEntries.map(e => e[1].total));
    const foodGroup = document.createElement('div');
    foodGroup.className = 'pattern-group';
    foodGroup.innerHTML = '<h3>Potential Triggers (by meal)</h3>';

    foodEntries.slice(0, 10).forEach(([food, data]) => {
      const detail = `${data.total} symptom links, avg severity ${data.avgSeverity}`;
      foodGroup.appendChild(renderBar(food, data.total, maxFood, 'meal-bar', detail));
    });

    container.appendChild(foodGroup);
  }
}

function renderBar(label, value, max, colorClass, detail) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pattern-bar-container';

  const pct = Math.round((value / max) * 100);

  wrapper.innerHTML = `
    <div class="pattern-bar-label">
      <span>${label}</span>
      <span class="count">${detail}</span>
    </div>
    <div class="pattern-bar">
      <div class="pattern-bar-fill ${colorClass}" style="width: ${pct}%"></div>
    </div>
  `;

  return wrapper;
}

// ── Export ──────────────────────────────────────────────────

function escapeCsv(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

document.getElementById('export-csv').addEventListener('click', () => {
  const entries = getAllEntries();
  if (!entries.length) { showToast('No data to export'); return; }

  const headers = ['type', 'date', 'name', 'tags', 'symptom_type', 'severity', 'bristol_type', 'urgency', 'notes'];
  const rows = [headers.join(',')];

  entries.forEach(e => {
    const row = [
      e.type,
      e.time,
      e.type === 'meal' ? e.name : '',
      e.type === 'meal' && e.tags ? e.tags.join('; ') : '',
      e.type === 'symptom' ? e.symptomType : '',
      e.type === 'symptom' ? e.severity : '',
      e.type === 'bm' ? e.bristolType : '',
      e.type === 'bm' ? e.urgency : '',
      e.notes || '',
    ];
    rows.push(row.map(escapeCsv).join(','));
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ibs-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV downloaded');
});

document.getElementById('export-md').addEventListener('click', () => {
  const entries = getAllEntries();
  if (!entries.length) { showToast('No data to export'); return; }

  const byDate = {};
  entries.forEach(e => {
    const d = new Date(e.time);
    const key = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(e);
  });

  let md = '# IBS Tracker Data\n\n';
  md += `Exported: ${new Date().toLocaleString()}\n`;
  md += `Total entries: ${entries.length} (${getMeals().length} meals, ${getSymptoms().length} symptoms, ${getBMs().length} bowel movements)\n\n`;
  md += '---\n\n';

  for (const [date, dayEntries] of Object.entries(byDate)) {
    md += `## ${date}\n\n`;

    dayEntries.forEach(e => {
      const time = new Date(e.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

      if (e.type === 'meal') {
        md += `- **Meal** (${time}): ${e.name}`;
        if (e.tags && e.tags.length) md += ` [${e.tags.join(', ')}]`;
        if (e.notes) md += ` -- ${e.notes}`;
        md += '\n';
      } else if (e.type === 'symptom') {
        md += `- **Symptom** (${time}): ${symptomLabel(e.symptomType)}, severity ${e.severity}/10`;
        if (e.notes) md += ` -- ${e.notes}`;
        md += '\n';
      } else if (e.type === 'bm') {
        md += `- **Bowel Movement** (${time}): Bristol type ${e.bristolType}`;
        if (e.urgency && e.urgency !== 'none') md += `, ${e.urgency} urgency`;
        if (e.notes) md += ` -- ${e.notes}`;
        md += '\n';
      }
    });

    md += '\n';
  }

  navigator.clipboard.writeText(md).then(() => {
    showToast('Copied to clipboard');
  }).catch(() => {
    const w = window.open('', '_blank');
    w.document.write('<pre>' + md.replace(/</g, '&lt;') + '</pre>');
    showToast('Opened in new tab (clipboard blocked)');
  });
});

// ── Dashboard Refresh ───────────────────────────────────────

function refreshDashboard() {
  renderCalendar();
  renderRecentEntries();
  document.getElementById('day-detail').classList.add('hidden');
}

// ── Service Worker ──────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// ── Init ────────────────────────────────────────────────────

refreshDashboard();
