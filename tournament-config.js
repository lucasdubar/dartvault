/**
 * DartVault — Tournament Configuration
 *
 * All parameter names match the exact HTML inputs/variables in each game file.
 * The tournament engine will read these and pre-fill each game's setup screen.
 *
 * Common params passed to every game (via localStorage dartvault_tournament):
 *   - players: string[]       player names in order
 *   - inputMode: 'manual'|'autodarts'
 *   - difficulty: 'easy'|'normal'
 *   - gameIndex: number       which game we're on (0-based)
 *   - totalGames: number
 *   - scores: { [playerName]: number }  cumulative tournament scores
 */

const TOURNAMENT_GAMES = [

  // ── 501 ────────────────────────────────────────────────────────────────────
  // input[name="gamemode"] → "301" | "501" | "701"
  // end mode → "simpleout" | "doubleout" | "dblindblout"
  // legs → selectedLegs (1 in tournament, no sets)
  {
    id: 'g501',
    name: '501',
    url: '501.html',
    teamMode: 'never',
    minPlayers: 2,
    maxPlayers: 6,
    configs: {
      easy: [
        { gamemode: '301', endMode: 'simpleout', legs: 1 },
      ],
      normal: [
        { gamemode: '501', endMode: 'doubleout', legs: 1 },
      ],
    },
  },

  // ── CRICKET ────────────────────────────────────────────────────────────────
  // input[name="mode"]   → "standard" | "cutthroat" | "noscore"
  // input[name="rounds"] → 0 (infini) | 10 | 15 | 20
  // 2 joueurs easy  : "standard" ou "cutthroat", tours: 10 ou 15
  // 3+ joueurs easy : "noscore"  ou "cutthroat", tours: 10 ou 15
  // normal (tous)   : tours 0 (infini), mode selon nb joueurs
  {
    id: 'cricket',
    name: 'Cricket',
    url: 'cricket.html',
    teamMode: 'never',
    minPlayers: 2,
    maxPlayers: 6,
    configs: {
      easy: [
        { mode: 'standard',  rounds: 10, _for2: true  },
        { mode: 'standard',  rounds: 15, _for2: true  },
        { mode: 'cutthroat', rounds: 10, _for2: true  },
        { mode: 'cutthroat', rounds: 15, _for2: true  },
        { mode: 'noscore',   rounds: 10, _for2: false },
        { mode: 'noscore',   rounds: 15, _for2: false },
        { mode: 'cutthroat', rounds: 10, _for2: false },
        { mode: 'cutthroat', rounds: 15, _for2: false },
      ],
      normal: [
        { mode: 'standard',  rounds: 0, _for2: true  },
        { mode: 'cutthroat', rounds: 0, _for2: true  },
        { mode: 'noscore',   rounds: 0, _for2: false },
        { mode: 'cutthroat', rounds: 0, _for2: false },
      ],
    },
  },

  // ── SHANGHAI ───────────────────────────────────────────────────────────────
  // mode        → "standard" | "random"   (#opt-shg-std / #opt-shg-rnd)
  // rounds      → 7   (input[name="rounds"], always 7 in tournament)
  // Same pool for easy and normal — picked randomly
  {
    id: 'shanghai',
    name: 'Shanghai',
    url: 'shanghai.html',
    teamMode: 'never',
    minPlayers: 2,
    maxPlayers: 6,
    configs: {
      easy: [
        { mode: 'standard', rounds: 7 },
        { mode: 'random',   rounds: 7 },
      ],
      normal: [
        { mode: 'standard', rounds: 7 },
        { mode: 'random',   rounds: 7 },
      ],
    },
  },

  // ── HORLOGE ────────────────────────────────────────────────────────────────
  // ordre  → "asc" always (1→20) in tournament
  // bull   → "none" | "bull" | "bulleye"  (#opt-bull-none/bull/bulleye)
  // hits   → 1  (always 1 hit per number in tournament)
  // skip   → "normal" | "skip"  (#opt-skip-normal/skip) — random both modes
  // replay → true always  (#chk-replay)
  {
    id: 'horloge',
    name: 'Horloge',
    url: 'horloge.html',
    teamMode: 'never',
    minPlayers: 2,
    maxPlayers: 6,
    configs: {
      easy: [
        { ordre: 'asc',  bull: 'none', hits: 1, skip: 'normal', replay: true },
        { ordre: 'asc',  bull: 'none', hits: 1, skip: 'skip',   replay: true },
        { ordre: 'desc', bull: 'none', hits: 1, skip: 'normal', replay: true },
        { ordre: 'desc', bull: 'none', hits: 1, skip: 'skip',   replay: true },
      ],
      normal: [
        { ordre: 'asc',  bull: 'bull',    hits: 1, skip: 'normal', replay: true },
        { ordre: 'asc',  bull: 'bull',    hits: 1, skip: 'skip',   replay: true },
        { ordre: 'asc',  bull: 'bulleye', hits: 1, skip: 'normal', replay: true },
        { ordre: 'asc',  bull: 'bulleye', hits: 1, skip: 'skip',   replay: true },
        { ordre: 'desc', bull: 'bull',    hits: 1, skip: 'normal', replay: true },
        { ordre: 'desc', bull: 'bull',    hits: 1, skip: 'skip',   replay: true },
        { ordre: 'desc', bull: 'bulleye', hits: 1, skip: 'normal', replay: true },
        { ordre: 'desc', bull: 'bulleye', hits: 1, skip: 'skip',   replay: true },
      ],
    },
  },

  // ── RACE 500 ───────────────────────────────────────────────────────────────
  // input[name="tgt"]   → "300" | "500"
  // input[name="steal"] → "0" | "10" | "25" | "50" | "75"
  {
    id: 'race500',
    name: 'Race',
    url: 'race500.html',
    teamMode: 'never',
    minPlayers: 2,
    maxPlayers: 6,
    configs: {
      easy: [
        { tgt: '300', steal: '10' },
        { tgt: '300', steal: '25' },
      ],
      normal: [
        { tgt: '500', steal: '10' },
        { tgt: '500', steal: '25' },
        { tgt: '500', steal: '50' },
      ],
    },
  },

  // ── BLACKDART ──────────────────────────────────────────────────────────────
  // input[name="rounds"] → 3 | 5 | 7 | 10
  // #inp-tgt-min / #inp-tgt-max → numeric
  {
    id: 'blackdart',
    name: 'BlackDart',
    url: 'blackjack.html',
    teamMode: 'never',
    minPlayers: 2,
    maxPlayers: 6,
    configs: {
      easy: [
        { rounds: 5, tgtMin: 21, tgtMax: 60 },
      ],
      normal: [
        { rounds: 7, tgtMin: 21, tgtMax: 80 },
      ],
    },
  },

  // ── TERRITOIRE ─────────────────────────────────────────────────────────────
  // input[name="zones"]  → 5 | 7 | 10
  // input[name="rounds"] → 5 | 7 | 10
  // difficulty           → "easy" | "normal"
  // input[name="mode"]   → "solo" | "equipe"
  // 1-3 joueurs : solo | 4 joueurs : equipe | 5-6 : indisponible
  {
    id: 'territoire',
    name: 'Territoire',
    url: 'territoire.html',
    teamMode: 'conditional',
    minPlayers: 2,
    maxPlayers: 4,
    configs: {
      easy: [
        { zones: 5, rounds: 5, difficulty: 'easy' },
        { zones: 5, rounds: 7, difficulty: 'easy' },
        { zones: 7, rounds: 5, difficulty: 'easy' },
        { zones: 7, rounds: 7, difficulty: 'easy' },
      ],
      normal: [
        { zones: 5, rounds: 5, difficulty: 'normal' },
        { zones: 5, rounds: 7, difficulty: 'normal' },
        { zones: 7, rounds: 5, difficulty: 'normal' },
        { zones: 7, rounds: 7, difficulty: 'normal' },
      ],
    },
  },

  // ── DARTPONG ───────────────────────────────────────────────────────────────
  // input[name="zones"]    → 5 | 7 | 10
  // difficulty             → "easy" | "hard"
  // input[name="mode"]     → "duel" | "equipe"
  // #party-mode (checkbox) → always false in tournament
  // Impair → duel | Pair → random duel ou equipe
  {
    id: 'dartspong',
    name: 'DartPong',
    url: 'dartspong.html',
    teamMode: 'optional',
    minPlayers: 2,
    maxPlayers: 4,
    configs: {
      easy: [
        { zones: 5, difficulty: 'easy', partyMode: false },
        { zones: 7, difficulty: 'easy', partyMode: false },
      ],
      normal: [
        { zones: 7,  difficulty: 'hard', partyMode: false },
        { zones: 10, difficulty: 'hard', partyMode: false },
      ],
    },
  },

  // ── SHOOTER (BATTLEROYAL) ──────────────────────────────────────────────────
  // input[name="hp"]    → 3 | 5 | 10
  // difficulty          → "easy" | "hard"
  // input[name="mode"]  → "solo" | "team"
  // 2-3 joueurs : solo | 4 joueurs : random solo (1v1v1v1) ou team (2v2)
  {
    id: 'shooter',
    name: 'BattleRoyal',
    url: 'shooter.html',
    teamMode: 'conditional',
    minPlayers: 2,
    maxPlayers: 4,
    configs: {
      easy: [
        { hp: 3, difficulty: 'easy' },
        { hp: 5, difficulty: 'easy' },
      ],
      normal: [
        { hp: 5, difficulty: 'hard' },
      ],
    },
  },

  // ── BATAILLE NAVALE ────────────────────────────────────────────────────────
  // input[name="nb-ships"]  → 2 | 3 | 4
  // input[name="game-mode"] → "solo" | "team"
  // 2 joueurs : solo | 3 joueurs : indisponible | 4 ou 6 joueurs : team
  {
    id: 'bataille',
    name: 'Bataille Navale',
    url: 'bataille.html',
    teamMode: 'conditional',
    minPlayers: 2,
    maxPlayers: 6,
    configs: {
      easy: [
        { nbShips: 2 },
        { nbShips: 3 },
      ],
      normal: [
        { nbShips: 3 },
        { nbShips: 4 },
      ],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

/** Points for a given rank (1-based) in solo mode */
function tournamentPoints(rank, nbPlayers) {
  return Math.max(0, nbPlayers - rank);
}

/** Points for each member of the winning team */
function tournamentTeamPoints(nbPlayers) {
  return Math.ceil(nbPlayers / 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Config picker
// ─────────────────────────────────────────────────────────────────────────────

/** Random config for a game + difficulty + nbPlayers */
function pickConfig(gameId, difficulty, nbPlayers) {
  const game = TOURNAMENT_GAMES.find(g => g.id === gameId);
  if (!game) return null;
  const pool = (game.configs[difficulty] ?? game.configs.normal).filter(c => {
    if ('_for2' in c) return nbPlayers === 2 ? c._for2 : !c._for2;
    return true;
  });
  if (!pool.length) return null;
  return { ...pool[Math.floor(Math.random() * pool.length)] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Team mode resolver
// ─────────────────────────────────────────────────────────────────────────────

/** Returns 'solo' | 'team' | 'unavailable' for a game given nbPlayers */
function resolveTeamMode(game, nbPlayers) {
  if (nbPlayers < game.minPlayers || nbPlayers > game.maxPlayers) return 'unavailable';

  if (game.id === 'bataille') {
    if (nbPlayers === 3) return 'unavailable';
    return nbPlayers === 2 ? 'solo' : 'team'; // 4 or 6
  }
  if (game.id === 'territoire') {
    if (nbPlayers > 4) return 'unavailable';
    return nbPlayers === 4 ? 'team' : 'solo';
  }
  if (game.id === 'shooter') {
    if (nbPlayers > 4) return 'unavailable';
    if (nbPlayers === 4) return Math.random() < 0.5 ? 'team' : 'solo';
    return 'solo';
  }
  if (game.id === 'dartspong') {
    if (nbPlayers % 2 === 0) return Math.random() < 0.5 ? 'team' : 'solo';
    return 'solo';
  }
  return 'solo';
}

// ─────────────────────────────────────────────────────────────────────────────
// Available games for a given player count
// ─────────────────────────────────────────────────────────────────────────────

function availableGames(nbPlayers) {
  return TOURNAMENT_GAMES.filter(g => resolveTeamMode(g, nbPlayers) !== 'unavailable');
}
