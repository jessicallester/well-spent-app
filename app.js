// ---- Storage ----
var STORAGE_KEY = 'wellSpentData';

function load() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { currentPeriod: null, merchantMemory: [], lastStartingAmount: null };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

var state = load();
var editing = null, mode = 'spend';

// ---- Helpers ----
function addDays(n) {
  var d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function money(n) {
  return '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: Math.abs(n) % 1 ? 2 : 0,
    maximumFractionDigits: 2
  });
}

function balance() {
  var p = state.currentPeriod;
  if (!p) return 0;
  return p.entries.reduce(function (t, e) {
    return e.type === 'money_in' ? t + e.amount : t - e.amount;
  }, p.startingAmount);
}

function spent() {
  var p = state.currentPeriod;
  if (!p) return 0;
  return p.entries.reduce(function (t, e) {
    return e.type === 'spend' ? t + e.amount : t;
  }, 0);
}

function daysLeft() {
  var payday = new Date(state.currentPeriod.paydayDate + 'T00:00:00');
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((payday - today) / 86400000);
}

function rememberMerchant(desc) {
  if (!desc) return;
  var idx = state.merchantMemory.findIndex(function (m) {
    return m.toLowerCase() === desc.toLowerCase();
  });
  if (idx !== -1) state.merchantMemory.splice(idx, 1);
  state.merchantMemory.unshift(desc);
  if (state.merchantMemory.length > 30) state.merchantMemory.length = 30;
}

// ---- Home rendering ----
function render() {
  var p = state.currentPeriod;
  var b = p ? balance() : 0;
  var over = b < 0;

  var hero = document.getElementById('hero');
  hero.textContent = money(b);
  hero.className = over ? 'over' : '';
  document.getElementById('eyebrow').textContent = over ? 'Over by' : 'Variable Spend Left';

  var daysEl = document.getElementById('days');
  if (!p) {
    daysEl.textContent = '—';
  } else {
    var d = daysLeft();
    daysEl.textContent =
      d > 1 ? d + ' days until payday' :
      d === 1 ? 'Payday is tomorrow' :
      d === 0 ? 'Payday is today' : 'Payday has passed';
  }

  var startAmount = p ? p.startingAmount : 0;
  document.getElementById('progress').textContent = p ? (money(spent()) + ' of ' + money(startAmount) + ' spent') : '—';

  var fill = document.getElementById('barfill');
  fill.style.width = p ? Math.min(100, Math.max(0, spent() / startAmount * 100)) + '%' : '0%';
  fill.className = over ? 'over' : '';

  var entries = p ? p.entries : [];
  var n = entries.length;
  document.getElementById('count').textContent = n ? (n + (n === 1 ? ' entry' : ' entries')) : '';

  var list = document.getElementById('list');
  if (!n) {
    list.innerHTML = '<div class="empty">Nothing logged yet. Tap + Add Spend when you buy something.</div>';
  } else {
    list.innerHTML = entries.slice().reverse().map(function (e) {
      return '<div class="row" onclick="openEntry(\'' + e.type + '\',\'' + e.id + '\')">' +
        '<div class="name">' + (e.description || 'No note') + '</div>' +
        '<div class="amt ' + (e.type === 'money_in' ? 'in' : '') + '">' + (e.type === 'money_in' ? '+' : '−') + money(e.amount) + '</div>' +
      '</div>';
    }).join('') + '<div style="height:26px"></div>';
  }

  document.getElementById('resetBtn').style.display = p ? 'block' : 'none';
}

// ---- Sheets ----
function closeSheets() {
  ['entrySheet', 'winSheet', 'setupSheet'].forEach(function (id) {
    document.getElementById(id).classList.remove('show');
  });
  editing = null;
}

function openEntry(type, id) {
  if (!state.currentPeriod) return;
  closeSheets();
  mode = type;
  editing = null;
  var a = document.getElementById('amt'), ds = document.getElementById('desc');
  a.value = '';
  ds.value = '';
  document.getElementById('delBtn').style.display = 'none';
  document.getElementById('entryTitle').textContent = type === 'money_in' ? 'Add money' : 'Add spend';
  a.style.color = type === 'money_in' ? 'var(--fern)' : 'var(--clay)';

  if (id !== undefined) {
    var e = state.currentPeriod.entries.find(function (x) { return x.id === id; });
    if (e) {
      editing = e;
      a.value = e.amount;
      ds.value = e.description;
      document.getElementById('entryTitle').textContent = 'Edit entry';
      document.getElementById('delBtn').style.display = 'block';
    }
  }

  document.getElementById('chips').innerHTML = state.merchantMemory.slice(0, 5).map(function (m) {
    return '<div class="chip" onclick="document.getElementById(\'desc\').value=' + JSON.stringify(m) + '">' + m + '</div>';
  }).join('');

  document.getElementById('entrySheet').classList.add('show');
  setTimeout(function () { a.focus(); }, 60);
}

function saveEntry() {
  var v = parseFloat(document.getElementById('amt').value);
  if (!v || v <= 0) {
    document.getElementById('amt').style.borderColor = 'var(--brick)';
    return;
  }
  var d = document.getElementById('desc').value.trim();

  if (editing) {
    editing.amount = v;
    editing.description = d;
  } else {
    state.currentPeriod.entries.push({
      id: uid(), amount: v, type: mode, description: d, createdAt: new Date().toISOString()
    });
  }
  rememberMerchant(d);
  save();
  closeSheets();
  render();
}

function deleteEntry() {
  state.currentPeriod.entries = state.currentPeriod.entries.filter(function (x) { return x !== editing; });
  save();
  closeSheets();
  render();
}

function openWin() {
  if (!state.currentPeriod) return;
  closeSheets();
  var b = balance(), near = Math.abs(b) <= 10;
  var n = document.getElementById('winnum'), line = document.getElementById('winline'), sub = document.getElementById('winsub');
  n.textContent = money(b);
  if (b === 0) {
    n.className = 'target'; line.textContent = 'You landed exactly on';
    sub.textContent = 'Not a dollar wasted. That almost never happens.';
  } else if (near) {
    n.className = 'target'; line.textContent = 'You ended right on target';
    sub.textContent = b > 0
      ? money(b) + ' left over — that\'s about as close as it gets.'
      : money(b) + ' over. Don\'t sweat the small stuff — that\'s about as close as it gets.';
  } else if (b < 0) {
    n.className = 'over'; line.textContent = 'You went over by';
    sub.textContent = 'It happens. Next period is a fresh start.';
  } else {
    n.className = ''; line.textContent = 'You finished with';
    sub.textContent = "That's " + money(b) + " you didn't spend. Nice work.";
  }
  document.getElementById('winSheet').classList.add('show');
}

function openSetup(isFirstRun) {
  closeSheets();
  var title = document.getElementById('setupTitle');
  var cancelBtn = document.getElementById('setupCancelBtn');
  var note = document.getElementById('setupNote');
  var startAmt = document.getElementById('startAmt');

  if (isFirstRun) {
    title.textContent = "Let's get started";
    cancelBtn.style.display = 'none';
    note.textContent = 'Your data lives only on this device — clearing browser data will erase it.';
    startAmt.value = state.lastStartingAmount || '';
  } else {
    title.textContent = 'New pay period';
    cancelBtn.style.display = 'block';
    note.textContent = 'This clears everything from the last period. Your data lives only on this device — clearing browser data will erase it.';
    startAmt.value = state.currentPeriod ? state.currentPeriod.startingAmount : (state.lastStartingAmount || '');
  }
  document.getElementById('payday').value = addDays(14);
  document.getElementById('setupSheet').classList.add('show');
  setTimeout(function () { startAmt.focus(); }, 60);
}

function startPeriod() {
  var v = parseFloat(document.getElementById('startAmt').value);
  if (!v || v <= 0) {
    document.getElementById('startAmt').style.borderColor = 'var(--brick)';
    return;
  }
  var payday = document.getElementById('payday').value || addDays(14);
  state.currentPeriod = {
    startingAmount: v,
    paydayDate: payday,
    startedAt: new Date().toISOString(),
    entries: []
  };
  state.lastStartingAmount = v;
  save();
  closeSheets();
  render();
}

document.getElementById('amt').addEventListener('input', function () { this.style.borderColor = ''; });
document.getElementById('startAmt').addEventListener('input', function () { this.style.borderColor = ''; });

// ---- Install prompt ----
var deferredPrompt = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBtn').style.display = 'inline-block';
});
document.getElementById('installBtn').addEventListener('click', function () {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(function () {
    deferredPrompt = null;
    document.getElementById('installBtn').style.display = 'none';
  });
});
window.addEventListener('appinstalled', function () {
  document.getElementById('installBtn').style.display = 'none';
});

// ---- Service worker ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}

// ---- Boot ----
render();
if (!state.currentPeriod) {
  openSetup(true);
}
