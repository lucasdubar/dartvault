/**
 * DartVault — Tournament Bridge
 * Included in every game page. Activates only when a tournament is in progress.
 *
 * Responsibilities:
 *  1. Detect tournament mode via localStorage payload
 *  2. Auto-fill game setup form + auto-start
 *  3. Monitor #end-modal opening → inject tournament UI
 *  4. Expose TournamentBridge.onGameEnd(ranking) for each game to call
 *
 * Each game must:
 *  A. Include tournament-config.js, tournament.js, tournament-bridge.js (3 script tags)
 *  B. Call TournamentBridge.onGameEnd(ranking) at game end (1 line per game)
 */

(function () {
  'use strict';

  const PAYLOAD_KEY = 'dartvault_tournament_payload';

  // ── Identify current game by URL ──────────────────────────────────────────
  const urlFile = location.pathname.split('/').pop();
  const URL_TO_GAME = {
    '501.html':       'g501',
    'cricket.html':   'cricket',
    'shanghai.html':  'shanghai',
    'horloge.html':   'horloge',
    'race500.html':   'race500',
    'blackjack.html': 'blackdart',
    'territoire.html':'territoire',
    'dartspong.html': 'dartspong',
    'shooter.html':   'shooter',
    'bataille.html':  'bataille',
  };
  const currentGameId = URL_TO_GAME[urlFile];
  if (!currentGameId) return;

  // ── Load payload ──────────────────────────────────────────────────────────
  let payload;
  try { payload = JSON.parse(localStorage.getItem(PAYLOAD_KEY)); } catch { payload = null; }
  if (!payload || !payload.active || payload.gameId !== currentGameId) return;

  // ── Session guard: only activate if launched from tournament.html ──────────
  // sessionStorage is set by tournament.html just before navigating here.
  // It persists through page refreshes but not across new tabs/sessions,
  // preventing the bridge from hijacking the game when opened directly.
  const _sessionIdx = sessionStorage.getItem('dartvault_t_session');
  if (_sessionIdx === null || _sessionIdx !== String(payload.gameIndex)) return;

  // ── Store ranking when game ends ──────────────────────────────────────────
  let _ranking = null;
  // Guard: recordResult must only be called once per game, even if the user
  // clicks "Annuler" on the end popup and finishes the game again.
  let _resultRecorded = false;

  // ── Game key map (matches each game's internal GAME_KEY for localStorage) ─
  const _GAME_STATS_KEY = {
    g501: '501', cricket: 'cricket', shanghai: 'shanghai', horloge: 'horloge',
    race500: 'race500', blackdart: 'blackjack', territoire: 'territoire',
    dartspong: 'dartspong', shooter: 'shooter', bataille: 'bataille',
  };

  // Bridge-side stats recording.
  // Each game's own stats IIFE now handles detailed stats (games count, avg, darts, etc.)
  // for tournament players via the `!window.TournamentBridge` guard exemption.
  // The bridge only records WINS, since _recordWins() in each game still skips
  // non-profile (tournament) players.
  function _bridgeRecordStats(ranking) {
    const gameKey = _GAME_STATS_KEY[currentGameId];
    if (!gameKey) return;

    // Record win for winner(s) — ranking[0] is string (solo) or string[] (team)
    const first = ranking[0];
    if (!first) return;
    const winners = Array.isArray(first) ? first : [first];

    const WINS_KEY = 'dartvault_wins';
    let wins = {};
    try { wins = JSON.parse(localStorage.getItem(WINS_KEY)) || {}; } catch (e) {}

    function _dateKeys() {
      const today = new Date().toISOString().slice(0, 10);
      const d = new Date(), day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      const week = d.toISOString().slice(0, 10);
      const month = new Date().toISOString().slice(0, 7);
      return { today, week, month };
    }
    function _mutateWin(name) {
      if (!wins[name]) wins[name] = {};
      ['_total', gameKey].forEach(g => {
        if (!wins[name][g]) wins[name][g] = { daily: {}, weekly: {}, monthly: {}, total: 0 };
        const k = _dateKeys();
        wins[name][g].daily[k.today]   = (wins[name][g].daily[k.today]   || 0) + 1;
        wins[name][g].weekly[k.week]   = (wins[name][g].weekly[k.week]   || 0) + 1;
        wins[name][g].monthly[k.month] = (wins[name][g].monthly[k.month] || 0) + 1;
        wins[name][g].total            = (wins[name][g].total             || 0) + 1;
      });
    }
    winners.forEach(_mutateWin);
    localStorage.setItem(WINS_KEY, JSON.stringify(wins));
  }

  // ════════════════════════════════════════════════
  // PUBLIC API — called by each game at game end
  // ════════════════════════════════════════════════
  window.TournamentBridge = {
    /**
     * @param {string[]|string[][]} ranking
     *   Solo:  ['Player1', 'Player2', 'Player3']   (1st → last)
     *   Team:  [['P1','P2'], ['P3','P4']]           (winning team first)
     */
    onGameEnd(ranking) {
      _ranking = ranking;

      // Record result only once — prevents score inflation when user goes
      // back via "Annuler" on the end popup and finishes the game again.
      if (!_resultRecorded) {
        _resultRecorded = true;
        TournamentManager.load();
        TournamentManager.recordResult(ranking);
        // Games skip stats/wins for non-profile players. The bridge records
        // them directly so tournament play is reflected in the classement.
        _bridgeRecordStats(ranking);
      }

      // Inject tournament UI — onGameEnd() always runs AFTER openModal() (synchronous),
      // so the modal already has the 'open' class. We inject here directly instead of
      // relying on MutationObserver (which is a microtask and fires too late).
      const modal = document.getElementById('end-modal');
      if (modal && modal.classList.contains('open') && !modal._tInjected) {
        modal._tInjected = true;
        _injectTournamentUI(modal);
      } else {
        // Fallback: modal already injected or not yet open — update what exists
        _updateTournamentSection();
        const btn = document.getElementById('_t_btn_next');
        if (btn) btn.disabled = false;
      }
    },
  };

  // ════════════════════════════════════════════════
  // SETUP AUTO-FILL
  // ════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', () => {
    // Small delay to let game JS initialize its setup
    setTimeout(_fillSetupAndStart, 150);
  });

  function _fillSetupAndStart() {
    const cfg     = payload.config;
    const mode    = payload.inputMode;    // 'total' | 'darts' | 'autodarts'
    const tm      = payload.teamMode;     // 'solo' | 'team'
    const cfgMode = payload.configMode || 'random';

    // Build ordered player list: interleaved (A0,B0,A1,B1…) for team games, shuffled for solo
    let playersToAdd;
    if (payload.teams && payload.teams.length >= 2) {
      const teamA = payload.teams[0], teamB = payload.teams[1];
      const maxLen = Math.max(teamA.length, teamB.length);
      playersToAdd = [];
      for (let i = 0; i < maxLen; i++) {
        if (i < teamA.length) playersToAdd.push(teamA[i]);
        if (i < teamB.length) playersToAdd.push(teamB[i]);
      }
    } else {
      playersToAdd = [...payload.players].sort(() => Math.random() - 0.5);
    }

    if (cfgMode === 'manual') {
      // Manual config: inject players + team/input mode only.
      // The player configures game params themselves and clicks start.
      _addPlayersToGame(playersToAdd);
      _fillManualMode(mode, tm);
      setTimeout(_lockPlayerUI, 100);
      return;
    }

    // Auto config: full param fill + auto-start

    // 1. Set game options first (mode, difficulty, etc.)
    //    Team games read the current mode to know which team to assign players to.
    const filler = SETUP_FILLERS[currentGameId];
    if (filler) {
      try { filler(cfg, mode, tm, payload.players, payload.teams); } catch (e) { console.warn('[Tournament] setup fill error:', e); }
    }

    // 2. Add players
    _addPlayersToGame(playersToAdd);

    // 3. For blackdart: apply croupier selected by roulette (set synchronously — players are now in B.players)
    if (currentGameId === 'blackdart') {
      const croupierName = localStorage.getItem('dartvault_tournament_croupier');
      if (croupierName) {
        localStorage.removeItem('dartvault_tournament_croupier');
        // B is declared with `let` in blackjack.html — not a window property, but accessible as a global
        const _B = window.B || (typeof B !== 'undefined' ? B : null);
        if (_B && Array.isArray(_B.players)) {
          const idx = _B.players.findIndex(p => p.name === croupierName);
          if (idx >= 0 && typeof setDealer === 'function') setDealer(idx);
        }
      }
    }

    // 4. Auto-click start button
    setTimeout(() => {
      const startSel = currentGameId === 'race500' ? '#bstart' : '#btn-start';
      const btn = document.querySelector(startSel);
      if (btn) btn.click();
    }, 200);
  }

  // ── Manual config mode helpers ────────────────────────────────────────────

  // Set only team/game mode + input mode (player fills the rest)
  function _fillManualMode(mode, tm) {
    if (currentGameId === 'territoire') {
      _clickOpt('mode', tm === 'team' ? 'equipe' : 'solo');
    } else if (currentGameId === 'dartspong') {
      _clickOpt('mode', tm === 'team' ? 'equipe' : 'duel');
      _chk('#party-mode', false);
    } else if (currentGameId === 'shooter') {
      _clickOpt('mode', tm === 'team' ? 'team' : 'solo');
    } else if (currentGameId === 'bataille') {
      _clickOpt('game-mode', tm === 'team' ? 'team' : 'solo');
    }
    _setInputMode(mode, payload.autodarts_ip);
  }

  // Grey out and disable player add/remove controls so the player list is locked
  function _lockPlayerUI() {
    // Disable elements directly — most reliable method across all games
    const inp = document.getElementById('player-input') || document.getElementById('pinp');
    if (inp) inp.disabled = true;

    const addBtn = document.getElementById('btn-add')
                || document.getElementById('btn-add-player')
                || document.getElementById('badd');
    if (addBtn) addBtn.disabled = true;

    // CSS for visual greying + .btn-del (dynamically created, can't set disabled directly)
    const style = document.createElement('style');
    style.textContent = `
      #player-input, #pinp { opacity:.35!important; cursor:not-allowed!important; }
      #btn-add, #btn-add-player, #badd { opacity:.35!important; cursor:not-allowed!important; }
      .btn-del { opacity:.35!important; pointer-events:none!important; cursor:not-allowed!important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ────────────────────────────────────────────────
  // Player injection helpers

  // Input field ID varies by game
  const PLAYER_INPUT_ID = { race500: 'pinp' };

  // Add-player function name varies by game
  function _callAddPlayerFn() {
    if (currentGameId === 'race500')  { if (typeof window.addP === 'function')             window.addP();             return; }
    if (currentGameId === 'bataille') { if (typeof window.addPlayerSetup === 'function')   window.addPlayerSetup();   return; }
    if (typeof window.addPlayer === 'function') window.addPlayer();
  }

  function _addPlayersToGame(players) {
    if (!players || !players.length) return;
    const inputId = PLAYER_INPUT_ID[currentGameId] || 'player-input';
    const inp = document.getElementById(inputId);
    if (!inp) { console.warn('[Tournament] player input not found:', inputId); return; }
    players.forEach(fullName => {
      inp.value = fullName;
      _callAddPlayerFn();
      inp.value = '';
    });
  }

  // ────────────────────────────────────────────────
  // Helper: click a radio/option button by value
  function _clickOpt(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
    // Try data-val or data-value
    const btn = document.querySelector(`[data-val="${value}"], [data-value="${value}"]`);
    if (btn && !btn.classList.contains('active')) btn.click();
  }

  // Helper: click an element by selector
  function _click(sel) {
    const el = document.querySelector(sel);
    if (el) el.click();
  }

  // Helper: set checkbox
  function _chk(sel, checked) {
    const el = document.querySelector(sel);
    if (!el) return;
    if (el.checked !== checked) el.click();
  }

  // Helper: set input value
  function _val(sel, value) {
    const el = document.querySelector(sel);
    if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  // Helper: set input mode (total / darts / autodarts)
  function _setInputMode(mode, autodarts_ip) {
    if (mode === 'autodarts') {
      _chk('#chk-autodarts', true);
      if (autodarts_ip) _val('#autodarts-ip', autodarts_ip);
    } else {
      _chk('#chk-autodarts', false);
      // toggle input mode button if it exists
      const btn = document.querySelector('#btn-input-mode, #btn-input-mode-bj');
      if (btn) {
        const current = btn.dataset.mode || btn.textContent;
        const wantDarts = mode === 'darts';
        const isDarts = current === 'darts' || btn.textContent.toLowerCase().includes('fléchette');
        if (wantDarts !== isDarts) btn.click();
      }
    }
  }

  // ────────────────────────────────────────────────
  // Per-game setup fillers
  const SETUP_FILLERS = {

    // ── 501 ──────────────────────────────────────
    g501(cfg, mode, tm, players, teams) {
      // Game mode (301/501)
      _clickOpt('gamemode', cfg.gamemode);
      // End mode
      _click(`#opt-${cfg.endMode}`);
      // Legs (always 1 in tournament — default)
      // Input mode
      _setInputMode(mode, payload.autodarts_ip);
    },

    // ── Cricket ──────────────────────────────────
    cricket(cfg, mode, tm, players, teams) {
      _clickOpt('mode', cfg.mode);
      _clickOpt('rounds', String(cfg.rounds));
      _setInputMode(mode, payload.autodarts_ip);
    },

    // ── Shanghai ─────────────────────────────────
    shanghai(cfg, mode, tm, players, teams) {
      _click(cfg.mode === 'random' ? '#opt-shg-rnd' : '#opt-shg-std');
      _clickOpt('rounds', String(cfg.rounds));
      _setInputMode(mode, payload.autodarts_ip);
    },

    // ── Horloge ──────────────────────────────────
    horloge(cfg, mode, tm, players, teams) {
      _click(`#opt-ordre-${cfg.ordre}`);
      _click(`#opt-bull-${cfg.bull}`);
      _click(`#opt-hits-${cfg.hits}`);
      _click(`#opt-skip-${cfg.skip}`);
      _chk('#chk-replay', cfg.replay);
      if (cfg.maxrounds != null) _click(`#opt-maxrounds-${cfg.maxrounds}`);
      _setInputMode(mode, payload.autodarts_ip);
    },

    // ── Race500 ──────────────────────────────────
    race500(cfg, mode, tm, players, teams) {
      _clickOpt('tgt', String(cfg.tgt));
      _clickOpt('steal', String(cfg.steal));
      _setInputMode(mode, payload.autodarts_ip);
    },

    // ── BlackDart ─────────────────────────────────
    blackdart(cfg, mode, tm, players, teams) {
      _clickOpt('rounds', String(cfg.rounds));
      _val('#inp-tgt-min', cfg.tgtMin);
      _val('#inp-tgt-max', cfg.tgtMax);
      _setInputMode(mode, payload.autodarts_ip);
    },

    // ── Territoire ────────────────────────────────
    territoire(cfg, mode, tm, players, teams) {
      _clickOpt('zones', String(cfg.zones));
      _clickOpt('rounds', String(cfg.rounds));
      // Difficulty toggle
      const diffBtn = document.querySelector('#btn-difficulty');
      if (diffBtn) {
        const cur = diffBtn.dataset.difficulty || diffBtn.textContent;
        const wantNormal = cfg.difficulty === 'normal';
        const isNormal = cur === 'normal' || diffBtn.textContent.toLowerCase().includes('normal');
        if (wantNormal !== isNormal) diffBtn.click();
      }
      // Team mode
      _clickOpt('mode', cfg.mode || (tm === 'team' ? 'equipe' : 'solo'));
      _setInputMode(mode, payload.autodarts_ip);
    },

    // ── DartPong ─────────────────────────────────
    dartspong(cfg, mode, tm, players, teams) {
      _clickOpt('zones', String(cfg.zones));
      // Difficulty
      const diffBtn = document.querySelector('#btn-difficulty-dp');
      if (diffBtn) {
        const cur = diffBtn.dataset.difficulty || '';
        const wantHard = cfg.difficulty === 'hard';
        const isHard = cur === 'hard' || diffBtn.textContent.toLowerCase().includes('difficile');
        if (wantHard !== isHard) diffBtn.click();
      }
      // Game mode
      _clickOpt('mode', cfg.mode || (tm === 'team' ? 'equipe' : 'duel'));
      // Never party mode in tournament
      _chk('#party-mode', false);
      _setInputMode(mode, payload.autodarts_ip);
    },

    // ── Shooter ──────────────────────────────────
    shooter(cfg, mode, tm, players, teams) {
      _clickOpt('hp', String(cfg.hp));
      // Difficulty
      const diffBtn = document.querySelector('#btn-difficulty');
      if (diffBtn) {
        const wantHard = cfg.difficulty === 'hard';
        const isHard = diffBtn.classList.contains('hard')
                    || (diffBtn.dataset.difficulty || '') === 'hard'
                    || diffBtn.textContent.toLowerCase().includes('difficile')
                    || diffBtn.textContent.toLowerCase().includes('hard');
        if (wantHard !== isHard) diffBtn.click();
      }
      // Team mode
      _clickOpt('mode', cfg.mode || (tm === 'team' ? 'team' : 'solo'));
      _clickOpt('maxrounds-sht', String(cfg['maxrounds-sht'] ?? 0));
      _setInputMode(mode, payload.autodarts_ip);
    },

    // ── Bataille Navale ───────────────────────────
    bataille(cfg, mode, tm, players, teams) {
      _clickOpt('difficulty', cfg.difficulty || 'easy');
      if (cfg.difficulty !== 'normal' && cfg.difficulty !== 'hard') {
        _clickOpt('nb-ships', String(cfg.nbShips ?? 3));
      }
      _clickOpt('game-mode', cfg['game-mode'] || (tm === 'team' ? 'team' : 'solo'));
      _clickOpt('maxrounds-bt', String(cfg['maxrounds-bt'] ?? 0));
      _setInputMode(mode, payload.autodarts_ip);
    },
  };

  // ════════════════════════════════════════════════
  // MENU / BACK BUTTON — replace with "Quitter le tournoi"
  // ════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', () => {
    // Back/menu button IDs vary by game
    const backBtn = document.getElementById('btn-back')
                 || document.getElementById('btn-menu-back')
                 || document.getElementById('bbk');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        _showQuitOverlay();
      }, true); // capture phase to intercept before the game's own handler
    }
  });

  function _showQuitOverlay() {
    if (document.getElementById('_t_quit_overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = '_t_quit_overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,.85);backdrop-filter:blur(6px);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:24px;gap:16px;
    `;
    overlay.innerHTML = `
      <div style="font-family:'Rajdhani',sans-serif;font-size:1.3rem;font-weight:800;letter-spacing:2px;color:#fff;text-align:center;">
        ⚠️ QUITTER LE TOURNOI ?
      </div>
      <div style="font-size:.88rem;color:rgba(255,255,255,.55);text-align:center;max-width:280px;line-height:1.5;">
        La progression du tournoi sera perdue.
      </div>
      <button id="_t_quit_confirm" style="
        width:100%;max-width:320px;padding:13px;border-radius:12px;border:none;
        background:#E53935;color:#fff;font-family:'Rajdhani',sans-serif;
        font-size:1rem;font-weight:800;letter-spacing:2px;cursor:pointer;
      ">🚪 QUITTER LE TOURNOI</button>
      <button id="_t_quit_cancel" style="
        width:100%;max-width:320px;padding:11px;border-radius:12px;
        border:1px solid rgba(255,255,255,.15);background:transparent;
        color:rgba(255,255,255,.7);font-family:'Rajdhani',sans-serif;
        font-size:.95rem;font-weight:700;cursor:pointer;
      ">↩ Continuer la partie</button>
    `;
    document.body.appendChild(overlay);

    document.getElementById('_t_quit_confirm').addEventListener('click', () => {
      TournamentManager.load();
      TournamentManager.quit();
      localStorage.removeItem('dartvault_tournament_payload');
      location.href = 'index.html';
    });
    document.getElementById('_t_quit_cancel').addEventListener('click', () => {
      overlay.remove();
    });
  }

  // ════════════════════════════════════════════════
  // END POPUP MONITORING
  // ════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('end-modal');
    if (!modal) return;

    // Watch for 'open' class being added
    new MutationObserver(() => {
      if (modal.classList.contains('open') && !modal._tInjected && _ranking !== null) {
        modal._tInjected = true;
        _injectTournamentUI(modal);
      }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  });

  function _injectTournamentUI(modal) {
    // ── Hide unwanted buttons ──
    const toHide = ['#btn-rematch', '#btn-end-back', '#btn-end-config', '#btn-end-menu'];
    toHide.forEach(sel => {
      const el = modal.querySelector(sel);
      if (el) el.style.display = 'none';
    });

    // ── Intercept "Annuler/Close" button: in tournament, redirect to tournament.html
    //    instead of letting the user replay (which would re-record wins infinitely).
    const closeBtnIntercept = modal.querySelector('#btn-end-close');
    if (closeBtnIntercept) {
      closeBtnIntercept.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        location.href = 'tournament.html';
      }, true); // capture phase — runs before the game's own handler
    }

    // ── Find close button and its container row ──
    const closeBtn = modal.querySelector('#btn-end-close');
    // Button row is the direct parent of closeBtn (e.g. .mod-btns / .modal-btns)
    const btnRow = closeBtn ? closeBtn.parentNode : null;
    // Inner modal card is the direct parent of the button row (e.g. .mod / .modal)
    const innerCard = btnRow ? btnRow.parentNode : modal;

    // ── Build tournament section ──
    const section = document.createElement('div');
    section.id = '_t_section';
    section.innerHTML = _buildSectionHTML();
    section.style.cssText = `
      margin: 12px 0 10px;
      display: flex; flex-direction: column; gap: 10px;
    `;

    // Insert section before the button row (both are direct children of innerCard)
    if (btnRow) {
      innerCard.insertBefore(section, btnRow);
    } else {
      innerCard.appendChild(section);
    }

    // ── Add "Manche suivante" / "Terminer" button AFTER close button ──
    const isLast = _isLastGame();
    const nextBtn = document.createElement('button');
    nextBtn.id = '_t_btn_next';
    const alreadyCalled = _ranking !== null;
    nextBtn.disabled = !alreadyCalled;
    nextBtn.textContent = isLast ? '🏆 TERMINER LE TOURNOI' : '➡ MANCHE SUIVANTE';
    nextBtn.style.cssText = `
      width: 100%; padding: 13px; border-radius: 12px; border: none;
      background: linear-gradient(135deg, #E8C547, #F0A040);
      color: #0A0A0A; font-family: 'Rajdhani', sans-serif;
      font-size: 1.05rem; font-weight: 800; letter-spacing: 2px;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 20px rgba(232,197,71,.4);
      margin-top: 6px; opacity: ${alreadyCalled ? '1' : '.5'}; transition: opacity .2s;
    `;
    nextBtn.addEventListener('click', _onNextGame);
    const observer = new MutationObserver(() => {
      nextBtn.style.opacity = nextBtn.disabled ? '.5' : '1';
    });
    observer.observe(nextBtn, { attributes: true, attributeFilter: ['disabled'] });

    // Append next button inside the button row, after the close button
    if (closeBtn) {
      closeBtn.after(nextBtn);
    } else {
      innerCard.appendChild(nextBtn);
    }

    // Si onGameEnd() a déjà été appelé avant l'injection, mettre à jour le leaderboard maintenant
    if (alreadyCalled) {
      _updateTournamentSection();
    }
  }

  function _buildSectionHTML() {
    TournamentManager.load();
    const idx   = TournamentManager.state?.gameIndex ?? 0;
    const total = TournamentManager.state?.games?.length ?? 0;

    return `
      <div style="height:1px;background:rgba(255,255,255,.08);margin:4px 0;"></div>
      <div style="font-size:.68rem;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);text-align:center;">
        Classement du tournoi — Jeu ${idx} / ${total}
      </div>
      <div id="_t_leaderboard" style="display:flex;flex-direction:column;gap:6px;">
        <div style="text-align:center;color:rgba(255,255,255,.3);font-size:.82rem;">En attente des résultats...</div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,.08);margin:4px 0;"></div>
    `;
  }

  function _updateTournamentSection() {
    TournamentManager.load();
    const lb  = TournamentManager.getLeaderboard();
    const container = document.getElementById('_t_leaderboard');
    if (!container) return;

    const rankEmojis = ['🥇','🥈','🥉'];
    const maxPts = lb[0]?.score || 1;

    container.innerHTML = lb.map((p, i) => {
      const barW = maxPts > 0 ? Math.round((p.score / maxPts) * 100) : 0;
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;
          background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);">
          <span style="width:20px;text-align:center;font-size:.95rem;">${rankEmojis[i] || (i+1) + '.'}</span>
          <span style="flex:1;font-family:'Rajdhani',sans-serif;font-size:.9rem;font-weight:700;">${p.name}</span>
          <div style="width:60px;height:4px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;">
            <div style="width:${barW}%;height:100%;background:linear-gradient(90deg,#E8C547,#F0A040);border-radius:2px;"></div>
          </div>
          <span style="font-family:'Rajdhani',sans-serif;font-size:.9rem;font-weight:800;color:#E8C547;min-width:36px;text-align:right;">
            ${p.score} pt${p.score !== 1 ? 's' : ''}
          </span>
        </div>
      `;
    }).join('');
  }

  function _isLastGame() {
    TournamentManager.load();
    if (!TournamentManager.state) return false;
    const st = TournamentManager.state;
    // gameIndex was already advanced by recordResult, so check if done
    return st.phase === 'done';
  }

  function _onNextGame() {
    location.href = 'tournament.html';
  }

})();
