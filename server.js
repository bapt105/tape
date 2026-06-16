/* ============================================================
   tape_ — serveur
   - sert les fichiers statiques du dossier /public
   - gère le multijoueur temps réel (WebSocket) : salons, course, élimination
   ============================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { COMMON_WORDS, HARD_WORDS, TEXTS } = require("./public/words.js");

/* ---------- Mots & textes modifiables (admin) ----------
   Source de vérité partagée par tous les joueurs.
   Les listes par défaut viennent de words.js ; toute modification faite
   via le panneau « admin » est sauvegardée dans words-data.json, donc
   conservée même après un redémarrage du serveur. */
const WORDS_FILE = path.join(__dirname, "words-data.json");
const ADMIN_PASSWORD = "azerty";
const WORDS = { common: [...COMMON_WORDS], hard: [...HARD_WORDS], texts: [...TEXTS] };

function loadWords() {
  try {
    const data = JSON.parse(fs.readFileSync(WORDS_FILE, "utf8"));
    for (const key of ["common", "hard", "texts"]) {
      if (Array.isArray(data[key]) && data[key].length) WORDS[key] = data[key];
    }
  } catch { /* pas de fichier → on garde les listes par défaut */ }
}
function saveWords() {
  try { fs.writeFileSync(WORDS_FILE, JSON.stringify(WORDS, null, 2)); }
  catch (e) { console.error("[saveWords]", e); }
}
loadWords();

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
    req.on("end", () => {
      let msg; try { msg = JSON.parse(body); } catch { return sendJson(res, 400, { error: "requête invalide" }); }
      if (msg.password !== ADMIN_PASSWORD) return sendJson(res, 403, { error: "mot de passe incorrect" });

      const listName = msg.list; // "common" | "hard" | "texts"
      if ((msg.action === "add" || msg.action === "remove") && !WORDS[listName]) {
        return sendJson(res, 400, { error: "liste inconnue" });
      }

      let changed = false;
      if (msg.action === "add") {
        const value = (msg.value || "").toString().trim();
        if (value) {
          if (listName === "texts") {
            // un texte = une entrée complète (paragraphe)
            if (!WORDS.texts.includes(value)) { WORDS.texts.push(value); changed = true; }
          } else {
            // mots : on accepte plusieurs mots séparés par des espaces
            for (const w of value.split(/\s+/).filter(Boolean)) {
              if (!WORDS[listName].includes(w)) { WORDS[listName].push(w); changed = true; }
            }
          }
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
      }
      // action "check" (ou sans modif) : on renvoie simplement les listes à jour

      if (changed) saveWords();
      return sendJson(res, 200, WORDS);
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
const ELIM_COUNT = 50;                   // nb de mots par manche (élimination)
const ELIM_DURATION_MS = 18000;          // durée d'une manche
const ELIM_GAP_MS = 3500;                // pause entre les manches

const MODES = ["course", "elimination", "patate", "hard"];
function normMode(m) { return MODES.includes(m) ? m : "course"; }

// Réglages des modes : valeurs autorisées + valeurs par défaut
const OPT_VALUES = { lives: [1, 2, 3], elimDur: [12, 18, 25], hardCount: [20, 30, 50] };
function defaultOpts() { return { lives: 2, elimDur: 18, hardCount: 30 }; }

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
    if (room.mode === "course" || room.mode === "hard") startCourse(room);
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
  } else {
    room.textIndex = Math.floor(Math.random() * WORDS.texts.length);
    broadcast(room, { type: "start", mode: "course", textIndex: room.textIndex });
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
  broadcast(room, {
    type: "start", mode: "elimination",
    seed: room.seed, count: ELIM_COUNT, duration: dur, round: room.round,
  });
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
  room.bombTotal = 6000 + Math.floor(Math.random() * 8000); // 6 à 14 s
  room.bombEnd = Date.now() + room.bombTotal;
  room.currentWord = randWord();
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
  room.currentWord = randWord();
  sendPotato(room);
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
        const r = {
          code, hostId: id, mode: normMode(msg.mode), opts: defaultOpts(),
          state: "lobby", round: 0, elimOrder: [], players: new Map([[id, player]]),
        };
        rooms.set(code, r);
        ws.player = player; ws.roomCode = code;
        send(ws, { type: "joined", code, you: id, mode: r.mode, opts: r.opts, isHost: true, players: playerList(r) });
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
        send(ws, { type: "joined", code: r.code, you: id, mode: r.mode, opts: r.opts, isHost: false, players: playerList(r) });
        broadcast(r, { type: "players", players: playerList(r), mode: r.mode, opts: r.opts });
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
        room.mode = normMode(msg.mode);
        broadcast(room, { type: "players", players: playerList(room), mode: room.mode, opts: room.opts });
        break;
      }
      case "setopt": {
        // l'hôte change un réglage (vies / durée / nombre de mots), dans le salon
        if (!room || !ws.player) return;
        if (room.hostId !== ws.player.id || room.state !== "lobby") return;
        if (OPT_VALUES[msg.key] && OPT_VALUES[msg.key].includes(msg.value)) {
          room.opts[msg.key] = msg.value;
          broadcast(room, { type: "players", players: playerList(room), mode: room.mode, opts: room.opts });
        }
        break;
      }
      case "start": {
        if (room && ws.player) tryStart(room, ws.player.id);
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
      case "finished": {
        if (!room || !ws.player || (room.mode !== "course" && room.mode !== "hard") || room.state !== "playing") return;
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
  } else if (room.state === "playing") {
    if (room.mode === "course" || room.mode === "hard") {
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

server.listen(PORT, HOST, () => {
  const shown = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`\n  tape_  ▸  http://${shown}:${PORT}\n  (Ctrl+C pour arrêter)\n`);
});
