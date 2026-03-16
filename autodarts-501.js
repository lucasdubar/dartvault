// ╔══════════════════════════════════════════════════════════════╗
// ║  autodarts-501.js — Intégration Autodarts → 501            ║
// ║  À inclure APRÈS autodarts-bridge.js et APRÈS le script    ║
// ║  principal du 501.                                         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Ce script :
// 1. Force le mode d'input en "darts" (fléchette par fléchette)
// 2. Traduit chaque dart Autodarts en appel dHit() du 501
// 3. Gère le takeout (passage au joueur suivant automatique)

(function() {
  'use strict';

  // Attendre que le DOM et les scripts du jeu soient chargés
  function init() {

    // Vérifie que les fonctions du 501 sont disponibles
    if (typeof dHit !== 'function') {
      console.warn('[Autodarts-501] dHit() not found, retrying...');
      setTimeout(init, 500);
      return;
    }

    if (typeof AutodartsBridge === 'undefined') {
      console.warn('[Autodarts-501] AutodartsBridge not loaded');
      return;
    }

    console.log('[Autodarts-501] Initializing bridge for 501...');

    AutodartsBridge.autoInit({

      onDart: function(dart, dartNum) {
        // Ne rien faire si le jeu n'est pas démarré
        if (typeof G === 'undefined' || !G.gameStarted) {
          console.log('[Autodarts-501] Game not started, ignoring dart');
          return;
        }

        // ── Forcer le mode fléchettes ──
        if (typeof inputMode !== 'undefined' && inputMode !== 'darts') {
          // Simuler le toggle vers le mode darts
          if (typeof toggleInputMode === 'function') {
            toggleInputMode();
          } else {
            // Fallback : forcer directement
            inputMode = 'darts';
            if (G) G.inputMode = 'darts';
            const padTotal = document.getElementById('pad-total');
            const padDarts = document.getElementById('pad-darts');
            if (padTotal) padTotal.style.display = 'none';
            if (padDarts) padDarts.style.display = '';
          }
        }

        // ── Traduire le bed Autodarts en multiplicateur DartVault ──
        let mult = 's'; // single par défaut

        switch (dart.bed) {
          case 'D':
          case 'DBull':
            mult = 'd';
            break;
          case 'T':
            mult = 't';
            break;
          case 'Miss':
            mult = 's'; // Miss = dHit(0)
            break;
          case 'Bull':
            mult = 's'; // Bull simple = dHit(25) avec mult 's'
            break;
          default:
            mult = 's';
        }

        // ── Déterminer le numéro à passer à dHit ──
        let number = dart.number;
        if (dart.bed === 'Miss') {
          number = 0; // OUT / Miss
        }

        // ── Positionner le multiplicateur AVANT d'appeler dHit ──
        if (typeof dartState !== 'undefined') {
          dartState.mult = mult;
          // Mettre à jour le visuel des boutons multiplicateurs
          if (typeof dUpdateMult === 'function') {
            dUpdateMult(mult);
          }
        }

        console.log('[Autodarts-501] Injecting dart:', mult.toUpperCase() + number, '(' + dart.points + 'pts)');

        // ── Appeler dHit ──
        dHit(number);
      },

      onTakeout: function() {
        console.log('[Autodarts-501] Takeout finished');
        // Le passage au joueur suivant est déjà géré par dHit()
        // quand 3 fléchettes sont atteintes ou en cas de bust.
        // Rien de spécial à faire ici.
      },

      onStatus: function(status) {
        console.log('[Autodarts-501] Bridge status:', status);
      }

    });
  }

  // Lancer l'init quand le DOM est prêt
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 300);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(init, 300);
    });
  }

})();
