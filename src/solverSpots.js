/* ================== SOLVER-DERIVED POSTFLOP SPOTS ==================
 *
 * Maps real CFR solver output (lesson_strategies.json, generated offline by
 * the poker-solver repo) into the lesson/quiz objects the Train tab already
 * uses. No UI lives here -- this module is purely a data adapter.
 *
 * Schema recap (see the solver repo's README for the full version):
 *   data.spots[].strategies[player][history][combo] =
 *       { strength, hand_class, semantic_strength, reached, actions }
 * where `player` is "OOP"/"IP", `history` is "root" or actions joined by "/"
 * (e.g. "check/bet 50"), `combo` is like "AsQs", and `actions` is a
 * frequency distribution that sums to 1. `semantic_strength` is a board-aware
 * label ("top_pair", "set", "overpair", ...) used to filter dealt combos to a
 * spot's featured_hand_strength so the hand always matches the lesson concept.
 *
 * One solver spot contains ~10 decision points x ~25 combos, so instead of
 * hardcoding one hand per lesson, genSolverSpots() samples a fresh
 * (spot, hero, decision point, combo) every time a lesson is built --
 * 15 solved spots behave like hundreds of distinct quiz questions.
 */
import solverData from "./lesson_strategies.json";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// Fisher-Yates: an unbiased shuffle (a .sort() with a random comparator is not
// uniform). Returns a new array; the input is left untouched.
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* Suit symbols for explain-text only; the table renders cards itself. */
const SUIT_SYM = { s: "♠", h: "♥", d: "♦", c: "♣" };

/* "AsQs" -> ["As", "Qs"] (the format TablePanel's <Card> expects). */
function parseCombo(comboName) {
  return [comboName.slice(0, 2), comboName.slice(2)];
}

/* "AsQs" -> "A♠Q♠" for prose. */
function prettyCombo(comboName) {
  return parseCombo(comboName)
    .map((c) => (c[0] === "T" ? "10" : c[0]) + SUIT_SYM[c[1]])
    .join("");
}

/* Solver action keys -> button labels. Keys are stable strings:
 * "check", "fold", "call", "bet <pct>", "raise <pct>" (pct = % of pot). */
function actionLabel(action) {
  if (action === "check") return "Check";
  if (action === "fold") return "Fold";
  if (action === "call") return "Call";
  const [verb, pct] = action.split(" ");
  return `${verb === "bet" ? "Bet" : "Raise"} ${pct}% pot`;
}

/* Turn a history key like "check/bet 50" into table-talk lines.
 * River actions strictly alternate OOP, IP, OOP, ... so the i-th token's
 * actor is known; `hero` decides whether to say "You" or the villain name. */
function narrate(historyKey, hero) {
  if (historyKey === "root") return ["You're first to act on the river."];
  const lines = historyKey.split("/").map((token, i) => {
    const actor = i % 2 === 0 ? "OOP" : "IP";
    const you = actor === hero;
    const subject = you ? "You" : "villain";
    const s = you ? "" : "s"; // "You check." vs "OOP checks."
    if (token === "check") return `${subject} check${s}.`;
    const [verb, pct] = token.split(" ");
    return `${subject} ${verb}${s} ${pct}% pot.`;
  });
  lines.push("Action on you.");
  return lines;
}

/* Build the post-answer explanation: the spot's lesson text plus a sentence
 * about how the solver actually plays this exact combo here. */
function explainFor(spot, comboName, comboData, options) {
  const sorted = [...options].sort((a, b) => b.freq - a.freq);
  const top = sorted[0];
  const mixText =
    top.freq >= 85
      ? `plays ${top.label} ${top.freq}% of the time -- essentially a pure strategy`
      : `genuinely mixes here: ${sorted
          .filter((o) => o.freq >= 3)
          .map((o) => `${o.label} ${o.freq}%`)
          .join(", ")}`;
  return (
    `${spot.description} You hold ${prettyCombo(comboName)} ` +
    `(${comboData.hand_class.toLowerCase()}). The solver ${mixText}. ` +
    `These frequencies are real CFR output, not hand-tuned numbers.`
  );
}

/* All quizzable (hero, historyKey) decision points of one spot: those where
 * at least one combo actually reaches the node under equilibrium play.
 * Combos flagged reached:false carry a meaningless uniform placeholder
 * strategy, so they are excluded from sampling entirely.
 *
 * Only OOP nodes are returned because every spot's description is written
 * from OOP's perspective. Serving IP nodes would show the user the villain's
 * narrative. Full IP perspective support is a future enhancement. */
function quizzableNodes(spot) {
  const nodes = [];
  for (const [historyKey, table] of Object.entries(spot.strategies["OOP"])) {
    const combos = Object.keys(table).filter((c) => table[c].reached);
    if (combos.length > 0) nodes.push({ hero: "OOP", historyKey, combos });
  }
  return nodes;
}

/* Human-friendly aliases accepted in a spot's featured_hand_strength, mapped to
 * the canonical semantic_strength label the JSON carries. Kept in sync with
 * precompute.py's FEATURED_ALIASES. */
const FEATURED_ALIASES = { bluff: "high_card" };

/* Within one decision node, the combos whose semantic_strength matches the
 * spot's featured concept (e.g. only "top_pair" combos on a kicker-battle spot).
 * Returns all combos when the spot names no featured strengths. */
function featuredCombos(spot, hero, historyKey, combos) {
  const featured = spot.featured_hand_strength || [];
  if (featured.length === 0) return combos;
  const wanted = new Set(featured.map((f) => FEATURED_ALIASES[f] || f));
  const table = spot.strategies[hero][historyKey];
  return combos.filter((c) => wanted.has(table[c].semantic_strength));
}

/* Generate coaching read-more text from the actual spot numbers at this node.
 * Facing a bet → pot odds with real chips; first to act → check/bet framing. */
function riverReadMore(spot, historyKey, comboData) {
  const acts = historyKey === "root" ? [] : historyKey.split("/");
  const last = acts[acts.length - 1] ?? "";
  const strength = comboData.semantic_strength.replace(/_/g, " ");

  if (last.startsWith("bet")) {
    const betFrac = parseInt(last.split(" ")[1]) / 100;
    const bet = Math.round(spot.pot * betFrac);
    const req = Math.round((bet / (spot.pot + 2 * bet)) * 100);

    const STRONG = new Set(["flush", "full_house", "quads", "straight_flush", "straight", "set", "trips", "two_pair"]);
    const MEDIUM = new Set(["top_pair", "overpair"]);

    let verdict;
    if (STRONG.has(comboData.semantic_strength)) {
      verdict = `With ${strength} you're well above that number — this is generally a call.`;
    } else if (MEDIUM.has(comboData.semantic_strength)) {
      verdict = `With ${strength} you're right around that number — it comes down to how often villain is bluffing here.`;
    } else {
      verdict = `With ${strength} you're likely below that number, so calling only works if villain is bluffing a lot.`;
    }

    return `Villain bet ${bet} into a ${spot.pot} pot, so you need to win ${req}% of the time to break even on a call. ${verdict}`;
  }

  const STRONG_BET = new Set(["flush", "full_house", "quads", "straight_flush", "straight", "set", "trips", "two_pair", "top_pair", "overpair"]);
  if (STRONG_BET.has(comboData.semantic_strength)) {
    return `You're first to act in a ${spot.pot} pot with ${strength}. Strong made hands generally want to bet — checking gives villain a free showdown and leaves value on the table.`;
  }
  return `You're first to act in a ${spot.pot} pot with ${strength}. Without showdown value, any bet has to work as a bluff — the question is whether villain folds enough here to make it profitable.`;
}

/* One solver spot -> one lesson object in the Train tab's existing format. */
function buildSpot(spot) {
  // Prefer decision nodes that actually contain a combo of the featured concept
  // so the dealt hand always matches the spot's title/lesson.
  const nodes = quizzableNodes(spot).map((n) => ({
    ...n,
    matching: featuredCombos(spot, n.hero, n.historyKey, n.combos),
  }));
  const matchingNodes = nodes.filter((n) => n.matching.length > 0);

  let node, comboPool;
  if (matchingNodes.length > 0) {
    node = pick(matchingNodes);
    comboPool = node.matching;
  } else {
    // No node anywhere in this spot offers a combo of the featured strength --
    // the spot is misconfigured. Fall back to the full pool so quizzing never
    // breaks, but warn loudly so it is visible during development.
    node = pick(nodes);
    comboPool = node.combos;
    const available = [
      ...new Set(
        node.combos.map((c) => spot.strategies[node.hero][node.historyKey][c].semantic_strength),
      ),
    ];
    console.warn(
      `[solverSpots] No combo matches featured_hand_strength ` +
        `[${(spot.featured_hand_strength || []).join(", ")}] for spot "${spot.name}" ` +
        `at node "${node.historyKey}". Available strengths: [${available.join(", ")}]. ` +
        `Falling back to the full combo pool.`,
    );
  }

  const { hero, historyKey } = node;
  const comboName = pick(comboPool);
  const comboData = spot.strategies[hero][historyKey][comboName];

  // Frequencies arrive as 0..1 and the app works in whole percents.
  const options = Object.entries(comboData.actions).map(([action, f]) => ({
    label: actionLabel(action),
    freq: Math.round(f * 100),
  }));

  return {
    kind: "river",
    solver: true, // marks the spot as real solver data (vs hand-written)
    title: spot.name,
    sub: `you vs villain · river · vanilla CFR, ${solverData.iterations} iterations`,
    heroPos: hero,
    heroCards: parseCombo(comboName),
    board: spot.board,
    pot: spot.pot,
    history: narrate(historyKey, hero),
    options,
    explain: explainFor(spot, comboName, comboData, options),
    concept: spot.concept,
    read_more: riverReadMore(spot, historyKey, comboData),
  };
}

/* n lesson objects from n distinct solver spots, freshly sampled. */
export function genSolverSpots(n) {
  return shuffle(solverData.spots).slice(0, n).map(buildSpot);
}
