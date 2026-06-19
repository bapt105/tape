/* ============================================================
   tape_ — serveur
   - sert les fichiers statiques du dossier /public
   - gère le multijoueur temps réel (WebSocket) : salons, course, élimination
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { COMMON_WORDS, HARD_WORDS, SPEED_WORDS, TEXTS } = require("./public/words.js");

/* ---------- Mots & textes modifiables (admin) ----------
   Source de vérité partagée par tous les joueurs.
   Les listes par défaut viennent de words.js. Toute modification faite via le
   panneau « admin » est conservée à DEUX endroits :
     1) le fichier local words-data.json (pratique quand on teste sur son PC) ;
     2) un petit stockage en ligne « Upstash Redis » — UNIQUEMENT si les
        variables d'environnement UPSTASH_REDIS_REST_URL et
        UPSTASH_REDIS_REST_TOKEN sont définies.
   Le point 2 est indispensable sur les hébergeurs « jetables » (Render, etc.)
   où le disque repart de zéro à chaque redémarrage : le fichier y est effacé,
   mais le stockage en ligne, lui, survit. En local (sans ces variables) on
   garde simplement le fichier — rien ne change. */
const WORDS_FILE = path.join(__dirname, "words-data.json");
const ADMIN_PASSWORD = "azerty";
const WORDS = { common: [...COMMON_WORDS], hard: [...HARD_WORDS], speed: [...SPEED_WORDS], texts: [...TEXTS] };
// Les listes gérables par l'admin (et sauvegardées).
const LIST_KEYS = ["common", "hard", "speed", "texts"];

// Stockage en ligne (optionnel) — actif seulement si les 2 variables existent.
const STORE_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const STORE_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const STORE_KEY = "tape:words";
const storeEnabled = Boolean(STORE_URL && STORE_TOKEN);

// Recopie les listes valides de `data` dans WORDS. Renvoie true si au moins une.
function applyData(data) {
  let any = false;
  for (const key of LIST_KEYS) {
    if (Array.isArray(data[key]) && data[key].length) { WORDS[key] = data[key]; any = true; }
  }
  return any;
}

// --- Fichier local ---
function loadFile() {
  try { return applyData(JSON.parse(fs.readFileSync(WORDS_FILE, "utf8"))); }
  catch { return false; } // pas de fichier → on garde les listes par défaut
}
function saveFile() {
  try { // écriture « atomique » : fichier temporaire puis renommage (anti-corruption)
    const tmp = WORDS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(WORDS, null, 2));
    fs.renameSync(tmp, WORDS_FILE);
  } catch (e) { console.error("[saveFile]", e); }
}

// --- Stockage en ligne (Upstash Redis, API REST) ---
async function storeCommand(args) {
  const res = await fetch(STORE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${STORE_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000), // 5 s max : ne jamais bloquer le jeu si Upstash traîne
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  return (await res.json()).result;
}
async function loadStore() {
  const raw = await storeCommand(["GET", STORE_KEY]);
  if (!raw) return false;            // rien d'enregistré pour l'instant
  try { return applyData(JSON.parse(raw)); } catch { return false; }
}
async function saveStore() {
  await storeCommand(["SET", STORE_KEY, JSON.stringify(WORDS)]);
}

// Sauvegarde « tout » : fichier local + stockage en ligne (si activé).
async function persist() {
  saveFile();
  if (storeEnabled) {
    try { await saveStore(); }
    catch (e) { console.error("[stockage en ligne] écriture impossible :", e.message); }
  }
}

// Supprime les doublons de chaque liste (garde le 1er, conserve l'ordre).
// Renvoie true si au moins un doublon a été retiré.
function dedupeAll() {
  let changed = false;
  for (const key of LIST_KEYS) {
    const seen = new Set(), out = [];
    for (const v of WORDS[key]) { if (!seen.has(v)) { seen.add(v); out.push(v); } }
    if (out.length !== WORDS[key].length) { WORDS[key] = out; changed = true; }
  }
  return changed;
}

/* ============================================================
   CLASSEMENT (scores des joueurs)
   -----------------------------------------------------------
   Même principe que les mots : on garde tout en mémoire, et on sauvegarde
   dans scores-data.json (fichier local) ET dans Upstash (en ligne) si les
   2 variables d'environnement sont définies. On réutilise EXACTEMENT la même
   base Upstash que les mots — juste une autre « clé » (tape:scores) — donc
   AUCUNE configuration supplémentaire à faire : ça marche dès que les mots
   sont déjà sauvegardés en ligne.

   Pour chaque pseudo on conserve un « profil » :
     - des totaux cumulés (pour les moyennes et les records, sur TOUTES les
       parties depuis toujours) ;
     - le détail par mode (mots / texte / zen / difficile / speed) ;
     - les N dernières parties (pour tracer les COURBES de progression).
   ============================================================ */
const SCORES_FILE = path.join(__dirname, "scores-data.json");
const SCORES_STORE_KEY = "tape:scores";
const SCORE_MODES = ["mots", "texte", "zen", "difficile", "speed"];
const RUNS_KEPT = 100;           // nb de parties gardées par joueur (pour les courbes)
const MAX_PROFILES = 500;        // garde-fou : nb max de profils conservés
const SCORES = { players: {} };  // pseudo -> profil

// Borne un nombre dans [min, max] (et remplace les valeurs invalides par `dflt`).
function clampNum(v, min, max, dflt = 0) {
  v = Number(v);
  if (!Number.isFinite(v)) return dflt;
  return Math.max(min, Math.min(max, Math.round(v)));
}
// Nettoie un pseudo (comme pour les joueurs multi : 14 caractères max).
function cleanName(name) {
  name = (name || "").toString().replace(/\s+/g, " ").trim().slice(0, 14);
  return name || "joueur";
}
function emptyProfile(name) {
  const t = Date.now();
  return {
    name, firstSeen: t, lastSeen: t,
    count: 0, sumWpm: 0, sumAcc: 0, sumChars: 0, sumTimeMs: 0,
    bestWpm: 0, bestMode: null,
    modes: {},   // mode -> { count, sumWpm, sumAcc, bestWpm }
    runs: [],    // { t, mode, wpm, acc, chars, timeMs }
  };
}

// Enregistre une partie terminée. Renvoie le profil mis à jour (ou null si
// la partie est trop courte/invalide pour compter).
function recordScore({ name, mode, wpm, acc, chars, timeMs }) {
  if (!SCORE_MODES.includes(mode)) return null;
  wpm = clampNum(wpm, 0, 400);
  acc = clampNum(acc, 0, 100);
  chars = clampNum(chars, 0, 100000);
  timeMs = clampNum(timeMs, 0, 3600000);
  if (wpm < 1 || chars < 1) return null; // rien tapé → on n'enregistre pas

  const key = cleanName(name);
  let p = SCORES.players[key];
  if (!p) {
    // garde-fou anti-débordement : si trop de profils, on retire le plus ancien
    const names = Object.keys(SCORES.players);
    if (names.length >= MAX_PROFILES) {
      let oldest = names[0];
      for (const n of names) if (SCORES.players[n].lastSeen < SCORES.players[oldest].lastSeen) oldest = n;
      delete SCORES.players[oldest];
    }
    p = emptyProfile(key);
    SCORES.players[key] = p;
  }
  p.lastSeen = Date.now();
  p.count++; p.sumWpm += wpm; p.sumAcc += acc; p.sumChars += chars; p.sumTimeMs += timeMs;
  if (wpm > p.bestWpm) { p.bestWpm = wpm; p.bestMode = mode; }

  let m = p.modes[mode];
  if (!m) { m = { count: 0, sumWpm: 0, sumAcc: 0, bestWpm: 0 }; p.modes[mode] = m; }
  m.count++; m.sumWpm += wpm; m.sumAcc += acc; if (wpm > m.bestWpm) m.bestWpm = wpm;

  p.runs.push({ t: Date.now(), mode, wpm, acc, chars, timeMs });
  if (p.runs.length > RUNS_KEPT) p.runs.splice(0, p.runs.length - RUNS_KEPT);

  persistScores();
  return p;
}

// Construit le tableau du classement, trié (record décroissant). `mode` peut
// être "tous" (record toutes catégories) ou un mode précis.
function leaderboard(mode) {
  const list = [];
  for (const p of Object.values(SCORES.players)) {
    if (mode === "tous") {
      if (p.count <= 0) continue;
      list.push({
        name: p.name, bestWpm: p.bestWpm, bestMode: p.bestMode,
        avgWpm: Math.round(p.sumWpm / p.count), avgAcc: Math.round(p.sumAcc / p.count),
        count: p.count,
      });
    } else {
      const m = p.modes[mode];
      if (!m || m.count <= 0) continue;
      list.push({
        name: p.name, bestWpm: m.bestWpm, bestMode: mode,
        avgWpm: Math.round(m.sumWpm / m.count), avgAcc: Math.round(m.sumAcc / m.count),
        count: m.count,
      });
    }
  }
  list.sort((a, b) => (b.bestWpm - a.bestWpm) || (b.avgWpm - a.avgWpm) || (b.count - a.count));
  return list;
}
// Position d'un joueur au classement « toutes catégories ».
function rankOf(name) {
  const lb = leaderboard("tous");
  const i = lb.findIndex((x) => x.name === name);
  return { rank: i < 0 ? null : i + 1, total: lb.length };
}

// --- Sauvegarde du classement (fichier local) ---
function loadScoresFile() {
  try {
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
    if (data && data.players && typeof data.players === "object") { SCORES.players = data.players; return true; }
  } catch { /* pas de fichier → on démarre avec un classement vide */ }
  return false;
}
function saveScoresFile() {
  try {
    const tmp = SCORES_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(SCORES));
    fs.renameSync(tmp, SCORES_FILE);
  } catch (e) { console.error("[saveScoresFile]", e); }
}
// --- Sauvegarde du classement (Upstash, même base que les mots) ---
async function loadScoresStore() {
  const raw = await storeCommand(["GET", SCORES_STORE_KEY]);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (data && data.players && typeof data.players === "object") { SCORES.players = data.players; return true; }
  } catch { /* contenu illisible → on ignore */ }
  return false;
}
async function saveScoresStore() {
  await storeCommand(["SET", SCORES_STORE_KEY, JSON.stringify(SCORES)]);
}

// Sauvegarde « groupée » : on n'écrit pas à chaque partie (sinon on martèle
// Upstash). On programme une écriture ~2,5 s après le 1er changement, qui
// emporte tous les changements accumulés entre-temps.
let scoresTimer = null;
function persistScores() {
  if (scoresTimer) return;
  scoresTimer = setTimeout(async () => {
    scoresTimer = null;
    saveScoresFile();
    if (storeEnabled) {
      try { await saveScoresStore(); }
      catch (e) { console.error("[classement en ligne] écriture impossible :", e.message); }
    }
  }, 2500);
}

// Port/IP d'écoute :
// - AlwaysData fournit ALWAYSDATA_HTTPD_PORT / ALWAYSDATA_HTTPD_IP
// - Render/Railway/Heroku fournissent PORT
// - en local : 3000 sur toutes les interfaces
const PORT = process.env.ALWAYSDATA_HTTPD_PORT || process.env.PORT || 3000;
const HOST = process.env.ALWAYSDATA_HTTPD_IP || process.env.HOST || "0.0.0.0";
const PUBLIC = path.join(__dirname, "public");

/* ---------- Serveur HTTP : fichiers statiques ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  /* ---------- API : listes de mots ---------- */
  // Le client récupère les listes au chargement.
  if (urlPath === "/api/words" && req.method === "GET") {
    return sendJson(res, 200, WORDS);
  }
  // L'admin ajoute / supprime un mot ou un texte (protégé par mot de passe).
  if (urlPath === "/api/admin" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", async () => {
      let msg; try { msg = JSON.parse(body); } catch { return sendJson(res, 400, { error: "requête invalide" }); }
      if (msg.password !== ADMIN_PASSWORD) return sendJson(res, 403, { error: "mot de passe incorrect" });

      const listName = msg.list; // "common" | "hard" | "texts"
      const needsList = msg.action === "add" || msg.action === "remove" || msg.action === "edit";
      if (needsList && !WORDS[listName]) {
        return sendJson(res, 400, { error: "liste inconnue" });
      }

      let changed = false, message = "";
      if (msg.action === "add") {
        const value = (msg.value || "").toString().trim();
        if (!value) {
          message = "rien à ajouter";
        } else if (listName === "texts") {
          // un texte = une entrée complète (paragraphe)
          if (WORDS.texts.includes(value)) message = "ce texte existe déjà";
          else { WORDS.texts.push(value); changed = true; message = "texte ajouté ✓"; }
        } else {
          // mots : on accepte plusieurs mots séparés par des espaces ; anti-doublon
          let added = 0, dup = 0;
          for (const w of value.split(/\s+/).filter(Boolean)) {
            if (WORDS[listName].includes(w)) dup++;
            else { WORDS[listName].push(w); added++; changed = true; }
          }
          if (added && dup) message = `${added} ajouté(s), ${dup} déjà présent(s)`;
          else if (added) message = added > 1 ? `${added} mots ajoutés ✓` : "ajouté ✓";
          else message = dup > 1 ? "déjà présents" : "déjà présent";
        }
      } else if (msg.action === "remove") {
        const value = (msg.value || "").toString();
        const filtered = WORDS[listName].filter((w) => w !== value);
        // garde-fou : on ne vide jamais complètement une liste (sinon le jeu casse)
        if (filtered.length === 0) {
          return sendJson(res, 400, { error: "impossible de tout supprimer : garde au moins une entrée" });
        }
        changed = filtered.length !== WORDS[listName].length;
        WORDS[listName] = filtered;
        message = "supprimé ✓";
      } else if (msg.action === "edit") {
        // remplace une entrée existante (utilisé pour modifier un texte)
        const oldValue = (msg.oldValue || "").toString();
        const value = (msg.value || "").toString().trim();
        if (!value) return sendJson(res, 400, { error: "le contenu ne peut pas être vide" });
        const idx = WORDS[listName].indexOf(oldValue);
        if (idx === -1) return sendJson(res, 400, { error: "introuvable (déjà modifié ?)" });
        const dup = WORDS[listName].indexOf(value);
        if (dup !== -1 && dup !== idx) return sendJson(res, 400, { error: "existe déjà à l'identique" });
        if (WORDS[listName][idx] !== value) { WORDS[listName][idx] = value; changed = true; }
        message = changed ? "modifié ✓" : "aucun changement";
      }
      // action "check" (connexion) : on renvoie juste les listes, sans message

      if (changed) await persist();
      return sendJson(res, 200, { lists: WORDS, message });
    });
    return;
  }

  /* ---------- API : classement ---------- */
  // Le tableau du classement (trié), filtrable par mode (?mode=tous|mots|…).
  if (urlPath === "/api/leaderboard" && req.method === "GET") {
    let mode = "tous";
    try { mode = new URL(req.url, "http://x").searchParams.get("mode") || "tous"; } catch {}
    if (mode !== "tous" && !SCORE_MODES.includes(mode)) mode = "tous";
    return sendJson(res, 200, { mode, players: leaderboard(mode) });
  }
  // Le profil détaillé d'un joueur (stats + historique pour les courbes).
  if (urlPath === "/api/profile" && req.method === "GET") {
    let name = "";
    try { name = new URL(req.url, "http://x").searchParams.get("name") || ""; } catch {}
    const p = SCORES.players[cleanName(name)] || null;
    return sendJson(res, 200, { profile: p, rank: p ? rankOf(p.name) : null });
  }
  // Enregistre une partie terminée (envoyé par le client à la fin d'un solo).
  if (urlPath === "/api/score" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on("end", () => {
      let msg; try { msg = JSON.parse(body); } catch { return sendJson(res, 400, { error: "requête invalide" }); }
      const p = recordScore({
        name: msg.name, mode: msg.mode,
        wpm: msg.wpm, acc: msg.accuracy, chars: msg.chars, timeMs: msg.timeMs,
      });
      if (!p) return sendJson(res, 200, { ok: true, recorded: false });
      const { rank, total } = rankOf(p.name);
      return sendJson(res, 200, { ok: true, recorded: true, profile: p, rank, total });
    });
    return;
  }

  /* ---------- Fichiers statiques ---------- */
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(PUBLIC, path.normalize(urlPath));

  // empêche de sortir du dossier public
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end("403"); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("404 — page introuvable"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

/* ---------- Multijoueur ---------- */
const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> room
let pid = 0;

const COURSE_GRACE_MS = 45000;          // temps max après le 1er arrivé (course)
const ELIM_COUNT = 50;                   // nb de mots par manche (élimination, contenu « mots »)
const ELIM_DURATION_MS = 18000;          // durée d'une manche
const ELIM_GAP_MS = 3500;                // pause entre les manches
const WORD_COURSE_COUNT = 40;            // nb de mots à taper en course (contenu « mots »)
const PATATE_WORD_COUNT = 2;             // nb de mots à taper pour refiler la patate

const MODES = ["course", "elimination", "patate", "hard", "speed"];
function normMode(m) { return MODES.includes(m) ? m : "course"; }
// Modes « course » : tout le monde tape la même chose, le 1er à finir gagne.
const RACE_MODES = ["course", "hard", "speed"];
function isRace(m) { return RACE_MODES.includes(m); }

// Réglages des modes : valeurs autorisées + valeurs par défaut
const OPT_VALUES = { lives: [1, 2, 3], elimDur: [12, 18, 25], hardCount: [20, 30, 50], speedCount: [20, 40, 60] };
// Contenu par défaut pour course / élimination : texte long pour la course, mots pour l'élimination.
function defaultContentFor(mode) { return mode === "elimination" ? "mots" : "texte"; }
function defaultOpts(mode) {
  return { lives: 2, elimDur: 18, hardCount: 30, speedCount: 40, content: defaultContentFor(mode || "course"), textChoice: "rand" };
}
// Choisit l'index du texte à utiliser (un index précis choisi par l'hôte, ou aléatoire).
function pickTextIndex(room) {
  const n = WORDS.texts.length;
  const c = room.opts && room.opts.textChoice;
  if (Number.isInteger(c) && c >= 0 && c < n) return c;
  return Math.floor(Math.random() * n);
}

function code4() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(""); }
  while (rooms.has(c));
  return c;
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj) {
  for (const p of room.players.values()) send(p.ws, obj);
}

/* ----- Chat du salon ----- */
const CHAT_MAX = 60; // nb de messages gardés dans l'historique d'un salon
function pushChat(room, entry) {
  if (!room.chat) room.chat = [];
  room.chat.push(entry);
  if (room.chat.length > CHAT_MAX) room.chat.splice(0, room.chat.length - CHAT_MAX);
}
// Message « système » (arrivée / départ) : stocké dans l'historique + diffusé.
function systemChat(room, text) {
  const entry = { system: true, text };
  pushChat(room, entry);
  broadcast(room, { type: "chat", system: true, text });
}

function playerList(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, ready: p.ready, host: p.id === room.hostId,
    eliminated: p.eliminated,
  }));
}
function raceState(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, progress: p.progress, wpm: p.wpm,
    finished: p.finished, eliminated: p.eliminated, lives: p.lives,
  }));
}

function startCountdownThenPlay(room) {
  room.state = "countdown";
  broadcast(room, { type: "countdown" });
  // les clients affichent 3-2-1 (3s) ; on lance ensuite la manche
  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    if (isRace(room.mode)) startCourse(room);
    else if (room.mode === "patate") startPatate(room);
    else startElimRound(room);
  }, 3200);
}

/* ----- COURSE ----- */
function startCourse(room) {
  room.state = "playing";
  room.startedAt = Date.now();
  room.firstFinishTimer = null;
  for (const p of room.players.values()) {
    p.progress = 0; p.wpm = 0; p.finished = false; p.finishTime = null; p.rank = null;
  }
  if (room.mode === "hard") {
    room.seed = Math.floor(Math.random() * 1e9);
    const count = (room.opts && room.opts.hardCount) || 30;
    broadcast(room, { type: "start", mode: "hard", seed: room.seed, count });
  } else if (room.mode === "speed") {
    // course sur des mots simples sans accents
    room.seed = Math.floor(Math.random() * 1e9);
    const count = (room.opts && room.opts.speedCount) || 40;
    broadcast(room, { type: "start", mode: "speed", seed: room.seed, count });
  } else if (room.opts && room.opts.content === "mots") {
    // course sur des mots courants
    room.seed = Math.floor(Math.random() * 1e9);
    broadcast(room, { type: "start", mode: "course", content: "mots", seed: room.seed, count: WORD_COURSE_COUNT });
  } else {
    // course sur un texte long (précis ou aléatoire)
    room.textIndex = pickTextIndex(room);
    broadcast(room, { type: "start", mode: "course", content: "texte", textIndex: room.textIndex });
  }
}
function endCourse(room) {
  if (room.state !== "playing") return;
  room.state = "ended";
  if (room.firstFinishTimer) clearTimeout(room.firstFinishTimer);
  const players = [...room.players.values()];
  const ranking = players
    .map((p) => ({
      name: p.name,
      finished: p.finished,
      time: p.finishTime,
      wpm: p.wpm,
      accuracy: p.accuracy || 0,
      progress: p.progress,
    }))
    .sort((a, b) => {
      if (a.finished && b.finished) return a.time - b.time;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  broadcast(room, { type: "result", mode: room.mode, ranking });
  resetReady(room);
}

/* ----- ÉLIMINATION ----- */
function startElimRound(room) {
  room.state = "playing";
  room.round = (room.round || 0) + 1;
  room.seed = Math.floor(Math.random() * 1e9);
  const dur = (room.opts && room.opts.elimDur ? room.opts.elimDur : 18) * 1000;
  for (const p of room.players.values()) { p.score = 0; p.progress = 0; p.wpm = 0; }
  if (room.opts && room.opts.content === "texte") {
    // manche sur un texte long (précis ou aléatoire)
    room.textIndex = pickTextIndex(room);
    broadcast(room, {
      type: "start", mode: "elimination", content: "texte",
      textIndex: room.textIndex, duration: dur, round: room.round,
    });
  } else {
    // manche sur des mots courants
    broadcast(room, {
      type: "start", mode: "elimination", content: "mots",
      seed: room.seed, count: ELIM_COUNT, duration: dur, round: room.round,
    });
  }
  room.roundTimer = setTimeout(() => evaluateElim(room), dur + 800);
}
function evaluateElim(room) {
  if (room.state !== "playing") return;
  const active = [...room.players.values()].filter((p) => !p.eliminated);
  if (active.length <= 1) { finishElim(room); return; }
  // élimine le score le plus bas (égalité : wpm le plus bas)
  active.sort((a, b) => (a.score - b.score) || (a.wpm - b.wpm));
  const out = active[0];
  out.eliminated = true;
  room.elimOrder.push(out.name);
  const remaining = active.length - 1;
  broadcast(room, {
    type: "roundEnd", round: room.round,
    eliminated: out.name, eliminatedId: out.id,
    standings: active.map((p) => ({ id: p.id, name: p.name, score: p.score, wpm: p.wpm, eliminated: p.eliminated })),
    remaining,
  });
  if (remaining <= 1) { setTimeout(() => finishElim(room), 1500); }
  else { setTimeout(() => { if (rooms.has(room.code)) startCountdownThenPlay(room); }, ELIM_GAP_MS); }
}
function finishElim(room) {
  room.state = "ended";
  const winner = [...room.players.values()].find((p) => !p.eliminated);
  const ranking = [];
  if (winner) ranking.push({ name: winner.name, place: 1 });
  // les éliminés du plus récent au plus ancien
  for (let i = room.elimOrder.length - 1; i >= 0; i--) {
    ranking.push({ name: room.elimOrder[i], place: ranking.length + 1 });
  }
  broadcast(room, { type: "result", mode: room.mode, ranking });
  resetReady(room);
}

/* ----- PATATE CHAUDE ----- */
function randWord() {
  const list = WORDS.common;
  return list[Math.floor(Math.random() * list.length)];
}
// plusieurs mots séparés par des espaces : le joueur doit tous les taper pour passer la patate
function randPatateWords() {
  const out = [];
  for (let i = 0; i < PATATE_WORD_COUNT; i++) {
    let w = randWord();
    if (i > 0) { while (w === out[i - 1]) w = randWord(); } // évite deux mots identiques à la suite
    out.push(w);
  }
  return out.join(" ");
}
function startPatate(room) {
  room.state = "playing";
  room.elimOrder = [];
  const lives = (room.opts && room.opts.lives) || 2;
  for (const p of room.players.values()) { p.lives = lives; p.eliminated = false; }
  broadcast(room, { type: "start", mode: "patate", lives });
  // laisse le temps au 3-2-1 côté client, puis lance la première bombe
  setTimeout(() => { if (rooms.has(room.code)) beginPatateRound(room); }, 3200);
}
function beginPatateRound(room) {
  if (!rooms.has(room.code)) return;
  const active = [...room.players.values()].filter((p) => !p.eliminated);
  if (active.length <= 1) { finishElim(room); return; }
  room.state = "playing";
  room.turnIds = active.map((p) => p.id);
  room.holderIdx = Math.floor(Math.random() * room.turnIds.length);
  room.bombTotal = 5000 + Math.floor(Math.random() * 15001); // 5 à 20 s
  room.bombEnd = Date.now() + room.bombTotal;
  room.currentWord = randPatateWords();
  if (room.bombTimer) clearTimeout(room.bombTimer);
  room.bombTimer = setTimeout(() => explodePatate(room), room.bombTotal);
  sendPotato(room);
}
function sendPotato(room) {
  if (!room.turnIds) return; // sécurité : pas de manche en cours
  broadcast(room, {
    type: "potato",
    holderId: room.turnIds[room.holderIdx],
    word: room.currentWord,
    bombTotal: room.bombTotal,
    bombRemaining: Math.max(0, room.bombEnd - Date.now()),
    players: raceState(room),
  });
}
function passPotato(room) {
  // joueur suivant encore en jeu (la bombe continue de brûler)
  let guard = 0;
  do {
    room.holderIdx = (room.holderIdx + 1) % room.turnIds.length;
    const p = room.players.get(room.turnIds[room.holderIdx]);
    if (p && !p.eliminated) break;
  } while (guard++ < room.turnIds.length);
  room.currentWord = randPatateWords();
  sendPotato(room);
}
// une faute de frappe rapproche l'explosion d'1 seconde (le client n'envoie qu'une pénalité par tour)
// note : le minuteur de la bombe est caché côté client, donc pas besoin de renvoyer de message « potato »
function penalizePatate(room) {
  if (!room.bombTimer || room.state !== "playing") return;
  const remaining = Math.max(0, room.bombEnd - Date.now() - 1000);
  room.bombEnd = Date.now() + remaining;
  clearTimeout(room.bombTimer);
  room.bombTimer = setTimeout(() => explodePatate(room), remaining);
}
function explodePatate(room) {
  if (room.state !== "playing" || room.mode !== "patate") return;
  room.state = "roundend"; // stoppe les « pass » jusqu'à la manche suivante
  const holder = room.players.get(room.turnIds[room.holderIdx]);
  if (!holder) { beginPatateRound(room); return; }
  holder.lives = (holder.lives || 1) - 1;
  const out = holder.lives <= 0;
  if (out) { holder.eliminated = true; room.elimOrder.push(holder.name); }
  const remaining = [...room.players.values()].filter((p) => !p.eliminated).length;
  broadcast(room, {
    type: "roundEnd",
    exploded: holder.name, explodedId: holder.id, livesLeft: Math.max(0, holder.lives),
    eliminated: out ? holder.name : null,
    eliminatedId: out ? holder.id : null,
    remaining, standings: raceState(room),
  });
  if (remaining <= 1) setTimeout(() => finishElim(room), 1800);
  else setTimeout(() => { if (rooms.has(room.code)) beginPatateRound(room); }, ELIM_GAP_MS);
}

function resetReady(room) {
  for (const p of room.players.values()) { p.ready = false; }
}
function resetRoom(room) {
  if (room.roundTimer) clearTimeout(room.roundTimer);
  if (room.firstFinishTimer) clearTimeout(room.firstFinishTimer);
  if (room.bombTimer) clearTimeout(room.bombTimer);
  room.state = "lobby"; room.round = 0; room.elimOrder = []; room.turnIds = null;
  for (const p of room.players.values()) {
    p.ready = false; p.eliminated = false; p.progress = 0; p.wpm = 0;
    p.finished = false; p.score = 0;
  }
}

function tryStart(room, byId) {
  if (room.state !== "lobby") return;
  if (room.hostId !== byId) return;
  const players = [...room.players.values()];
  if (players.length < 2) { send(room.players.get(byId).ws, { type: "error", message: "Il faut au moins 2 joueurs." }); return; }
  if (!players.every((p) => p.ready)) { send(room.players.get(byId).ws, { type: "error", message: "Tous les joueurs ne sont pas prêts." }); return; }
  room.elimOrder = []; room.round = 0;
  startCountdownThenPlay(room);
}

wss.on("connection", (ws) => {
  ws.player = null;
  ws.roomCode = null;

  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.roomCode ? rooms.get(ws.roomCode) : null;

    switch (msg.type) {
      case "create": {
        const code = code4();
        const id = ++pid;
        const player = mkPlayer(id, msg.name, ws);
        const mode = normMode(msg.mode);
        const r = {
          code, hostId: id, mode, opts: defaultOpts(mode),
          state: "lobby", round: 0, elimOrder: [], players: new Map([[id, player]]), chat: [],
        };
        rooms.set(code, r);
        ws.player = player; ws.roomCode = code;
        send(ws, { type: "joined", code, you: id, mode: r.mode, opts: r.opts, isHost: true, players: playerList(r), chat: r.chat });
        break;
      }
      case "join": {
        const r = rooms.get((msg.code || "").toUpperCase());
        if (!r) { send(ws, { type: "error", message: "Salon introuvable." }); return; }
        if (r.state !== "lobby") { send(ws, { type: "error", message: "La partie a déjà commencé." }); return; }
        if (r.players.size >= 8) { send(ws, { type: "error", message: "Salon complet (8 max)." }); return; }
        const id = ++pid;
        const player = mkPlayer(id, msg.name, ws);
        r.players.set(id, player);
        ws.player = player; ws.roomCode = r.code;
        send(ws, { type: "joined", code: r.code, you: id, mode: r.mode, opts: r.opts, isHost: false, players: playerList(r), chat: r.chat || [] });
        broadcast(r, { type: "players", players: playerList(r), mode: r.mode, opts: r.opts });
        systemChat(r, `${player.name} a rejoint le salon`);
        break;
      }
      case "ready": {
        if (!room || !ws.player || room.state !== "lobby") return;
        ws.player.ready = !!msg.ready;
        broadcast(room, { type: "players", players: playerList(room), mode: room.mode, opts: room.opts });
        break;
      }
      case "setmode": {
        // seul l'hôte peut changer le mode, et seulement dans le salon
        if (!room || !ws.player) return;
        if (room.hostId !== ws.player.id || room.state !== "lobby") return;
        const newMode = normMode(msg.mode);
        if (newMode !== room.mode) {
          room.mode = newMode;
          // remet le contenu par défaut du nouveau mode (texte pour course, mots pour élim)
          room.opts.content = defaultContentFor(newMode);
          room.opts.textChoice = "rand";
        }
        broadcast(room, { type: "players", players: playerList(room), mode: room.mode, opts: room.opts });
        break;
      }
      case "setopt": {
        // l'hôte change un réglage (vies / durée / nb de mots / contenu / texte), dans le salon
        if (!room || !ws.player) return;
        if (room.hostId !== ws.player.id || room.state !== "lobby") return;
        const { key, value } = msg;
        let ok = false;
        if (OPT_VALUES[key] && OPT_VALUES[key].includes(value)) ok = true;
        else if (key === "content" && (value === "texte" || value === "mots")) ok = true;
        else if (key === "textChoice" &&
          (value === "rand" || (Number.isInteger(value) && value >= 0 && value < WORDS.texts.length))) ok = true;
        if (ok) {
          room.opts[key] = value;
          broadcast(room, { type: "players", players: playerList(room), mode: room.mode, opts: room.opts });
        }
        break;
      }
      case "start": {
        if (room && ws.player) tryStart(room, ws.player.id);
        break;
      }
      case "chat": {
        // message de chat du salon : on nettoie, on borne, puis on diffuse à tous.
        if (!room || !ws.player) return;
        const text = (msg.text || "").toString().replace(/\s+/g, " ").trim().slice(0, 200);
        if (!text) return;
        pushChat(room, { name: ws.player.name, text });
        broadcast(room, { type: "chat", name: ws.player.name, text });
        break;
      }
      case "progress": {
        if (!room || !ws.player || room.state !== "playing") return;
        const p = ws.player;
        p.progress = msg.progress || 0;
        p.wpm = msg.wpm || 0;
        if (typeof msg.chars === "number") p.score = msg.chars;
        broadcast(room, { type: "update", players: raceState(room) });
        break;
      }
      case "pass": {
        // le porteur de la patate a tapé son mot → on la refile
        if (!room || !ws.player || room.mode !== "patate" || room.state !== "playing") return;
        if (!room.turnIds || room.turnIds[room.holderIdx] !== ws.player.id) return;
        passPotato(room);
        break;
      }
      case "typo": {
        // le porteur a fait une faute → la bombe explose 1 s plus tôt (1 seule pénalité par tour, gérée côté client)
        if (!room || !ws.player || room.mode !== "patate" || room.state !== "playing") return;
        if (!room.turnIds || room.turnIds[room.holderIdx] !== ws.player.id) return;
        penalizePatate(room);
        break;
      }
      case "finished": {
        if (!room || !ws.player || !isRace(room.mode) || room.state !== "playing") return;
        const p = ws.player;
        if (p.finished) return;
        p.finished = true;
        p.finishTime = Date.now() - room.startedAt;
        p.wpm = msg.wpm || p.wpm;
        p.accuracy = msg.accuracy || 0;
        p.progress = 100;
        broadcast(room, { type: "update", players: raceState(room) });
        const all = [...room.players.values()];
        if (all.every((x) => x.finished)) { endCourse(room); }
        else if (!room.firstFinishTimer) {
          room.firstFinishTimer = setTimeout(() => endCourse(room), COURSE_GRACE_MS);
        }
        break;
      }
      case "rematch": {
        if (!room) return;
        resetRoom(room);
        broadcast(room, { type: "lobby", mode: room.mode, opts: room.opts, players: playerList(room) });
        break;
      }
      case "leave": {
        leave(ws);
        break;
      }
    }
  });

  ws.on("close", () => leave(ws));
});

function mkPlayer(id, name, ws) {
  name = (name || "joueur").toString().slice(0, 14).trim() || "joueur";
  return {
    id, name, ws, ready: false, progress: 0, wpm: 0, accuracy: 0,
    finished: false, finishTime: null, eliminated: false, score: 0,
  };
}

function leave(ws) {
  const code = ws.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  ws.roomCode = null;
  if (!room) return;
  const wasHost = ws.player && room.hostId === ws.player.id;
  const leftId = ws.player ? ws.player.id : null;
  const leftName = ws.player ? ws.player.name : null;
  if (ws.player) room.players.delete(ws.player.id);
  ws.player = null;

  if (room.players.size === 0) {
    if (room.roundTimer) clearTimeout(room.roundTimer);
    if (room.firstFinishTimer) clearTimeout(room.firstFinishTimer);
    rooms.delete(code);
    return;
  }
  // nouvel hôte si besoin
  if (wasHost) room.hostId = [...room.players.keys()][0];

  if (room.state === "lobby") {
    broadcast(room, { type: "players", players: playerList(room), mode: room.mode, opts: room.opts });
    if (leftName) systemChat(room, `${leftName} a quitté le salon`);
  } else if (room.state === "playing") {
    if (isRace(room.mode)) {
      const all = [...room.players.values()];
      if (all.length && all.every((x) => x.finished)) endCourse(room);
      else broadcast(room, { type: "update", players: raceState(room) });
    } else if (room.mode === "patate") {
      const active = [...room.players.values()].filter((p) => !p.eliminated);
      if (active.length <= 1) { if (room.bombTimer) clearTimeout(room.bombTimer); finishElim(room); }
      else if (room.turnIds) { // la manche est lancée (turnIds défini)
        if (room.turnIds[room.holderIdx] === leftId) passPotato(room); // le porteur est parti
        else sendPotato(room); // rafraîchit la liste
      }
      // sinon : on est avant la 1re bombe (turnIds pas encore défini) → rien à faire
    } else {
      // élimination : si un seul joueur actif reste, on termine
      const active = [...room.players.values()].filter((p) => !p.eliminated);
      if (active.length <= 1) { if (room.roundTimer) clearTimeout(room.roundTimer); finishElim(room); }
      else broadcast(room, { type: "update", players: raceState(room) });
    }
  }
}

// Filet de sécurité : on logue les erreurs imprévues sans tuer le serveur,
// pour qu'un bug dans un salon ne déconnecte pas tout le monde.
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

// Démarrage : on récupère les mots (fichier puis stockage en ligne s'il existe),
// on nettoie les doublons, puis seulement on ouvre le serveur — ainsi les
// joueurs reçoivent tout de suite les bonnes listes.
async function init() {
  loadFile(); // fichier local / valeurs par défaut de words.js
  let fromStore = false, storeOk = false;
  if (storeEnabled) {
    try { fromStore = await loadStore(); storeOk = true; }
    catch (e) { console.error("[stockage en ligne] lecture impossible :", e.message); }
  }
  const deduped = dedupeAll();
  if (deduped) saveFile();
  // 1er lancement avec un stockage vide → on y recopie les listes actuelles ;
  // (sinon, si on vient de retirer des doublons, on pousse aussi la version nettoyée)
  if (storeEnabled && storeOk && (!fromStore || deduped)) {
    try { await saveStore(); }
    catch (e) { console.error("[stockage en ligne] écriture impossible :", e.message); storeOk = false; }
  }

  // Classement : on charge le fichier local puis, s'il existe, le stockage en
  // ligne (qui fait foi). Comme pour les mots, l'en-ligne survit aux redémarrages.
  loadScoresFile();
  if (storeEnabled) {
    try { await loadScoresStore(); }
    catch (e) { console.error("[classement en ligne] lecture impossible :", e.message); }
  }

  server.listen(PORT, HOST, () => {
    const shown = HOST === "0.0.0.0" ? "localhost" : HOST;
    let stockage;
    if (!storeEnabled) stockage = "fichier local seulement";
    else if (storeOk) stockage = "en ligne (Upstash) ✓";
    else stockage = "⚠ Upstash configuré mais injoignable — vérifie les 2 clés";
    console.log(`\n  tape_  ▸  http://${shown}:${PORT}`);
    console.log(`  sauvegarde des mots : ${stockage}`);
    console.log(`  (Ctrl+C pour arrêter)\n`);
  });
}
init();
