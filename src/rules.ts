import type { UpdateApi } from "@clockwyrks/simple-2d";
import type {
  CascadeState,
  ReadState,
  CardState,
  PileKind,
  Suit,
  Screen,
  FlyerState,
  DropTargetState,
} from "./game";
import * as C from "./constants";
import { clearPaint, stamp } from "./drawing";
type CueSet = Set<C.CueName>;
const cue = (q: CueSet | undefined, name: C.CueName) => q?.add(name);
export const color = (c: { suit: Suit }) =>
  c.suit === "hearts" || c.suit === "diamonds" ? "red" : "black";
export function initial(muted = false): CascadeState {
  return {
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    stock: [],
    waste: [],
    wasteSets: [],
    foundations: Array.from({ length: C.FOUNDATION_COUNT }, () => []),
    tableau: Array.from({ length: C.TABLEAU_COLUMNS }, () => []),
    drag: null,
    dropTarget: null,
    pointer: { x: 0, y: 0, down: false },
    lastPress: null,
    autoFlip: true,
    winDetect: true,
    launching: true,
    trailPainting: true,
    launchClock: 0,
    launched: 0,
    flyers: [],
    cascadeDone: false,
    trailStamps: 0,
    nextId: 1,
    simTime: 0,
    muted,
  };
}
function integer(n: number, min: number, max: number) {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new RangeError(`Invalid integer: ${n}`);
}
export function pile(
  s: ReadState,
  p: PileKind,
  i: number,
): readonly CardState[] {
  if (!["stock", "waste", "foundation", "tableau"].includes(p))
    throw new Error("Invalid pile");
  integer(
    i,
    0,
    p === "foundation"
      ? C.FOUNDATION_COUNT - 1
      : p === "tableau"
        ? C.TABLEAU_COLUMNS - 1
        : 0,
  );
  return p === "foundation"
    ? s.foundations[i]
    : p === "tableau"
      ? s.tableau[i]
      : s[p];
}
function put(
  s: ReadState,
  p: PileKind,
  i: number,
  c: readonly CardState[],
): CascadeState {
  pile(s, p, i);
  if (p === "foundation" || p === "tableau") {
    const key = p === "foundation" ? "foundations" : "tableau";
    return { ...s, [key]: s[key].map((a, j) => (j === i ? c : a)) };
  }
  return { ...s, [p]: c };
}
export function positions(cards: readonly CardState[]): number[] {
  const before = cards.slice(0, -1),
    downs = before.filter((c) => !c.faceUp).length,
    ups = before.length - downs;
  const offset = ups
    ? Math.max(
        C.FACE_UP_OFFSET_MIN,
        Math.min(
          C.FACE_UP_OFFSET,
          (C.COLUMN_BOTTOM_LIMIT -
            C.TABLEAU_Y -
            C.CARD_H -
            downs * C.FACE_DOWN_OFFSET) /
            ups,
        ),
      )
    : C.FACE_UP_OFFSET;
  let y = C.TABLEAU_Y;
  return cards.map((c) => {
    const at = y;
    y += c.faceUp ? offset : C.FACE_DOWN_OFFSET;
    return at;
  });
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export function menuRect(s: ReadState, i: number): Rect | null {
  if (!Number.isInteger(i) || i < 0) return null;
  if (s.screen === "title" && i < C.TITLE_ITEMS.length)
    return { x: 480, y: 410 + i * 66, w: 320, h: 52 };
  if (s.screen === "howto" && i === 0) return { x: 480, y: 584, w: 320, h: 52 };
  if (s.screen === "playing" && i < C.HUD_ITEMS.length)
    return { x: 224 + i * 150, y: C.HUD_Y, w: 138, h: C.HUD_H };
  return null;
}
export function accepts(
  s: ReadState,
  c: readonly CardState[],
  p: PileKind,
  i: number,
  from: PileKind,
): boolean {
  const a = pile(s, p, i),
    lead = c[0],
    top = last(a);
  if (
    !lead ||
    c.some((k) => !k.faceUp) ||
    c.some(
      (k, j) =>
        j > 0 && (k.rank !== c[j - 1].rank - 1 || color(k) === color(c[j - 1])),
    )
  )
    return false;
  if (p === "foundation")
    return (
      from !== "foundation" &&
      c.length === 1 &&
      (top
        ? top.rank < C.RANK_MAX &&
          top.suit === lead.suit &&
          lead.rank === top.rank + 1
        : lead.rank === C.RANK_MIN)
    );
  if (p === "tableau")
    return top
      ? top.faceUp && lead.rank === top.rank - 1 && color(top) !== color(lead)
      : lead.rank === C.RANK_MAX;
  return false;
}
function shrink(s: ReadState): CascadeState {
  const sets = [...s.wasteSets];
  while (sets.length && last(sets) === 0) sets.pop();
  if (sets.length) {
    sets[sets.length - 1]--;
    if (last(sets) === 0) sets.pop();
  }
  return { ...s, wasteSets: sets };
}
function finish(
  s: ReadState,
  from: PileKind,
  i: number,
  q?: CueSet,
): CascadeState {
  let next: CascadeState = { ...s };
  if (from === "tableau" && s.autoFlip) {
    const a = s.tableau[i],
      t = last(a);
    if (t && !t.faceUp) {
      next = put(next, "tableau", i, [
        ...a.slice(0, -1),
        { ...t, faceUp: true },
      ]);
      cue(q, C.CUES.flip);
    }
  }
  if (
    next.winDetect &&
    next.foundations.every(
      (a) =>
        a.length === C.RANK_MAX &&
        a.every(
          (c, j) =>
            c.faceUp && c.rank === j + C.RANK_MIN && c.suit === a[0].suit,
        ),
    ) &&
    next.foundations.flat().length === C.DECK_SIZE &&
    new Set(next.foundations.map((a) => a[0].suit)).size === C.FOUNDATION_COUNT
  ) {
    next = {
      ...next,
      screen: "won",
      drag: null,
      dropTarget: null,
      launchClock: C.LAUNCH_INTERVAL,
      cascadeDone: false,
    };
    cue(q, C.CUES.win);
  }
  return next;
}
export function move(
  s: ReadState,
  fp: PileKind,
  fi: number,
  row: number,
  tp: PileKind,
  ti: number,
  q?: CueSet,
): [CascadeState, boolean] {
  const a = pile(s, fp, fi);
  pile(s, tp, ti);
  integer(row, 0, a.length - 1);
  const run = a.slice(row);
  if (
    !run.length ||
    fp === "stock" ||
    (fp === "waste" && (!s.wasteSets.length || row !== a.length - 1)) ||
    (fp === "foundation" && row !== a.length - 1) ||
    (fp === tp && fi === ti) ||
    !accepts(s, run, tp, ti, fp)
  )
    return [{ ...s }, false];
  let n = put(s, fp, fi, a.slice(0, row));
  n = put(n, tp, ti, [...pile(n, tp, ti), ...run]);
  if (fp === "waste") n = shrink(n);
  cue(q, C.CUES.drop);
  if (tp === "foundation") cue(q, C.CUES.home);
  return [finish(n, fp, fi, q), true];
}
export function autoMove(
  s: ReadState,
  p: PileKind,
  i: number,
  q?: CueSet,
): [CascadeState, boolean] {
  const a = pile(s, p, i);
  if ((p !== "waste" && p !== "tableau") || !a.length || !last(a)?.faceUp)
    return [{ ...s }, false];
  for (let j = 0; j < C.FOUNDATION_COUNT; j++)
    if (accepts(s, a.slice(-1), "foundation", j, p)) {
      const events: CueSet = new Set();
      const result = move(s, p, i, a.length - 1, "foundation", j, events);
      // Sending a card home is not a released drop.
      for (const event of events) if (event !== C.CUES.drop) cue(q, event);
      return result;
    }
  return [{ ...s }, false];
}
export function deal(s: ReadState, q?: CueSet): CascadeState {
  clearPaint();
  let id = s.nextId;
  const deck = C.SUITS.flatMap((suit) =>
    Array.from({ length: C.RANK_MAX }, (_, j) => ({
      id: id++,
      suit,
      rank: j + C.RANK_MIN,
      faceUp: false,
    })),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  let at = 0;
  const tableau = Array.from({ length: C.TABLEAU_COLUMNS }, (_, i) =>
    deck.slice(at, (at += i + 1)).map((c, j) => ({ ...c, faceUp: j === i })),
  );
  cue(q, C.CUES.deal);
  return {
    ...s,
    stock: deck.slice(
      C.DEAL_TABLEAU_CARDS,
      C.DEAL_TABLEAU_CARDS + C.DEAL_STOCK_CARDS,
    ),
    waste: [],
    wasteSets: [],
    foundations: Array.from({ length: C.FOUNDATION_COUNT }, () => []),
    tableau,
    launched: 0,
    trailStamps: 0,
    nextId: id,
  };
}
export function turn(s: ReadState, q?: CueSet): CascadeState {
  if (s.stock.length) {
    const n = Math.min(C.TURN_COUNT, s.stock.length);
    cue(q, C.CUES.turn);
    return {
      ...s,
      stock: s.stock.slice(0, -n),
      waste: [
        ...s.waste,
        ...s.stock
          .slice(-n)
          .reverse()
          .map((c) => ({ ...c, faceUp: true })),
      ],
      wasteSets: [...s.wasteSets, n],
    };
  }
  if (s.waste.length) {
    cue(q, C.CUES.recycle);
    return {
      ...s,
      stock: [...s.waste].reverse().map((c) => ({ ...c, faceUp: false })),
      waste: [],
      wasteSets: [],
    };
  }
  return { ...s };
}
function activate(
  s: ReadState,
  i: number,
  q?: CueSet,
  audio?: UpdateApi["audio"],
): CascadeState {
  if (s.screen === "title")
    return i === 0
      ? { ...deal(s, q), screen: "playing", menuIndex: 0, titleIndex: i }
      : { ...s, screen: "howto", menuIndex: 0, titleIndex: i };
  if (s.screen === "howto" || i === 1)
    return { ...s, screen: "title", menuIndex: s.titleIndex };
  if (i === 0) return { ...deal(s, q), menuIndex: 0 };
  audio?.setMuted(!audio.muted());
  return { ...s, muted: audio ? audio.muted() : !s.muted };
}
function hover(s: ReadState, x: number, y: number): CascadeState {
  for (let i = 0; i < C.HUD_ITEMS.length; i++) {
    const r = menuRect(s, i);
    if (r && contains(r, x, y)) return { ...s, menuIndex: i };
  }
  return { ...s };
}
function hit(
  s: ReadState,
  x: number,
  y: number,
): {
  p: "waste" | "foundation" | "tableau";
  i: number;
  row: number;
  x: number;
  y: number;
} | null {
  for (let i = C.TABLEAU_COLUMNS - 1; i >= 0; i--) {
    const a = s.tableau[i],
      ys = positions(a);
    for (let j = a.length - 1; j >= 0; j--)
      if (
        contains({ x: C.COLUMN_X[i], y: ys[j], w: C.CARD_W, h: C.CARD_H }, x, y)
      )
        return { p: "tableau", i, row: j, x: C.COLUMN_X[i], y: ys[j] };
  }
  for (let i = 0; i < C.FOUNDATION_COUNT; i++)
    if (
      s.foundations[i].length &&
      contains(
        { x: C.FOUNDATION_X[i], y: C.TOP_ROW_Y, w: C.CARD_W, h: C.CARD_H },
        x,
        y,
      )
    )
      return {
        p: "foundation",
        i,
        row: s.foundations[i].length - 1,
        x: C.FOUNDATION_X[i],
        y: C.TOP_ROW_Y,
      };
  const count = last(s.wasteSets) ?? 0;
  if (count && s.waste.length) {
    const wx = C.WASTE_X + (count - 1) * C.WASTE_FAN;
    if (contains({ x: wx, y: C.TOP_ROW_Y, w: C.CARD_W, h: C.CARD_H }, x, y))
      return {
        p: "waste",
        i: 0,
        row: s.waste.length - 1,
        x: wx,
        y: C.TOP_ROW_Y,
      };
  }
  return null;
}
export function target(s: ReadState): DropTargetState | null {
  const d = s.drag;
  if (!d) return null;
  const x = d.x + C.CARD_W / 2,
    y = d.y + C.CARD_H / 2;
  for (const p of ["foundation", "tableau"] as const)
    for (
      let i = 0;
      i < (p === "foundation" ? C.FOUNDATION_COUNT : C.TABLEAU_COLUMNS);
      i++
    ) {
      const a = pile(s, p, i),
        ys = positions(a),
        r = {
          x: p === "foundation" ? C.FOUNDATION_X[i] : C.COLUMN_X[i],
          y: p === "foundation" ? C.TOP_ROW_Y : C.TABLEAU_Y,
          w: C.CARD_W,
          h:
            p === "foundation"
              ? C.CARD_H
              : (last(ys) ?? C.TABLEAU_Y) + C.CARD_H - C.TABLEAU_Y,
        };
      if (
        contains(r, x, y) &&
        !(d.fromPile === p && d.fromIndex === i) &&
        accepts(s, d.cards, p, i, d.fromPile)
      )
        return { pile: p, index: i };
    }
  return null;
}
function restore(s: ReadState): CascadeState {
  const d = s.drag;
  return d
    ? {
        ...put(s, d.fromPile, d.fromIndex, [
          ...pile(s, d.fromPile, d.fromIndex),
          ...d.cards,
        ]),
        drag: null,
        dropTarget: null,
      }
    : { ...s };
}
export function pointer(
  s: ReadState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  q?: CueSet,
  audio?: UpdateApi["audio"],
): CascadeState {
  let n = hover(s, x, y);
  if (type === "move" || type === "up") {
    if (n.drag)
      n = {
        ...n,
        drag: {
          ...n.drag,
          x: n.drag.x + x - n.pointer.x,
          y: n.drag.y + y - n.pointer.y,
        },
      };
    n = { ...n, pointer: { x, y, down: n.pointer.down } };
    n = { ...n, dropTarget: target(n) };
  }
  if (type === "move") return n;
  if (type === "down") {
    const prev = s.lastPress;
    n = {
      ...n,
      lastPress: { x, y, at: s.simTime },
      pointer: { x, y, down: true },
    };
    if (s.screen === "won")
      return {
        ...deal(n, q),
        screen: "playing",
        menuIndex: 0,
        drag: null,
        dropTarget: null,
        flyers: [],
        cascadeDone: false,
        launchClock: 0,
        pointer: { x, y, down: false },
      };
    if (s.screen !== "playing") return n;
    const h = hit(n, x, y);
    if (!h) return n;
    const a = pile(n, h.p, h.i);
    if (!a[h.row].faceUp) return n;
    if (
      prev &&
      s.simTime - prev.at <= C.DOUBLE_CLICK_WINDOW &&
      Math.hypot(x - prev.x, y - prev.y) <= C.DOUBLE_CLICK_SLOP &&
      h.p !== "foundation" &&
      h.row === a.length - 1
    ) {
      n = autoMove(n, h.p, h.i, q)[0];
      return { ...n, pointer: { x, y, down: false } };
    }
    n = put(n, h.p, h.i, a.slice(0, h.row));
    cue(q, C.CUES.lift);
    n = {
      ...n,
      drag: {
        cards: a.slice(h.row),
        fromPile: h.p,
        fromIndex: h.i,
        x: h.x,
        y: h.y,
      },
    };
    return { ...n, dropTarget: target(n) };
  }
  if (!s.pointer.down) return { ...n, pointer: { x, y, down: false } };
  const press = n.lastPress;
  if (!press) return { ...n, pointer: { x, y, down: false } };
  if (n.drag) {
    const d = n.drag;
    if (Math.hypot(x - press.x, y - press.y) <= C.DRAG_THRESHOLD)
      n = restore(n);
    else {
      const t = target(n);
      if (t) {
        n = put(n, t.pile, t.index, [...pile(n, t.pile, t.index), ...d.cards]);
        if (d.fromPile === "waste") n = shrink(n);
        n = finish(
          { ...n, drag: null, dropTarget: null },
          d.fromPile,
          d.fromIndex,
          q,
        );
        cue(q, C.CUES.drop);
        if (t.pile === "foundation") cue(q, C.CUES.home);
      } else {
        n = restore(n);
        cue(q, C.CUES.reject);
      }
    }
  }
  if (
    n.screen === "playing" &&
    Math.hypot(x - press.x, y - press.y) <= C.DRAG_THRESHOLD &&
    contains(
      { x: C.STOCK_X, y: C.TOP_ROW_Y, w: C.CARD_W, h: C.CARD_H },
      press.x,
      press.y,
    )
  )
    n = turn(n, q);
  for (let i = 0; i < C.HUD_ITEMS.length; i++) {
    const r = menuRect(n, i);
    if (r && contains(r, press.x, press.y) && contains(r, x, y)) {
      n = activate({ ...n, menuIndex: i }, i, q, audio);
      break;
    }
  }
  return { ...n, pointer: { x, y, down: false } };
}
export function drawLaunchVx(): number {
  return (
    (C.LAUNCH_VX_MIN + Math.random() * (C.LAUNCH_VX_MAX - C.LAUNCH_VX_MIN)) *
    (Math.random() < 0.5 ? -1 : 1)
  );
}
export function advance(s: ReadState, dt: number, q?: CueSet): CascadeState {
  let n: CascadeState = { ...s, simTime: s.simTime + dt };
  // Posed flyers obey the same physics on every screen.
  const flyers: FlyerState[] = [];
  let stamps = s.trailStamps;
  for (const f of s.flyers) {
    let vy = f.vy + C.GRAVITY * dt;
    const x = f.x + f.vx * dt;
    let y = f.y + vy * dt;
    if (y >= C.FLOOR_Y && vy > 0) {
      y = C.FLOOR_Y;
      vy = -vy * C.BOUNCE_DAMP;
    }
    const next = { ...f, x, y, vy };
    if (s.trailPainting) {
      stamp(next);
      stamps++;
    }
    if (x + C.CARD_W >= 0 && x <= C.STAGE_W) flyers.push(next);
  }
  n = { ...n, flyers, trailStamps: stamps };
  if (s.screen === "won" && s.launching) {
    let clock = s.launchClock + dt,
      launched = s.launched;
    let foundations = s.foundations;
    while (
      clock >= C.LAUNCH_INTERVAL &&
      launched < C.DECK_SIZE &&
      foundations.some((a) => a.length)
    ) {
      let i = launched % C.FOUNDATION_COUNT;
      while (!foundations[i].length) i = (i + 1) % C.FOUNDATION_COUNT;
      const c = last(foundations[i])!;
      flyers.push({
        id: c.id,
        suit: c.suit,
        rank: c.rank,
        x: C.FOUNDATION_X[i],
        y: C.TOP_ROW_Y,
        vx: drawLaunchVx(),
        vy: C.LAUNCH_VY,
      });
      foundations = foundations.map((a, j) => (j === i ? a.slice(0, -1) : a));
      clock -= C.LAUNCH_INTERVAL;
      launched++;
      cue(q, C.CUES.launch);
    }
    n = { ...n, foundations, launchClock: clock, launched };
  }
  return {
    ...n,
    cascadeDone: n.launched === C.DECK_SIZE && flyers.length === 0,
  };
}
export function step(s: ReadState, api: UpdateApi, dt: number): CascadeState {
  const q: CueSet = new Set();
  let n: CascadeState = { ...s };
  for (const e of api.input.pointerSamples())
    if (e.primary) n = pointer(n, e.type, e.x, e.y, q, api.audio);
  if (n.screen !== "won") {
    const count =
      n.screen === "title"
        ? C.TITLE_ITEMS.length
        : n.screen === "howto"
          ? 1
          : C.HUD_ITEMS.length;
    if (api.input.pressed(C.MENU_UP))
      n = { ...n, menuIndex: (n.menuIndex + count - 1) % count };
    else if (api.input.pressed(C.MENU_DOWN))
      n = { ...n, menuIndex: (n.menuIndex + 1) % count };
    else if (
      api.input.pressed(C.MENU_CONFIRM) ||
      (n.screen === "howto" && api.input.pressed(C.MENU_BACK))
    )
      n = activate(n, n.menuIndex, q, api.audio);
  }
  n = advance(n, dt, q);
  for (const c of q) api.audio.play(c);
  return { ...n, muted: api.audio.muted() };
}
function findCard(s: ReadState, id: number): [PileKind, number, number] {
  for (const p of ["stock", "waste", "foundation", "tableau"] as const)
    for (
      let i = 0;
      i <
      (p === "foundation"
        ? C.FOUNDATION_COUNT
        : p === "tableau"
          ? C.TABLEAU_COLUMNS
          : 1);
      i++
    ) {
      const row = pile(s, p, i).findIndex((c) => c.id === id);
      if (row >= 0) return [p, i, row];
    }
  throw new Error(`Unknown card ${id}`);
}
function validCard(suit: Suit, rank: number) {
  if (!C.SUITS.includes(suit)) throw new Error("Invalid suit");
  integer(rank, C.RANK_MIN, C.RANK_MAX);
}
function flyerChange(
  s: ReadState,
  id: number,
  change: (f: FlyerState) => FlyerState | null,
): CascadeState {
  if (!s.flyers.some((f) => f.id === id))
    throw new Error(`Unknown flyer ${id}`);
  return {
    ...s,
    flyers: s.flyers.flatMap((f) =>
      f.id === id ? (change(f) ? [change(f)!] : []) : [f],
    ),
  };
}
export function snapshot(s: ReadState) {
  const card = (c: CardState) => ({ ...c, color: color(c) });
  const { nextId: _nextId, ...rest } = s;
  return {
    ...rest,
    version: C.CASCADE_DEBUG_VERSION,
    dealMode: C.DEAL_MODE,
    turnCount: C.TURN_COUNT,
    dealModeLabel: C.DEAL_MODE_LABEL,
    stock: s.stock.map(card),
    waste: s.waste.map(card),
    wasteSets: [...s.wasteSets],
    wasteVisibleCount: last(s.wasteSets) ?? 0,
    foundations: s.foundations.map((a) => a.map(card)),
    tableau: s.tableau.map((a) => a.map(card)),
    drag: s.drag ? { ...s.drag, cards: s.drag.cards.map(card) } : null,
    dropTarget: target(s),
    pointer: { ...s.pointer },
    lastPress: s.lastPress ? { ...s.lastPress } : null,
    flyers: s.flyers.map((f) => ({ ...f })),
  };
}
export function createDebug(
  audio: () => UpdateApi["audio"] | undefined = () => undefined,
) {
  return {
    version: C.CASCADE_DEBUG_VERSION,
    reset: (s: ReadState) => {
      clearPaint();
      return initial(s.muted);
    },
    snapshot,
    reconcile: (s: ReadState): CascadeState => ({
      ...s,
      dropTarget: target(s),
    }),
    menuItemRect: menuRect,
    setScreen: (s: ReadState, screen: Screen): CascadeState => {
      if (!["title", "howto", "playing", "won"].includes(screen))
        throw new Error("Invalid screen");
      return { ...s, screen };
    },
    setMenuIndex: (s: ReadState, menuIndex: number): CascadeState => {
      integer(
        menuIndex,
        0,
        s.screen === "title"
          ? C.TITLE_ITEMS.length - 1
          : s.screen === "playing"
            ? C.HUD_ITEMS.length - 1
            : 0,
      );
      return { ...s, menuIndex };
    },
    setTitleIndex: (s: ReadState, titleIndex: number): CascadeState => {
      integer(titleIndex, 0, C.TITLE_ITEMS.length - 1);
      return { ...s, titleIndex };
    },
    addCard: (
      s: ReadState,
      p: PileKind,
      i: number,
      suit: Suit,
      rank: number,
      faceUp: boolean,
    ): CascadeState => {
      validCard(suit, rank);
      return {
        ...put(s, p, i, [
          ...pile(s, p, i),
          { id: s.nextId, suit, rank, faceUp },
        ]),
        nextId: s.nextId + 1,
      };
    },
    removeCard: (s: ReadState, id: number) => {
      const [p, i, row] = findCard(s, id);
      const n = put(
        s,
        p,
        i,
        pile(s, p, i).filter((_, j) => j !== row),
      );
      return p === "waste" ? shrink(n) : n;
    },
    setCardFaceUp: (s: ReadState, id: number, faceUp: boolean) => {
      const [p, i] = findCard(s, id);
      return put(
        s,
        p,
        i,
        pile(s, p, i).map((c) => (c.id === id ? { ...c, faceUp } : c)),
      );
    },
    clearPile: (s: ReadState, p: PileKind, i: number) => {
      const n = put(s, p, i, []);
      return p === "waste" ? { ...n, wasteSets: [] } : n;
    },
    clearTable: (s: ReadState): CascadeState => ({
      ...s,
      stock: [],
      waste: [],
      wasteSets: [],
      foundations: s.foundations.map(() => []),
      tableau: s.tableau.map(() => []),
      drag: null,
      dropTarget: null,
    }),
    addWasteSet: (s: ReadState, count: number): CascadeState => {
      integer(count, 0, Number.MAX_SAFE_INTEGER);
      return { ...s, wasteSets: [...s.wasteSets, count] };
    },
    clearWasteSets: (s: ReadState): CascadeState => ({ ...s, wasteSets: [] }),
    deal,
    turnStock: turn,
    move,
    autoMove,
    pointerDown: (s: ReadState, x: number, y: number) =>
      pointer(s, "down", x, y, undefined, audio()),
    pointerMove: (s: ReadState, x: number, y: number) =>
      pointer(s, "move", x, y, undefined, audio()),
    pointerUp: (s: ReadState, x: number, y: number) =>
      pointer(s, "up", x, y, undefined, audio()),
    setAutoFlip: (s: ReadState, autoFlip: boolean): CascadeState => ({
      ...s,
      autoFlip,
    }),
    setWinDetect: (s: ReadState, winDetect: boolean): CascadeState => ({
      ...s,
      winDetect,
    }),
    setLaunching: (s: ReadState, launching: boolean): CascadeState => ({
      ...s,
      launching,
    }),
    setTrailPainting: (s: ReadState, trailPainting: boolean): CascadeState => ({
      ...s,
      trailPainting,
    }),
    addFlyer: (
      s: ReadState,
      suit: Suit,
      rank: number,
      x: number,
      y: number,
      vx: number,
      vy: number,
    ): CascadeState => {
      validCard(suit, rank);
      return {
        ...s,
        flyers: [...s.flyers, { id: s.nextId, suit, rank, x, y, vx, vy }],
        nextId: s.nextId + 1,
      };
    },
    setFlyerPosition: (s: ReadState, id: number, x: number, y: number) =>
      flyerChange(s, id, (f) => ({ ...f, x, y })),
    setFlyerVelocity: (s: ReadState, id: number, vx: number, vy: number) =>
      flyerChange(s, id, (f) => ({ ...f, vx, vy })),
    removeFlyer: (s: ReadState, id: number) => flyerChange(s, id, () => null),
    clearFlyers: (s: ReadState): CascadeState => ({ ...s, flyers: [] }),
    setLaunchClock: (s: ReadState, launchClock: number): CascadeState => {
      if (!Number.isFinite(launchClock) || launchClock < 0)
        throw new RangeError("Invalid clock");
      return { ...s, launchClock };
    },
    clearTrail: (s: ReadState): CascadeState => {
      clearPaint();
      return { ...s, trailStamps: 0 };
    },
    drawLaunchVx: (_s: ReadState) => drawLaunchVx(),
  };
}

function last<T>(a: readonly T[]): T | undefined {
  return a[a.length - 1];
}
