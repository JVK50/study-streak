/* ===== KONSTANTA ===== */
const MIN_SECONDS = 3600; // syarat minimal 1 jam
const STORAGE_KEY = "study-streak-data";
const ACTIVE_KEY = "study-streak-active-session";
const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const RING_RADIUS = 90;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/* ===== STATE ===== */
let data = null;
let startTime = null;
let elapsed = 0;
let intervalId = null;

/* ===== REFERENSI DOM ===== */
const screens = {
  home: document.getElementById("screen-home"),
  active: document.getElementById("screen-active"),
  summary: document.getElementById("screen-summary"),
};

const el = {
  streakCount: document.getElementById("streak-count"),
  flameIcon: document.getElementById("flame-icon"),
  weekStrip: document.getElementById("week-strip"),
  statSessions: document.getElementById("stat-sessions"),
  statRecord: document.getElementById("stat-record"),
  statHours: document.getElementById("stat-hours"),
  btnStart: document.getElementById("btn-start"),

  progressRing: document.getElementById("progress-ring"),
  timerText: document.getElementById("timer-text"),
  activeStatus: document.getElementById("active-status"),
  ringFlame: document.getElementById("ring-flame"),
  btnStop: document.getElementById("btn-stop"),

  summaryIconWrap: document.getElementById("summary-icon-wrap"),
  summaryIcon: document.getElementById("summary-icon"),
  summaryTitle: document.getElementById("summary-title"),
  summaryMessage: document.getElementById("summary-message"),
  summaryStreakRow: document.getElementById("summary-streak-row"),
  summaryStreakText: document.getElementById("summary-streak-text"),
  btnBack: document.getElementById("btn-back"),

  modal: document.getElementById("modal-confirm"),
  modalElapsedText: document.getElementById("modal-elapsed-text"),
  btnCancelStop: document.getElementById("btn-cancel-stop"),
  btnConfirmStop: document.getElementById("btn-confirm-stop"),
};

/* ===== UTIL TANGGAL & FORMAT ===== */
function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db - da) / 86400000);
}

function formatHMS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatHoursLabel(totalSeconds) {
  return (totalSeconds / 3600).toFixed(1) + " jam";
}

/* ===== DATA (localStorage) ===== */
function defaultData() {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: null,
    totalSessions: 0,
    totalSeconds: 0,
    history: {}, // "YYYY-MM-DD": { seconds, sessions }
  };
}

function normalizeStreak(d) {
  if (!d.lastStudyDate) return d;
  const diff = daysBetween(d.lastStudyDate, todayStr());
  if (diff > 1) {
    return { ...d, currentStreak: 0 };
  }
  return d;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    return normalizeStreak(JSON.parse(raw));
  } catch (e) {
    console.error("Gagal membaca data, memakai data default.", e);
    return defaultData();
  }
}

function saveData(d) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch (e) {
    console.error("Gagal menyimpan data streak.", e);
  }
}

function saveActiveSession(start) {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ startTime: start }));
  } catch (e) {
    console.error("Gagal menyimpan sesi aktif.", e);
  }
}

function loadActiveSession() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearActiveSession() {
  localStorage.removeItem(ACTIVE_KEY);
}

/* ===== NAVIGASI LAYAR ===== */
function showScreen(name) {
  Object.keys(screens).forEach((key) => {
    screens[key].style.display = key === name ? "flex" : "none";
  });
}

/* ===== RENDER: HOME ===== */
function renderHome() {
  const lit = data.currentStreak > 0;

  el.streakCount.textContent = data.currentStreak;
  el.streakCount.style.color = lit ? "#3C3C3C" : "#AFAFAF";
  el.flameIcon.setAttribute("fill", lit ? "#FF9600" : "#E5E5E5");

  renderWeekStrip();

  el.statSessions.textContent = data.totalSessions;
  el.statRecord.textContent = data.longestStreak;
  el.statHours.textContent = formatHoursLabel(data.totalSeconds);
}

function renderWeekStrip() {
  el.weekStrip.innerHTML = "";
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = todayStr(d);
    const entry = data.history[key];
    const done = entry && entry.seconds >= MIN_SECONDS;
    const isToday = i === 0;

    const col = document.createElement("div");
    col.className = "day-col";

    const label = document.createElement("div");
    label.className = "day-label" + (isToday ? " is-today" : "");
    label.textContent = DAY_LABELS[d.getDay()];

    const dot = document.createElement("div");
    dot.className =
      "day-dot" + (done ? " done" : "") + (isToday && !done ? " is-today-empty" : "");

    if (done) {
      dot.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF9600">
          <path d="M12 2c1 3-2 4-2 7a3 3 0 006 0c0-1-1-2-1-2 2 1 3 3 3 5a6 6 0 01-12 0c0-4 3-6 3-10 0 0 2 1 3 0z"/>
        </svg>`;
    }

    col.appendChild(label);
    col.appendChild(dot);
    el.weekStrip.appendChild(col);
  }
}

/* ===== RENDER: ACTIVE ===== */
function initRing() {
  el.progressRing.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
}

function renderActiveTick() {
  const progress = Math.min(elapsed / MIN_SECONDS, 1);
  const reached = elapsed >= MIN_SECONDS;
  const offset = RING_CIRCUMFERENCE * (1 - progress);

  el.progressRing.style.strokeDashoffset = `${offset}`;
  el.progressRing.setAttribute("stroke", reached ? "#58CC02" : "#FF9600");
  el.ringFlame.setAttribute("fill", reached ? "#58CC02" : "#FF9600");

  el.timerText.textContent = formatHMS(elapsed);

  el.activeStatus.textContent = reached ? "Target 1 jam tercapai!" : "Menuju target 1 jam…";
  el.activeStatus.classList.toggle("reached", reached);
}

/* ===== RENDER: SUMMARY ===== */
function renderSummary(result) {
  const { elapsed: finalElapsed, valid, streakEarned, streak } = result;

  el.summaryIconWrap.classList.toggle("not-valid", !valid);
  el.summaryIcon.innerHTML = valid
    ? `<path d="M5 13l4 4L19 7" stroke="#58CC02" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M6 6l12 12M18 6L6 18" stroke="#FF9600" stroke-width="3" stroke-linecap="round"/>`;

  el.summaryTitle.textContent = valid ? "Kerja Bagus!" : "Sesi Tidak Mencukupi";

  if (valid) {
    el.summaryMessage.textContent = streakEarned
      ? `Kamu belajar selama ${formatHMS(finalElapsed)}. Streak bertambah menjadi ${streak} hari.`
      : `Kamu belajar selama ${formatHMS(finalElapsed)}. Streak hari ini sudah tercatat sebelumnya.`;
    el.summaryStreakRow.style.display = "flex";
    el.summaryStreakText.textContent = `${streak} Hari Beruntun`;
  } else {
    el.summaryMessage.textContent = `Sesi hanya berlangsung ${formatHMS(
      finalElapsed
    )}, kurang dari 1 jam sehingga streak tidak bertambah.`;
    el.summaryStreakRow.style.display = "none";
  }
}

/* ===== LOGIKA SESI & STREAK ===== */
function startSession() {
  startTime = Date.now();
  elapsed = 0;
  saveActiveSession(startTime);

  showScreen("active");
  renderActiveTick();

  intervalId = setInterval(tick, 1000);
}

function tick() {
  elapsed = Math.floor((Date.now() - startTime) / 1000);
  renderActiveTick();
}

function requestStop() {
  if (elapsed < MIN_SECONDS) {
    el.modalElapsedText.textContent = `Sesi ini baru ${formatHMS(
      elapsed
    )}. Jika dihentikan sekarang, streak tidak akan bertambah.`;
    el.modal.style.display = "flex";
  } else {
    finishSession(true);
  }
}

function finishSession(valid) {
  clearInterval(intervalId);
  intervalId = null;
  el.modal.style.display = "none";
  clearActiveSession();

  const finalElapsed = elapsed;
  let streakEarned = false;

  if (valid) {
    const today = todayStr();
    const prevToday = data.history[today] || { seconds: 0, sessions: 0 };
    data.history[today] = {
      seconds: prevToday.seconds + finalElapsed,
      sessions: prevToday.sessions + 1,
    };

    if (data.lastStudyDate === today) {
      // sesi kedua di hari yang sama, streak tidak bertambah lagi
    } else if (data.lastStudyDate && daysBetween(data.lastStudyDate, today) === 1) {
      data.currentStreak += 1;
      streakEarned = true;
    } else {
      data.currentStreak = 1;
      streakEarned = true;
    }

    data.longestStreak = Math.max(data.longestStreak, data.currentStreak);
    data.lastStudyDate = today;
    data.totalSessions += 1;
    data.totalSeconds += finalElapsed;

    saveData(data);
  }

  renderSummary({
    elapsed: finalElapsed,
    valid,
    streakEarned,
    streak: data.currentStreak,
  });
  showScreen("summary");
}

function backHome() {
  startTime = null;
  elapsed = 0;
  renderHome();
  showScreen("home");
}

/* ===== EVENT LISTENERS ===== */
el.btnStart.addEventListener("click", startSession);
el.btnStop.addEventListener("click", requestStop);
el.btnCancelStop.addEventListener("click", () => {
  el.modal.style.display = "none";
});
el.btnConfirmStop.addEventListener("click", () => finishSession(false));
el.btnBack.addEventListener("click", backHome);

/* ===== INISIALISASI SAAT HALAMAN DIBUKA ===== */
function init() {
  data = loadData();
  initRing();

  const active = loadActiveSession();
  if (active && active.startTime) {
    startTime = active.startTime;
    elapsed = Math.floor((Date.now() - startTime) / 1000);
    showScreen("active");
    renderActiveTick();
    intervalId = setInterval(tick, 1000);
    return;
  }

  renderHome();
  showScreen("home");
}

init();