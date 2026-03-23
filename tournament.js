/**
 * DartVault — Tournament Manager
 * Central state machine for tournament mode.
 * All state persists in localStorage under TOURNAMENT_KEY.
 */

const TOURNAMENT_KEY = 'dartvault_tournament';

const TournamentManager = {

  state: null,

  // ─────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────

  load() {
    try {
      const raw = localStorage.getItem(TOURNAMENT_KEY);
      this.state = raw ? JSON.parse(raw) : null;
    } catch {
      this.state = null;
    }
    return this.state;
  },

  save() {
    if (this.state) {
      localStorage.setItem(TOURNAMENT_KEY, JSON.stringify(this.state));
    }
  },

  exists() {
    if (!this.state) this.load();
    return !!(this.state && this.state.active);
  },

  quit() {
    this.state = null;
    localStorage.removeItem(TOURNAMENT_KEY);
  },

  // ─────────────────────────────────────────────
  // Create tournament
  // ─────────────────────────────────────────────

  /**
   * Create and persist a new tournament.
   * @param {object} opts
   *   players       string[]           ordered player names
   *   nbGames       number             2–10
   *   difficulty    'easy'|'normal'
   *   inputMode     'manual'|'autodarts'
   *   autodarts_ip  string
   *   selectionMode 'manual'|'random'
   *   selectedGames string[]|null      game IDs if manual, null if random
   */
  create({ players, nbGames, difficulty, inputMode, autodarts_ip, selectionMode, selectedGames, configMode }) {
    // Build the ordered game list with configs + team assignments
    const games = this._buildGameList(
      selectedGames,
      nbGames,
      players,
      difficulty,
      selectionMode,
      configMode || 'random'
    );

    // Initial scores
    const scores = {};
    players.forEach(p => scores[p] = 0);

    this.state = {
      active:        true,
      createdAt:     Date.now(),
      difficulty,
      inputMode,
      autodarts_ip:  autodarts_ip || '192.168.1.37',
      selectionMode,
      configMode:    configMode || 'random',
      players,
      scores,
      games,          // array of game objects (see _makeGameEntry)
      gameIndex:      0,
      phase:          'setup', // 'setup' | 'playing' | 'between' | 'done'
    };

    this.save();
    return this.state;
  },

  // ─────────────────────────────────────────────
  // Game list builder
  // ─────────────────────────────────────────────

  _buildGameList(selectedGames, nbGames, players, difficulty, selectionMode, configMode) {
    let gameIds;

    if (selectionMode === 'manual') {
      gameIds = selectedGames;
    } else {
      // Random: pick nbGames from available games, no duplicates
      const pool = availableGames(players.length).map(g => g.id);
      gameIds = this._shuffleArray([...pool]).slice(0, nbGames);
    }

    return gameIds.map(id => this._makeGameEntry(id, players, difficulty, configMode));
  },

  _makeGameEntry(gameId, players, difficulty, configMode) {
    const gameDef  = TOURNAMENT_GAMES.find(g => g.id === gameId);
    const teamMode = resolveTeamMode(gameDef, players.length);
    // In manual config mode, the player will choose params themselves
    const config   = (configMode === 'manual') ? null : pickConfig(gameId, difficulty, players.length);
    const teams    = teamMode === 'team' ? this._assignTeams(players) : null;

    // In team mode, add the resolved mode to config
    if (config) {
      if (gameDef.id === 'territoire' || gameDef.id === 'dartspong') {
        config.mode = teamMode === 'team' ? 'equipe' : 'duel';
      }
      if (gameDef.id === 'shooter' || gameDef.id === 'bataille') {
        config.mode = teamMode === 'team' ? 'team' : 'solo';
        if (gameDef.id === 'bataille') config['game-mode'] = config.mode;
      }
    }

    return {
      id:       gameId,
      name:     gameDef.name,
      url:      gameDef.url,
      teamMode,           // 'solo' | 'team'
      teams,              // null or [[p1,p2],[p3,p4]]
      config,             // game-specific params
      status:   'pending',// 'pending' | 'playing' | 'done'
      ranking:  null,     // filled after game: string[] ordered 1st→last
                          // in team mode: array of teams [[p1,p2],[p3,p4]]
      revealed: false,    // for random mode: shown to players yet?
    };
  },

  // ─────────────────────────────────────────────
  // Team assignment
  // ─────────────────────────────────────────────

  _assignTeams(players) {
    const shuffled = this._shuffleArray([...players]);
    const half     = Math.ceil(shuffled.length / 2);
    return [
      shuffled.slice(0, half),
      shuffled.slice(half),
    ];
  },

  // ─────────────────────────────────────────────
  // Game flow
  // ─────────────────────────────────────────────

  getCurrentGame() {
    if (!this.state) return null;
    return this.state.games[this.state.gameIndex] ?? null;
  },

  getNextGame() {
    if (!this.state) return null;
    return this.state.games[this.state.gameIndex + 1] ?? null;
  },

  isLastGame() {
    if (!this.state) return true;
    return this.state.gameIndex >= this.state.games.length - 1;
  },

  isComplete() {
    if (!this.state) return true;
    return this.state.phase === 'done';
  },

  /** Call when the current game starts */
  markGameStarted() {
    const game = this.getCurrentGame();
    if (!game) return;
    game.status      = 'playing';
    this.state.phase = 'playing';
    this.save();
  },

  /**
   * Call when a game ends.
   * @param {string[]|Array[]} ranking
   *   Solo: ordered player names, 1st to last  ['Lucas','Marie','Tom']
   *   Team: ordered teams 1st to last          [['Lucas','Marie'],['Tom','Jean']]
   */
  recordResult(ranking) {
    const game    = this.getCurrentGame();
    const players = this.state.players;
    const nb      = players.length;
    if (!game) return;

    game.ranking = ranking;
    game.status  = 'done';

    // Award points
    if (game.teamMode === 'team' && Array.isArray(ranking[0])) {
      // Team mode: winners get ceil(nb/2) pts each, rest 0
      const winPts = tournamentTeamPoints(nb);
      ranking[0].forEach(p => {
        if (p in this.state.scores) this.state.scores[p] += winPts;
      });
    } else {
      // Solo mode: ranking may contain strings or string[] (tied groups)
      // e.g. ['P1', ['P2','P3'], 'P4'] — tied players all get points of their best shared rank
      let rank = 1;
      ranking.forEach(entry => {
        const group = Array.isArray(entry) ? entry : [entry];
        const pts = tournamentPoints(rank, nb);
        group.forEach(p => {
          if (typeof p === 'string' && p in this.state.scores) this.state.scores[p] += pts;
        });
        rank += group.length;
      });
    }

    // Advance
    if (this.isLastGame()) {
      this.state.phase = 'done';
    } else {
      this.state.gameIndex++;
      this.state.phase = 'between';
      // Reveal next game if random mode
      const next = this.getCurrentGame();
      if (next) next.revealed = false; // will be revealed by slot machine
    }

    this.save();
  },

  /** Reveal the current game (slot machine done) */
  revealCurrentGame() {
    const game = this.getCurrentGame();
    if (game) {
      game.revealed = true;
      this.save();
    }
  },

  /** Sorted leaderboard: [{name, score}] */
  getLeaderboard() {
    if (!this.state) return [];
    return Object.entries(this.state.scores)
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score);
  },

  // ─────────────────────────────────────────────
  // Config payload for each game
  // Returned object is written to localStorage
  // so each game can read it on load.
  // ─────────────────────────────────────────────

  getTournamentPayload() {
    if (!this.state) return null;
    const game = this.getCurrentGame();
    if (!game) return null;

    return {
      // Tournament meta
      active:      true,
      inputMode:   this.state.inputMode,
      autodarts_ip:this.state.autodarts_ip,
      difficulty:  this.state.difficulty,
      configMode:  this.state.configMode || 'random',
      players:     this.state.players,
      gameIndex:   this.state.gameIndex,
      totalGames:  this.state.games.length,
      scores:      this.state.scores,
      // Current game
      gameId:      game.id,
      teamMode:    game.teamMode,
      teams:       game.teams,
      // Game-specific config (all params pre-filled)
      config:      game.config,
    };
  },

  // ─────────────────────────────────────────────
  // Config label (human readable) for between screen
  // ─────────────────────────────────────────────

  getConfigLabel(game) {
    if (!game || !game.config) return '';
    const c = game.config;
    const parts = [];

    switch (game.id) {
      case 'g501':
        parts.push(c.gamemode + ' pts');
        parts.push('Sortie : ' + (c.endMode === 'doubleout' ? 'Double' : 'Libre'));
        break;
      case 'cricket':
        parts.push('Mode : ' + (c.mode === 'noscore' ? 'Sans score' : c.mode === 'cutthroat' ? 'Cut-Throat' : 'Standard'));
        parts.push(c.rounds === 0 ? 'Manches : illimitées' : c.rounds + ' manches');
        break;
      case 'shanghai':
        parts.push('Mode : ' + (c.mode === 'random' ? 'Zones aléatoires' : 'Standard'));
        parts.push('7 zones');
        break;
      case 'horloge':
        parts.push('Ordre : ' + (c.ordre === 'asc' ? '1 → 20' : '20 → 1'));
        parts.push('Bull : ' + (c.bull === 'none' ? 'Non' : c.bull === 'bulleye' ? 'Bull + œil' : 'Oui'));
        parts.push('Saut : ' + (c.skip === 'skip' ? 'Activé' : 'Désactivé'));
        if (c.maxrounds) parts.push(c.maxrounds + ' manches max');
        break;
      case 'race500':
        parts.push('Objectif : ' + c.tgt + ' pts');
        parts.push('Vol : ' + c.steal + ' pts');
        break;
      case 'blackdart':
        parts.push(c.rounds + ' manches');
        parts.push('Cible : ' + c.tgtMin + ' – ' + c.tgtMax);
        break;
      case 'territoire':
        parts.push(c.zones + ' zones');
        parts.push(c.rounds + ' manches');
        parts.push('Difficulté : ' + (c.difficulty === 'easy' ? 'Facile' : 'Normal'));
        parts.push('Mode : ' + (c.mode === 'equipe' ? 'Équipe' : 'Solo'));
        break;
      case 'dartspong':
        parts.push(c.zones + ' zones');
        parts.push('Difficulté : ' + (c.difficulty === 'easy' ? 'Facile' : 'Difficile'));
        parts.push('Mode : ' + (c.mode === 'equipe' ? 'Équipe' : 'Duel'));
        break;
      case 'shooter':
        parts.push(c.hp + ' vies');
        parts.push('Difficulté : ' + (c.difficulty === 'easy' ? 'Facile' : 'Normal'));
        parts.push('Mode : ' + (c.mode === 'team' ? 'Équipe' : 'Solo'));
        if (c['maxrounds-sht']) parts.push(c['maxrounds-sht'] + ' manches max');
        break;
      case 'bataille':
        parts.push('Difficulté : ' + (c.difficulty === 'easy' ? 'Facile' : 'Normal'));
        if (c.nbShips) parts.push(c.nbShips + ' bateaux');
        parts.push(c['maxrounds-bt'] + ' manches max');
        parts.push('Mode : ' + (c['game-mode'] === 'team' ? 'Équipe' : 'Solo'));
        break;
    }

    return parts.filter(Boolean).join(' · ');
  },

  // ─────────────────────────────────────────────
  // Utils
  // ─────────────────────────────────────────────

  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

};
