import { describe, it, expect, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import type { InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import { game, type CascadeState } from "./game";
import { createDebug, initial, advance, positions, step } from "./rules";
import * as C from "./constants";
const d = createDebug();
function add(
  s: CascadeState,
  p: "tableau" | "foundation" | "stock" | "waste",
  i: number,
  suit: "hearts" | "spades" | "clubs" | "diamonds",
  rank: number,
  faceUp = true,
) {
  return d.addCard(s, p, i, suit, rank, faceUp);
}
function api() {
  return {
    input: { pressed: vi.fn(() => false), pointerSamples: vi.fn(() => []) },
    audio: { play: vi.fn(), muted: vi.fn(() => false), setMuted: vi.fn() },
  } as unknown as UpdateApi;
}
describe("dealing and Draw Three", () => {
  it("deals every pair once without mutating the source", () => {
    const s = initial(),
      n = d.deal(s);
    expect(s.stock).toHaveLength(0);
    expect(n.stock).toHaveLength(C.DEAL_STOCK_CARDS);
    expect(n.tableau.map((a) => a.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      new Set(
        [...n.stock, ...n.tableau.flat()].map((c) => `${c.suit}:${c.rank}`),
      ).size,
    ).toBe(C.DECK_SIZE);
    n.tableau.forEach((a) =>
      expect(a.map((c) => c.faceUp)).toEqual(
        a.map((_, i) => i === a.length - 1),
      ),
    );
  });
  it("remembers each set, reduces it only on accepted moves, and recycles in order", () => {
    let s = initial();
    for (let i = 1; i <= 7; i++) s = add(s, "stock", 0, "hearts", i, false);
    const before = s.stock.map((c) => c.id);
    s = d.turnStock(s);
    expect(s.waste.map((c) => c.rank)).toEqual([7, 6, 5]);
    s = d.turnStock(s);
    expect(s.wasteSets).toEqual([3, 3]);
    s = d.turnStock(s);
    expect(s.wasteSets).toEqual([3, 3, 1]);
    const [n, ok] = d.autoMove(s, "waste", 0);
    expect(ok).toBe(true);
    expect(n.wasteSets).toEqual([3, 3]);
    expect(d.snapshot(n).wasteVisibleCount).toBe(3);
    s = d.turnStock(s);
    expect(s.stock.map((c) => c.id)).toEqual(before);
    expect(s.wasteSets).toEqual([]);
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
  });
  it("offers no waste cards without set memory and refuses buried cards", () => {
    let s = add(initial(), "waste", 0, "hearts", 1);
    expect(d.autoMove(s, "waste", 0)[1]).toBe(false);
    s = d.addWasteSet(s, 1);
    s = add(s, "waste", 0, "clubs", 1);
    expect(d.move(s, "waste", 0, 0, "foundation", 0)[1]).toBe(false);
  });
});
describe("moves", () => {
  it("moves an alternating run, flipping only the newly exposed card", () => {
    let s = add(initial(), "tableau", 0, "spades", 5, false);
    s = add(s, "tableau", 0, "hearts", 4);
    s = add(s, "tableau", 0, "spades", 3);
    s = add(s, "tableau", 1, "clubs", 5);
    const [n, ok] = d.move(s, "tableau", 0, 1, "tableau", 1);
    expect(ok).toBe(true);
    expect(n.tableau[0][0].faceUp).toBe(true);
    expect(s.tableau[0][0].faceUp).toBe(false);
    expect(n.tableau[1].map((c) => c.rank)).toEqual([5, 4, 3]);
  });
  it("respects flip and win gates and refuses invalid runs", () => {
    let s = add(initial(), "tableau", 0, "clubs", 3, false);
    s = add(s, "tableau", 0, "hearts", 1);
    s = d.setAutoFlip(s, false);
    const n = d.autoMove(s, "tableau", 0)[0];
    expect(n.tableau[0][0].faceUp).toBe(false);
    s = add(initial(), "tableau", 0, "hearts", 13);
    s = add(s, "tableau", 0, "diamonds", 12);
    expect(d.move(s, "tableau", 0, 0, "tableau", 1)[1]).toBe(false);
  });
  it("foundation suits are assigned by their ace and only the top can leave", () => {
    let s = add(initial(), "tableau", 0, "hearts", 1);
    s = d.autoMove(s, "tableau", 0)[0];
    s = add(s, "tableau", 1, "spades", 2);
    expect(d.move(s, "tableau", 1, 0, "foundation", 0)[1]).toBe(false);
    s = add(s, "tableau", 2, "hearts", 2);
    expect(d.autoMove(s, "tableau", 2)[1]).toBe(true);
  });
  it("wins on the last accepted move and launches in round-robin order", () => {
    let s = initial();
    C.SUITS.forEach((suit, i) => {
      for (let r = C.RANK_MIN; r <= C.RANK_MAX; r++)
        if (!(i === 3 && r === C.RANK_MAX))
          s = add(s, "foundation", i, suit, r);
    });
    s = add(s, "tableau", 0, "clubs", C.RANK_MAX);
    const off = d.autoMove(d.setWinDetect(s, false), "tableau", 0)[0];
    expect(off.screen).toBe("title");
    s = d.autoMove(s, "tableau", 0)[0];
    expect(s.screen).toBe("won");
    expect(s.launchClock).toBe(C.LAUNCH_INTERVAL);
    s = advance(s, 0);
    expect(s.flyers[0].suit).toBe("spades");
    expect(s.flyers[0].y).toBe(C.TOP_ROW_Y);
    s = advance(s, C.LAUNCH_INTERVAL);
    expect(s.flyers[1].suit).toBe("hearts");
    expect(s.flyers[0].x).not.toBe(C.FOUNDATION_X[0]);
  });
});
describe("pointer and menu", () => {
  it("lifts at once, follows its offset, and restores a rejected drop without flipping", () => {
    let s = d.setScreen(initial(), "playing");
    s = add(s, "tableau", 0, "clubs", 5, false);
    s = add(s, "tableau", 0, "hearts", 4);
    s = d.pointerDown(
      s,
      C.COLUMN_X[0] + 17,
      C.TABLEAU_Y + C.FACE_DOWN_OFFSET + 10,
    );
    expect(s.drag?.x).toBe(C.COLUMN_X[0]);
    expect(s.tableau[0]).toHaveLength(1);
    s = d.pointerMove(s, 35, 45);
    expect(s.drag?.x).toBe(18);
    s = d.pointerUp(s, 35, 45);
    expect(s.drag).toBeNull();
    expect(s.tableau[0]).toHaveLength(2);
    expect(s.tableau[0][0].faceUp).toBe(false);
  });
  it("clicks return a lift; a double click sends an exposed ace home", () => {
    let s = add(d.setScreen(initial(), "playing"), "tableau", 0, "hearts", 1);
    s = d.pointerDown(s, 240, 200);
    s = d.pointerUp(s, 240, 200);
    expect(s.tableau[0]).toHaveLength(1);
    s = d.pointerDown(s, 240, 200);
    expect(s.foundations[0]).toHaveLength(1);
    expect(s.drag).toBeNull();
    s = d.pointerUp(s, 240, 200);
    expect(s.foundations[0]).toHaveLength(1);
  });
  it("can drop an ace on an empty foundation", () => {
    let s = add(d.setScreen(initial(), "playing"), "tableau", 0, "hearts", 1);
    s = d.pointerDown(s, C.COLUMN_X[0] + 10, C.TABLEAU_Y + 10);
    s = d.pointerMove(s, C.FOUNDATION_X[0] + 10, C.TOP_ROW_Y + 10);
    expect(s.dropTarget).toEqual({ pile: "foundation", index: 0 });
    s = d.pointerUp(s, C.FOUNDATION_X[0] + 10, C.TOP_ROW_Y + 10);
    expect(s.foundations[0]).toHaveLength(1);
  });
  it("keeps waste sets unchanged while lifted or returned", () => {
    let s = add(d.setScreen(initial(), "playing"), "waste", 0, "hearts", 1);
    s = d.addWasteSet(s, 1);
    s = d.pointerDown(s, C.WASTE_X + 10, C.TOP_ROW_Y + 10);
    expect(s.wasteSets).toEqual([1]);
    expect(s.waste).toHaveLength(0);
    s = d.pointerUp(s, C.WASTE_X + 10, C.TOP_ROW_Y + 10);
    expect(s.wasteSets).toEqual([1]);
  });
  it("processes a press and release in a single frame and keyboard movement before confirmation", () => {
    const a = api();
    vi.mocked(a.input.pointerSamples).mockReturnValue([
      { type: "down", x: 600, y: 435, primary: true },
      { type: "up", x: 600, y: 435, primary: true },
    ] as ReturnType<UpdateApi["input"]["pointerSamples"]>);
    let s = step(initial(), a, 0.1);
    expect(s.screen).toBe("playing");
    vi.mocked(a.input.pointerSamples).mockReturnValue([]);
    vi.mocked(a.input.pressed).mockImplementation(
      (k) => k === C.MENU_UP || k === C.MENU_CONFIRM,
    );
    s = step(s, a, 0.1);
    expect(s.menuIndex).toBe(2);
    expect(a.audio.setMuted).not.toHaveBeenCalled();
  });
  it("returns to the remembered title selection and reports valid menu rectangles", () => {
    let s = initial();
    const r = d.menuItemRect(s, 1)!;
    s = d.pointerDown(s, r.x + 2, r.y + 2);
    s = d.pointerUp(s, r.x + 2, r.y + 2);
    expect(s.screen).toBe("howto");
    const back = d.menuItemRect(s, 0)!;
    s = d.pointerDown(s, back.x + 2, back.y + 2);
    s = d.pointerUp(s, back.x + 2, back.y + 2);
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
    expect(d.menuItemRect(d.setScreen(s, "won"), 0)).toBeNull();
  });
});
describe("simulation and debug contract", () => {
  it("integrates gravity, bounces without changing vx, stamps then retires", () => {
    let s = d.addFlyer(initial(), "hearts", 8, 30, C.FLOOR_Y - 1, 200, 100);
    s = d.setLaunching(s, false);
    s = advance(s, 0.1);
    expect(s.flyers[0].y).toBe(C.FLOOR_Y);
    expect(s.flyers[0].vy).toBe(-(100 + C.GRAVITY * 0.1) * C.BOUNCE_DAMP);
    expect(s.flyers[0].vx).toBe(200);
    expect(s.trailStamps).toBe(1);
    s = d.setFlyerPosition(s, s.flyers[0].id, C.STAGE_W + 1, 10);
    s = advance(s, 0);
    expect(s.flyers).toHaveLength(0);
    expect(s.trailStamps).toBe(2);
    expect(s.cascadeDone).toBe(false);
  });
  it("horizontal travel and simulation time are frame-rate independent", () => {
    let s = d.addFlyer(initial(), "clubs", 4, 0, 0, 100, 0);
    s = d.setTrailPainting(s, false);
    const one = advance(s, 1);
    let many = s;
    for (let i = 0; i < 60; i++) many = advance(many, 1 / 60);
    expect(many.flyers[0].x).toBeCloseTo(one.flyers[0].x);
    expect(many.simTime).toBeCloseTo(one.simTime);
    expect(many.trailStamps).toBe(0);
  });
  it("reconciles without running a system and reset preserves mute", () => {
    let s = d.addFlyer(initial(true), "clubs", 3, 1500, 0, 100, 0);
    s = d.setLaunchClock(s, 1);
    const n = d.reconcile(s);
    expect(n).toEqual(s);
    expect(d.reset(n)).toEqual(initial(true));
    expect(() => d.removeFlyer(n, 999)).toThrow();
    expect(() => d.addCard(n, "tableau", 7, "clubs", 1, true)).toThrow();
    expect(() => d.addWasteSet(n, 1.5)).toThrow();
    expect(() => d.setCardFaceUp(n, 999, true)).toThrow();
  });
  it("compresses face-up spacing without reducing face-down spacing", () => {
    let s = initial();
    for (let i = 0; i < 20; i++) s = add(s, "tableau", 0, "clubs", 5);
    const ys = positions(s.tableau[0]);
    expect(ys[19] + C.CARD_H).toBeCloseTo(C.COLUMN_BOTTOM_LIMIT);
    expect(positions(s.tableau[0].slice(0, 2))[1] - C.TABLEAU_Y).toBe(
      C.FACE_UP_OFFSET,
    );
  });
  it("draws every screen on a real canvas and initializes all cues and diagnostics", () => {
    const register = vi.fn(),
      define = vi.fn(),
      diagnostic = vi.fn();
    const [s] = game.initialize({
      input: { register },
      audio: { define },
      diagnostics: { register: diagnostic },
    } as unknown as InitApi<CascadeState>) as [CascadeState, unknown];
    expect(register).toHaveBeenCalledTimes(4);
    expect(define).toHaveBeenCalledTimes(Object.keys(C.CUES).length);
    expect(diagnostic.mock.calls.every(([, fn]) => fn(s) !== undefined)).toBe(
      true,
    );
    const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
    for (const screen of ["title", "howto", "playing", "won"] as const)
      game.render({ ...d.deal(s), screen }, {
        ctx: canvas.getContext("2d"),
      } as unknown as Parameters<typeof game.render>[1]);
    expect(canvas.toBuffer("image/png").length).toBeGreaterThan(1000);
  });
});

describe("cascade completion and remaining poses", () => {
  it("launches all 52 cards, stops launching when gated, and completes only after retirement", () => {
    let s = initial();
    C.SUITS.forEach((suit, i) => {
      for (let rank = C.RANK_MIN; rank <= C.RANK_MAX; rank++)
        s = add(s, "foundation", i, suit, rank);
    });
    s = d.setScreen(s, "won");
    s = d.setLaunchClock(s, C.LAUNCH_INTERVAL);
    const paused = advance(d.setLaunching(s, false), 1);
    expect(paused.launched).toBe(0);
    expect(paused.launchClock).toBe(C.LAUNCH_INTERVAL);
    s = advance(s, C.LAUNCH_INTERVAL * C.DECK_SIZE);
    expect(s.launched).toBe(C.DECK_SIZE);
    expect(s.foundations.every((a) => !a.length)).toBe(true);
    expect(s.flyers).toHaveLength(C.DECK_SIZE);
    expect(s.cascadeDone).toBe(false);
    s = advance(s, 20);
    expect(s.flyers).toHaveLength(0);
    expect(s.cascadeDone).toBe(true);
    s = d.pointerDown(s, 0, 0);
    expect(s.screen).toBe("playing");
    expect(s.trailStamps).toBe(0);
    expect(s.launched).toBe(0);
  });
  it("poses and clears individual entities without disturbing other faculties", () => {
    let s = add(initial(), "waste", 0, "hearts", 1);
    s = d.addWasteSet(s, 1);
    const id = s.waste[0].id;
    s = d.setCardFaceUp(s, id, false);
    expect(s.waste[0].faceUp).toBe(false);
    s = d.removeCard(s, id);
    expect(s.wasteSets).toEqual([]);
    s = add(s, "waste", 0, "clubs", 2);
    s = d.addWasteSet(s, 1);
    s = d.clearWasteSets(s);
    expect(s.waste).toHaveLength(1);
    s = d.clearPile(s, "waste", 0);
    expect(s.waste).toHaveLength(0);
    s = d.addFlyer(s, "clubs", 5, 50, 50, 0, 0);
    const fid = s.flyers[0].id;
    s = d.setFlyerVelocity(s, fid, -50, -20);
    expect(s.flyers[0].vx).toBe(-50);
    s = d.clearTable(s);
    expect(s.flyers).toHaveLength(1);
    s = d.clearTrail(advance(s, 0.1));
    expect(s.trailStamps).toBe(0);
    s = d.removeFlyer(s, fid);
    s = d.clearFlyers(s);
    expect(s.flyers).toHaveLength(0);
    expect(() => d.removeCard(s, id)).toThrow();
    expect(() => d.addCard(s, "stock", 0, "clubs", 14, false)).toThrow();
    expect(() => d.setLaunchClock(s, -1)).toThrow();
    const vx = d.drawLaunchVx(s);
    expect(Math.abs(vx)).toBeGreaterThanOrEqual(C.LAUNCH_VX_MIN);
    expect(Math.abs(vx)).toBeLessThanOrEqual(C.LAUNCH_VX_MAX);
  });
  it("toggles runtime sound from the keyboard and plays each raised cue once", () => {
    const a = api();
    let muted = false;
    vi.mocked(a.audio.muted).mockImplementation(() => muted);
    vi.mocked(a.audio.setMuted).mockImplementation((value) => {
      muted = value;
    });
    vi.mocked(a.input.pressed).mockImplementation(
      (key) => key === C.MENU_CONFIRM,
    );
    let s = d.setMenuIndex(d.setScreen(initial(), "playing"), 2);
    s = step(s, a, 0.1);
    expect(s.muted).toBe(true);
    s = d.setMenuIndex(s, 0);
    s = step(s, a, 0.1);
    expect(s.stock).toHaveLength(C.DEAL_STOCK_CARDS);
    expect(a.audio.play).toHaveBeenCalledWith(C.CUES.deal);
    expect(a.audio.play).toHaveBeenCalledTimes(1);
  });
});

it("debug sound gestures reach the owning engine audio resource before and after its first update", () => {
  const initApi = {
    input: { register: vi.fn() },
    audio: { define: vi.fn() },
    diagnostics: { register: vi.fn() },
  } as unknown as InitApi<CascadeState>;
  const [start, debug] = game.initialize(initApi) as [
    CascadeState,
    ReturnType<typeof createDebug>,
  ];
  const a = api();
  let muted = false;
  vi.mocked(a.audio.muted).mockImplementation(() => muted);
  vi.mocked(a.audio.setMuted).mockImplementation((value) => {
    muted = value;
  });
  let s = debug.setScreen(start, "playing");
  const r = debug.menuItemRect(s, 2)!;
  s = debug.pointerDown(s, r.x + 10, r.y + 10);
  s = debug.pointerUp(s, r.x + 10, r.y + 10);
  expect(s.muted).toBe(true);
  s = game.update(s, a, 0);
  expect(muted).toBe(true);
  s = debug.pointerDown(s, r.x + 10, r.y + 10);
  s = debug.pointerUp(s, r.x + 10, r.y + 10);
  expect(muted).toBe(false);
  expect(game.update(s, a, 0).muted).toBe(false);
});
