/* ============================================================
   NOTES DE MISE À JOUR (patch notes) — affichées via le bouton
   « ✨ nouveautés » en bas du site.

   POUR AJOUTER UNE NOUVEAUTÉ :
   copie-colle un bloc en HAUT de la liste (le plus récent en premier) :

     {
       version: "1.3",                 // un numéro, comme tu veux
       date: "2026-07-01",             // format AAAA-MM-JJ
       changes: [
         "Première chose ajoutée.",
         "Deuxième chose corrigée.",
       ],
     },

   N'oublie pas la virgule à la fin de chaque ligne et après l'accolade « } ».
   ============================================================ */
const PATCH_NOTES = [
  {
    version: "1.3",
    date: "2026-06-19",
    changes: [
      "Nouveau : un CLASSEMENT en ligne ! Chaque partie solo est enregistrée sous ton pseudo.",
      "Nouvel écran « mon profil » : meilleur score, vitesse et précision moyennes, parties jouées, caractères tapés, temps total…",
      "Des courbes de progression pour suivre ton évolution (vitesse et précision sur tes dernières parties).",
      "Le classement se filtre par mode (mots, texte, zen, difficile, speed) et se conserve en ligne, comme les mots.",
      "Mode « texte » : un classement SÉPARÉ par texte (les textes n'ont pas tous la même longueur) — choisis « tous les textes » ou un texte précis.",
      "Les parties multijoueur (course, difficile, speed) comptent aussi pour le classement.",
      "Nouveau : des SALONS PUBLICS — choisis « public » à la création et ton salon apparaît dans une liste où tout le monde peut te rejoindre en un clic (ou reste « privé » sur code).",
      "Anti-triche en course : arriver au bout en tapant n'importe quoi ne fait plus gagner — il faut vraiment avoir tapé le texte (sinon l'arrivée est « non valide »).",
      "À l'import d'un texte (admin), les apostrophes « courbes » deviennent des apostrophes simples ', les « … » deviennent ... et les guillemets/tirets sont uniformisés — pour que tout reste facile à taper.",
      "Nouveau mode solo : « code </> » — tape de vraies lignes de code le plus vite possible (compte aussi pour le classement).",
      "Anti-bot renforcé : le texte affiché est brouillé dans le code de la page (un bot qui lit les mots via l'inspecteur ne récupère que du charabia), et un score à vitesse impossible (> 250 mpm) est ignoré et ne gagne pas.",
      "Admin : nouvel onglet « joueurs » pour supprimer le score d'un pseudo ou bannir quelqu'un (il ne peut plus enregistrer de score ni jouer en multijoueur).",
    ],
  },
  {
    version: "1.2",
    date: "2026-06-19",
    changes: [
      "Nouveau mode « speed » : des mots simples sans accents, à taper le plus vite possible (en solo et en multijoueur).",
      "Nouveau : un chat dans le salon multijoueur pour discuter avant la partie.",
      "Ajout de ce bouton « nouveautés » pour suivre les changements du jeu.",
    ],
  },
  {
    version: "1.1",
    date: "2026-06-19",
    changes: [
      "Le bouton multijoueur est plus grand, mis en avant à droite et en couleur.",
      "Les mots et textes ajoutés via l'admin sont maintenant conservés en ligne (ils ne disparaissent plus quand le serveur redémarre).",
    ],
  },
  {
    version: "1.0",
    date: "2026-06-16",
    changes: [
      "Première version : modes solo (mots courants, texte, zen, difficile) et multijoueur (course, élimination, patate chaude, difficile).",
    ],
  },
];

// Expose pour le navigateur (et évite une erreur si jamais chargé côté Node).
if (typeof module !== "undefined" && module.exports) module.exports = { PATCH_NOTES };
