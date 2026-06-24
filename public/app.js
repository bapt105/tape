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
  // en quittant l'écran multijoueur, on arrête de sonder les salons publics
  if (currentScreen === "multi-home" && name !== "multi-home" && typeof stopPublicPolling === "function") stopPublicPolling();
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
  let cb = { start() {}, progress() {}, finish() {}, error() {} };

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
  // Renvoie une COPIE mélangée d'un tableau (mélange de Fisher-Yates).
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function paintWord(i) {
    const el = wordEls[i], w = words[i], t = input[i] || "";
    const total = Math.max(w.length, t.length);
    const spans = [];
    for (let j = 0; j < total; j++) {
      const span = document.createElement("span");
      let cls = "l", ch;
      if (j < w.length) {
        ch = w[j];
        if (j < t.length) cls += t[j] === w[j] ? " correct" : " wrong";
      } else { ch = t[j]; cls += " extra"; }
      span.className = cls;
      span.textContent = ch;          // textContent = échappement auto (sûr pour le code)
      span.style.order = j;           // ordre VISUEL correct (flexbox)…
      spans.push(span);
    }
    el._spans = spans; // ordre LOGIQUE (pour le curseur)
    // …mais on insère les lettres dans le DOM dans un ordre MÉLANGÉ : un bot qui
    // lit le texte via l'inspecteur (textContent/innerText) ne récupère que du
    // charabia, alors que le joueur voit le mot correctement.
    el.textContent = "";
    for (const span of shuffled(spans)) el.appendChild(span);
  }
  function updateCaret() {
    if (!caretEl || !wordEls[cur]) return;
    const wordEl = wordEls[cur];
    const spans = wordEl._spans || []; // ordre logique (le DOM, lui, est mélangé)
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
    else cb.error();
    if ((input[cur] || "").length < words[cur].length + 8) {
      input[cur] = (input[cur] || "") + k;
      paintWord(cur);
      // petit saut de la lettre quand elle est correcte
      if (k === expected) {
        const span = (wordEls[cur]._spans || [])[input[cur].length - 1];
        if (span) span.classList.add("pop");
      }
      updateCaret();
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

/* ---------- Petits utilitaires d'animation ---------- */
// Rejoue une animation CSS en retirant puis remettant la classe.
function restartAnim(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // force le reflow pour que l'animation puisse rejouer
  el.classList.add(cls);
}
// Fait défiler un nombre de 0 jusqu'à sa valeur (effet « compteur »).
function countUp(el, target, dur = 700) {
  if (!el) return;
  target = Math.round(target) || 0;
  if (target <= 0) { el.textContent = "0"; return; }
  const start = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  })(start);
}
// Déclenche l'effet d'explosion (flash + onde + secousse de l'écran).
function triggerExplosion() {
  restartAnim($("#boom-flash"), "show");
  restartAnim($("#boom-ring"), "show");
  restartAnim($("#screen-race"), "shake");
}

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
let currentTextStr = ""; // le texte en cours (pour le classement par texte)

function pickText() {
  let i; do { i = Math.floor(Math.random() * TEXTS.length); } while (i === lastTextIdx && TEXTS.length > 1);
  lastTextIdx = i;
  return TEXTS[i];
}
function setupText() {
  currentTextStr = pickText();
  textEngine.load(currentTextStr, { finite: true });
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
  finish(s) { clearInterval(textTick); showResult(s, "texte", textExtra(currentTextStr)); },
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

/* ============================================================
   SOLO — SPEED (chrono, mots simples sans accents)
   ============================================================ */
const speedEngine = createEngine($("#speed-typing"));
let speedDuration = 30, speedTimer = null, speedTick = null;

function setupSpeed() {
  const enough = Math.max(60, Math.round(speedDuration * 4));
  speedEngine.load(generateSpeedWords(enough), { finite: false });
  $("#speed-timer").textContent = speedDuration;
  $("#speed-wpm").textContent = "0 mpm";
  clearInterval(speedTick); clearTimeout(speedTimer);
}
speedEngine.on({
  start() {
    speedTick = setInterval(() => {
      const s = speedEngine.stats();
      $("#speed-timer").textContent = Math.max(0, speedDuration - Math.floor(s.elapsedMs / 1000));
      $("#speed-wpm").textContent = s.wpm + " mpm";
    }, 100);
    speedTimer = setTimeout(() => { clearInterval(speedTick); speedEngine.forceFinish(); }, speedDuration * 1000);
  },
  progress(s) { $("#speed-wpm").textContent = s.wpm + " mpm"; },
  finish(s) { clearInterval(speedTick); clearTimeout(speedTimer); showResult({ ...s, elapsedMs: speedDuration * 1000 }, "speed"); },
});
$$("#speed-options .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#speed-options .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    speedDuration = +b.dataset.dur;
    setupSpeed(); speedEngine.focus();
  })
);
onEnter["solo-speed"] = () => { setupSpeed(); setTimeout(() => speedEngine.focus(), 30); };

/* ============================================================
   SOLO — CODE (chrono, vraies lignes de code)
   ============================================================ */
const codeEngine = createEngine($("#code-typing"));
let codeDuration = 30, codeTimer = null, codeTick = null, codeCat = "web"; // catégorie : web / java / cpp

function setupCode() {
  const enough = Math.max(30, Math.round(codeDuration * 2.5)); // jetons de code = plus longs
  codeEngine.load(generateCode(enough, undefined, codeCat), { finite: false });
  $("#code-timer").textContent = codeDuration;
  $("#code-wpm").textContent = "0 mpm";
  clearInterval(codeTick); clearTimeout(codeTimer);
}
codeEngine.on({
  start() {
    codeTick = setInterval(() => {
      const s = codeEngine.stats();
      $("#code-timer").textContent = Math.max(0, codeDuration - Math.floor(s.elapsedMs / 1000));
      $("#code-wpm").textContent = s.wpm + " mpm";
    }, 100);
    codeTimer = setTimeout(() => { clearInterval(codeTick); codeEngine.forceFinish(); }, codeDuration * 1000);
  },
  progress(s) { $("#code-wpm").textContent = s.wpm + " mpm"; },
  finish(s) { clearInterval(codeTick); clearTimeout(codeTimer); showResult({ ...s, elapsedMs: codeDuration * 1000 }, "code", { codeCat }); },
});
$$("#code-options .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#code-options .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    codeDuration = +b.dataset.dur;
    setupCode(); codeEngine.focus();
  })
);
// Choix du langage (web / java / c++)
$$("#code-cat-options .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#code-cat-options .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    codeCat = b.dataset.cat;
    setupCode(); codeEngine.focus();
  })
);
onEnter["solo-code"] = () => { setupCode(); setTimeout(() => codeEngine.focus(), 30); };

/* ---------- Tab = recommencer (sur écrans solo) ---------- */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  if (currentScreen === "solo-words") { e.preventDefault(); setupWords(); wordsEngine.focus(); }
  else if (currentScreen === "solo-text") { e.preventDefault(); setupText(); textEngine.focus(); }
  else if (currentScreen === "solo-zen") { e.preventDefault(); setupZen(); zenEngine.focus(); }
  else if (currentScreen === "solo-hard") { e.preventDefault(); setupHard(); hardEngine.focus(); }
  else if (currentScreen === "solo-speed") { e.preventDefault(); setupSpeed(); speedEngine.focus(); }
  else if (currentScreen === "solo-code") { e.preventDefault(); setupCode(); codeEngine.focus(); }
});

/* ============================================================
   RÉSULTAT SOLO
   ============================================================ */
let lastSoloMode = "solo-words";
function showResult(s, label, extra) {
  lastSoloMode = label === "texte" ? "solo-text" : label === "zen" ? "solo-zen"
    : label === "difficile" ? "solo-hard" : label === "speed" ? "solo-speed" : "solo-words";
  countUp($("#res-wpm"), s.wpm);
  countUp($("#res-acc"), s.accuracy);
  countUp($("#res-chars"), s.correctChars);
  $("#res-time").textContent = Math.round(s.elapsedMs / 1000);
  $("#res-mode").textContent = label;
  go("result");
  renderResultSave(labelToMode(label), s, extra); // proposer d'enregistrer au classement
}
$("#res-again").addEventListener("click", () => go(lastSoloMode));

/* ============================================================
   MULTIJOUEUR
   ============================================================ */
const raceEngine = createEngine($("#race-typing"));
$("#race-typing").classList.add("text-mode");
// retire la classe « shake » une fois la secousse finie (sinon elle rejoue à la prochaine partie)
$("#screen-race").addEventListener("animationend", (e) => {
  if (e.animationName === "shake") e.currentTarget.classList.remove("shake");
});

let ws = null, wsReady = false;
let me = { id: null, name: "" };
let room = { code: null, mode: "course", isHost: false, players: [], opts: { lives: 2, elimDur: 18, hardCount: 30, speedCount: 40 } };

// Réglages proposés selon le mode. Course et élimination ont en plus le choix
// du « contenu » (texte long / mots courants) et, si texte, lequel.
function lobbyOptionGroups() {
  const m = room.mode, groups = [];
  if (m === "patate") groups.push({ key: "lives", label: "vies", values: [1, 2, 3] });
  if (m === "elimination") groups.push({ key: "elimDur", label: "durée", values: [12, 18, 25], suffix: "s" });
  if (m === "hard") groups.push({ key: "hardCount", label: "mots", values: [20, 30, 50] });
  if (m === "speed") groups.push({ key: "speedCount", label: "mots", values: [20, 40, 60] });
  if (m === "course" || m === "elimination") {
    groups.push({ key: "content", label: "contenu", values: [
      { v: "texte", txt: "texte long" }, { v: "mots", txt: "mots courants" },
    ] });
    if ((room.opts.content || "texte") === "texte") {
      groups.push({ key: "textChoice", label: "texte", kind: "text" });
    }
  }
  return groups;
}
let mpModePick = "course";
let raceTick = null, lastSent = 0, roundLocalTimer = null, sentFinished = false, amEliminated = false;
let patateHolder = null, patatePassed = false, patateWord = "", patateErrored = false;
let raceScoreInfo = null; // { modeKey, extra } pour enregistrer le score multi au classement

// Modes « course » : tout le monde tape la même chose, le 1er à finir gagne.
// (course, difficile et speed partagent exactement la même mécanique d'affichage.)
const isRaceMode = (m) => m === "course" || m === "hard" || m === "speed";
// Pour qu'une arrivée « compte » (gagner + classement) : il faut avoir vraiment
// tapé le texte (mêmes seuils que le serveur).
const MIN_FINISH_PROGRESS = 50, MIN_FINISH_ACCURACY = 50;

const MODE_DESC = {
  course: "Tout le monde tape le même texte. Le premier à finir gagne. Barres de progression en direct.",
  elimination: "Manches de 18s. À chaque manche, le joueur le plus lent est éliminé. Le dernier survivant gagne.",
  patate: "Une bombe passe de joueur en joueur : tape les 2 mots pour la refiler. Une faute la fait exploser 1s plus tôt. Celui qui la tient quand elle explose est éliminé.",
  hard: "Comme la course, mais avec des mots difficiles et pleins d'accents. Le premier à finir gagne.",
  speed: "Comme la course, mais avec des mots simples sans accents. Tape vite — le premier à finir gagne !",
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
    if (currentScreen === "multi-home") requestPublicRooms(); // charge le fil dès la connexion
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
let mpPublic = true; // à la création : salon public (listé) ou privé (sur code)
onEnter["multi-home"] = () => {
  if (!ws) connect();
  $("#mp-error").textContent = "";
  $("#mp-mode-desc").textContent = MODE_DESC[mpModePick];
  const savedName = localStorage.getItem("tape-name");
  if (savedName) $("#mp-name").value = savedName;
  startPublicPolling(); // demande régulièrement la liste des salons publics
};
$$("#mp-mode-pick .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#mp-mode-pick .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    mpModePick = b.dataset.mpmode;
    $("#mp-mode-desc").textContent = MODE_DESC[mpModePick];
  })
);
// Choix public / privé à la création
$$("#mp-visibility .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#mp-visibility .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    mpPublic = b.dataset.vis === "public";
    $("#mp-vis-note").textContent = mpPublic
      ? "visible par tous dans la liste des salons publics."
      : "privé : rejoignable uniquement avec le code à 4 lettres.";
  })
);
function getName() {
  const n = ($("#mp-name").value || "").trim().slice(0, 14) || "joueur";
  localStorage.setItem("tape-name", n);
  return n;
}
$("#mp-create").addEventListener("click", () => {
  if (!wsReady) { $("#mp-error").textContent = "Pas de connexion au serveur."; return; }
  sendWs({ type: "create", name: getName(), mode: mpModePick, public: mpPublic });
});

/* ----- Fil des salons publics ----- */
let publicPollTimer = null;
function requestPublicRooms() { sendWs({ type: "listPublic" }); }
function startPublicPolling() {
  requestPublicRooms();
  clearInterval(publicPollTimer);
  publicPollTimer = setInterval(requestPublicRooms, 3000);
}
function stopPublicPolling() { clearInterval(publicPollTimer); publicPollTimer = null; }

const MP_MODE_NAMES = { course: "course", elimination: "élimination", patate: "patate chaude", hard: "difficile", speed: "speed" };
function renderPublicRooms(list) {
  const wrap = $("#public-list");
  if (!wrap) return;
  if (!list || !list.length) {
    wrap.innerHTML = '<p class="public-empty">Aucun salon public ouvert. Crée-en un — il apparaîtra ici pour les autres !</p>';
    return;
  }
  wrap.innerHTML = "";
  list.forEach((r) => {
    const row = document.createElement("div");
    row.className = "public-room";
    row.innerHTML = `<div class="pr-info">
        <span class="pr-host">${escapeText(r.host)}</span>
        <span class="pr-meta">${MP_MODE_NAMES[r.mode] || r.mode} · ${r.count}/8 joueur(s)</span>
      </div>
      <button class="btn pr-join">rejoindre</button>`;
    row.querySelector(".pr-join").addEventListener("click", () => {
      if (!wsReady) { $("#mp-error").textContent = "Pas de connexion au serveur."; return; }
      sendWs({ type: "join", code: r.code, name: getName() });
    });
    wrap.appendChild(row);
  });
}
$("#mp-refresh").addEventListener("click", requestPublicRooms);
$("#mp-join").addEventListener("click", () => {
  if (!wsReady) { $("#mp-error").textContent = "Pas de connexion au serveur."; return; }
  const code = ($("#mp-code").value || "").trim().toUpperCase();
  if (code.length !== 4) { $("#mp-error").textContent = "Entre un code à 4 lettres."; return; }
  sendWs({ type: "join", code, name: getName() });
});
$("#mp-code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#mp-join").click(); });

/* ----- Salon ----- */
function renderLobbyOpts() {
  const wrap = $("#lobby-opts");
  wrap.innerHTML = "";
  const groups = lobbyOptionGroups();
  if (!groups.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "";
  groups.forEach((g) => {
    const row = document.createElement("div");
    row.className = "lobby-mode-row";
    const label = document.createElement("span");
    label.className = "opt-label";
    label.textContent = g.label;
    row.appendChild(label);

    if (g.kind === "text") {
      // menu déroulant : aléatoire + chaque texte (aperçu tronqué)
      const sel = document.createElement("select");
      sel.className = "opt-select";
      sel.disabled = !room.isHost;
      const cur = Number.isInteger(room.opts.textChoice) ? room.opts.textChoice : "rand";
      const optRand = new Option("aléatoire", "rand", false, cur === "rand");
      sel.appendChild(optRand);
      TEXTS.forEach((t, i) => {
        const preview = t.length > 46 ? t.slice(0, 46) + "…" : t;
        sel.appendChild(new Option(`#${i + 1} — ${preview}`, String(i), false, cur === i));
      });
      sel.addEventListener("change", () => {
        if (!room.isHost) return;
        const val = sel.value === "rand" ? "rand" : parseInt(sel.value, 10);
        sendWs({ type: "setopt", key: "textChoice", value: val });
      });
      row.appendChild(sel);
    } else {
      const pick = document.createElement("div");
      pick.className = "mode-pick";
      const cur = room.opts[g.key];
      g.values.forEach((item) => {
        const v = typeof item === "object" ? item.v : item;
        const txt = typeof item === "object" ? item.txt : v + (g.suffix || "");
        const b = document.createElement("button");
        b.className = "opt" + (v === cur ? " active" : "");
        b.textContent = txt;
        b.disabled = !room.isHost;
        b.addEventListener("click", () => { if (room.isHost) sendWs({ type: "setopt", key: g.key, value: v }); });
        pick.appendChild(b);
      });
      row.appendChild(pick);
    }
    wrap.appendChild(row);
  });
}

function renderLobby() {
  $("#lobby-code").textContent = room.code;
  const visEl = $("#lobby-vis");
  if (visEl) {
    visEl.textContent = room.isPublic ? "● public" : "● privé";
    visEl.classList.toggle("is-public", !!room.isPublic);
  }
  // sélecteur de mode : bouton actif = mode courant ; cliquable seulement par l'hôte
  $$("#lobby-mode-pick .opt").forEach((b) => {
    b.classList.toggle("active", b.dataset.mpmode === room.mode);
    b.disabled = !room.isHost;
  });
  $("#lobby-mode-note").textContent = room.isHost ? "" : "choisi par l'hôte";
  renderLobbyOpts();
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
    t.dataset.id = p.id; // pour retrouver le joueur (ex. flash à l'explosion)
    const isMe = p.id === me.id;
    const right = p.eliminated ? "éliminé"
      : p.holder ? "tient la bombe"
      : room.mode === "patate" ? `<span class="hearts">${"♥".repeat(p.lives || 0)}</span>`
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
  // chaque chiffre est un nouveau <span> → l'animation « pop » rejoue toute seule
  const paint = (txt) => { el.innerHTML = `<span class="count-num">${txt}</span>`; };
  paint(n);
  const iv = setInterval(() => {
    n--;
    if (n <= 0) {
      paint("go"); clearInterval(iv);
      setTimeout(() => { el.classList.remove("show"); el.innerHTML = ""; then(); }, 500);
    } else paint(n);
  }, 800);
}

function startCourseClient(cfg) {
  go("race");
  $("#race-bomb").classList.add("hidden");
  $("#race-mode-label").textContent = cfg.mode === "hard" ? "difficile" : cfg.mode === "speed" ? "speed" : "course";
  $("#race-info").textContent = "premier arrivé, premier servi";
  let text;
  if (cfg.mode === "hard") text = generateHardWords(cfg.count, cfg.seed);
  else if (cfg.mode === "speed") text = generateSpeedWords(cfg.count, cfg.seed);
  else if (cfg.content === "mots") text = generateWords(cfg.count, cfg.seed);
  else text = TEXTS[cfg.textIndex];
  // À la fin, on enregistrera ce score au classement (comme en solo). Pour une
  // course sur un texte, on garde aussi son identité (classement par texte).
  if (cfg.mode === "hard") raceScoreInfo = { modeKey: "difficile", extra: null };
  else if (cfg.mode === "speed") raceScoreInfo = { modeKey: "speed", extra: null };
  else if (cfg.content === "mots") raceScoreInfo = { modeKey: "mots", extra: null };
  else raceScoreInfo = { modeKey: "texte", extra: textExtra(text) };
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
  raceScoreInfo = null; // la patate chaude ne compte pas au classement
  $("#race-bomb").classList.add("hidden"); // patate chaude : on ne montre pas le temps restant
  $("#race-mode-label").textContent = "patate chaude";
  $("#race-info").textContent = "préparez-vous…";
  $("#race-progress").textContent = "";
  $("#race-wpm").textContent = "";
  patateHolder = null; patatePassed = false; patateWord = ""; patateErrored = false;
  $("#race-typing").classList.remove("my-turn");
  raceEngine.load("…", { finite: false });
  raceEngine.setSpectator(true);
  raceEngine.setBlur(true);
  showCountdown(() => { $("#race-info").textContent = "la bombe arrive…"; raceEngine.setBlur(false); });
}
function onPotato(msg) {
  // patate chaude : la barre de temps (bombe) reste cachée, on n'anime rien
  patateHolder = msg.holderId;
  patateWord = msg.word;
  renderTracks(msg.players.map((p) => ({ ...p, holder: p.id === msg.holderId })));
  const holderName = (msg.players.find((p) => p.id === msg.holderId) || {}).name || "";
  raceEngine.load(msg.word, { finite: false });
  if (msg.holderId === me.id && !amEliminated) {
    patatePassed = false;
    patateErrored = false; // nouvelle prise de patate → la pénalité d'erreur est réarmée
    $("#race-info").textContent = "à toi ! tape les mots";
    $("#race-typing").classList.add("my-turn"); // cadre blanc : c'est ton tour
    raceEngine.setSpectator(false);
    raceEngine.setBlur(false);
    raceEngine.focus();
  } else {
    $("#race-info").textContent = "au tour de " + holderName;
    $("#race-typing").classList.remove("my-turn");
    raceEngine.setSpectator(true);
    raceEngine.setBlur(false);
  }
}
function startElimClient(msg) {
  const { duration, round } = msg;
  go("race");
  raceScoreInfo = null; // l'élimination ne compte pas au classement (parties partielles)
  $("#race-mode-label").textContent = "élimination";
  // contenu : texte long (tout le monde le même) ou mots courants (via graine)
  const text = msg.content === "texte" ? TEXTS[msg.textIndex] : generateWords(msg.count, msg.seed);
  raceEngine.load(text, { finite: false });
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
  error() {
    // patate chaude : une faute rapproche l'explosion d'1 s, mais une seule fois par tour
    if (room.mode !== "patate") return;
    if (patateHolder === me.id && !patatePassed && !patateErrored && !amEliminated) {
      patateErrored = true;
      sendWs({ type: "typo" });
    }
  },
  progress(s) {
    if (room.mode === "patate") {
      // refile la patate dès que les mots sont tapés entièrement et correctement
      if (patateHolder === me.id && !patatePassed && !amEliminated && patateWord && s.correctChars >= patateWord.length) {
        patatePassed = true;
        raceEngine.setSpectator(true);
        $("#race-typing").classList.remove("my-turn");
        $("#race-info").textContent = "passé !";
        sendWs({ type: "pass" });
      }
      return;
    }
    const pct = isRaceMode(room.mode);
    $("#race-progress").textContent = pct ? s.progress + "%" : s.correctChars + " car.";
    $("#race-wpm").textContent = s.wpm + " mpm";
    const t = now();
    if (t - lastSent > 180) {
      lastSent = t;
      sendWs({ type: "progress", progress: s.progress, wpm: s.wpm, chars: s.correctChars });
    }
  },
  finish(s) {
    if (isRaceMode(room.mode) && !sentFinished) {
      sentFinished = true;
      // on transmet aussi l'avancement réel : le serveur s'en sert pour vérifier
      // que l'arrivée est « vraie » (pas du n'importe quoi tapé pour finir vite).
      sendWs({ type: "finished", wpm: s.wpm, accuracy: s.accuracy, time: s.elapsedMs, progress: s.progress });
      const valid = s.accuracy >= MIN_FINISH_ACCURACY && s.progress >= MIN_FINISH_PROGRESS;
      $("#race-info").textContent = valid
        ? "terminé — en attente des autres…"
        : "arrivée non valide (trop de fautes) — ça ne compte pas";
      // n'enregistre au classement QUE si l'arrivée est valide (pas de score poubelle)
      if (valid && raceScoreInfo && !isOffline() && currentPseudo()) {
        submitScore(raceScoreInfo.modeKey, s, raceScoreInfo.extra);
      }
    }
  },
});
function startRaceTick() {
  clearInterval(raceTick);
  raceTick = setInterval(() => {
    if (raceEngine.isFinished()) return;
    const s = raceEngine.stats();
    $("#race-progress").textContent = (isRaceMode(room.mode) ? s.progress + "%" : s.correctChars + " car.");
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
  const titles = { course: "course terminée", hard: "difficile terminée", speed: "speed terminée", elimination: "élimination terminée", patate: "patate chaude terminée" };
  title.textContent = titles[data.mode] || "résultats";
  if (isRaceMode(data.mode)) {
    data.ranking.forEach((r, i) => {
      const li = document.createElement("li");
      const stat = r.finished ? `${r.wpm} mpm · ${r.accuracy}% · ${(r.time / 1000).toFixed(1)}s`
                  : r.invalid ? `non valide · trop de fautes (${r.progress}%)`
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
      room = { code: msg.code, mode: msg.mode, isHost: msg.isHost, isPublic: msg.isPublic, players: msg.players, opts: msg.opts || room.opts };
      amEliminated = false;
      resetChat(msg.chat);
      renderLobby(); go("lobby");
      break;
    case "publicRooms":
      renderPublicRooms(msg.rooms);
      break;
    case "chat":
      addChatMessage({ name: msg.name, text: msg.text, system: msg.system });
      break;
    case "players":
      if (msg.mode) room.mode = msg.mode;
      if (msg.opts) room.opts = msg.opts;
      room.players = msg.players;
      if (currentScreen === "lobby") renderLobby();
      break;
    case "lobby": // après une revanche
      room.mode = msg.mode; room.players = msg.players;
      if (msg.opts) room.opts = msg.opts;
      if (typeof msg.isPublic === "boolean") room.isPublic = msg.isPublic;
      room.isHost = !!(room.players.find((p) => p.id === me.id)?.host);
      amEliminated = false;
      renderLobby(); go("lobby");
      break;
    case "countdown":
      // la manche arrive : on prépare l'écran (le start arrive juste après)
      break;
    case "start":
      if (msg.mode === "course") { amEliminated = false; startCourseClient({ mode: "course", content: msg.content, textIndex: msg.textIndex, seed: msg.seed, count: msg.count }); }
      else if (msg.mode === "hard") { amEliminated = false; startCourseClient({ mode: "hard", seed: msg.seed, count: msg.count }); }
      else if (msg.mode === "speed") { amEliminated = false; startCourseClient({ mode: "speed", seed: msg.seed, count: msg.count }); }
      else if (msg.mode === "patate") { startPatateClient(); }
      else startElimClient(msg);
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
      $("#race-typing").classList.remove("my-turn");
      let info;
      if (msg.exploded) { // patate chaude
        triggerExplosion(); // 💥 flash + onde + secousse
        const mine = msg.explodedId === me.id;
        if (msg.eliminatedId) {
          info = `${escapeText(msg.exploded)} explose et est éliminé · ${msg.remaining} en jeu` + (mine ? " — tu es éliminé !" : "");
        } else {
          info = `${escapeText(msg.exploded)} explose ! ${msg.livesLeft} vie(s) · ${msg.remaining} en jeu` + (mine ? " — tu perds une vie !" : "");
        }
      } else { // élimination
        info = `${escapeText(msg.eliminated)} éliminé · ${msg.remaining} restant(s)` + (msg.eliminatedId === me.id ? " — tu es éliminé !" : "");
      }
      renderTracks(msg.standings.map((s) => ({ ...s, progress: 0 })));
      // fait clignoter en rouge la piste du joueur qui a explosé
      if (msg.exploded && msg.explodedId != null) {
        restartAnim($(`#race-tracks .track[data-id="${msg.explodedId}"]`), "boom-track");
      }
      $("#race-info").textContent = info;
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

/* ============================================================
   ADMIN — gestion des mots et des textes
   ============================================================ */

// Remplace en place le contenu des listes utilisées par le jeu.
// (COMMON_WORDS / HARD_WORDS / TEXTS viennent de words.js ; on garde la même
//  référence de tableau, on change juste son contenu.)
function applyWordData(data) {
  if (Array.isArray(data.common) && data.common.length) { COMMON_WORDS.length = 0; COMMON_WORDS.push(...data.common); }
  if (Array.isArray(data.hard)   && data.hard.length)   { HARD_WORDS.length = 0;   HARD_WORDS.push(...data.hard); }
  if (Array.isArray(data.speed)  && data.speed.length)  { SPEED_WORDS.length = 0;  SPEED_WORDS.push(...data.speed); }
  if (Array.isArray(data.texts)  && data.texts.length)  { TEXTS.length = 0;        TEXTS.push(...data.texts); }
  if (Array.isArray(data.codeweb)  && data.codeweb.length)  { CODE_WEB.length = 0;  CODE_WEB.push(...data.codeweb); }
  if (Array.isArray(data.codejava) && data.codejava.length) { CODE_JAVA.length = 0; CODE_JAVA.push(...data.codejava); }
  if (Array.isArray(data.codecpp)  && data.codecpp.length)  { CODE_CPP.length = 0;  CODE_CPP.push(...data.codecpp); }
}

// Récupère les listes depuis le serveur au chargement de la page.
async function loadWordData() {
  try {
    const res = await fetch("/api/words");
    if (!res.ok) return;
    applyWordData(await res.json());
    refreshCurrentSolo();
  } catch { /* serveur indisponible (ex : ouvert en fichier) → listes par défaut */ }
}

// Recharge l'écran solo courant pour que les nouveaux mots soient pris en compte.
function refreshCurrentSolo() {
  if (currentScreen === "solo-words") setupWords();
  else if (currentScreen === "solo-hard") setupHard();
  else if (currentScreen === "solo-speed") setupSpeed();
  else if (currentScreen === "solo-zen") setupZen();
  else if (currentScreen === "solo-text") setupText();
  else if (currentScreen === "solo-code") setupCode();
}

const adminOverlay = $("#admin-overlay");
let adminPassword = "";                                  // mémorisé après connexion réussie
let adminList = "common";                                // liste active dans le panneau
let adminSearch = "";                                    // texte de recherche (filtre la liste)
let adminData = { common: [], hard: [], speed: [], texts: [], codeweb: [], codejava: [], codecpp: [] }; // dernières listes connues
const LINE_LISTS = ["texts", "codeweb", "codejava", "codecpp"]; // « une entrée = une ligne entière »
const ADMIN_META = {
  common:   { hint: "Mots du mode « mots courants » (aussi patate chaude et élimination). Tu peux en ajouter plusieurs séparés par des espaces.", ph: "ex : bonjour maison soleil" },
  hard:     { hint: "Mots du mode « difficile ». Plusieurs mots possibles, séparés par des espaces.", ph: "ex : anticonstitutionnellement" },
  speed:    { hint: "Mots du mode « speed » : simples et SANS accent. Plusieurs possibles, séparés par des espaces.", ph: "ex : maison velo jardin" },
  codeweb:  { hint: "Mode « code » — catégorie WEB (HTML/CSS/JS/PHP). Une ligne complète par entrée.", ph: "ex : const el = document.querySelector(\".btn\");" },
  codejava: { hint: "Mode « code » — catégorie JAVA. Une ligne complète par entrée.", ph: "ex : System.out.println(\"Hello\");" },
  codecpp:  { hint: "Mode « code » — catégorie C++. Une ligne complète par entrée.", ph: "ex : std::cout << \"Hello\";" },
  texts:    { hint: "Textes du mode « texte ». Modifie un texte directement dans son cadre puis « enregistrer ».", ph: "Colle ici un nouveau texte complet…" },
};

function openAdmin() {
  adminOverlay.classList.remove("hidden");
  $("#admin-login").classList.remove("hidden");
  $("#admin-panel").classList.add("hidden");
  $("#admin-error").textContent = "";
  $("#admin-pass").value = "";
  setTimeout(() => $("#admin-pass").focus(), 30);
}
function closeAdmin() {
  adminOverlay.classList.add("hidden");
  refreshCurrentSolo(); // applique d'éventuels changements à l'écran en cours
}

// Petit utilitaire pour parler au serveur d'admin.
async function adminRequest(payload) {
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "serveur injoignable" } };
  }
}

async function adminLogin() {
  const pass = $("#admin-pass").value;
  const { ok, data } = await adminRequest({ password: pass, action: "check" });
  if (!ok) { $("#admin-error").textContent = data.error || "mot de passe incorrect"; return; }
  adminPassword = pass;
  adminData = data.lists;
  applyWordData(data.lists);
  $("#admin-login").classList.add("hidden");
  $("#admin-panel").classList.remove("hidden");
  adminSearch = ""; $("#admin-search").value = "";
  renderAdminList();
}

function renderAdminList() {
  const meta = ADMIN_META[adminList];
  $("#admin-list-hint").textContent = meta.hint;
  $("#admin-input").placeholder = meta.ph;
  const all = adminData[adminList] || [];
  const q = adminSearch.trim().toLowerCase();
  const items = q ? all.filter((v) => v.toLowerCase().includes(q)) : all;
  const unit = adminList === "texts" ? "texte(s)" : adminList.startsWith("code") ? "ligne(s)" : "mot(s)";
  $("#admin-count").textContent = q
    ? `${items.length} affiché(s) sur ${all.length} ${unit}`
    : `${all.length} ${unit}`;
  const wrap = $("#admin-list");
  wrap.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty";
    empty.textContent = q ? "aucun résultat pour « " + adminSearch.trim() + " »" : "liste vide";
    wrap.appendChild(empty);
    return;
  }
  items.forEach((val) => wrap.appendChild(LINE_LISTS.includes(adminList) ? buildTextItem(val) : buildWordItem(val)));
}

// Un mot : libellé + bouton supprimer
function buildWordItem(val) {
  const row = document.createElement("div");
  row.className = "admin-item";
  const span = document.createElement("span");
  span.className = "admin-item-val";
  span.textContent = val;
  const del = document.createElement("button");
  del.className = "admin-del"; del.textContent = "×"; del.title = "supprimer";
  del.addEventListener("click", () => adminRemove(val));
  row.appendChild(span); row.appendChild(del);
  return row;
}

// Un texte : bloc-note éditable + « enregistrer » + supprimer
function buildTextItem(val) {
  const row = document.createElement("div");
  row.className = "admin-item is-text";
  const ta = document.createElement("textarea");
  ta.className = "admin-text-edit"; ta.value = val; ta.rows = 3;
  const actions = document.createElement("div");
  actions.className = "admin-text-actions";
  const save = document.createElement("button");
  save.className = "btn admin-save"; save.textContent = "enregistrer";
  save.addEventListener("click", () => adminEdit(val, ta.value));
  const del = document.createElement("button");
  del.className = "admin-del"; del.textContent = "×"; del.title = "supprimer";
  del.addEventListener("click", () => adminRemove(val));
  actions.appendChild(save); actions.appendChild(del);
  row.appendChild(ta); row.appendChild(actions);
  return row;
}

function adminStatus(text, isErr) {
  const el = $("#admin-status");
  el.textContent = text;
  el.classList.toggle("err", !!isErr);
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 2200);
}

async function adminAdd() {
  const value = $("#admin-input").value.trim();
  if (!value) return;
  const { ok, data } = await adminRequest({ password: adminPassword, action: "add", list: adminList, value });
  if (!ok) { adminStatus(data.error || "erreur", true); return; }
  adminData = data.lists; applyWordData(data.lists);
  // on ne vide le champ que si quelque chose a réellement été ajouté
  if (!/déjà/.test(data.message || "")) $("#admin-input").value = "";
  renderAdminList();
  adminStatus(data.message || "ajouté ✓", /déjà/.test(data.message || ""));
}
async function adminRemove(value) {
  const { ok, data } = await adminRequest({ password: adminPassword, action: "remove", list: adminList, value });
  if (!ok) { adminStatus(data.error || "erreur", true); return; }
  adminData = data.lists; applyWordData(data.lists);
  renderAdminList();
  adminStatus(data.message || "supprimé ✓");
}
async function adminEdit(oldValue, newValue) {
  newValue = (newValue || "").trim();
  if (!newValue) { adminStatus("le texte ne peut pas être vide", true); return; }
  if (newValue === oldValue) { adminStatus("aucun changement"); return; }
  const { ok, data } = await adminRequest({ password: adminPassword, action: "edit", list: adminList, oldValue, value: newValue });
  if (!ok) { adminStatus(data.error || "erreur", true); return; }
  adminData = data.lists; applyWordData(data.lists);
  renderAdminList();
  adminStatus(data.message || "modifié ✓");
}

$("#admin-open").addEventListener("click", openAdmin);
$("#admin-close").addEventListener("click", closeAdmin);
adminOverlay.addEventListener("click", (e) => { if (e.target === adminOverlay) closeAdmin(); });
$("#admin-login-btn").addEventListener("click", adminLogin);
$("#admin-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") adminLogin(); });
$("#admin-add-btn").addEventListener("click", adminAdd);
$("#admin-input").addEventListener("keydown", (e) => {
  // Entrée = ajouter (sauf pour les textes, où Entrée sert à aller à la ligne)
  if (e.key === "Enter" && !e.shiftKey && adminList !== "texts") { e.preventDefault(); adminAdd(); }
});
$("#admin-search").addEventListener("input", (e) => { adminSearch = e.target.value; renderAdminList(); });
$$("#admin-tabs .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#admin-tabs .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    const tab = b.dataset.list;
    const playersTab = tab === "players";
    // bascule entre la vue « listes » et la vue « joueurs »
    $("#admin-lists-view").classList.toggle("hidden", playersTab);
    $("#admin-players-view").classList.toggle("hidden", !playersTab);
    if (playersTab) { adminPlayersSearch = ""; $("#admin-players-search").value = ""; loadAdminPlayers(); return; }
    adminList = tab;
    $("#admin-input").value = "";
    adminSearch = ""; $("#admin-search").value = ""; // la recherche repart à zéro par onglet
    renderAdminList();
  })
);

/* ----- Admin : gestion des joueurs (bannir / supprimer un score) ----- */
let adminPlayers = [], adminBanned = [], adminPlayersSearch = "";

async function loadAdminPlayers() {
  $("#admin-players-list").innerHTML = '<p class="admin-empty">chargement…</p>';
  const { ok, data } = await adminRequest({ password: adminPassword, action: "players" });
  if (!ok) { $("#admin-players-list").innerHTML = `<p class="admin-empty">${escapeText(data.error || "erreur")}</p>`; return; }
  adminPlayers = data.players || [];
  adminBanned = data.banned || [];
  renderAdminPlayers();
}
function renderAdminPlayers() {
  // bannis (en haut, avec bouton « débannir »)
  const bannedWrap = $("#admin-banned");
  if (adminBanned.length) {
    bannedWrap.innerHTML = `<div class="admin-banned-title">bannis (${adminBanned.length})</div>`;
    adminBanned.forEach((name) => {
      const row = document.createElement("div");
      row.className = "admin-player banned";
      row.innerHTML = `<span class="ap-name">🚫 ${escapeText(name)}</span>`;
      const btn = document.createElement("button");
      btn.className = "btn ap-unban"; btn.textContent = "débannir";
      btn.addEventListener("click", () => adminModerate("unban", name));
      row.appendChild(btn);
      bannedWrap.appendChild(row);
    });
  } else bannedWrap.innerHTML = "";

  // liste des joueurs (filtrée par recherche)
  const q = adminPlayersSearch.trim().toLowerCase();
  const items = q ? adminPlayers.filter((p) => p.name.toLowerCase().includes(q)) : adminPlayers;
  $("#admin-players-count").textContent = q
    ? `${items.length} affiché(s) sur ${adminPlayers.length} joueur(s)`
    : `${adminPlayers.length} joueur(s) au classement`;
  const wrap = $("#admin-players-list");
  wrap.innerHTML = "";
  if (!items.length) {
    wrap.innerHTML = `<p class="admin-empty">${q ? "aucun joueur trouvé" : "aucun joueur au classement"}</p>`;
    return;
  }
  items.forEach((p) => {
    const row = document.createElement("div");
    row.className = "admin-player";
    row.innerHTML = `<span class="ap-name">${escapeText(p.name)}</span>
      <span class="ap-stat">${p.bestWpm} mpm · ${p.count} partie(s)</span>`;
    const actions = document.createElement("span");
    actions.className = "ap-actions";
    const del = document.createElement("button");
    del.className = "btn ap-del"; del.textContent = "suppr. score";
    del.addEventListener("click", () => adminModerate("deleteScore", p.name));
    const ban = document.createElement("button");
    ban.className = "btn ap-ban"; ban.textContent = "bannir";
    ban.addEventListener("click", () => { if (confirm(`Bannir « ${p.name} » ? Son score sera supprimé et il ne pourra plus jouer en multi.`)) adminModerate("ban", p.name); });
    actions.appendChild(del); actions.appendChild(ban);
    row.appendChild(actions);
    wrap.appendChild(row);
  });
}
async function adminModerate(action, name) {
  const { ok, data } = await adminRequest({ password: adminPassword, action, name });
  if (!ok) { adminStatus(data.error || "erreur", true); return; }
  adminPlayers = data.players || [];
  adminBanned = data.banned || [];
  renderAdminPlayers();
  adminStatus(data.message || "fait ✓");
}
$("#admin-players-search").addEventListener("input", (e) => { adminPlayersSearch = e.target.value; renderAdminPlayers(); });

/* ============================================================
   NOUVEAUTÉS (patch notes)
   ============================================================ */
const notesOverlay = $("#notes-overlay");
function renderNotes() {
  const wrap = $("#notes-list");
  wrap.innerHTML = "";
  const list = (typeof PATCH_NOTES !== "undefined" && Array.isArray(PATCH_NOTES)) ? PATCH_NOTES : [];
  if (!list.length) { wrap.innerHTML = '<p class="admin-empty">Aucune nouveauté pour l\'instant.</p>'; return; }
  list.forEach((entry) => {
    const block = document.createElement("div");
    block.className = "notes-entry";
    const head = document.createElement("div");
    head.className = "notes-entry-head";
    head.innerHTML = `<span class="notes-version">v${escapeText(String(entry.version || ""))}</span>` +
      `<span class="notes-date">${escapeText(String(entry.date || ""))}</span>`;
    const ul = document.createElement("ul");
    ul.className = "notes-changes";
    (entry.changes || []).forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c; // textContent = pas d'injection HTML possible
      ul.appendChild(li);
    });
    block.appendChild(head); block.appendChild(ul);
    wrap.appendChild(block);
  });
}
function openNotes() { renderNotes(); notesOverlay.classList.remove("hidden"); }
function closeNotes() { notesOverlay.classList.add("hidden"); }
$("#notes-open").addEventListener("click", openNotes);
$("#notes-close").addEventListener("click", closeNotes);
notesOverlay.addEventListener("click", (e) => { if (e.target === notesOverlay) closeNotes(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !notesOverlay.classList.contains("hidden")) closeNotes(); });

/* ============================================================
   CHAT DU SALON (multijoueur)
   ============================================================ */
const chatMessagesEl = $("#chat-messages");

// Vide le chat et affiche un éventuel historique (reçu à l'arrivée dans le salon).
function resetChat(history) {
  chatMessagesEl.innerHTML = "";
  if (Array.isArray(history) && history.length) {
    history.forEach((m) => addChatMessage(m, false));
  } else {
    chatMessagesEl.innerHTML = '<p class="chat-empty">Dis bonjour 👋</p>';
  }
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}
// Ajoute un message au chat. `m` = { name, text, system }.
function addChatMessage(m, scroll = true) {
  const empty = chatMessagesEl.querySelector(".chat-empty");
  if (empty) empty.remove();
  const div = document.createElement("div");
  if (m.system) {
    div.className = "chat-msg system";
    div.textContent = m.text;
  } else {
    const mine = m.name === me.name;
    div.className = "chat-msg" + (mine ? " me" : "");
    div.innerHTML = `<span class="chat-name">${escapeText(m.name)}</span><span class="chat-text"></span>`;
    div.querySelector(".chat-text").textContent = m.text; // textContent = sûr
  }
  chatMessagesEl.appendChild(div);
  if (scroll) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}
$("#chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = (input.value || "").trim().slice(0, 200);
  if (!text) return;
  sendWs({ type: "chat", text });
  input.value = "";
});

/* ============================================================
   CLASSEMENT (leaderboard + profil + courbes de progression)
   ------------------------------------------------------------
   - chaque partie solo terminée est envoyée au serveur (/api/score) sous ton
     pseudo ; le serveur calcule moyennes, records et garde l'historique ;
   - l'écran « classement » a deux vues : le classement global (filtrable par
     mode) et « mon profil » (stats détaillées + courbes).
   Tout passe par de simples requêtes HTTP : pas besoin du WebSocket. Hors-ligne
   (fichier ouvert sans serveur), le classement affiche un message d'info.
   ============================================================ */

// Les 5 modes solo, avec leur libellé lisible.
const MODE_LABELS = { mots: "mots courants", texte: "texte", zen: "zen", difficile: "difficile", speed: "speed", code: "code" };
const SOLO_MODES = ["mots", "texte", "zen", "difficile", "speed", "code"];

// Convertit le libellé d'un résultat solo en clé de mode pour le classement.
function labelToMode(label) {
  return label === "texte" ? "texte"
    : label === "zen" ? "zen"
    : label === "difficile" ? "difficile"
    : label === "speed" ? "speed"
    : label === "code" ? "code"
    : "mots"; // "mots courants"
}

/* ----- Identité d'un texte (pour le classement par texte) -----
   Chaque texte est identifié par une petite empreinte de son contenu : c'est
   STABLE (le même texte → le même identifiant sur tous les appareils) et ça
   reste juste même si l'admin réordonne les textes. Un texte modifié devient
   un « nouveau » texte (nouvelle empreinte) — ce qui est logique. */
function normText(s) { return (s || "").trim().replace(/\s+/g, " "); }
function hashText(s) {
  s = normText(s);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function textPreviewOf(s) { s = normText(s); return s.length > 48 ? s.slice(0, 48) + "…" : s; }
function textExtra(s) { return { textId: hashText(s), textPreview: textPreviewOf(s) }; }

const isOffline = () => location.protocol === "file:";
function currentPseudo() { return (localStorage.getItem("tape-name") || "").trim(); }
function setPseudo(name) {
  name = (name || "").trim().slice(0, 14);
  localStorage.setItem("tape-name", name);
  const mp = $("#mp-name"); if (mp) mp.value = name;
  const lb = $("#lb-name"); if (lb) lb.value = name;
  return name;
}

/* ----- Envoi d'un score à la fin d'un solo ----- */
async function submitScore(modeKey, s, extra) {
  try {
    const body = {
      name: currentPseudo(), mode: modeKey,
      wpm: s.wpm, accuracy: s.accuracy, chars: s.correctChars, timeMs: Math.round(s.elapsedMs),
    };
    if (extra && extra.textId) { body.textId = extra.textId; body.textPreview = extra.textPreview; }
    if (extra && extra.codeCat) { body.codeCat = extra.codeCat; }
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch { return null; }
}

// Affiche le bloc « enregistré au classement » sous le résultat solo.
function renderResultSave(modeKey, s, extra) {
  const box = $("#result-save");
  if (!box) return;
  if (isOffline()) { box.innerHTML = '<span class="rs-note">classement indisponible hors-ligne</span>'; return; }
  if (!currentPseudo()) {
    // pas encore de pseudo : on propose d'en choisir un pour « réclamer » le score
    box.innerHTML = `<div class="rs-claim">
        <span class="rs-note">choisis un pseudo pour enregistrer ce score :</span>
        <span class="rs-row">
          <input type="text" id="rs-name" maxlength="14" placeholder="ton pseudo" autocomplete="off" />
          <button class="btn" id="rs-save">enregistrer</button>
        </span>
      </div>`;
    const save = () => {
      const n = setPseudo($("#rs-name").value);
      if (!n) { $("#rs-name").focus(); return; }
      doSubmitScore(modeKey, s, extra);
    };
    $("#rs-save").addEventListener("click", save);
    $("#rs-name").addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    return;
  }
  doSubmitScore(modeKey, s, extra);
}
async function doSubmitScore(modeKey, s, extra) {
  const box = $("#result-save");
  box.innerHTML = '<span class="rs-note">enregistrement…</span>';
  const r = await submitScore(modeKey, s, extra);
  if (!r || !r.ok) { box.innerHTML = '<span class="rs-note err">classement injoignable — le serveur est-il lancé ?</span>'; return; }
  if (!r.recorded) { box.innerHTML = '<span class="rs-note">score trop court pour le classement</span>'; return; }
  const rankTxt = r.rank ? ` · <b>${r.rank}<sup>e</sup></b> sur ${r.total}` : "";
  box.innerHTML = `<span class="rs-ok">✓ enregistré au classement (${escapeText(currentPseudo())})${rankTxt}</span>
      <button class="link rs-see" id="rs-see">voir le classement →</button>`;
  $("#rs-see").addEventListener("click", () => go("leaderboard"));
}

/* ----- Petit graphique en courbe (SVG, sans librairie) ----- */
// values = suite de nombres (chronologique). Renvoie un <svg> qui s'adapte à la
// largeur de son conteneur et se recolore selon le thème (via currentColor).
function buildLineChart(values, opts = {}) {
  const W = 560, H = 170, padL = 10, padR = 30, padT = 16, padB = 22;
  const cls = opts.cls || "", suffix = opts.suffix || "";
  const n = values.length;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  let max = opts.yMax != null ? opts.yMax : Math.max(...values);
  let min = opts.yMin != null ? opts.yMin : Math.min(...values);
  if (max === min) { max += 1; min = Math.max(0, min - 1); }
  const range = max - min || 1;
  const X = (i) => padL + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const Y = (v) => padT + innerH * (1 - (v - min) / range);

  let grid = "";
  for (let g = 0; g <= 2; g++) {
    const val = min + (range * g) / 2, yy = Y(val);
    grid += `<line class="chart-grid" x1="${padL}" y1="${yy.toFixed(1)}" x2="${(padL + innerW).toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    grid += `<text class="chart-label" x="${(padL + innerW + 5).toFixed(1)}" y="${(yy + 3.5).toFixed(1)}">${Math.round(val)}</text>`;
  }
  const pts = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `${padL},${(padT + innerH).toFixed(1)} ${pts} ${(padL + innerW).toFixed(1)},${(padT + innerH).toFixed(1)}`;
  const lastX = X(n - 1), lastY = Y(values[n - 1]);
  return `<svg class="chart ${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="courbe">
      ${grid}
      <polygon class="chart-area" points="${area}"/>
      <polyline class="chart-line" points="${pts}"/>
      <circle class="chart-dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.6"/>
      <text class="chart-lastval" x="${(lastX - 5).toFixed(1)}" y="${(lastY - 8).toFixed(1)}" text-anchor="end">${values[n - 1]}${suffix}</text>
    </svg>`;
}

// Formate une durée (ms) en texte court : « 45 s », « 3 min 20 s », « 1 h 05 ».
function fmtDuration(ms) {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return sec + " s";
  const min = Math.floor(sec / 60), s = sec % 60;
  if (min < 60) return `${min} min ${String(s).padStart(2, "0")}`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, "0")}`;
}
function offlineHtml() {
  return '<p class="lb-empty">Le classement a besoin du serveur. Lance « node server.js » puis ouvre le jeu via http://localhost:3000 (pas en double-cliquant le fichier).</p>';
}

/* ----- État de l'écran classement ----- */
let lbTab = "ranking", lbMode = "tous", lbTextId = "", lbCodeCat = ""; // "" = tous

// Affiche (ou cache) le menu déroulant « texte », et le remplit avec les textes
// actuels du jeu. Visible uniquement quand le mode « texte » est sélectionné.
function renderTextFilter() {
  const wrap = $("#lb-text-filter");
  if (lbMode !== "texte") { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  const sel = $("#lb-text-select");
  sel.innerHTML = "";
  sel.appendChild(new Option("tous les textes", "", lbTextId === "", lbTextId === ""));
  TEXTS.forEach((t, i) => {
    const id = hashText(t);
    sel.appendChild(new Option(`#${i + 1} — ${textPreviewOf(t)}`, id, lbTextId === id, lbTextId === id));
  });
}
// Affiche (ou cache) le filtre de langage, visible seulement en mode « code ».
function renderCodeFilter() {
  const wrap = $("#lb-code-filter");
  if (lbMode !== "code") { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  $$("#lb-code-filter .opt").forEach((b) => b.classList.toggle("active", b.dataset.lbcat === lbCodeCat));
}

onEnter["leaderboard"] = () => {
  $("#lb-name").value = currentPseudo();
  $("#lb-id-note").textContent = currentPseudo() ? "" : "choisis un pseudo pour suivre ta progression";
  showLbTab(lbTab);
};

function showLbTab(tab) {
  lbTab = tab;
  $$("#lb-tabs .opt").forEach((b) => b.classList.toggle("active", b.dataset.lbtab === tab));
  $("#lb-ranking-view").classList.toggle("hidden", tab !== "ranking");
  $("#lb-profile-view").classList.toggle("hidden", tab !== "profile");
  if (tab === "ranking") renderLeaderboard();
  else renderProfile();
}

/* ----- Vue : classement global ----- */
async function renderLeaderboard() {
  renderTextFilter();
  renderCodeFilter();
  const view = $("#lb-table");
  if (isOffline()) { view.innerHTML = offlineHtml(); return; }
  view.innerHTML = '<p class="lb-loading">chargement…</p>';
  let url = `/api/leaderboard?mode=${encodeURIComponent(lbMode)}`;
  if (lbMode === "texte" && lbTextId) url += `&text=${encodeURIComponent(lbTextId)}`;
  if (lbMode === "code" && lbCodeCat) url += `&cat=${encodeURIComponent(lbCodeCat)}`;
  let data;
  try { data = await (await fetch(url)).json(); }
  catch { view.innerHTML = '<p class="lb-empty">classement injoignable — le serveur est-il lancé ?</p>'; return; }
  const players = data.players || [];
  if (!players.length) {
    view.innerHTML = ((lbMode === "texte" && lbTextId) || (lbMode === "code" && lbCodeCat))
      ? '<p class="lb-empty">Aucun score dans cette catégorie pour l\'instant — sois le premier !</p>'
      : '<p class="lb-empty">Aucun score pour l\'instant. Joue une partie solo pour ouvrir le classement !</p>';
    return;
  }
  const me = currentPseudo();
  let html = `<div class="lb-row lb-head">
      <span class="lb-rank">#</span><span class="lb-pname">joueur</span>
      <span class="lb-val">record</span><span class="lb-val">moy.</span>
      <span class="lb-val">parties</span><span class="lb-val">préc.</span>
    </div>`;
  players.forEach((p, i) => {
    const mine = me && p.name === me;
    const badge = lbMode === "tous" && p.bestMode ? `<span class="lb-badge">${escapeText(MODE_LABELS[p.bestMode] || p.bestMode)}</span>` : "";
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
    html += `<div class="lb-row${mine ? " mine" : ""}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-pname">${escapeText(p.name)}${mine ? " (toi)" : ""}</span>
        <span class="lb-val lb-best">${p.bestWpm}${badge}</span>
        <span class="lb-val">${p.avgWpm}</span>
        <span class="lb-val">${p.count}</span>
        <span class="lb-val">${p.avgAcc}%</span>
      </div>`;
  });
  view.innerHTML = html;
}

/* ----- Vue : mon profil ----- */
async function renderProfile() {
  const cards = $("#profile-cards"), charts = $("#profile-charts"),
        modesEl = $("#profile-modes"), runsEl = $("#profile-runs");
  const clear = (extra = "") => { charts.innerHTML = ""; modesEl.innerHTML = ""; runsEl.innerHTML = ""; cards.innerHTML = extra; };
  if (isOffline()) { clear(offlineHtml()); return; }
  const pseudo = currentPseudo();
  if (!pseudo) { clear('<p class="lb-empty">Choisis un pseudo ci-dessus, puis joue une partie solo pour voir tes statistiques et tes courbes.</p>'); return; }

  cards.innerHTML = '<p class="lb-loading">chargement…</p>';
  let data;
  try { data = await (await fetch(`/api/profile?name=${encodeURIComponent(pseudo)}`)).json(); }
  catch { clear('<p class="lb-empty">profil injoignable — le serveur est-il lancé ?</p>'); return; }
  const p = data.profile;
  if (!p || !p.count) { clear(`<p class="lb-empty">Pas encore de partie enregistrée pour « ${escapeText(pseudo)} ». Joue une partie solo !</p>`); return; }

  const avgWpm = Math.round(p.sumWpm / p.count), avgAcc = Math.round(p.sumAcc / p.count);
  const rank = data.rank && data.rank.rank;
  // grandes tuiles de stats
  cards.innerHTML = [
    statCard(p.bestWpm, "mpm", "meilleur score", p.bestMode ? MODE_LABELS[p.bestMode] : ""),
    statCard(avgWpm, "mpm", "vitesse moyenne"),
    statCard(avgAcc, "%", "précision moyenne"),
    statCard(p.count, "", "parties jouées"),
    statCard(p.sumChars.toLocaleString("fr-FR"), "", "caractères tapés"),
    statCard(fmtDuration(p.sumTimeMs), "", "temps total"),
    statCard(rank ? rank + "ᵉ" : "—", "", "rang au classement"),
  ].join("");

  // courbes : mpm et précision sur les dernières parties
  const recent = (p.runs || []).slice(-30);
  const wpmSeries = recent.map((r) => r.wpm);
  const accSeries = recent.map((r) => r.acc);
  const enough = recent.length >= 2;
  charts.innerHTML = `
    <div class="chart-card">
      <div class="chart-title">évolution de la vitesse <span>(${recent.length} dernière(s) partie(s))</span></div>
      ${enough ? buildLineChart(wpmSeries, { suffix: "", cls: "" }) : '<p class="chart-empty">Joue au moins 2 parties pour voir la courbe.</p>'}
    </div>
    <div class="chart-card">
      <div class="chart-title">évolution de la précision <span>(%)</span></div>
      ${enough ? buildLineChart(accSeries, { suffix: "%", cls: "chart--acc", yMin: Math.max(0, Math.min(...accSeries) - 5), yMax: 100 }) : '<p class="chart-empty">Joue au moins 2 parties pour voir la courbe.</p>'}
    </div>`;

  // détail par mode
  let rows = "";
  SOLO_MODES.forEach((mk) => {
    const m = p.modes[mk];
    if (!m || !m.count) return;
    rows += `<div class="pm-row">
        <span class="pm-mode">${MODE_LABELS[mk]}</span>
        <span>${m.count}</span>
        <span class="pm-best">${m.bestWpm}</span>
        <span>${Math.round(m.sumWpm / m.count)}</span>
        <span>${Math.round(m.sumAcc / m.count)}%</span>
      </div>`;
  });
  modesEl.innerHTML = rows ? `<div class="pm-title">détail par mode</div>
      <div class="pm-table">
        <div class="pm-row pm-head"><span>mode</span><span>parties</span><span>record</span><span>moy.</span><span>préc.</span></div>
        ${rows}
      </div>` : "";

  // dernières parties
  const last = (p.runs || []).slice(-8).reverse();
  runsEl.innerHTML = last.length ? `<div class="pm-title">dernières parties</div>
      <div class="runs-list">${last.map((r) => `
        <div class="run-row">
          <span class="run-mode">${escapeText(MODE_LABELS[r.mode] || r.mode)}</span>
          <span class="run-wpm">${r.wpm} mpm</span>
          <span class="run-acc">${r.acc}%</span>
        </div>`).join("")}</div>` : "";
}

function statCard(value, unit, label, extra) {
  return `<div class="stat-card">
      <div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ""}</div>
      <div class="stat-label">${label}${extra ? ` <span class="stat-extra">${escapeText(extra)}</span>` : ""}</div>
    </div>`;
}

/* ----- Branchements de l'écran classement ----- */
$("#lb-name-save").addEventListener("click", () => {
  const n = setPseudo($("#lb-name").value);
  $("#lb-id-note").textContent = n ? "pseudo enregistré ✓" : "entre un pseudo";
  if (lbTab === "profile") renderProfile();
  else renderLeaderboard();
});
$("#lb-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#lb-name-save").click(); });
$$("#lb-tabs .opt").forEach((b) => b.addEventListener("click", () => showLbTab(b.dataset.lbtab)));
$$("#lb-mode-filter .opt").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#lb-mode-filter .opt").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    lbMode = b.dataset.lbmode;
    lbTextId = ""; lbCodeCat = ""; // en changeant de mode, on repart sur « tous »
    renderLeaderboard();
  })
);
$("#lb-text-select").addEventListener("change", (e) => {
  lbTextId = e.target.value;
  renderLeaderboard();
});
$$("#lb-code-filter .opt").forEach((b) =>
  b.addEventListener("click", () => {
    lbCodeCat = b.dataset.lbcat;
    renderLeaderboard();
  })
);

/* ---------- démarrage ---------- */
loadWordData();
go("home");
