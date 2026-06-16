import { useState } from "react";
import { genSolverSpots } from "./solverSpots";

/* ================== THEME ================== */
const T = {
  felt: "#0C2B22",
  feltDeep: "#081E18",
  feltLine: "#1B4A3B",
  cream: "#F6F1E3",
  creamDim: "#CFC8B4",
  brass: "#D8A93D",
  brassDeep: "#A87E1F",
  red: "#D64541",
  blue: "#3D7BD9",
  green: "#3FA06A",
  ink: "#10151A",
};
const SUITS = {
  s: { sym: "♠", color: "#2A313A" },
  h: { sym: "♥", color: "#D64541" },
  d: { sym: "♦", color: "#3D7BD9" },
  c: { sym: "♣", color: "#3FA06A" },
};
const RANKS = "23456789TJQKA";

/* ================== RANGE ENGINE ================== */
// expands tokens like "22+", "ATs+", "K9s", "A2o+", "Q4s+"
function expandRange(str) {
  const out = new Set();
  for (const tok of str.trim().split(/\s+/)) {
    const plus = tok.endsWith("+");
    const core = plus ? tok.slice(0, -1) : tok;
    if (core.length === 2 && core[0] === core[1]) {
      // pair
      const start = RANKS.indexOf(core[0]);
      const end = plus ? RANKS.length - 1 : start;
      for (let i = start; i <= end; i++) out.add(RANKS[i] + RANKS[i]);
    } else {
      const hi = core[0], lo = core[1], suit = core[2]; // 's' or 'o'
      const hiIdx = RANKS.indexOf(hi);
      const loIdx = RANKS.indexOf(lo);
      const end = plus ? hiIdx - 1 : loIdx;
      for (let j = loIdx; j <= end; j++) out.add(hi + RANKS[j] + suit);
    }
  }
  return out;
}

const RFI = {
  UTG: { pct: 17, range: expandRange("22+ ATs+ A5s KTs+ QTs+ JTs T9s 98s AJo+ KQo") },
  HJ:  { pct: 21, range: expandRange("22+ A9s+ A5s A4s K9s+ Q9s+ J9s+ T9s 98s 87s ATo+ KJo+ QJo") },
  CO:  { pct: 28, range: expandRange("22+ A2s+ K8s+ Q8s+ J8s+ T8s+ 97s+ 87s 76s 65s A9o+ KTo+ QTo+ JTo") },
  BTN: { pct: 44, range: expandRange("22+ A2s+ K2s+ Q4s+ J6s+ T6s+ 96s+ 85s+ 75s+ 64s+ 54s A2o+ K8o+ Q9o+ J9o+ T9o") },
  SB:  { pct: 42, range: expandRange("22+ A2s+ K2s+ Q2s+ J4s+ T6s+ 96s+ 86s+ 75s+ 65s 54s A2o+ K5o+ Q8o+ J8o+ T8o+ 98o") },
};
const POS_LABEL = { UTG: "UTG (lojack)", HJ: "Hijack", CO: "Cutoff", BTN: "Button", SB: "Small Blind" };

function randCard(used) {
  while (true) {
    const c = RANKS[Math.floor(Math.random() * 13)] + "shdc"[Math.floor(Math.random() * 4)];
    if (!used.has(c)) { used.add(c); return c; }
  }
}
function classOf(c1, c2) {
  let r1 = RANKS.indexOf(c1[0]), r2 = RANKS.indexOf(c2[0]);
  if (r1 === r2) return c1[0] + c2[0];
  if (r1 < r2) [c1, c2] = [c2, c1];
  return c1[0] + c2[0] + (c1[1] === c2[1] ? "s" : "o");
}
function handFeatures(cls) {
  const suited = cls.endsWith("s");
  const pair = cls.length === 2;
  const hi = RANKS.indexOf(cls[0]);
  const gap = pair ? 0 : RANKS.indexOf(cls[0]) - RANKS.indexOf(cls[1]);
  return { suited, pair, hi, gap };
}

function genRFISpot() {
  const positions = Object.keys(RFI);
  const pos = positions[Math.floor(Math.random() * positions.length)];
  const used = new Set();
  const c1 = randCard(used), c2 = randCard(used);
  const cls = classOf(c1, c2);
  const inRange = RFI[pos].range.has(cls);
  const f = handFeatures(cls);

  let why;
  if (inRange) {
    if (f.pair) why = `Pairs always have raw equity and set value. ${cls} opens from every position it appears in a chart for, including here.`;
    else if (f.suited && f.hi >= RANKS.indexOf("T")) why = `${cls} has high-card strength plus suited playability (flushes, blocker value). Comfortably inside the ~${RFI[pos].pct}% ${POS_LABEL[pos]} opening range.`;
    else if (f.suited) why = `${cls} makes the range mostly for board coverage: it flops draws and disguised hands. Suited connectivity is what gets it into the ~${RFI[pos].pct}% ${POS_LABEL[pos]} range.`;
    else why = `${cls} opens here on raw high-card strength. Offsuit hands like this drop out of earlier-position ranges fast, but the ~${RFI[pos].pct}% range from ${POS_LABEL[pos]} keeps it.`;
  } else {
    if (f.suited) why = `Suited helps, but ${cls} is still outside the ~${RFI[pos].pct}% ${POS_LABEL[pos]} range. It either lacks high-card value, connectivity, or both. From a later position it might open.`;
    else why = `${cls} is a fold here. Offsuit, weak high card, poor connectivity. Solvers fold this at 100% from ${POS_LABEL[pos]}; opening it just lights money on fire postflop out of position.`;
  }

  return {
    kind: "preflop",
    title: "Open or fold?",
    sub: `6-max cash · 100bb effective · folds to you`,
    heroPos: pos,
    heroCards: [c1, c2],
    board: [],
    pot: 1.5,
    history: [`Action folds to you in the ${POS_LABEL[pos]}.`],
    options: [
      { label: "Raise 2.3bb", freq: inRange ? 100 : 0 },
      { label: "Limp", freq: 0 },
      { label: "Fold", freq: inRange ? 0 : 100 },
    ],
    explain: why + ` (Note: borderline combos mix in real solver output; this trainer rounds them to the dominant action.)`,
  };
}

/* ================== CURATED PREFLOP SPOTS ==================
 * Hand-written preflop spots, kept as-is. The curated *postflop* spots that
 * used to live here have moved to real solver output (see solverSpots.js /
 * genSolverSpots), so only these preflop ones remain hardcoded. */
const CURATED_PREFLOP = [
  {
    kind: "preflop", title: "The squeeze", sub: "BB vs BTN open + SB call · 100bb",
    heroPos: "BB", heroCards: ["Ks", "Qs"], board: [], pot: 6.5,
    history: ["BTN opens 2.5bb.", "SB calls 2.5bb. Action on you in the BB."],
    options: [
      { label: "Fold", freq: 0 },
      { label: "Call", freq: 45 },
      { label: "Squeeze to 11bb", freq: 55 },
    ],
    explain: "With a raise and a call in front, there's dead money in the pot and the SB caller's range is capped (they'd usually 3-bet their best hands). KQs is strong enough to value-squeeze and plays fine when called. Flatting is also fine but invites a multiway pot out of position. Squeezing slightly more often is the solver lean.",
  },
  {
    kind: "preflop", title: "Facing the 3-bet in position", sub: "BTN vs SB 3-bet · 100bb",
    heroPos: "BTN", heroCards: ["Td", "9d"], board: [], pot: 13,
    history: ["You open 2.5bb on the BTN.", "SB 3-bets to 10bb. BB folds. Action on you."],
    options: [
      { label: "Fold", freq: 25 },
      { label: "Call", freq: 65 },
      { label: "4-bet to 22bb", freq: 10 },
    ],
    explain: "Suited connectors are premium 3-bet defends in position: you close the action, you're getting a decent price, and T9s flops draws and disguised monsters that crack overpairs. Folding all your suited connectors to 3-bets makes you trivially exploitable. The small 4-bet mix exists but is the least-used line.",
  },
  {
    kind: "preflop", title: "The 4-bet bluff", sub: "CO vs BTN 3-bet · 100bb",
    heroPos: "CO", heroCards: ["As", "5s"], board: [], pot: 11.5,
    history: ["You open 2.5bb in the CO.", "BTN 3-bets to 8bb. Blinds fold. Action on you."],
    options: [
      { label: "Fold", freq: 30 },
      { label: "Call", freq: 35 },
      { label: "4-bet to 20bb", freq: 35 },
    ],
    explain: "A5s is the textbook 4-bet bluff: the ace blocks AA and AK (villain is less likely to have a hand that continues), and when called you still have wheel straight and nut flush potential. Solvers split this combo three ways almost evenly. The hands that pure-fold here are the dominated offsuit broadways, not the suited wheel aces.",
  },
];

/* ================== GENERATED MATH DRILLS ================== */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// Fisher-Yates: an unbiased shuffle. (A .sort() with a random comparator is
// NOT uniform -- it favors leaving elements near their original position,
// which skewed both curated-spot selection and lesson question order.)
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function genPotOddsDrill() {
  const pot = pick([6, 8, 10, 12, 16, 20]);
  const sizes = [["33% pot", 0.33], ["half pot", 0.5], ["75% pot", 0.75], ["a full pot-size bet", 1], ["a 150% pot overbet", 1.5]];
  const [betLabel, mult] = pick(sizes);
  const bet = Math.round(pot * mult * 10) / 10;
  const req = Math.round((bet / (pot + 2 * bet)) * 100);
  const trap = Math.round((bet / (pot + bet)) * 100); // common error: forgets your own call grows the pot
  const distractors = [...new Set([trap, req + 9, Math.max(4, req - 9)])].filter((d) => Math.abs(d - req) >= 3).slice(0, 2);
  const options = shuffle([
    { label: `${req}%`, freq: 100 },
    ...distractors.map((d) => ({ label: `${d}%`, freq: 0 })),
  ]);
  return {
    kind: "math", quiz: true, title: "Pot odds drill", sub: "Pure math · no reads needed",
    heroPos: "—", heroCards: [], board: [],
    stat: { pot, bet, betLabel },
    pot,
    history: [`The pot is ${pot}bb on the river.`, `Villain bets ${bet}bb (${betLabel}).`, `What is the minimum equity you need to profitably call?`],
    options,
    explain: `You call ${bet}bb to win the pot (${pot}bb) plus villain's bet (${bet}bb) plus your own call (${bet}bb). Required equity = bet ÷ (pot + 2 × bet) = ${bet} ÷ ${Math.round((pot + 2 * bet) * 10) / 10} ≈ ${req}%. The classic mistake is ${trap}% (bet ÷ (pot + bet)), which forgets your call also goes into the final pot.`,
  };
}

function genMDFDrill() {
  const pot = pick([8, 10, 12, 16, 20]);
  const sizes = [["33% pot", 0.33], ["half pot", 0.5], ["75% pot", 0.75], ["a full pot-size bet", 1]];
  const [betLabel, mult] = pick(sizes);
  const bet = Math.round(pot * mult * 10) / 10;
  const mdf = Math.round((pot / (pot + bet)) * 100);
  const alpha = 100 - mdf;
  const req = Math.round((bet / (pot + 2 * bet)) * 100);
  const distractors = [...new Set([alpha, req])].filter((d) => Math.abs(d - mdf) >= 3).slice(0, 2);
  while (distractors.length < 2) distractors.push(Math.max(5, mdf - 15));
  const options = shuffle([
    { label: `${mdf}%`, freq: 100 },
    ...distractors.map((d) => ({ label: `${d}%`, freq: 0 })),
  ]);
  return {
    kind: "math", quiz: true, title: "MDF drill", sub: "Minimum defense frequency",
    heroPos: "—", heroCards: [], board: [],
    stat: { pot, bet, betLabel },
    pot,
    history: [`The pot is ${pot}bb.`, `Villain bets ${bet}bb (${betLabel}).`, `What fraction of your range must continue so villain can't profit by bluffing any two cards?`],
    options,
    explain: `MDF = pot ÷ (pot + bet) = ${pot} ÷ ${Math.round((pot + bet) * 10) / 10} ≈ ${mdf}%. If you fold more than ${alpha}% of the time, villain's bluffs print money automatically. MDF is a defensive baseline, not a strict rule: vs real players who under-bluff, you can fold more.`,
  };
}

const DRAW_TEMPLATES = [
  { name: "nut flush draw", outs: 9, build: () => { const s = pick(["h", "s", "d", "c"]); const o = pick("hsdc".replace(s, "").split("")); return { hero: [`A${s}`, `6${s}`], board: [`K${s}`, `9${s}`, `4${o}`] }; } },
  { name: "open-ended straight draw", outs: 8, build: () => ({ hero: ["9h", "8d"], board: ["7s", "6c", "2h"] }) },
  { name: "gutshot", outs: 4, build: () => ({ hero: ["5h", "4d"], board: ["8s", "7c", "Kh"] }) },
  { name: "flush draw + open-ender (combo draw)", outs: 15, build: () => { const s = pick(["h", "s"]); const o = s === "h" ? "s" : "h"; return { hero: [`9${s}`, `8${s}`], board: [`7${s}`, `6${s}`, `2${o}`] }; } },
];

function genDrawDrill() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const t = pick(DRAW_TEMPLATES);
    const pot = pick([6, 8, 10, 12]);
    const mult = pick([0.5, 0.75, 1, 1.5, 2]);
    const bet = Math.round(pot * mult * 10) / 10;
    const equity = 1 - (1 - t.outs / 47) * (1 - t.outs / 46); // two cards to come
    const price = bet / (pot + 2 * bet);
    if (Math.abs(equity - price) < 0.05) continue; // skip razor-thin spots
    const callGood = equity > price;
    const { hero, board } = t.build();
    const eqPct = Math.round(equity * 100);
    const prPct = Math.round(price * 100);
    return {
      kind: "drill", quiz: true, title: "Equity vs price", sub: "Flop · villain is all in · no more betting",
      heroPos: "BB", heroCards: hero, board, pot,
      history: [`You have a ${t.name} (${t.outs} outs, two cards to come).`, `Villain shoves ${bet}bb into the ${pot}bb pot.`, `No future streets to worry about. Call or fold?`],
      options: shuffle([
        { label: "Call", freq: callGood ? 100 : 0 },
        { label: "Fold", freq: callGood ? 0 : 100 },
      ]),
      explain: `${t.outs} outs with two cards to come ≈ ${eqPct}% equity (rule of 4 says ~${Math.min(t.outs * 4, 60)}%, the exact number is ${eqPct}%). You need ${bet} ÷ (${pot} + 2×${bet}) ≈ ${prPct}% to call. ${eqPct}% ${callGood ? ">" : "<"} ${prPct}%, so ${callGood ? "calling is clearly profitable. Equity is real money when stacks are in." : "this is a clear fold. Draws are only as good as the price you're getting."}`,
    };
  }
  return genPotOddsDrill();
}


function Card({ c, big }) {
  if (!c) return null;
  const s = SUITS[c[1]];
  const w = big ? 64 : 46, h = big ? 90 : 64;
  return (
    <div style={{
      width: w, height: h, background: T.cream, borderRadius: 8,
      border: "1px solid rgba(0,0,0,0.25)", boxShadow: "0 3px 8px rgba(0,0,0,0.45)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      color: s.color, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
      flexShrink: 0,
    }}>
      <div style={{ fontSize: big ? 30 : 20, fontWeight: 800, lineHeight: 1 }}>{c[0] === "T" ? "10" : c[0]}</div>
      <div style={{ fontSize: big ? 26 : 18, lineHeight: 1.1 }}>{s.sym}</div>
    </div>
  );
}

function Heart({ on }) {
  return <span style={{ fontSize: 18, opacity: on ? 1 : 0.22, filter: on ? "none" : "grayscale(1)" }}>❤️</span>;
}

function FreqBar({ label, freq, chosen }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3, color: chosen ? T.brass : T.creamDim, fontWeight: chosen ? 700 : 400 }}>
        <span>{label}{chosen ? "  ← you" : ""}</span><span>{freq}%</span>
      </div>
      <div style={{ height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 5, overflow: "hidden" }}>
        <div style={{ width: `${freq}%`, height: "100%", borderRadius: 5, background: chosen ? T.brass : "rgba(246,241,227,0.45)", transition: "width 600ms ease" }} />
      </div>
    </div>
  );
}

/* ================== TABLE PANEL ================== */
function TablePanel({ spot }) {
  if (spot.stat) {
    return (
      <div style={{
        background: `radial-gradient(ellipse at 50% 30%, ${T.feltLine}22, transparent 70%), ${T.feltDeep}`,
        border: `1px solid ${T.feltLine}`, borderRadius: 18, padding: "22px 16px",
      }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 28, marginBottom: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.creamDim }}>Pot</div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 38, fontWeight: 800, color: T.cream }}>{spot.stat.pot}<span style={{ fontSize: 16, color: T.creamDim }}>bb</span></div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.creamDim }}>Villain bets</div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 38, fontWeight: 800, color: T.brass }}>{spot.stat.bet}<span style={{ fontSize: 16, color: T.brassDeep }}>bb</span></div>
          </div>
        </div>
        <div style={{ borderTop: `1px dashed ${T.feltLine}`, paddingTop: 10 }}>
          {spot.history.map((h, i) => (
            <div key={i} style={{ fontSize: 13.5, color: T.creamDim, lineHeight: 1.5 }}>· {h}</div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{
      background: `radial-gradient(ellipse at 50% 30%, ${T.feltLine}22, transparent 70%), ${T.feltDeep}`,
      border: `1px solid ${T.feltLine}`, borderRadius: 18, padding: "18px 16px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: T.creamDim }}>
          You: <b style={{ color: T.brass }}>{spot.heroPos}</b>
        </span>
        <span style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: T.creamDim }}>
          Pot: <b style={{ color: T.cream }}>{spot.pot}{spot.solver ? " chips" : "bb"}</b>
        </span>
      </div>

      {spot.board.length > 0 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
          {spot.board.map((c) => <Card key={c} c={c} />)}
        </div>
      )}
      {spot.board.length === 0 && (
        <div style={{ textAlign: "center", color: T.creamDim, fontSize: 13, fontStyle: "italic", margin: "10px 0 16px" }}>preflop</div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center" }}>
        {spot.heroCards.map((c) => <Card key={c} c={c} big />)}
      </div>

      <div style={{ marginTop: 14, borderTop: `1px dashed ${T.feltLine}`, paddingTop: 10 }}>
        {spot.history.map((h, i) => (
          <div key={i} style={{ fontSize: 13.5, color: T.creamDim, lineHeight: 1.5 }}>· {h}</div>
        ))}
      </div>
    </div>
  );
}

/* ================== RANGE CHART TAB ================== */
function RangeChart() {
  const [pos, setPos] = useState("BTN");
  const range = RFI[pos].range;
  const grid = [];
  for (let r = 0; r < 13; r++) {
    const row = [];
    for (let c = 0; c < 13; c++) {
      const rA = 12 - r, rB = 12 - c;
      let cls, kind;
      if (r === c) { cls = RANKS[rA] + RANKS[rA]; kind = "pair"; }
      else if (c > r) { cls = RANKS[rA] + RANKS[rB] + "s"; kind = "s"; }
      else { cls = RANKS[rB] + RANKS[rA] + "o"; kind = "o"; }
      row.push({ cls, on: range.has(cls), kind });
    }
    grid.push(row);
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {Object.keys(RFI).map((p) => (
          <button key={p} onClick={() => setPos(p)} style={{
            padding: "8px 14px", borderRadius: 999, cursor: "pointer",
            border: `1px solid ${p === pos ? T.brass : T.feltLine}`,
            background: p === pos ? T.brass : "transparent",
            color: p === pos ? T.ink : T.creamDim, fontWeight: 700, fontSize: 13,
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          }}>{p}</button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: T.creamDim, marginBottom: 12 }}>
        Raise-first-in range from the <b style={{ color: T.cream }}>{POS_LABEL[pos]}</b> · opens ~{RFI[pos].pct}% of hands. Gold = raise, dark = fold. Upper right is suited, lower left offsuit.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: 2, maxWidth: 560 }}>
        {grid.flat().map((cell, idx) => (
          <div key={idx} title={cell.cls} style={{
            aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "clamp(6px, 1.6vw, 10.5px)", borderRadius: 3, fontWeight: 700,
            fontFamily: "'Space Grotesk', monospace",
            background: cell.on ? (cell.kind === "pair" ? T.brassDeep : T.brass) : "rgba(255,255,255,0.05)",
            color: cell.on ? T.ink : "rgba(246,241,227,0.35)",
          }}>{cell.cls}</div>
        ))}
      </div>
    </div>
  );
}

/* ================== LESSON LOGIC ================== */
function buildLesson() {
  // The 3 "curated" slots now draw from a pool of real solver-derived river
  // spots plus the hand-written curated preflop spots, matching the old
  // behavior where each slot could be either. genSolverSpots samples a fresh
  // decision point + combo per spot, so they vary lesson to lesson.
  const curatedPool = [...genSolverSpots(6), ...CURATED_PREFLOP];
  const curated = shuffle(curatedPool).slice(0, 3);
  const gen = Array.from({ length: 3 }, genRFISpot);
  const drills = [pick([genPotOddsDrill, genMDFDrill])(), genDrawDrill()];
  return shuffle([...curated, ...gen, ...drills]);
}
function grade(freq) {
  if (freq >= 50) return { tier: "best", xp: 10, label: "Solver approved", color: T.green };
  if (freq >= 20) return { tier: "mix", xp: 5, label: "Mixed strategy. Acceptable.", color: T.brass };
  return { tier: "wrong", xp: 0, label: "Solver disagrees", color: T.red };
}

/* ================== APP ================== */
export default function App() {
  const [tab, setTab] = useState("train");
  const [phase, setPhase] = useState("home"); // home | question | done | failed
  const [lesson, setLesson] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [hearts, setHearts] = useState(3);
  const [xp, setXp] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [results, setResults] = useState([]);

  const spot = lesson[qIdx];

  const start = () => {
    setLesson(buildLesson()); setQIdx(0); setPicked(null);
    setHearts(3); setSessionXp(0); setResults([]); setPhase("question");
  };
  const choose = (i) => {
    if (picked !== null) return;
    const g = grade(spot.options[i].freq);
    setPicked(i);
    setSessionXp((x) => x + g.xp);
    setXp((x) => x + g.xp);
    setResults((r) => [...r, { spot, choice: i, tier: g.tier }]);
    if (g.tier === "wrong") setHearts((h) => h - 1);
  };
  const next = () => {
    if (hearts <= 0) { setPhase("failed"); return; }
    if (qIdx + 1 >= lesson.length) { setStreak((s) => s + 1); setPhase("done"); return; }
    setQIdx((i) => i + 1); setPicked(null);
  };

  const g = picked !== null && spot ? grade(spot.options[picked].freq) : null;

  return (
    <div style={{ minHeight: "100vh", background: T.felt, color: T.cream, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Space+Grotesk:wght@400;500;700&display=swap');
        button { transition: transform 80ms ease, filter 120ms ease; }
        button:active { transform: scale(0.97); }
        button:hover { filter: brightness(1.08); }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      {/* Header */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em" }}>
          FELT<span style={{ color: T.brass }}>.</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: T.creamDim, marginLeft: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>daily GTO reps</span>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 14 }}>
          <span title="streak">🔥 {streak}</span>
          <span title="total XP" style={{ color: T.brass, fontWeight: 700 }}>{xp} XP</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px", display: "flex", gap: 8, marginBottom: 14 }}>
        {[["train", "Train"], ["ranges", "Ranges"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            border: `1px solid ${tab === k ? T.brass : T.feltLine}`,
            background: tab === k ? "rgba(216,169,61,0.14)" : "transparent",
            color: tab === k ? T.brass : T.creamDim,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px 60px" }}>
        {tab === "ranges" && <RangeChart />}

        {tab === "train" && phase === "home" && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: "clamp(34px, 7vw, 54px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
              Eight hands.<br />Play them like a <span style={{ color: T.brass }}>solver</span>.
            </div>
            <p style={{ color: T.creamDim, fontSize: 15, maxWidth: 440, margin: "18px auto 30px", lineHeight: 1.6 }}>
              Daily reps of real poker decisions: GTO preflop spots, solver-derived postflop spots, and randomized pot odds, MDF, and equity drills that never repeat. Three hearts. Don't punt them.
            </p>
            <button onClick={start} style={{
              background: T.brass, color: T.ink, border: "none", borderRadius: 14,
              padding: "16px 44px", fontSize: 17, fontWeight: 800, cursor: "pointer",
              fontFamily: "'Bricolage Grotesque', sans-serif",
              boxShadow: `0 5px 0 ${T.brassDeep}`,
            }}>Start today's lesson</button>
            <div style={{ marginTop: 26, fontSize: 12, color: T.creamDim, opacity: 0.8 }}>
              River spots use real CFR solver output (computed offline); preflop and drills use standard charts and exact math. Frequencies shown as whole percents.
            </div>
          </div>
        )}

        {tab === "train" && phase === "question" && spot && (
          <div>
            {/* Progress + hearts */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 12, background: "rgba(255,255,255,0.08)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ width: `${((qIdx + (picked !== null ? 1 : 0)) / lesson.length) * 100}%`, height: "100%", background: T.brass, borderRadius: 6, transition: "width 350ms ease" }} />
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                {[0, 1, 2].map((i) => <Heart key={i} on={i < hearts} />)}
              </div>
            </div>

            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 24, fontWeight: 800, marginBottom: 2 }}>{spot.title}</div>
            <div style={{ fontSize: 13, color: T.creamDim, marginBottom: 12 }}>{spot.sub}</div>

            <TablePanel spot={spot} />

            {picked === null ? (
              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                {spot.options.map((o, i) => (
                  <button key={i} onClick={() => choose(i)} style={{
                    padding: "15px 18px", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer",
                    fontFamily: "'Space Grotesk', sans-serif", textAlign: "left",
                    background: "rgba(246,241,227,0.06)", color: T.cream,
                    border: `1px solid ${T.feltLine}`,
                  }}>{o.label}</button>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  padding: "12px 16px", borderRadius: 12, marginBottom: 14, fontWeight: 800, fontSize: 16,
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  background: `${g.color}22`, border: `1px solid ${g.color}`, color: g.color,
                }}>
                  {spot.quiz ? (g.tier === "wrong" ? "Not quite" : "Correct") : g.label} {g.xp > 0 ? `· +${g.xp} XP` : "· −1 ❤️"}
                </div>
                {!spot.quiz && (
                  <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.creamDim, marginBottom: 10 }}>Solver frequencies</div>
                    {spot.options.map((o, i) => <FreqBar key={i} label={o.label} freq={o.freq} chosen={i === picked} />)}
                  </div>
                )}
                {spot.quiz && g.tier === "wrong" && (
                  <div style={{ fontSize: 14, color: T.creamDim, marginBottom: 12 }}>
                    Answer: <b style={{ color: T.cream }}>{spot.options.find((o) => o.freq === 100)?.label}</b>
                  </div>
                )}
                <p style={{ fontSize: 14.5, lineHeight: 1.65, color: T.cream, opacity: 0.92 }}>{spot.explain}</p>
                <button onClick={next} style={{
                  marginTop: 12, width: "100%", background: T.brass, color: T.ink, border: "none",
                  borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 800, cursor: "pointer",
                  fontFamily: "'Bricolage Grotesque', sans-serif", boxShadow: `0 4px 0 ${T.brassDeep}`,
                }}>
                  {hearts <= 0 ? "See results" : qIdx + 1 >= lesson.length ? "Finish lesson" : "Continue"}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "train" && (phase === "done" || phase === "failed") && (
          <div style={{ textAlign: "center", paddingTop: 30 }}>
            <div style={{ fontSize: 54 }}>{phase === "done" ? "🃏" : "💔"}</div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 34, fontWeight: 800, margin: "10px 0 4px" }}>
              {phase === "done" ? "Lesson complete" : "Out of hearts"}
            </div>
            <div style={{ color: T.creamDim, fontSize: 15, marginBottom: 20 }}>
              {phase === "done" ? `Streak ${streak} 🔥 · +${sessionXp} XP this session` : "The solver is patient. You can be too."}
            </div>
            <div style={{ textAlign: "left", maxWidth: 480, margin: "0 auto 26px", display: "grid", gap: 8 }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px", borderRadius: 10, fontSize: 14,
                  background: "rgba(255,255,255,0.05)", border: `1px solid ${T.feltLine}`,
                }}>
                  <span>{r.spot.title} · <span style={{ color: T.creamDim }}>{r.spot.heroCards.map(c => (c[0] === "T" ? "10" : c[0]) + SUITS[c[1]].sym).join(" ")}</span></span>
                  <span style={{ fontWeight: 800, color: r.tier === "best" ? T.green : r.tier === "mix" ? T.brass : T.red }}>
                    {r.tier === "best" ? "✓" : r.tier === "mix" ? "≈" : "✗"}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={start} style={{
              background: T.brass, color: T.ink, border: "none", borderRadius: 14,
              padding: "15px 40px", fontSize: 16, fontWeight: 800, cursor: "pointer",
              fontFamily: "'Bricolage Grotesque', sans-serif", boxShadow: `0 5px 0 ${T.brassDeep}`,
            }}>{phase === "done" ? "Next lesson" : "Run it back"}</button>
            <div style={{ marginTop: 18, fontSize: 12, color: T.creamDim, opacity: 0.7 }}>
              Progress is in-memory only for this demo. Refreshing resets streak and XP.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
