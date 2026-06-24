# tape_ — jeu de dactylographie minimaliste

Un petit site de dactylographie en français, épuré.
**Solo** (mots courants / texte) + **multijoueur en ligne** (course / élimination)
+ un **classement** en ligne avec statistiques et courbes de progression.

```
typing/
├── public/          ← le site (HTML / CSS / JS)
│   ├── index.html
│   ├── style.css
│   ├── app.js       ← logique du jeu
│   └── words.js     ← les mots et les textes
├── server.js        ← serveur : sert le site + multijoueur
├── package.json
└── README.md
```

---

## 1. Tester sur ton ordinateur (le plus simple)

Il te faut **Node.js** (gratuit). Vérifie s'il est installé :

```bash
node -v
```

- Si tu vois un numéro de version (ex. `v20.x`) → c'est bon.
- Sinon → installe-le depuis https://nodejs.org (prends la version « LTS »).

Ensuite, dans un terminal, place-toi dans le dossier du projet et lance :

```bash
cd "C:\tout et nimp\typing"
npm install        # à faire une seule fois (télécharge la librairie « ws »)
npm start
```

Tu verras :

```
  tape_  ▸  http://localhost:3000
```

Ouvre **http://localhost:3000** dans ton navigateur. 🎉

> **Tester le multijoueur tout seul :** ouvre deux onglets (ou deux fenêtres) sur
> `http://localhost:3000`. Dans le premier, crée un salon → un code à 4 lettres
> s'affiche. Dans le second, rejoins avec ce code. Mets les deux « prêts », puis
> l'hôte clique sur **démarrer**.

---

## 2. Les modes de jeu

### Solo
- **Mots courants** — tape un maximum de mots avant la fin du chrono (15 / 30 / 60 / 120 s).
  Score en **mpm** (mots par minute) et **précision**.
- **Texte** — recopie un texte complet, du début à la fin.
- **Zen** — sans chrono : finis un nombre de mots à ton rythme.
- **Difficile** — mots compliqués, pleins d'accents.
- **Speed** — mots **simples et sans accents** : tape le plus vite possible.
- **Code** `</>` — de vraies **lignes de code** à taper vite, par **langage au choix** :
  **web** (HTML/CSS/JS/PHP), **Java** ou **C++** (chaque catégorie a son propre classement).

`Tab` recommence une partie. `◐` en haut à droite change le thème clair/sombre.

### Multijoueur (2 à 8 joueurs)
- **Course** — tout le monde tape **le même texte** (ou des mots). Le premier à finir gagne.
  ⚠️ Pour gagner, il faut **vraiment avoir tapé le texte** : arriver au bout en
  tapant n'importe quoi (trop de fautes / presque rien de correct) donne une
  arrivée **« non valide »** qui ne gagne pas et ne compte pas au classement.
- **Élimination** — manches de 18 s. À chaque manche, **le joueur le plus lent est éliminé**.
- **Patate chaude** — une bombe passe de joueur en joueur ; celui qui la tient quand elle explose perd une vie.
- **Difficile** — comme la course, mais avec des mots à accents.
- **Speed** — comme la course, mais avec des mots simples sans accents.

Dans le **salon**, un **chat** permet de discuter avant de lancer la partie.

**Salons publics ou privés.** À la création d'un salon, tu choisis sa **visibilité** :
- **public** → ton salon apparaît dans la **liste des salons publics** (sur l'écran
  multijoueur) ; n'importe qui peut le rejoindre **en un clic**, sans connaître le code.
- **privé** → il n'apparaît nulle part ; on ne peut le rejoindre **qu'avec le code**
  à 4 lettres que tu partages.

La liste des salons publics se met à jour toute seule (bouton **↻ rafraîchir** pour
forcer). Un salon disparaît de la liste dès que la partie démarre ou qu'il est plein.

### Classement (🏆)
Accessible par le bouton **« classement »** (en haut, ou la carte sur l'accueil).

- **Choisis un pseudo** une seule fois : toutes tes parties **solo** terminées sont
  alors enregistrées automatiquement sous ce pseudo. Les parties **multijoueur**
  de type course / difficile / speed (où chacun finit avec un vrai score) comptent
  aussi.
- 🔒 **Protège ton pseudo avec un code secret.** La première fois que tu enregistres
  un score avec un code, ton pseudo est « réservé » : ensuite, **il faut le bon code**
  pour écrire dessus. Plus personne ne peut ruiner ton classement en prenant ton nom.
  (Le code n'est jamais stocké en clair, seulement une empreinte impossible à inverser.)
- **Onglet « classement »** — le tableau de tous les joueurs, trié par **record**,
  avec aussi la **moyenne**, le **nombre de parties** et la **précision**. Tu peux
  le filtrer par mode (mots, texte, zen, difficile, speed). En mode **texte**, un
  menu déroulant apparaît pour voir le classement **« tous les textes »** ou
  **d'un texte précis** (chaque texte a sa propre longueur → comparaison plus juste).
- **Onglet « mon profil »** — tes statistiques détaillées (meilleur score, vitesse
  et précision moyennes, parties jouées, caractères tapés, temps total, ton rang),
  le **détail par mode**, tes **dernières parties**, et surtout des **courbes de
  progression** (vitesse et précision au fil de tes parties) pour suivre tes progrès.

> Le classement a besoin du **serveur** (`server.js`). En ligne, il est conservé
> de la même façon que les mots (voir section 4) : **aucune configuration en plus**.

---

## 3. Mettre le jeu en ligne (pour jouer avec des amis à distance)

Le multijoueur a besoin que `server.js` tourne quelque part. Le **solo**, lui,
fonctionne même en simple hébergement de fichiers.

### Option AlwaysData (Node.js + multijoueur)

AlwaysData fait tourner `server.js` : le multijoueur fonctionne. `server.js` est
déjà prêt pour AlwaysData (il écoute sur `ALWAYSDATA_HTTPD_IP` / `ALWAYSDATA_HTTPD_PORT`).

1. **Crée un compte** sur https://www.alwaysdata.com (l'offre gratuite 100 Mo
   suffit et supporte Node.js).

2. **Envoie les fichiers** du projet dans ton espace, par ex. dans `~/typing/`.
   Le plus simple : **SFTP avec FileZilla**.
   - Hôte : `ssh-TONCOMPTE.alwaysdata.net` — Port : `22` — Identifiants : ceux de
     ton compte AlwaysData (onglet « SFTP/SSH »).
   - Envoie `server.js`, `package.json` et le dossier `public/`.
   - ⚠️ Pas besoin d'envoyer `node_modules/` (on l'installe à l'étape suivante).

3. **Installe les dépendances en SSH.**
   - Dans l'admin, vérifie que SSH est activé (« Accès distant » > SSH).
   - Connecte-toi : `ssh TONCOMPTE@ssh-TONCOMPTE.alwaysdata.net`
   - Puis :
     ```bash
     cd ~/typing
     npm install
     ```

4. **Crée le site Node.js** dans l'admin AlwaysData : **Web > Sites > Ajouter un site**.
   - **Adresses** : `TONCOMPTE.alwaysdata.net` (ou ton domaine).
   - **Type** : `Node.js`.
   - **Version de Node.js** : une version récente (≥ 18).
   - **Commande** : `node ~/typing/server.js`
   - **Répertoire de travail** : `~/typing`
   - Valide.

5. **Ouvre** `https://TONCOMPTE.alwaysdata.net` → le jeu est en ligne, **multijoueur
   compris** (le WebSocket passe automatiquement en `wss://` via le HTTPS d'AlwaysData).

> Si la page ne s'affiche pas : regarde les **logs du site** (Web > Sites > l'icône
> « logs »), vérifie la **version de Node** et que la **commande** pointe bien vers
> `server.js`. Les variables `ALWAYSDATA_HTTPD_*` n'existent que quand le **site**
> tourne (pas en SSH) — c'est normal.

### Option A — hébergeur Node gratuit (Render / Railway, multijoueur compris)

Des services lancent ton `server.js` pour toi, gratuitement :

- **Render** — https://render.com → « New Web Service »
- **Railway** — https://railway.app
- **Glitch** — https://glitch.com (importe le dossier)

Réglages pour Render / Railway :
- **Build command** : `npm install`
- **Start command** : `npm start`
- Le port est géré tout seul (le serveur lit `process.env.PORT`).

Pousse le dossier sur GitHub, connecte-le à l'hébergeur, et c'est en ligne.
Le multijoueur fonctionne directement (WebSocket inclus).

### Option B — hébergement statique (solo uniquement)

Sur GitHub Pages, Netlify, un hébergement mutualisé OVH, etc. : mets simplement
le **contenu du dossier `public/`** en ligne. Le solo marche. ⚠️ Le multijoueur
ne fonctionnera **pas** (il n'y a pas de serveur pour relier les joueurs).

### Option C — ton propre serveur / VPS

```bash
npm install
PORT=3000 node server.js
```

Mets-le derrière Nginx/Apache si tu veux un nom de domaine et le HTTPS
(pense à autoriser le WebSocket dans la config du reverse proxy).

---

## 4. Garder les mots ajoutés **en ligne** (Render → stockage Upstash)

> **Le problème :** sur Render (et Railway, Glitch…), le serveur tourne sur une
> machine « jetable ». À chaque redémarrage (après ~15 min sans visiteur, ou à
> chaque mise à jour), la machine **repart de zéro** et le fichier
> `words-data.json` est effacé → les mots ajoutés via le panneau **admin**
> disparaissent. En **local**, ce souci n'existe pas : le fichier reste sur ton PC.

La solution : un petit **stockage en ligne gratuit** (Upstash Redis) qui, lui,
**survit aux redémarrages**. Le serveur l'utilise automatiquement dès que tu lui
donnes 2 clés. **C'est gratuit et sans carte bancaire.** Étapes :

1. **Crée un compte Upstash** sur https://upstash.com (bouton « Sign Up » ; tu
   peux te connecter avec Google/GitHub). C'est gratuit.

2. **Crée une base de données** : clique **« Create Database »**.
   - **Name** : `tape` (ou ce que tu veux).
   - **Type** : `Regional` (gratuit).
   - **Region** : choisis une région proche de celle de ton service Render.
   - Valide avec **« Create »**.

3. **Récupère les 2 clés.** Sur la page de la base, descends à la section
   **« REST API »**. Tu y vois deux valeurs à copier :
   - `UPSTASH_REDIS_REST_URL` (commence par `https://…`)
   - `UPSTASH_REDIS_REST_TOKEN` (une longue suite de caractères)

4. **Colle-les dans Render.** Va sur ton service → onglet **« Environment »** →
   **« Add Environment Variable »**, et ajoute **les deux**, une par une :

   | Key (nom)                  | Value (valeur)                |
   |----------------------------|-------------------------------|
   | `UPSTASH_REDIS_REST_URL`   | *(colle l'URL copiée)*        |
   | `UPSTASH_REDIS_REST_TOKEN` | *(colle le token copié)*      |

   Clique **« Save Changes »** : Render redéploie tout seul.

5. **Vérifie.** Dans les **logs** de Render, tu dois voir au démarrage :
   ```
   sauvegarde mots + classement : en ligne (Upstash) ✓
   classement : 12 joueur(s) chargé(s) depuis Upstash
   ```
   À partir de là, les mots/textes (admin) **et le classement** sont conservés,
   même après un redémarrage. 🎉 La 2ᵉ ligne te confirme combien de joueurs ont
   été rechargés depuis le stockage en ligne.

> **Le classement survit-il aux redémarrages ?** Oui. Il utilise **la même base
> Upstash** que les mots (juste une autre « clé » interne). Donc **dès que les 2
> variables ci-dessus sont en place, le classement est conservé en ligne** — rien
> de plus à faire. Le serveur le sauvegarde après chaque partie, retente tout seul
> si Upstash est momentanément injoignable, et fait une **dernière sauvegarde au
> moment où Render éteint la machine** — pour ne perdre aucune partie récente.
>
> Sans Upstash (ou en local), les scores restent dans le fichier `scores-data.json` :
> parfait sur ton PC, mais effacé à chaque redémarrage sur Render — d'où l'intérêt
> des 2 variables ci-dessus.

> ⚠️ **Sécurité :** le `TOKEN` est un mot de passe. Ne le mets **jamais** dans le
> code ni dans un fichier public — seulement dans les **variables
> d'environnement** de Render (étape 4). Sur **Railway**, c'est pareil : ajoute
> ces deux variables dans l'onglet **« Variables »** du projet.

---

## 5. Personnaliser

- **Listes par défaut** → `COMMON_WORDS` / `HARD_WORDS` / `SPEED_WORDS` / `TEXTS`
  dans `public/words.js`. Ce sont les listes de base, utilisées tant que rien n'a
  encore été ajouté via l'admin.
- **Ajouter/retirer en direct** → bouton **admin** en bas du site (mot de passe
  dans `server.js`, variable `ADMIN_PASSWORD`). Onglets : mots courants, difficile,
  **speed**, **code web / java / c++**, textes, et **joueurs**. C'est ce qui est
  sauvegardé (fichier en local, et stockage Upstash en ligne — voir section 4).
- **Modérer les joueurs** → onglet **« joueurs »** de l'admin : **supprimer le
  score** d'un pseudo, ou le **bannir** (il ne pourra plus enregistrer de score
  ni jouer en multijoueur ; un bouton « débannir » annule).
- **Anti-triche** → le texte affiché est **brouillé dans le code de la page**
  (un bot qui lit les mots via l'inspecteur ne récupère que du charabia) et un
  score à **vitesse impossible** (au-delà de `MAX_HUMAN_WPM` dans `server.js`,
  250 mpm par défaut) est **ignoré** et ne gagne pas. ⚠️ Aucun jeu de frappe
  n'est inviolable à 100 % (le navigateur doit connaître le texte pour l'afficher),
  mais ces mesures cassent les bots simples et protègent le classement.
  > **Import propre :** quand tu colles un texte (depuis Word, le web…), les
  > caractères « jolis » mais impossibles à taper sont **uniformisés
  > automatiquement** : apostrophes courbes `’` → `'`, points de suspension
  > `…` → `...`, guillemets `“ ”` → `"`, tirets longs `— –` → `-`.
- **Annoncer une nouveauté** → ajoute un bloc en haut de `public/patch-notes.js`
  (le mode d'emploi est écrit dans le fichier). Il apparaît via le bouton
  **« ✨ nouveautés »** en bas du site.
- **Changer les couleurs** → variables `--bg`, `--accent`, etc. en haut de `public/style.css`.
- **Régler l'élimination** → constantes `ELIM_COUNT`, `ELIM_DURATION_MS` dans `server.js`.
- **Régler le classement** → constantes `RUNS_KEPT` (nb de parties gardées par
  joueur pour les courbes) et `MAX_PROFILES` (nb max de profils) dans `server.js`.
- **Anti-triche** → le texte à taper est **dessiné sur un canvas** (rien à lire dans
  le code de la page). De plus, côté serveur, un score au-dessus de `MAX_HUMAN_WPM`
  (dans `server.js`) est considéré comme un robot : il ne gagne pas et n'entre pas
  au classement. Un jeu de frappe ne sera jamais 100 % increvable, mais ça bloque
  les bots simples et protège le classement.

> Le jeu est pensé pour un **clavier physique** (ordinateur). Sur mobile, l'affichage
> s'adapte mais la frappe reste plus confortable au clavier.
