// ╔══════════════════════════════════════════════════════════════╗
// ║  autodarts-bridge.js — DartVault ↔ Autodarts WebSocket      ║
// ║  Connects to the local Autodarts Board Manager and injects  ║
// ║  detected dart scores into any DartVault game mode.         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// USAGE (dans n'importe quel jeu DartVault) :
//
//   <script src="/autodarts-bridge.js"></script>
//
//   // Dans le code du jeu, quand le jeu démarre :
//   AutodartsBridge.start({
//     onDart: function(dart) {
//       // dart = { number, bed, multiplier, name, coords }
//       // number: 0-20, 25 (bull)
//       // bed: 'S' | 'D' | 'T' | 'Bull' | 'DBull' | 'Miss'
//       // multiplier: 0 (miss), 1 (single), 2 (double/dbull), 3 (triple)
//       // name: original Autodarts name like "S5", "T20", "D16", "Bull", "Miss"
//       console.log('Dart detected:', dart);
//     },
//     onTakeout: function() {
//       // Les fléchettes ont été retirées, prêt pour le prochain tour
//       console.log('Takeout finished');
//     },
//     onStatus: function(status) {
//       // 'connected' | 'disconnected' | 'reconnecting'
//       console.log('Bridge status:', status);
//     }
//   });
//
//   // Pour arrêter :
//   AutodartsBridge.stop();

(function() {
  'use strict';

  // ── CONFIG ───────────────────────────────────────────────
  const STORAGE_KEY = 'dartvault_autodarts_ip';
  const DEFAULT_IP  = '192.168.1.37';
  const DEFAULT_PORT_WS  = 3180; // HTTP / ws://
  const DEFAULT_PORT_WSS = 3181; // HTTPS / wss://
  const RECONNECT_DELAY = 3000; // ms avant reconnexion auto

  // ── STATE ────────────────────────────────────────────────
  let ws = null;
  let callbacks = {};
  let lastNumThrows = 0;
  let active = false;
  let reconnectTimer = null;
  let enabled = false; // toggle ON/OFF par l'utilisateur

  // ── HELPERS ──────────────────────────────────────────────

  function getIP() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_IP;
  }

  function setIP(ip) {
    localStorage.setItem(STORAGE_KEY, ip);
  }

  function getWSUrl() {
    const ip = getIP();
    // Si la page est servie en HTTPS, utiliser wss:// sur le port 3181
    const isSecure = window.location.protocol === 'https:';
    const proto = isSecure ? 'wss' : 'ws';
    const port = isSecure ? DEFAULT_PORT_WSS : DEFAULT_PORT_WS;
    return proto + '://' + ip + ':' + port + '/api/events';
  }

  // Traduit un throw Autodarts en format DartVault normalisé
  function parseDart(throwData) {
    const seg = throwData.segment;
    if (!seg) return null;

    const name = seg.name;        // "S5", "T20", "D16", "Bull", "DBull", "Miss"
    const number = seg.number;    // 0-20, 25
    const mult = seg.multiplier;  // 0, 1, 2, 3

    let bed;
    if (name === 'Miss' || number === 0) {
      bed = 'Miss';
    } else if (name === 'Bull' || (number === 25 && mult === 1)) {
      bed = 'Bull';
    } else if (name === 'DBull' || (number === 25 && mult === 2)) {
      bed = 'DBull';
    } else if (mult === 3) {
      bed = 'T';
    } else if (mult === 2) {
      bed = 'D';
    } else {
      bed = 'S';
    }

    return {
      number: number,
      bed: bed,
      multiplier: mult,
      points: number * mult,
      name: name,
      coords: throwData.coords || null
    };
  }

  // ── WEBSOCKET ────────────────────────────────────────────

  function connect() {
    if (ws) {
      try { ws.close(); } catch(e) {}
    }

    const url = getWSUrl();
    console.log('[AutodartsBridge] Connecting to', url);

    try {
      ws = new WebSocket(url);
    } catch(e) {
      console.error('[AutodartsBridge] WebSocket creation failed:', e);
      scheduleReconnect();
      return;
    }

    ws.onopen = function() {
      console.log('[AutodartsBridge] Connected');
      lastNumThrows = 0;
      if (callbacks.onStatus) callbacks.onStatus('connected');
      updateUI('connected');
    };

    ws.onmessage = function(event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type !== 'state') return;

        const data = msg.data;

        // ── Nouveau dart détecté ──
        if (data.event === 'Throw detected' && data.numThrows > lastNumThrows) {
          const newThrow = data.throws[data.numThrows - 1];
          const dart = parseDart(newThrow);
          if (dart && callbacks.onDart) {
            console.log('[AutodartsBridge] Dart #' + data.numThrows + ':', dart.name, '(' + dart.points + 'pts)');
            callbacks.onDart(dart, data.numThrows);
          }
          lastNumThrows = data.numThrows;
        }

        // ── Takeout terminé (fléchettes retirées) ──
        if (data.event === 'Takeout finished') {
          lastNumThrows = 0;
          if (callbacks.onTakeout) callbacks.onTakeout();
        }

        // ── Reset manuel ──
        if (data.event === 'Manual reset') {
          lastNumThrows = 0;
        }

      } catch(e) {
        // Ignore malformed messages
      }
    };

    ws.onclose = function() {
      console.log('[AutodartsBridge] Disconnected');
      if (callbacks.onStatus) callbacks.onStatus('disconnected');
      updateUI('disconnected');
      if (active) scheduleReconnect();
    };

    ws.onerror = function() {
      console.error('[AutodartsBridge] WebSocket error');
      updateUI('disconnected');
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    if (!active) return;
    console.log('[AutodartsBridge] Reconnecting in', RECONNECT_DELAY + 'ms...');
    if (callbacks.onStatus) callbacks.onStatus('reconnecting');
    updateUI('reconnecting');
    reconnectTimer = setTimeout(function() {
      reconnectTimer = null;
      if (active) connect();
    }, RECONNECT_DELAY);
  }

  // ── UI INDICATOR ─────────────────────────────────────────
  // Petit indicateur dans le header du jeu

  function createUI() {
    // Eviter les doublons
    if (document.getElementById('ad-bridge-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'ad-bridge-indicator';
    indicator.innerHTML = `
      <style>
        #ad-bridge-indicator {
          position: fixed;
          top: 8px;
          right: 8px;
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(14,15,16,.9);
          border: 1px solid rgba(255,255,255,.1);
          backdrop-filter: blur(8px);
          cursor: pointer;
          transition: all .3s;
          font-family: 'Rajdhani', 'Exo 2', sans-serif;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        #ad-bridge-indicator:active { transform: scale(.95); }
        #ad-bridge-indicator.hidden { display: none; }
        #ad-bridge-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #606468;
          transition: background .3s, box-shadow .3s;
        }
        #ad-bridge-dot.connected {
          background: #28C76F;
          box-shadow: 0 0 8px rgba(40,199,111,.6);
        }
        #ad-bridge-dot.reconnecting {
          background: #FF9F43;
          box-shadow: 0 0 8px rgba(255,159,67,.5);
          animation: ad-pulse 1s ease-in-out infinite;
        }
        #ad-bridge-dot.disconnected {
          background: #DC3545;
          box-shadow: 0 0 6px rgba(220,53,69,.4);
        }
        @keyframes ad-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }
        #ad-bridge-label {
          font-size: .7rem;
          font-weight: 700;
          color: rgba(240,240,240,.7);
          letter-spacing: .5px;
        }
      </style>
      <div id="ad-bridge-dot"></div>
      <span id="ad-bridge-label">AD</span>
    `;
    indicator.addEventListener('click', function() {
      showSettingsModal();
    });
    document.body.appendChild(indicator);
  }

  function updateUI(status) {
    const dot = document.getElementById('ad-bridge-dot');
    if (!dot) return;
    dot.className = status || '';
    const label = document.getElementById('ad-bridge-label');
    if (label) {
      if (status === 'connected') label.textContent = 'AD';
      else if (status === 'reconnecting') label.textContent = 'AD...';
      else label.textContent = 'AD ✕';
    }
  }

  // ── SETTINGS MODAL ───────────────────────────────────────

  function applyToggle(turnOn) {
    const newIP = document.getElementById('ad-ip-field');
    if (newIP) { const v = newIP.value.trim(); if (v) setIP(v); }
    if (turnOn && !enabled) {
      enabled = true;
      localStorage.setItem('dartvault_autodarts_enabled', '1');
      AutodartsBridge.start(callbacks);
    } else if (!turnOn && enabled) {
      enabled = false;
      localStorage.setItem('dartvault_autodarts_enabled', '0');
      AutodartsBridge.stop();
    }
  }

  function closeModal() {
    const m = document.getElementById('ad-bridge-modal');
    if (m) m.remove();
  }

  function showSettingsModal() {
    let existing = document.getElementById('ad-bridge-modal');
    if (existing) existing.remove();

    const isOn = enabled;
    const currentIP = getIP();

    const modal = document.createElement('div');
    modal.id = 'ad-bridge-modal';
    modal.innerHTML = `
      <style>
        #ad-bridge-modal {
          position: fixed; inset: 0; z-index: 10000;
          background: rgba(0,0,0,.8); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          animation: ad-fadeIn .2s;
        }
        @keyframes ad-fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ad-modal-box {
          background: var(--bg2, #161718);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 16px;
          padding: 20px 18px;
          max-width: 280px; width: 88%;
          text-align: center;
          animation: ad-popIn .3s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes ad-popIn { from { opacity: 0; transform: scale(.75); } to { opacity: 1; transform: none; } }
        .ad-modal-title {
          font-family: 'Rajdhani', sans-serif;
          font-size: 1.1rem; font-weight: 900;
          margin-bottom: 14px;
          color: var(--text, #F0F0F0);
        }
        .ad-modal-row {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px; padding: 0 4px;
        }
        .ad-modal-label {
          font-family: 'Rajdhani', sans-serif;
          font-size: .85rem; font-weight: 700;
          color: var(--dim, #606468);
        }
        .ad-status-txt {
          font-family: 'Rajdhani', sans-serif;
          font-size: .7rem; font-weight: 700;
          color: var(--dim, #606468);
          margin-bottom: 10px;
        }
        .ad-status-txt.on { color: #28C76F; }
        .ad-toggle {
          position: relative; width: 44px; height: 24px;
          background: rgba(255,255,255,.1); border-radius: 12px;
          cursor: pointer; transition: background .3s;
          border: none; outline: none;
        }
        .ad-toggle.on { background: #28C76F; }
        .ad-toggle::after {
          content: ''; position: absolute;
          top: 3px; left: 3px;
          width: 18px; height: 18px;
          border-radius: 50%; background: #fff;
          transition: transform .2s;
        }
        .ad-toggle.on::after { transform: translateX(20px); }
        .ad-ip-input {
          width: 100%; padding: 8px 12px;
          background: var(--bg3, #1C1E20);
          border: 1.5px solid rgba(255,255,255,.1);
          border-radius: 10px; color: var(--text, #F0F0F0);
          font-family: 'Exo 2', monospace; font-size: .85rem;
          text-align: center; outline: none;
          transition: border-color .2s;
        }
        .ad-ip-input:focus { border-color: var(--accent, #E8E8E8); }
      </style>
      <div class="ad-modal-box">
        <div class="ad-modal-title">🎯 Autodarts</div>
        <div class="ad-modal-row">
          <span class="ad-modal-label">Activer</span>
          <button class="ad-toggle ${isOn ? 'on' : ''}" id="ad-toggle-btn" type="button"></button>
        </div>
        <input class="ad-ip-input" id="ad-ip-field" type="text"
               value="${currentIP}" placeholder="192.168.1.37" />
        <div class="ad-status-txt ${isOn ? 'on' : ''}" id="ad-status-txt">${isOn ? 'Connecté' : 'Désactivé'}</div>
      </div>
    `;
    document.body.appendChild(modal);

    // Toggle = action immédiate
    document.getElementById('ad-toggle-btn').addEventListener('click', function() {
      const nowOn = !this.classList.contains('on');
      this.classList.toggle('on');
      const statusEl = document.getElementById('ad-status-txt');
      if (nowOn) {
        statusEl.textContent = 'Connexion...';
        statusEl.className = 'ad-status-txt';
        applyToggle(true);
        // Vérifier la connexion après un court délai
        setTimeout(function() {
          if (AutodartsBridge.isConnected()) {
            statusEl.textContent = 'Connecté';
            statusEl.className = 'ad-status-txt on';
          } else {
            statusEl.textContent = 'Reconnexion...';
            statusEl.className = 'ad-status-txt';
          }
        }, 2000);
      } else {
        applyToggle(false);
        statusEl.textContent = 'Désactivé';
        statusEl.className = 'ad-status-txt';
      }
    });

    // Fermer en cliquant en dehors — sauve l'IP
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        const newIP = document.getElementById('ad-ip-field').value.trim();
        if (newIP && newIP !== currentIP) {
          setIP(newIP);
          if (enabled) {
            AutodartsBridge.stop();
            AutodartsBridge.start(callbacks);
          }
        }
        modal.remove();
      }
    });
  }

  // ── PUBLIC API ───────────────────────────────────────────

  window.AutodartsBridge = {

    start: function(cbs) {
      callbacks = cbs || {};
      active = true;
      enabled = true;
      localStorage.setItem('dartvault_autodarts_enabled', '1');
      createUI();
      connect();
    },

    stop: function() {
      active = false;
      enabled = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { try { ws.close(); } catch(e) {} ws = null; }
      updateUI('disconnected');
    },

    isConnected: function() {
      return ws && ws.readyState === WebSocket.OPEN;
    },

    isEnabled: function() {
      return enabled;
    },

    // Initialisation auto — restaure l'état précédent
    autoInit: function(cbs) {
      callbacks = cbs || {};
      createUI();
      const wasEnabled = localStorage.getItem('dartvault_autodarts_enabled') === '1';
      if (wasEnabled) {
        enabled = true;
        active = true;
        connect();
      } else {
        updateUI('disconnected');
      }
    }
  };

})();
