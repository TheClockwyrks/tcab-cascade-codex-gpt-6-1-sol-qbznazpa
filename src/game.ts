import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { createDebug, initial, step } from "./rules";
import { draw } from "./drawing";
export type Screen = "title" | "howto" | "playing" | "won";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type PileKind = "stock" | "waste" | "foundation" | "tableau";

export interface CardState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly faceUp: boolean;
}

export interface DragState {
  readonly cards: readonly CardState[];
  readonly fromPile: "waste" | "foundation" | "tableau";
  readonly fromIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface DropTargetState {
  readonly pile: "foundation" | "tableau";
  readonly index: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
}

export interface PressState {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

export interface FlyerState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface CascadeState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly titleIndex: number;

  readonly stock: readonly CardState[];
  readonly waste: readonly CardState[];
  readonly wasteSets: readonly number[];
  readonly foundations: readonly (readonly CardState[])[];
  readonly tableau: readonly (readonly CardState[])[];

  readonly drag: DragState | null;
  readonly dropTarget: DropTargetState | null;
  readonly pointer: PointerState;
  readonly lastPress: PressState | null;

  readonly autoFlip: boolean;
  readonly winDetect: boolean;
  readonly launching: boolean;
  readonly trailPainting: boolean;

  readonly launchClock: number;
  readonly launched: number;
  readonly flyers: readonly FlyerState[];
  readonly cascadeDone: boolean;
  readonly trailStamps: number;

  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}

export type CascadeDebugApi = ReturnType<typeof createDebug>;
export const BACKGROUND = "#123c39";
// The engine audio handle is a runtime resource, never a second game state.
// Associate it with transitions so separate engine instances remain isolated.
interface RuntimeResource {
  audio?: UpdateApi["audio"];
}
const runtimes = new WeakMap<object, RuntimeResource>();
function attachDebug(
  debug: CascadeDebugApi,
  runtime: RuntimeResource,
): CascadeDebugApi {
  return new Proxy(debug, {
    get(target, key, receiver) {
      const operation: unknown = Reflect.get(target, key, receiver);
      if (typeof operation !== "function") return operation;
      return (...args: unknown[]) => {
        const result: unknown = Reflect.apply(operation, target, args);
        const next: unknown = Array.isArray(result) ? result[0] : result;
        if (next && typeof next === "object" && "nextId" in next)
          runtimes.set(next, runtime);
        return result;
      };
    },
  });
}
export const game: Game<CascadeState, CascadeDebugApi> = {
  initialize(api) {
    for (const [name, keys] of Object.entries(C.MENU_BINDINGS))
      api.input.register(name, { keys: [...keys] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        freq: 180 + i * 71,
        freqTo: 260 + i * 97,
        durationMs: 55 + i * 9,
        gain: 0.12,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("deal mode", () => C.DEAL_MODE);
    api.diagnostics.register("stock", (s) => s.stock.length);
    api.diagnostics.register("waste", (s) => s.waste.length);
    for (let i = 0; i < C.FOUNDATION_COUNT; i++)
      api.diagnostics.register(
        `foundation ${i}`,
        (s) => s.foundations[i].length,
      );
    for (let i = 0; i < C.TABLEAU_COLUMNS; i++)
      api.diagnostics.register(`column ${i}`, (s) => s.tableau[i].length);
    api.diagnostics.register("in hand", (s) => s.drag !== null);
    api.diagnostics.register("held cards", (s) => s.drag?.cards.length ?? 0);
    api.diagnostics.register("launched", (s) => s.launched);
    api.diagnostics.register("in flight", (s) => s.flyers.length);
    const state = initial();
    const runtime: RuntimeResource = {};
    runtimes.set(state, runtime);
    return [
      state,
      attachDebug(
        createDebug(() => runtime.audio),
        runtime,
      ),
    ];
  },
  update(state, api, dt) {
    const runtime = runtimes.get(state);
    if (runtime) {
      // A debug gesture can toggle sound even before the first frame.
      if (!runtime.audio && state.muted !== api.audio.muted())
        api.audio.setMuted(state.muted);
      runtime.audio = api.audio;
    }
    const next = step(state, api, dt);
    if (runtime) runtimes.set(next, runtime);
    return next;
  },
  render(state, api) {
    draw(state, api.ctx);
  },
};
export type ReadState = DeepReadonly<CascadeState>;
