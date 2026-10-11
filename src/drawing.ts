import type { CardState, FlyerState, ReadState } from "./game";
import * as C from "./constants";
import { color, menuRect, positions, target } from "./rules";
const ink = "#183d3b",
  gold = "#d5b878",
  cream = "#f5eedc",
  red = "#b64b44";
const glyph = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
// The retained paint commands are drawing resources only; simulation never reads them.
let paint: FlyerState[] = [];
let layer: OffscreenCanvas | null = null;
let painted = 0;
export function clearPaint() {
  paint = [];
  painted = 0;
  layer = null;
}
export function stamp(f: FlyerState) {
  paint.push(f);
}
function box(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 8,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function text(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  size = 18,
  fill = cream,
  font = "sans-serif",
  align: CanvasTextAlign = "left",
) {
  ctx.fillStyle = fill;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.fillText(t, x, y);
}
export function card(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  c: Pick<CardState, "suit" | "rank" | "faceUp">,
  x: number,
  y: number,
  lift = false,
) {
  ctx.save();
  ctx.shadowColor = lift ? "#0009" : "#0005";
  ctx.shadowBlur = lift ? 18 : 4;
  ctx.shadowOffsetY = lift ? 8 : 3;
  box(ctx, x, y, C.CARD_W, C.CARD_H);
  ctx.fillStyle = cream;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#d9d0b6";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (c.faceUp) {
    const tint = color(c) === "red" ? red : ink;
    const rank =
      c.rank === C.RANK_MIN
        ? "A"
        : c.rank === 11
          ? "J"
          : c.rank === 12
            ? "Q"
            : c.rank === C.RANK_MAX
              ? "K"
              : String(c.rank);
    text(ctx, rank, x + 10, y + 24, 23, tint, "Georgia");
    text(ctx, glyph[c.suit], x + C.CARD_W - 24, y + 24, 21, tint, "Georgia");
    text(
      ctx,
      glyph[c.suit],
      x + C.CARD_W / 2,
      y + 94,
      49,
      tint,
      "Georgia",
      "center",
    );
    ctx.translate(x + C.CARD_W, y + C.CARD_H);
    ctx.rotate(Math.PI);
    text(ctx, rank, 10, 24, 23, tint, "Georgia");
    text(ctx, glyph[c.suit], C.CARD_W - 24, 24, 21, tint, "Georgia");
  } else {
    box(ctx, x + 5, y + 5, C.CARD_W - 10, C.CARD_H - 10, 5);
    ctx.fillStyle = "#255b63";
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1;
    box(ctx, x + 10, y + 10, C.CARD_W - 20, C.CARD_H - 20, 3);
    ctx.stroke();
    ctx.save();
    box(ctx, x + 12, y + 12, C.CARD_W - 24, C.CARD_H - 24, 2);
    ctx.clip();
    ctx.strokeStyle = "#74968d";
    ctx.globalAlpha = 0.42;
    for (let k = -C.CARD_H; k < C.CARD_W + C.CARD_H; k += 12) {
      ctx.beginPath();
      ctx.moveTo(x + k, y);
      ctx.lineTo(x + k + C.CARD_H, y + C.CARD_H);
      ctx.moveTo(x + k, y + C.CARD_H);
      ctx.lineTo(x + k + C.CARD_H, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#255b63";
    ctx.beginPath();
    ctx.ellipse(x + 50, y + 70, 22, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.stroke();
    text(ctx, "C", x + 50, y + 81, 31, gold, "Georgia", "center");
  }
  ctx.restore();
}
function slot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
) {
  box(ctx, x, y, C.CARD_W, C.CARD_H);
  ctx.fillStyle = "#0b2c2b66";
  ctx.fill();
  ctx.strokeStyle = "#71928655";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  text(
    ctx,
    label,
    x + C.CARD_W / 2,
    y + 82,
    30,
    "#71928699",
    "Georgia",
    "center",
  );
}
function backdrop(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(640, 300, 40, 640, 360, 790);
  g.addColorStop(0, "#24554b");
  g.addColorStop(1, "#123c39");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#e5cc9220";
  ctx.lineWidth = 1;
  box(ctx, 20, 18, C.STAGE_W - 40, C.STAGE_H - 36, 20);
  ctx.stroke();
  // A quiet woven felt texture, produced without images.
  ctx.fillStyle = "#ffffff03";
  for (let y = 8; y < C.STAGE_H; y += 24)
    for (let x = 8; x < C.STAGE_W; x += 24) ctx.fillRect(x + (y % 16), y, 1, 1);
}
function button(
  ctx: CanvasRenderingContext2D,
  s: ReadState,
  i: number,
  label: string,
) {
  const r = menuRect(s, i);
  if (!r) return;
  const selected = s.menuIndex === i;
  box(ctx, r.x, r.y, r.w, r.h, s.screen === "playing" ? 4 : 7);
  ctx.fillStyle = selected ? gold : "#102e2d88";
  ctx.fill();
  ctx.strokeStyle = selected ? "#eed6a0" : "#8ba39755";
  ctx.stroke();
  text(
    ctx,
    label,
    r.x + r.w / 2,
    r.y + r.h / 2 + 6,
    s.screen === "playing" ? 14 : 17,
    selected ? ink : cream,
    "sans-serif",
    "center",
  );
}
function table(ctx: CanvasRenderingContext2D, s: ReadState) {
  slot(ctx, C.STOCK_X, C.TOP_ROW_Y, "↻");
  if (s.stock.length) card(ctx, last(s.stock)!, C.STOCK_X, C.TOP_ROW_Y);
  const count = last(s.wasteSets) ?? 0;
  slot(ctx, C.WASTE_X, C.TOP_ROW_Y, "");
  if (count) {
    const actual = Math.min(
      count - (s.drag?.fromPile === "waste" ? 1 : 0),
      s.waste.length,
    );
    s.waste
      .slice(actual ? -actual : s.waste.length)
      .forEach((c, i) =>
        card(ctx, c, C.WASTE_X + i * C.WASTE_FAN, C.TOP_ROW_Y),
      );
  }
  s.foundations.forEach((a, i) => {
    slot(ctx, C.FOUNDATION_X[i], C.TOP_ROW_Y, "A");
    if (a.length) card(ctx, last(a)!, C.FOUNDATION_X[i], C.TOP_ROW_Y);
  });
  s.tableau.forEach((a, i) => {
    slot(ctx, C.COLUMN_X[i], C.TABLEAU_Y, "K");
    const ys = positions(a);
    a.forEach((c, j) => card(ctx, c, C.COLUMN_X[i], ys[j]));
  });
  const t = target(s);
  if (t) {
    const x =
      t.pile === "foundation" ? C.FOUNDATION_X[t.index] : C.COLUMN_X[t.index];
    const y =
      t.pile === "foundation"
        ? C.TOP_ROW_Y
        : (last(positions(s.tableau[t.index])) ?? C.TABLEAU_Y);
    ctx.save();
    ctx.shadowColor = gold;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = "#ffe2a2";
    ctx.lineWidth = 3;
    box(ctx, x - 3, y - 3, C.CARD_W + 6, C.CARD_H + 6);
    ctx.stroke();
    ctx.restore();
  }
  if (s.drag)
    s.drag.cards.forEach((c, i) =>
      card(ctx, c, s.drag!.x, s.drag!.y + i * C.FACE_UP_OFFSET, true),
    );
}
function paintedLayer(ctx: CanvasRenderingContext2D) {
  if (typeof OffscreenCanvas !== "undefined") {
    layer ??= new OffscreenCanvas(C.STAGE_W, C.STAGE_H);
    const lc = layer.getContext("2d");
    if (lc) {
      for (; painted < paint.length; painted++)
        card(
          lc,
          { ...paint[painted], faceUp: true },
          paint[painted].x,
          paint[painted].y,
        );
      ctx.drawImage(layer, 0, 0);
    }
  } else for (const f of paint) card(ctx, { ...f, faceUp: true }, f.x, f.y);
}
export function draw(s: ReadState, ctx: CanvasRenderingContext2D) {
  backdrop(ctx);
  if (s.screen === "playing") {
    text(ctx, "C", 112, 90, 48, gold, "Georgia", "center");
    text(ctx, "CASCADE", 112, 120, 14, gold, "sans-serif", "center");
    text(ctx, "PATIENCE", 112, 590, 11, "#92ada0", "sans-serif", "center");
    text(ctx, "& POSSIBILITY", 112, 610, 11, "#92ada0", "sans-serif", "center");
    table(ctx, s);
    ctx.fillStyle = "#0b2929";
    ctx.fillRect(0, C.HUD_Y, C.STAGE_W, C.HUD_H);
    C.HUD_ITEMS.forEach((t, i) => button(ctx, s, i, t));
    text(
      ctx,
      C.DEAL_MODE_LABEL,
      1056,
      C.HUD_Y + 24,
      13,
      gold,
      "sans-serif",
      "right",
    );
  } else if (s.screen === "won") {
    paintedLayer(ctx);
    s.foundations.forEach((a, i) => {
      if (a.length) card(ctx, last(a)!, C.FOUNDATION_X[i], C.TOP_ROW_Y);
    });
    s.flyers.forEach((f) => card(ctx, { ...f, faceUp: true }, f.x, f.y));
    if (s.cascadeDone) {
      ctx.fillStyle = "#102e2dcc";
      box(ctx, 420, 280, 440, 160, 12);
      ctx.fill();
      text(ctx, C.WIN_TEXT, 640, 352, 52, gold, "Georgia", "center");
      text(
        ctx,
        "Touch the table for a fresh beginning",
        640,
        397,
        17,
        cream,
        "sans-serif",
        "center",
      );
    }
  } else if (s.screen === "title") {
    ctx.save();
    ctx.translate(273, 245);
    ctx.rotate(-0.22);
    card(ctx, { suit: "spades", rank: C.RANK_MIN, faceUp: true }, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(905, 248);
    ctx.rotate(0.22);
    card(ctx, { suit: "hearts", rank: C.RANK_MAX, faceUp: true }, 0, 0);
    ctx.restore();
    text(
      ctx,
      "THE ART OF A QUIET MOMENT",
      640,
      158,
      14,
      gold,
      "sans-serif",
      "center",
    );
    text(ctx, C.TITLE_TEXT, 640, 287, 92, cream, "Georgia", "center");
    text(ctx, C.TAGLINE_TEXT, 640, 330, 18, gold, "sans-serif", "center");
    C.TITLE_ITEMS.forEach((t, i) => button(ctx, s, i, t));
    text(ctx, C.DEAL_MODE_LABEL, 640, 590, 13, gold, "sans-serif", "center");
    text(
      ctx,
      "Build a little order. Let it all cascade.",
      640,
      652,
      17,
      "#9bb8ab",
      "Georgia",
      "center",
    );
  } else {
    text(ctx, "HOW TO PLAY", 640, 120, 46, cream, "Georgia", "center");
    text(
      ctx,
      "A little patience goes a long way.",
      640,
      162,
      18,
      gold,
      "Georgia",
      "center",
    );
    const lines = [
      [
        "01",
        "BUILD YOUR FOUNDATIONS",
        "Bring each suit home, from ACE to KING.",
      ],
      [
        "02",
        "MAKE ROOM",
        "Build columns downward in alternating colors. Only a KING fills an empty column.",
      ],
      [
        "03",
        "TURN THE DECK",
        "Click the STOCK to turn three cards. Play the front card; recycle when empty.",
      ],
      [
        "04",
        "FOLLOW YOUR HAND",
        "Drag cards or a whole run. DOUBLE-CLICK an exposed card to send it home.",
      ],
    ];
    lines.forEach(([num, title, body], i) => {
      const y = 236 + i * 78;
      text(ctx, num, 232, y, 25, gold, "Georgia");
      text(ctx, title, 300, y - 3, 16, gold);
      text(ctx, body, 300, y + 24, 17, cream);
    });
    button(ctx, s, 0, C.HOWTO_BACK_LABEL);
  }
}

function last<T>(a: readonly T[]): T | undefined {
  return a[a.length - 1];
}
