/* ============================================================
   Données : mots courants + textes (français)
   Partagé par le solo et le multijoueur.
   ============================================================ */

// ~300 mots français courants (sans doublons)
const COMMON_WORDS = [
  "le","la","les","un","une","des","de","du","et","ou","mais","donc","car","ni",
  "à","au","aux","en","dans","sur","sous","vers","chez","avec","sans","pour","par",
  "il","elle","je","tu","nous","vous","ils","elles","on","ce","cet","cette","ces",
  "mon","ton","son","ma","ta","sa","mes","tes","ses","notre","votre","leur","leurs",
  "qui","que","quoi","dont","où","quand","comment","pourquoi","combien","si","comme",
  "est","sont","était","être","avoir","fait","faire","dit","dire","va","aller","voir",
  "vu","savoir","sais","sait","peut","pouvoir","veut","vouloir","vient","venir","prend",
  "prendre","met","mettre","donne","donner","trouve","trouver","parle","parler","aime",
  "aimer","pense","penser","croit","doit","devoir","passe","passer","reste","rester",
  "garde","monde","temps","jour","jours","nuit","vie","homme","femme","enfant","ami",
  "amour","main","mains","yeux","tête","coeur","eau","feu","terre","ciel","mer","soleil",
  "lune","étoile","arbre","fleur","oiseau","chien","chat","maison","ville","rue","route",
  "voiture","train","école","livre","mot","mots","page","lettre","histoire","musique",
  "film","jeu","travail","argent","porte","fenêtre","table","chaise","lit","mur","sol",
  "pain","vin","café","idée","raison","force","vérité","mort","bien","mal","grand","petit",
  "gros","long","court","haut","bas","beau","joli","vieux","jeune","nouveau","bon","mauvais",
  "chaud","froid","vrai","faux","fort","faible","plein","vide","riche","pauvre","propre",
  "sale","facile","difficile","premier","dernier","seul","même","autre","tout","tous","toute",
  "rien","quelque","chaque","plusieurs","beaucoup","peu","trop","très","plus","moins","assez",
  "mieux","ici","là","partout","ailleurs","dehors","dedans","dessus","dessous","devant",
  "derrière","près","loin","avant","après","pendant","toujours","jamais","souvent","parfois",
  "encore","déjà","bientôt","maintenant","hier","demain","matin","soir","midi","minuit",
  "semaine","mois","année","heure","minute","seconde","oui","non","merci","bonjour","salut",
  "alors","ainsi","enfin","surtout","presque","vraiment","simplement","doucement","vite",
  "lentement","ensemble","contre","depuis","entre","jusque","selon","malgré","puisque","parce",
  "lorsque","tandis","cependant","pourtant","néanmoins","aussi","autant","tellement","plutôt",
  "ouvrir","fermer","monter","descendre","courir","marcher","tomber","lever","porter","tenir",
  "lire","écrire","compter","chanter","danser","jouer","gagner","perdre","commencer","finir",
  "attendre","entendre","écouter","regarder","montrer","cacher","chercher","perdre","oublier",
  "souvenir","apprendre","comprendre","expliquer","répondre","appeler","crier","rire","pleurer",
  "sourire","dormir","manger","boire","vivre","mourir","naître","grandir","changer","devenir"
];

// Mots difficiles : accents, lettres rares, mots longs (mode « difficile »)
const HARD_WORDS = [
  "château","hétéroclite","généalogie","kinésithérapeute","électroencéphalogramme",
  "otorhinolaryngologie","désoxyribonucléique","ambiguïté","exiguïté","coïncidence",
  "égoïsme","héroïque","naïveté","stoïque","païen","aïeul","caïman","faïence","mosaïque",
  "laïcité","archaïque","ouïe","inouï","anticonstitutionnellement","chrysanthème",
  "psychologie","rythme","système","événement","éphémère","métamorphose","onomatopée",
  "parallélépipède","bureaucratie","dysfonctionnement","enchevêtrement","abasourdi",
  "saugrenu","époustouflant","pusillanime","obséquieux","somnambule","crépuscule",
  "éblouissant","vraisemblablement","quincaillerie","écoeurant","gargouille","libellule",
  "millefeuille","portefeuille","chèvrefeuille","gageure","prestidigitateur","quintessence",
  "chuchotement","protozoaire","paradoxe","sérénité","théâtre","piqûre","aiguë","ciguë",
  "jeûne","bûcheron","flûtiste","maître","traître","huître","cloître","chômage","diplôme",
  "drôlerie","extrême","suprême","problème","modèle","fidèle","siècle","règlement","élève",
  "préférée","espèce","déçu","reçu","façade","garçon","leçon","français","soupçon","hameçon",
  "glaçon","tronçon","caleçon","balançoire","accueillir","cueillette","orgueilleux",
  "recueillement","oxygène","hydrogène","kaléidoscope","labyrinthe","hippopotame","rhinocéros",
  "zoologique","sténographie","sphygmomanomètre","anticonformiste","circonlocution"
];

// Mots « speed » : ultra simples, SANS accent, longueur variée (mode « speed »).
// But : taper le plus vite possible sans se prendre les doigts dans les accents.
const SPEED_WORDS = [
  "chat","chien","maison","table","chaise","porte","livre","page","stylo","papier",
  "sac","main","pied","jardin","arbre","plante","fleur","herbe","route","ville",
  "village","pont","train","avion","bateau","moto","camion","gare","port","plage",
  "sable","vague","montagne","colline","bois","champ","pomme","poire","banane","orange",
  "fraise","cerise","raisin","citron","tomate","salade","carotte","oignon","pain","beurre",
  "fromage","jambon","poulet","poisson","soupe","biscuit","chocolat","bonbon","sucre","poivre",
  "lait","verre","tasse","assiette","fourchette","couteau","casserole","lampe","bureau","ordinateur",
  "clavier","souris","portable","radio","musique","film","photo","image","dessin","couleur",
  "rouge","bleu","vert","jaune","violet","blanc","noir","marron","grand","petit",
  "mince","large","rond","rapide","lent","chaud","froid","facile","simple","propre",
  "content","calme","gentil","docteur","facteur","boulanger","pompier","policier","chanteur","peintre",
  "marin","pilote","soleil","lune","nuage","pluie","vent","neige","orage","jour",
  "matin","heure","minute","semaine","lundi","mardi","mercredi","jeudi","vendredi","samedi",
  "dimanche","copain","famille","cousin","enfant","bonjour","merci","ballon","jouet","carte",
  "cadeau","vacances","voyage","valise","chemin","argent","banque","magasin"
];

// Textes pour le mode « Texte » (originaux, libres de droits)
const TEXTS = [
  "Le matin, la ville s'éveille lentement sous une lumière douce. Les rues encore vides se remplissent peu à peu de pas pressés et de voix tranquilles. Quelque part, une fenêtre s'ouvre, et l'odeur du café se répand dans l'air frais du jour qui commence.",

  "Apprendre à taper vite demande de la patience plus que de la vitesse. Au début, les doigts hésitent et cherchent leur place. Puis, jour après jour, le geste devient naturel, presque invisible, et les mots se posent sur l'écran sans que l'on y pense vraiment.",

  "La mer changeait de couleur à chaque heure. Le matin elle était grise et calme, à midi d'un bleu profond, et le soir elle brillait comme un miroir d'or. Assis sur le sable, il regardait les vagues revenir sans jamais se lasser de ce mouvement éternel.",

  "Un bon livre ne se contente pas de raconter une histoire. Il ouvre une porte vers un autre monde, plus vaste que le nôtre, où le temps semble suspendu. On y entre seul, et l'on en ressort différent, avec dans la tête des images qui ne s'effacent plus.",

  "Le voyageur posa son sac au pied de l'arbre et regarda la route derrière lui. Il avait marché longtemps, traversé des villages silencieux et des champs sans fin. Devant lui, la montagne se dressait, immense, et pourtant il se sentait prêt à la franchir.",

  "Rien n'est plus précieux que le temps, et pourtant c'est ce que nous gaspillons le plus. Nous courons sans cesse vers demain, oubliant que chaque instant ne revient jamais. Apprendre à s'arrêter, à regarder, à respirer, voilà peut-être le vrai secret.",

  "La musique remplissait la pièce comme une vague chaude. Chacun écoutait en silence, les yeux fermés, emporté loin des soucis du jour. Quand le dernier accord s'éteignit, personne n'osa parler tout de suite, comme pour garder encore un peu de ce moment.",

  "Il pleuvait depuis le matin, une pluie fine et régulière qui lavait les toits et les trottoirs. Derrière la vitre, l'enfant suivait du doigt les gouttes qui glissaient en traçant des chemins. Dehors, le monde paraissait plus doux, plus lent, presque endormi."
];

// Lignes de code pour le mode « code » : on tape de vraies lignes de programmation.
// Chaque entrée est découpée en « jetons » séparés par des espaces, tapés l'un
// après l'autre comme des mots.
const CODE_SNIPPETS = [
  "const sum = (a, b) => a + b;",
  "let total = 0;",
  "for (let i = 0; i < n; i++) {",
  "if (x > 0) { return true; }",
  "function greet(name) { return `Hi ${name}`; }",
  "console.log(\"Hello, world!\");",
  "const arr = [1, 2, 3].map(x => x * 2);",
  "return items.filter(i => i.active);",
  "while (i < len) { i += 1; }",
  "const { id, name } = user;",
  "import React from \"react\";",
  "export default function App() {}",
  "try { run(); } catch (e) { log(e); }",
  "arr.forEach((item) => print(item));",
  "const obj = { x: 1, y: 2 };",
  "if (a === b && c !== d) doThing();",
  "def factorial(n): return n * factorial(n - 1)",
  "for x in range(0, 10): print(x)",
  "data = [row for row in rows if row.ok]",
  "public static void main(String[] args) {}",
  "System.out.println(\"done\");",
  "int[] nums = new int[10];",
  "SELECT * FROM users WHERE age > 18;",
  "git commit -m \"fix: typo\"",
  "npm install --save-dev eslint",
  "const res = await fetch(url).then(r => r.json());",
  "x = (y > 0) ? 1 : -1;",
  "ptr->next = head; head = ptr;",
];

// Nombre de textes (utilisé par le serveur pour synchroniser les courses)
const TEXTS_COUNT = TEXTS.length;

// Génère une suite de mots à partir d'une graine (déterministe : identique
// sur tous les clients pour le multijoueur).
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWords(list, count, seed) {
  const rng = seed === undefined ? Math.random : mulberry32(seed);
  const out = [];
  let last = -1;
  for (let i = 0; i < count; i++) {
    let idx;
    do { idx = Math.floor(rng() * list.length); } while (idx === last);
    last = idx;
    out.push(list[idx]);
  }
  return out.join(" ");
}
function generateWords(count, seed) { return pickWords(COMMON_WORDS, count, seed); }
function generateHardWords(count, seed) { return pickWords(HARD_WORDS, count, seed); }
function generateSpeedWords(count, seed) { return pickWords(SPEED_WORDS, count, seed); }

// Mode « code » : on enchaîne des lignes de code entières (et non des mots isolés)
// jusqu'à obtenir au moins `count` jetons à taper.
function generateCode(count, seed) {
  const list = (typeof CODE_SNIPPETS !== "undefined" && CODE_SNIPPETS.length) ? CODE_SNIPPETS : ["code"];
  const rng = seed === undefined ? Math.random : mulberry32(seed);
  const out = [];
  let tokens = 0, last = -1;
  while (tokens < count) {
    let idx;
    do { idx = Math.floor(rng() * list.length); } while (idx === last && list.length > 1);
    last = idx;
    out.push(list[idx]);
    tokens += list[idx].split(/\s+/).filter(Boolean).length;
  }
  return out.join(" ");
}

// Expose pour le navigateur et pour Node (serveur).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { COMMON_WORDS, HARD_WORDS, SPEED_WORDS, TEXTS, CODE_SNIPPETS, TEXTS_COUNT, generateWords, generateHardWords, generateSpeedWords, generateCode, mulberry32 };
}
