/* ============================================================
   tape_ — logique client
   ============================================================ */
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const now = () => Date.now();
const esc = (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c);

/* ---------- Navigation entre écrans ---------- */
const screens = {};
$$(".screen").forEach((s) => (screens[s.id.replace("screen-", "")] = s));
let currentScreen = "home";

function go(name) {
  if (!screens[name]) return;
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
  currentScreen = name;
  onEnter[name] && onEnter[name]();
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-go]");
  if (t) go(t.dataset.go);
});

const onEnter = {}; // remplis plus bas

/* ---------- Thème ---------- */
const themeBtn = $("#theme-toggle");
const savedTheme = localStorage.getItem("tape-theme");
if (savedTheme === "light") document.documentElement.setAttribute("data-theme", "light");
themeBtn.addEventListener("click", () => {
  const light = document.documentElement.getAttribute("data-theme") === "light";
  if (light) { document.documentElement.removeAttribute("data-theme"); localStorage.setItem("tape-theme", "dark"); }
  else { document.documentElement.setAttribute("data-theme", "light"); localStorage.setItem("tape-theme", "light"); }
});

/* ============================================================
   MOTEUR DE FRAPPE (réutilisable)
   ============================================================ */
function createEngine(typingEl) {
  const streamEl = $(".words", typingEl);
  let words = [], input = [""], cur = 0;
  let started = false, finished = false, startTime = 0;
  let keystrokes = 0, correctKeys = 0, finite = true, spectator = false;
  let wordEls = [], caretEl = null;
  let cb = { start() {}, progress() {}, finish() {} };

  function load(targetStr, opts = {}) {
    words = targetStr.trim().split(/\s+/);
    finite = opts.finite !== false;
    reset();
  }
  function reset() {
    input = [""]; cur = 0; started = false; finished = false;
    startTime = 0; keystrokes = 0; correctKeys = 0;
    render();
  }
  function render() {
    streamEl.style.transform = "translateY(0)";
    streamEl.innerHTML = "";
    wordEls = words.map((w, i) => {
      const el = document.createElement("div");
      el.className = "word";
      streamEl.appendChild(el);
      return el;
    });
    caretEl = document.createElement("div");
    caretEl.className = "caret";
    streamEl.appendChild(caretEl);
    words.forEach((_, i) => paintWord(i));
    updateCaret();
  }
  function paintWord(i) {
    const el = wordEls[i], w = words[i], t = input[i] || "";
    let html = "";
    for (let j = 0; j < w.length; j++) {
      let cls = "l";
      if (j < t.length) cls += t[j] === w[j] ? " correct" : " wrong";
      html += `<span class="${cls}">${esc(w[j])}</span>`;
    }
    for (let j = w.length; j < t.length; j++) html += `<span class="l extra">${esc(t[j])}</span>`;
    el.innerHTML = html;
  }
  function updateCaret() {
    if (!caretEl || !wordEls[cur]) return;
    const wordEl = wordEls[cur];
    const spans = wordEl.querySelectorAll(".l");
    const li = (input[cur] || "").length;
    // offsetLeft/Top des lettres sont relatifs à .words (seul parent positionné)
    let left, top, h;
    if (li < spans.length) {
      const r = spans[li];
      left = r.offsetLeft; top = r.offsetTop; h = r.offsetHeight;
    } else if (spans.length) {
      const r = spans[spans.length - 1];
      left = r.offsetLeft + r.offsetWidth; top = r.offsetTop; h = r.offsetHeight;
    } else {
      left = wordEl.offsetLeft; top = wordEl.offsetTop; h = wordEl.offsetHeight || 30;
    }
    caretEl.style.left = left + "px";
    caretEl.style.top = top + "px";
    caretEl.style.height = h + "px";
    streamEl.style.transform = `translateY(${-top}px)`;
  }
  function startTest() {
    started = true; startTime = now();
    cb.start();
  }
  function key(e) {
    if (finished || spectator) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === "Tab") return; // géré globalement (restart)
    if (k === "Backspace") {
      e.preventDefault();
      if ((input[cur] || "").length > 0) { input[cur] = input[cur].slice(0, -1); paintWord(cur); }
      else if (cur > 0) { cur--; paintWord(cur); }
      updateCaret();
      return;
    }
    if (k === " " || k === "Enter") {
      e.preventDefault();
      if ((input[cur] || "").length === 0) return;
      if (cur < words.length - 1) { cur++; if (input[cur] === undefined) input[cur] = ""; updateCaret(); checkFinish(); cb.progress(stats()); }
      else if (finite) finish();
      return;
    }
    if (k.length !== 1) return;
    e.preventDefault();
    if (!started) startTest();
    const expected = words[cur][(input[cur] || "").length];
    keystrokes++;
    if (k === expected) correctKeys++;
    if ((input[cur] || "").length < words[cur].length + 8) {
      input[cur] = (input[cur] || "") + k;
      paintWord(cur); updateCaret();
    }
    checkFinish();
    cb.progress(stats());
  }
  function checkFinish() {
    if (!finite || finished) return;
    if (cur === words.length - 1 && (input[cur] || "").length >= words[cur].length) finish();
  }
  function finish() {
    if (finished) return;
    finished = true;
    cb.finish(stats());
  }
  function stats() {
    const elapsedMs = started ? now() - startTime : 0;
    const minutes = elapsedMs / 60000;
    let typedCorrect = 0, totalTarget = 0;
    for (let i = 0; i < words.length; i++) totalTarget += words[i].length + (i < words.length - 1 ? 1 : 0);
    for (let i = 0; i <= cur && i < words.length; i++) {
      const t = input[i] || "", w = words[i];
      for (let j = 0; j < t.length && j < w.length; j++) if (t[j] === w[j]) typedCorrect++;
      if (i < cur && t === w) typedCorrect++; // crédite l'espace
    }
    const wpm = minutes > 0 ? Math.round(typedCorrect / 5 / minutes) : 0;
    const accuracy = keystrokes > 0 ? Math.round((correctKeys / keystrokes) * 100) : 100;
    const progress = finite ? Math.min(100, Math.round((typedCorrect / Math.max(1, totalTarget)) * 100)) : 0;
    return { wpm, accuracy, correctChars: typedCorrect, elapsedMs, progress };
  }

  // focus / flou
  typingEl.addEventListener("keydown", key);
  typingEl.addEventListener("focus", () => { if (!spectator) typingEl.classList.remove("blur"); });
  typingEl.addEventListener("blur", () => typingEl.classList.add("blur"));
  typingEl.addEventListener("mousedown", () => { if (!spectator) setTimeout(() => typingEl.focus(), 0); });
  window.addEventListener("resize", () => updateCaret());

  return {
    load, reset,
    focus: () => { if (!spectator) typingEl.focus(); },
    forceFinish: finish,
    stats,
    on: (events) => { cb = { ...cb, ...events }; },
    isStarted: () => started,
    isFinished: () => finished,
    setBlur: (b) => typingEl.classList.toggle("blur", b),
    setSpectator: (b) => { spectator = b; typingEl.classList.toggle("spectator", b); if (b) typingEl.blur(); },
    el: typingEl,
  };
}

/* fonction mpm/format */
function fmt(n) { return Math.round(n); }

/* ============================================================
   SOLO — MOTS COURANTS
   ============================================================ */
const wordsEngine = createEngine($("#words-typing"));
let wordsDuration = 30, wordsTimer = null, wordsTick = null;

function setupWords() {
  const enough = Math.max(60, Math.round(wordsDuration * 4));
  wordsEngine.load(generateWords(enough), { finite: false });
  $("#words-timer").textContent = wordsDuration;
  $("#words-wpm").textContent = "0 mpm";
  clearInterval(wordsTick); clearTimeout(wordsTimer);
}
wordsEngine.on({
  start() {
    let remaining = wordsDuration;
    wordsTick = setInterval(() => {
      const s = wordsEngine.stats();
      remaining = Math.max(0, wordsDuration - Math.floor(s.elapsedMs / 1000));
      $("#words-timer").textContent = remaining;
      $("#words-wpm").textContent = s.wpm + " mpm";
    }, 100);
    wordsTimer = setTimeout(() => {
      clearInterval(wordsTick);
      wordsEngine.forceFinish();
    }, wordsDuration * 1000);
  },
  progress(s) { $("#words-wpm").textContent = s.wpm + " mpm"; },
  finish(s) {
    clearInterval(wordsTick); clearTimeout(wordsTimer);
    showResult({ ...s, elapsedMs: wordsDuration * 1000 }, "mots courants");
  },
});
$$("#words-options .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#words-options .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    wordsDuration = +b.dataset.dur;
    setupWords(); wordsEngine.focus();
  })
);
onEnter["solo-words"] = () => { setupWords(); setTimeout(() => wordsEngine.focus(), 30); };

/* ============================================================
   SOLO — TEXTE
   ============================================================ */
const textEngine = createEngine($("#text-typing"));
$("#text-typing").classList.add("text-mode");
let textTick = null;
let lastTextIdx = -1;

function pickText() {
  let i; do { i = Math.floor(Math.random() * TEXTS.length); } while (i === lastTextIdx && TEXTS.length > 1);
  lastTextIdx = i;
  return TEXTS[i];
}
function setupText() {
  textEngine.load(pickText(), { finite: true });
  $("#text-progress").textContent = "0%";
  $("#text-wpm").textContent = "0 mpm";
  clearInterval(textTick);
}
textEngine.on({
  start() {
    textTick = setInterval(() => {
      const s = textEngine.stats();
      $("#text-progress").textContent = s.progress + "%";
      $("#text-wpm").textContent = s.wpm + " mpm";
    }, 100);
  },
  progress(s) {
    $("#text-progress").textContent = s.progress + "%";
    $("#text-wpm").textContent = s.wpm + " mpm";
  },
  finish(s) { clearInterval(textTick); showResult(s, "texte"); },
});
$("#text-shuffle").addEventListener("click", () => { setupText(); textEngine.focus(); });
onEnter["solo-text"] = () => { setupText(); setTimeout(() => textEngine.focus(), 30); };

/* ============================================================
   SOLO — ZEN (sans chrono, nombre de mots à finir)
   ============================================================ */
const zenEngine = createEngine($("#zen-typing"));
let zenCount = 50, zenTick = null;

function setupZen() {
  zenEngine.load(generateWords(zenCount), { finite: true });
  $("#zen-progress").textContent = "0%";
  $("#zen-wpm").textContent = "0 mpm";
  clearInterval(zenTick);
}
zenEngine.on({
  start() {
    zenTick = setInterval(() => {
      const s = zenEngine.stats();
      $("#zen-progress").textContent = s.progress + "%";
      $("#zen-wpm").textContent = s.wpm + " mpm";
    }, 100);
  },
  progress(s) {
    $("#zen-progress").textContent = s.progress + "%";
    $("#zen-wpm").textContent = s.wpm + " mpm";
  },
  finish(s) { clearInterval(zenTick); showResult(s, "zen"); },
});
$$("#zen-options .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#zen-options .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    zenCount = +b.dataset.count;
    setupZen(); zenEngine.focus();
  })
);
onEnter["solo-zen"] = () => { setupZen(); setTimeout(() => zenEngine.focus(), 30); };

/* ============================================================
   SOLO — DIFFICILE (chrono, mots à accents / compliqués)
   ============================================================ */
const hardEngine = createEngine($("#hard-typing"));
let hardDuration = 30, hardTimer = null, hardTick = null;

function setupHard() {
  const enough = Math.max(40, Math.round(hardDuration * 2.5));
  hardEngine.load(generateHardWords(enough), { finite: false });
  $("#hard-timer").textContent = hardDuration;
  $("#hard-wpm").textContent = "0 mpm";
  clearInterval(hardTick); clearTimeout(hardTimer);
}
hardEngine.on({
  start() {
    hardTick = setInterval(() => {
      const s = hardEngine.stats();
      $("#hard-timer").textContent = Math.max(0, hardDuration - Math.floor(s.elapsedMs / 1000));
      $("#hard-wpm").textContent = s.wpm + " mpm";
    }, 100);
    hardTimer = setTimeout(() => { clearInterval(hardTick); hardEngine.forceFinish(); }, hardDuration * 1000);
  },
  progress(s) { $("#hard-wpm").textContent = s.wpm + " mpm"; },
  finish(s) { clearInterval(hardTick); clearTimeout(hardTimer); showResult({ ...s, elapsedMs: hardDuration * 1000 }, "difficile"); },
});
$$("#hard-options .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#hard-options .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    hardDuration = +b.dataset.dur;
    setupHard(); hardEngine.focus();
  })
);
onEnter["solo-hard"] = () => { setupHard(); setTimeout(() => hardEngine.focus(), 30); };

/* ---------- Tab = recommencer (sur écrans solo) ---------- */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  if (currentScreen === "solo-words") { e.preventDefault(); setupWords(); wordsEngine.focus(); }
  else if (currentScreen === "solo-text") { e.preventDefault(); setupText(); textEngine.focus(); }
  else if (currentScreen === "solo-zen") { e.preventDefault(); setupZen(); zenEngine.focus(); }
  else if (currentScreen === "solo-hard") { e.preventDefault(); setupHard(); hardEngine.focus(); }
});

/* ============================================================
   RÉSULTAT SOLO
   ============================================================ */
let lastSoloMode = "solo-words";
function showResult(s, label) {
  lastSoloMode = label === "texte" ? "solo-text" : label === "zen" ? "solo-zen"
    : label === "difficile" ? "solo-hard" : "solo-words";
  $("#res-wpm").textContent = fmt(s.wpm);
  $("#res-acc").textContent = fmt(s.accuracy);
  $("#res-chars").textContent = s.correctChars;
  $("#res-time").textContent = Math.round(s.elapsedMs / 1000);
  $("#res-mode").textContent = label;
  go("result");
}
$("#res-again").addEventListener("click", () => go(lastSoloMode));

/* ============================================================
   MULTIJOUEUR
   ============================================================ */
const raceEngine = createEngine($("#race-typing"));
$("#race-typing").classList.add("text-mode");

let ws = null, wsReady = false;
let me = { id: null, name: "" };
let room = { code: null, mode: "course", isHost: false, players: [] };
let mpModePick = "course";
let raceTick = null, lastSent = 0, roundLocalTimer = null, sentFinished = false, amEliminated = false;
let patateHolder = null, patatePassed = false, patateWord = "";

const MODE_DESC = {
  course: "Tout le monde tape le même texte. Le premier à finir gagne. Barres de progression en direct.",
  elimination: "Manches de 18s. À chaque manche, le joueur le plus lent est éliminé. Le dernier survivant gagne.",
  patate: "Une bombe passe de joueur en joueur : tape ton mot pour la refiler. Celui qui la tient quand elle explose est éliminé.",
  hard: "Comme la course, mais avec des mots difficiles et pleins d'accents. Le premier à finir gagne.",
};

function connect() {
  const status = $("#conn-status");
  if (location.protocol === "file:") {
    status.textContent = "mode hors-ligne — lance le serveur Node pour jouer en ligne";
    status.className = "conn-status err";
    return;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  try { ws = new WebSocket(`${proto}://${location.host}`); }
  catch { status.textContent = "serveur injoignable"; status.className = "conn-status err"; return; }

  ws.addEventListener("open", () => {
    wsReady = true;
    status.textContent = "connecté au serveur";
    status.className = "conn-status ok";
  });
  ws.addEventListener("close", () => {
    wsReady = false;
    status.textContent = "déconnecté — relance le serveur puis recharge la page";
    status.className = "conn-status err";
  });
  ws.addEventListener("error", () => {
    status.textContent = "serveur injoignable — lance « node server.js »";
    status.className = "conn-status err";
  });
  ws.addEventListener("message", (ev) => handleServer(JSON.parse(ev.data)));
}
function sendWs(obj) { if (ws && wsReady) ws.send(JSON.stringify(obj)); }

/* ----- Écran d'accueil multi ----- */
onEnter["multi-home"] = () => {
  if (!ws) connect();
  $("#mp-error").textContent = "";
  $("#mp-mode-desc").textContent = MODE_DESC[mpModePick];
  const savedName = localStorage.getItem("tape-name");
  if (savedName) $("#mp-name").value = savedName;
};
$$("#mp-mode-pick .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#mp-mode-pick .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    mpModePick = b.dataset.mpmode;
    $("#mp-mode-desc").textContent = MODE_DESC[mpModePick];
  })
);
function getName() {
  const n = ($("#mp-name").value || "").trim().slice(0, 14) || "joueur";
  localStorage.setItem("tape-name", n);
  return n;
}
$("#mp-create").addEventListener("click", () => {
  if (!wsReady) { $("#mp-error").textContent = "Pas de connexion au serveur."; return; }
  sendWs({ type: "create", name: getName(), mode: mpModePick });
});
$("#mp-join").addEventListener("click", () => {
  if (!wsReady) { $("#mp-error").textContent = "Pas de connexion au serveur."; return; }
  const code = ($("#mp-code").value || "").trim().toUpperCase();
  if (code.length !== 4) { $("#mp-error").textContent = "Entre un code à 4 lettres."; return; }
  sendWs({ type: "join", code, name: getName() });
});
$("#mp-code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#mp-join").click(); });

/* ----- Salon ----- */
function renderLobby() {
  $("#lobby-code").textContent = room.code;
  // sélecteur de mode : bouton actif = mode courant ; cliquable seulement par l'hôte
  $$("#lobby-mode-pick .opt").forEach((b) => {
    b.classList.toggle("active", b.dataset.mpmode === room.mode);
    b.disabled = !room.isHost;
  });
  $("#lobby-mode-note").textContent = room.isHost ? "" : "choisi par l'hôte";
  const ul = $("#lobby-players");
  ul.innerHTML = "";
  room.players.forEach((p) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="pname">${escapeText(p.name)}${p.host ? '<span class="badge">hôte</span>' : ""}</span>
      <span class="pstate ${p.ready ? "ready" : ""}">${p.ready ? "prêt" : "en attente"}</span>`;
    ul.appendChild(li);
  });
  const meP = room.players.find((p) => p.id === me.id);
  const readyBtn = $("#lobby-ready");
  readyBtn.classList.toggle("is-ready", !!(meP && meP.ready));
  readyBtn.textContent = meP && meP.ready ? "annuler" : "je suis prêt";
  // bouton démarrer (hôte uniquement)
  const startBtn = $("#lobby-start");
  if (room.isHost) {
    startBtn.classList.remove("hidden");
    const ok = room.players.length >= 2 && room.players.every((p) => p.ready);
    startBtn.disabled = !ok;
    $("#lobby-hint").textContent = ok ? "Tout est prêt — clique sur démarrer !" :
      room.players.length < 2 ? "En attente d'au moins un autre joueur…" : "En attente que tout le monde soit prêt…";
  } else {
    startBtn.classList.add("hidden");
    $("#lobby-hint").textContent = "Quand tout le monde est prêt, l'hôte lance la partie.";
  }
}
$("#lobby-ready").addEventListener("click", () => {
  const meP = room.players.find((p) => p.id === me.id);
  sendWs({ type: "ready", ready: !(meP && meP.ready) });
});
$$("#lobby-mode-pick .opt").forEach((b) =>
  b.addEventListener("click", () => {
    if (!room.isHost) return;
    sendWs({ type: "setmode", mode: b.dataset.mpmode });
  })
);
$("#lobby-start").addEventListener("click", () => sendWs({ type: "start" }));
$("#lobby-leave").addEventListener("click", () => { sendWs({ type: "leave" }); go("multi-home"); });
$("#lobby-copy").addEventListener("click", () => {
  navigator.clipboard?.writeText(room.code);
  $("#lobby-copy").textContent = "copié !";
  setTimeout(() => ($("#lobby-copy").textContent = "copier"), 1200);
});

/* ----- Partie (course / élimination) ----- */
function renderTracks(players) {
  const wrap = $("#race-tracks");
  wrap.innerHTML = "";
  players.forEach((p) => {
    const t = document.createElement("div");
    t.className = "track" + (p.finished ? " done" : "") + (p.eliminated ? " eliminated" : "") + (p.holder ? " holder" : "");
    const isMe = p.id === me.id;
    const right = p.eliminated ? "éliminé"
      : p.holder ? "tient la bombe"
      : room.mode === "patate" ? ""
      : (p.wpm || 0) + " mpm";
    t.innerHTML = `
      <div class="track-bar">
        <div class="track-fill ${isMe ? "me" : ""}" style="width:${p.progress || 0}%"></div>
        <div class="track-label">
          <span class="tname">${escapeText(p.name)}${isMe ? " (toi)" : ""}</span>
          <span class="twpm">${right}</span>
        </div>
      </div>`;
    wrap.appendChild(t);
  });
}

function showCountdown(then) {
  const el = $("#race-countdown");
  el.classList.add("show");
  let n = 3;
  el.textContent = n;
  const iv = setInterval(() => {
    n--;
    if (n <= 0) { el.textContent = "go"; clearInterval(iv); setTimeout(() => { el.classList.remove("show"); then(); }, 500); }
    else el.textContent = n;
  }, 800);
}

function startCourseClient(cfg) {
  go("race");
  $("#race-bomb").classList.add("hidden");
  $("#race-mode-label").textContent = cfg.mode === "hard" ? "difficile" : "course";
  $("#race-info").textContent = "premier arrivé, premier servi";
  const text = cfg.mode === "hard" ? generateHardWords(cfg.count, cfg.seed) : TEXTS[cfg.textIndex];
  raceEngine.load(text, { finite: true });
  raceEngine.setSpectator(false);
  raceEngine.setBlur(true);
  sentFinished = false;
  $("#race-progress").textContent = "0%";
  $("#race-wpm").textContent = "0 mpm";
  showCountdown(() => { raceEngine.setBlur(false); raceEngine.focus(); startRaceTick(); });
}

/* ----- Patate chaude ----- */
function startPatateClient() {
  go("race");
  $("#race-bomb").classList.remove("hidden");
  $("#race-mode-label").textContent = "patate chaude";
  $("#race-info").textContent = "préparez-vous…";
  $("#race-progress").textContent = "";
  $("#race-wpm").textContent = "";
  patateHolder = null; patatePassed = false; patateWord = "";
  raceEngine.load("…", { finite: false });
  raceEngine.setSpectator(true);
  raceEngine.setBlur(true);
  $("#race-bomb-fill").style.width = "100%";
  showCountdown(() => { $("#race-info").textContent = "la bombe arrive…"; raceEngine.setBlur(false); });
}
function animateBomb(total, remaining) {
  const fill = $("#race-bomb-fill");
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  fill.style.transition = "none";
  fill.style.width = pct + "%";
  void fill.offsetWidth; // force le reflow
  fill.style.transition = "width " + remaining + "ms linear";
  fill.style.width = "0%";
}
function onPotato(msg) {
  $("#race-bomb").classList.remove("hidden");
  patateHolder = msg.holderId;
  patateWord = msg.word;
  renderTracks(msg.players.map((p) => ({ ...p, holder: p.id === msg.holderId })));
  animateBomb(msg.bombTotal, msg.bombRemaining);
  const holderName = (msg.players.find((p) => p.id === msg.holderId) || {}).name || "";
  raceEngine.load(msg.word, { finite: false });
  if (msg.holderId === me.id && !amEliminated) {
    patatePassed = false;
    $("#race-info").textContent = "à toi ! tape le mot";
    raceEngine.setSpectator(false);
    raceEngine.setBlur(false);
    raceEngine.focus();
  } else {
    $("#race-info").textContent = "au tour de " + holderName;
    raceEngine.setSpectator(true);
    raceEngine.setBlur(false);
  }
}
function startElimClient(seed, count, duration, round) {
  go("race");
  $("#race-mode-label").textContent = "élimination";
  raceEngine.load(generateWords(count, seed), { finite: false });
  raceEngine.setSpectator(amEliminated);
  clearTimeout(roundLocalTimer);

  if (amEliminated) {
    // spectateur : on regarde sans taper
    $("#race-info").textContent = "tu es éliminé · tu regardes";
    raceEngine.setBlur(false);
    return;
  }

  $("#race-info").textContent = "manche " + round + " · " + Math.round(duration / 1000) + "s";
  raceEngine.setBlur(true);
  sentFinished = false;
  $("#race-progress").textContent = "0 car.";
  $("#race-wpm").textContent = "0 mpm";
  showCountdown(() => {
    raceEngine.setBlur(false); raceEngine.focus(); startRaceTick();
    roundLocalTimer = setTimeout(() => {
      raceEngine.forceFinish();
      const s = raceEngine.stats();
      sendWs({ type: "progress", progress: s.progress, wpm: s.wpm, chars: s.correctChars });
      $("#race-info").textContent = "manche terminée — en attente du résultat…";
    }, duration);
  });
}

raceEngine.on({
  start() {},
  progress(s) {
    if (room.mode === "patate") {
      // refile la patate dès que le mot est tapé entièrement et correctement
      if (patateHolder === me.id && !patatePassed && !amEliminated && patateWord && s.correctChars >= patateWord.length) {
        patatePassed = true;
        raceEngine.setSpectator(true);
        $("#race-info").textContent = "passé !";
        sendWs({ type: "pass" });
      }
      return;
    }
    const pct = room.mode === "course" || room.mode === "hard";
    $("#race-progress").textContent = pct ? s.progress + "%" : s.correctChars + " car.";
    $("#race-wpm").textContent = s.wpm + " mpm";
    const t = now();
    if (t - lastSent > 180) {
      lastSent = t;
      sendWs({ type: "progress", progress: s.progress, wpm: s.wpm, chars: s.correctChars });
    }
  },
  finish(s) {
    if ((room.mode === "course" || room.mode === "hard") && !sentFinished) {
      sentFinished = true;
      sendWs({ type: "finished", wpm: s.wpm, accuracy: s.accuracy, time: s.elapsedMs });
      $("#race-info").textContent = "terminé — en attente des autres…";
    }
  },
});
function startRaceTick() {
  clearInterval(raceTick);
  raceTick = setInterval(() => {
    if (raceEngine.isFinished()) return;
    const s = raceEngine.stats();
    $("#race-progress").textContent = (room.mode === "course" || room.mode === "hard" ? s.progress + "%" : s.correctChars + " car.");
    $("#race-wpm").textContent = s.wpm + " mpm";
  }, 150);
}

/* ----- Résultats multi ----- */
function showMpResult(data) {
  clearInterval(raceTick); clearTimeout(roundLocalTimer);
  go("mp-result");
  const ol = $("#mpres-ranking");
  ol.innerHTML = "";
  const title = $("#mpres-title");
  const titles = { course: "course terminée", hard: "difficile terminée", elimination: "élimination terminée", patate: "patate chaude terminée" };
  title.textContent = titles[data.mode] || "résultats";
  if (data.mode === "course" || data.mode === "hard") {
    data.ranking.forEach((r, i) => {
      const li = document.createElement("li");
      const stat = r.finished ? `${r.wpm} mpm · ${r.accuracy}% · ${(r.time / 1000).toFixed(1)}s`
                              : `abandon (${r.progress}%)`;
      li.innerHTML = `<span class="rank">${i + 1}</span><span class="rname">${escapeText(r.name)}</span><span class="rstat">${stat}</span>`;
      ol.appendChild(li);
    });
  } else {
    data.ranking.forEach((r) => {
      const li = document.createElement("li");
      const medal = r.place === 1 ? "vainqueur" : r.place + "ᵉ";
      li.innerHTML = `<span class="rank">${r.place}</span><span class="rname">${escapeText(r.name)}</span><span class="rstat">${medal}</span>`;
      ol.appendChild(li);
    });
  }
}
$("#mpres-again").addEventListener("click", () => sendWs({ type: "rematch" }));

/* ----- Réception des messages serveur ----- */
function handleServer(msg) {
  switch (msg.type) {
    case "joined":
      me.id = msg.you; me.name = getName();
      room = { code: msg.code, mode: msg.mode, isHost: msg.isHost, players: msg.players };
      amEliminated = false;
      renderLobby(); go("lobby");
      break;
    case "players":
      if (msg.mode) room.mode = msg.mode;
      room.players = msg.players;
      if (currentScreen === "lobby") renderLobby();
      break;
    case "lobby": // après une revanche
      room.mode = msg.mode; room.players = msg.players;
      room.isHost = !!(room.players.find((p) => p.id === me.id)?.host);
      amEliminated = false;
      renderLobby(); go("lobby");
      break;
    case "countdown":
      // la manche arrive : on prépare l'écran (le start arrive juste après)
      break;
    case "start":
      if (msg.mode === "course") { amEliminated = false; startCourseClient({ mode: "course", textIndex: msg.textIndex }); }
      else if (msg.mode === "hard") { amEliminated = false; startCourseClient({ mode: "hard", seed: msg.seed, count: msg.count }); }
      else if (msg.mode === "patate") { startPatateClient(); }
      else startElimClient(msg.seed, msg.count, msg.duration, msg.round);
      break;
    case "potato":
      onPotato(msg);
      break;
    case "update":
      renderTracks(msg.players);
      break;
    case "roundEnd": {
      if (msg.eliminatedId === me.id) amEliminated = true;
      clearTimeout(roundLocalTimer); clearInterval(raceTick);
      raceEngine.setSpectator(true);
      if (room.mode === "patate") { const f = $("#race-bomb-fill"); f.style.transition = "none"; f.style.width = "0%"; }
      renderTracks(msg.standings.map((s) => ({ ...s, progress: 0 })));
      const suffix = msg.eliminatedId === me.id ? " — tu es éliminé !" : "";
      $("#race-info").textContent = `${escapeText(msg.eliminated)} éliminé · ${msg.remaining} restant(s)${suffix}`;
      break;
    }
    case "result":
      showMpResult(msg);
      break;
    case "error":
      if (currentScreen === "multi-home") $("#mp-error").textContent = msg.message;
      else if (currentScreen === "lobby") $("#lobby-hint").textContent = msg.message;
      break;
  }
}

function escapeText(s) {
  return (s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

/* ---------- démarrage ---------- */
go("home");
