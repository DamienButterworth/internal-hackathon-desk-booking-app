// Presentation helpers shared by the read-only floor view and the admin editor.
import type { ZoneType } from "./types";
import { ZONE_META } from "./types";

export const DESK_W = 66;
export const DESK_H = 48;

// Editor snap-to-grid spacing (world units) used for drag/resize alignment.
export const GRID = 20;

// Room render size (the body box of a ROOM bookable).
export const ROOM_W = DESK_W + 60;
export const ROOM_H = DESK_H + 70;

// Default seat marker diameter + gap from the table edge. The size is now
// per-bookable (`seatSize`), defaulting to SEAT.
export const SEAT = 18;
export const SEAT_GAP = 5;

// Default desk/table name label size (px); per-bookable via `fontSize`.
export const FONT = 11;

export type TableShape = "RECT" | "ROUND";

type DeskGeom = {
  type: string;
  seats?: number;
  shape?: string;
  width?: number;
  height?: number;
  seatSize?: number;
  seatGap?: number;
  seatSide?: string;
  endSeats?: boolean;
};

// The body box (table surface) of a bookable, ignoring any seats around it.
export function deskBox(d: DeskGeom): { w: number; h: number } {
  if (d.type === "ROOM") return { w: ROOM_W, h: ROOM_H };
  return { w: d.width || DESK_W, h: d.height || DESK_H };
}

// Seat-centre positions (in box-local coords, origin at the table top-left).
// A single seat sits at the front (bottom) edge — so even a plain desk shows a
// chair. Multi-seat tables ring the body (ROUND) or split across the long
// top/bottom edges (RECT). `seatSize` controls the marker diameter and
// `seatGap` the spacing between the marker and the table edge. `endSeats`
// (RECT only) reserves one seat for each short (left/right) end — boardroom
// style — and distributes the remainder along the top/bottom edges.
export function seatSlots(
  shape: string,
  w: number,
  h: number,
  seats: number,
  seatSize: number = SEAT,
  endSeats: boolean = false,
  seatGap: number = SEAT_GAP,
  // Which edge a single desk's chair sits on (multi-seat layouts ignore this).
  seatSide: string = "BOTTOM",
): Point[] {
  if (seats < 1) return [];
  const off = seatSize / 2 + seatGap;
  if (seats === 1) {
    switch (seatSide) {
      case "TOP":
        return [{ x: w / 2, y: -off }];
      case "LEFT":
        return [{ x: -off, y: h / 2 }];
      case "RIGHT":
        return [{ x: w + off, y: h / 2 }];
      default: // BOTTOM (front)
        return [{ x: w / 2, y: h + off }];
    }
  }
  if (shape === "ROUND") {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2 + off;
    const ry = h / 2 + off;
    const slots: Point[] = [];
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * Math.PI * 2 - Math.PI / 2; // start at top, clockwise
      slots.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    return slots;
  }
  // RECT: seats along the long top/bottom edges. With `endSeats`, reserve one
  // seat for each short end and split the rest between top and bottom.
  const slots: Point[] = [];
  const placeRow = (n: number, y: number) => {
    for (let i = 0; i < n; i++) slots.push({ x: (w * (i + 1)) / (n + 1), y });
  };
  if (endSeats) {
    const nEnds = Math.min(2, seats);
    const rest = seats - nEnds;
    const nTop = Math.ceil(rest / 2);
    placeRow(nTop, -off);
    placeRow(rest - nTop, h + off);
    slots.push({ x: -off, y: h / 2 }); // left end
    if (nEnds === 2) slots.push({ x: w + off, y: h / 2 }); // right end
    return slots;
  }
  const nTop = Math.ceil(seats / 2);
  placeRow(nTop, -off);
  placeRow(seats - nTop, h + off);
  return slots;
}

// World-space bounding box of a bookable including any seats around it.
export function deskBounds(d: DeskGeom & { x: number; y: number }) {
  const { w, h } = deskBox(d);
  if (d.type === "ROOM") {
    return { minX: d.x, minY: d.y, maxX: d.x + w, maxY: d.y + h };
  }
  const seats = d.seats ?? 1;
  const seatSize = d.seatSize || SEAT;
  const seatGap = d.seatGap ?? SEAT_GAP;
  let minX = 0;
  let minY = 0;
  let maxX = w;
  let maxY = h;
  for (const s of seatSlots(d.shape ?? "RECT", w, h, seats, seatSize, d.endSeats, seatGap, d.seatSide)) {
    minX = Math.min(minX, s.x - seatSize / 2);
    minY = Math.min(minY, s.y - seatSize / 2);
    maxX = Math.max(maxX, s.x + seatSize / 2);
    maxY = Math.max(maxY, s.y + seatSize / 2);
  }
  return { minX: d.x + minX, minY: d.y + minY, maxX: d.x + maxX, maxY: d.y + maxY };
}

export type DeskState =
  | "available"
  | "booked" // taken by someone else (reserved / checked-in) today
  | "mine" // current user has it today
  | "selected" // currently selected to book
  | "unavailable" // admin disabled it
  | "dimmed"; // filtered out

export type DeskStateStyle = {
  bg: string;
  border: string;
  text: string;
  dot: string;
};

// The four user-configurable legend colours that drive desk appearance.
export type LegendColors = {
  free: string;
  taken: string;
  yours: string;
  unavailable: string;
};

export const DEFAULT_LEGEND_COLORS: LegendColors = {
  free: "#22c55e",
  taken: "#f59e0b",
  yours: "#3b82f6",
  unavailable: "#cbd5d8",
};

// --- Small hex colour helpers (no deps) -------------------------------------
function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function parseHex(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const int = parseInt(h, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}
function toHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((n) => clampByte(n).toString(16).padStart(2, "0"))
      .join("")
  );
}
// Mix a colour toward white (amount>0) — for soft tinted fills.
function tint(hex: string, amount: number) {
  const [r, g, b] = parseHex(hex);
  return toHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}
// Mix a colour toward black (amount>0) — for borders and readable text.
function shade(hex: string, amount: number) {
  const [r, g, b] = parseHex(hex);
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

// Build the full per-state desk style map from the four legend colours.
// Free/Taken/Unavailable get a soft tinted fill with the legend colour as a
// strong border; Yours/Selected get a solid fill with white text.
export function buildDeskStateStyle(
  c: LegendColors,
): Record<DeskState, DeskStateStyle> {
  return {
    available: {
      bg: tint(c.free, 0.82),
      border: c.free,
      text: shade(c.free, 0.55),
      dot: c.free,
    },
    selected: {
      bg: c.free,
      border: shade(c.free, 0.25),
      text: "#ffffff",
      dot: "#ffffff",
    },
    mine: {
      bg: c.yours,
      border: shade(c.yours, 0.25),
      text: "#ffffff",
      dot: "#ffffff",
    },
    booked: {
      bg: tint(c.taken, 0.8),
      border: c.taken,
      text: shade(c.taken, 0.5),
      dot: c.taken,
    },
    unavailable: {
      bg: tint(c.unavailable, 0.45),
      border: c.unavailable,
      text: shade(c.unavailable, 0.4),
      dot: c.unavailable,
    },
    dimmed: {
      bg: "#ffffff",
      border: "#e8eded",
      text: "#c2cccf",
      dot: "#dde5e6",
    },
  };
}

export const DESK_STATE_STYLE = buildDeskStateStyle(DEFAULT_LEGEND_COLORS);

export function zoneVisual(type: string) {
  return ZONE_META[(type as ZoneType)] ?? ZONE_META.FOCUS;
}

// ---- Zone geometry ---------------------------------------------------------
// Zones are polygons (a list of points). The legacy x/y/width/height fields are
// kept as a bounding box so existing data and any non-visual query still work;
// when a zone has no explicit polygon we fall back to that rectangle.
export type Point = { x: number; y: number };

export function rectToPoints(
  x: number,
  y: number,
  width: number,
  height: number,
): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function parsePoints(json: string | null | undefined): Point[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (
      Array.isArray(v) &&
      v.length >= 3 &&
      v.every((p) => typeof p?.x === "number" && typeof p?.y === "number")
    ) {
      return v.map((p) => ({ x: p.x, y: p.y }));
    }
  } catch {
    /* fall through */
  }
  return null;
}

// Resolve a zone's outline: explicit polygon if present, else its rectangle.
export function zonePoints(z: {
  x: number;
  y: number;
  width: number;
  height: number;
  points?: string | null;
}): Point[] {
  return parsePoints(z.points) ?? rectToPoints(z.x, z.y, z.width, z.height);
}

// SVG points="x,y x,y ..." attribute string.
export function pointsToAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

// Derives a movable canvas window from the outer bounds of every entity so the
// office grows in any direction (incl. negative/up-left coordinates) instead of
// being capped at a fixed premise box. Returns the world-space origin (top-left,
// may be negative) plus the span. `pad` leaves slack on every side (drag-room in
// the editor); `minWidth/minHeight` (the premise size) act as a floor.
type DeskLike = {
  x: number;
  y: number;
  type: string;
  seats?: number;
  shape?: string;
  width?: number;
  height?: number;
  seatSize?: number;
  seatGap?: number;
  seatSide?: string;
  endSeats?: boolean;
};
type ZoneLike = { points: Point[] };
type FixtureLike = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export function layoutCanvasSize(
  desks: DeskLike[],
  zones: ZoneLike[],
  fixtures: FixtureLike[],
  opts: {
    pad?: number;
    minWidth?: number;
    minHeight?: number;
    // When false, the window hugs the content tightly instead of always
    // including the premise origin (used by the read-only view to maximise).
    seedOrigin?: boolean;
    // Extra world-space rects to include in the bounds (e.g. the background).
    extra?: { x: number; y: number; width: number; height: number }[];
  } = {},
): { originX: number; originY: number; width: number; height: number } {
  const {
    pad = 0,
    minWidth = 0,
    minHeight = 0,
    seedOrigin = true,
    extra = [],
  } = opts;
  // Seed at 0,0 so the premise origin is always included in the window (unless
  // seedOrigin is off, then start unbounded and hug the actual content).
  let minX = seedOrigin ? 0 : Infinity;
  let minY = seedOrigin ? 0 : Infinity;
  let maxX = seedOrigin ? 0 : -Infinity;
  let maxY = seedOrigin ? 0 : -Infinity;
  const acc = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const d of desks) {
    const b = deskBounds(d);
    acc(b.minX, b.minY);
    acc(b.maxX, b.maxY);
  }
  for (const z of zones) {
    for (const p of z.points) acc(p.x, p.y);
  }
  for (const f of fixtures) {
    // Account for rotation: the AABB of a rotated rectangle about its centre.
    const r = ((f.rotation || 0) * Math.PI) / 180;
    const hx =
      Math.abs(Math.cos(r) * (f.width / 2)) +
      Math.abs(Math.sin(r) * (f.height / 2));
    const hy =
      Math.abs(Math.sin(r) * (f.width / 2)) +
      Math.abs(Math.cos(r) * (f.height / 2));
    const cx = f.x + f.width / 2;
    const cy = f.y + f.height / 2;
    acc(cx - hx, cy - hy);
    acc(cx + hx, cy + hy);
  }
  for (const r of extra) {
    acc(r.x, r.y);
    acc(r.x + r.width, r.y + r.height);
  }
  // Nothing to bound (empty plan, no seed) → fall back to the premise box.
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = minWidth;
    maxY = minHeight;
  }
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  let width = maxX - minX;
  let height = maxY - minY;
  if (width < minWidth) {
    maxX += minWidth - width;
    width = minWidth;
  }
  if (height < minHeight) {
    maxY += minHeight - height;
    height = minHeight;
  }
  return {
    originX: Math.floor(minX),
    originY: Math.floor(minY),
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
}

export function bbox(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

// Anchor the zone label at its top-most (then left-most) vertex.
export function labelAnchor(points: Point[]): Point {
  return points.reduce(
    (a, p) => (p.y < a.y || (p.y === a.y && p.x < a.x) ? p : a),
    points[0],
  );
}

// ---- Walls -----------------------------------------------------------------
// A thin fixture (wall/window) is a rotated box. These helpers work off its
// centreline so snapping, junction detection and rendering all agree.
type WallLike = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

// The two centreline endpoints in world space, accounting for the CSS rotation
// applied about the box centre.
export function wallEnds(f: WallLike): [Point, Point] {
  const cx = f.x + f.width / 2;
  const cy = f.y + f.height / 2;
  const horizontal = f.width >= f.height;
  const half = (horizontal ? f.width : f.height) / 2;
  const r = ((f.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const local: [Point, Point] = horizontal
    ? [{ x: -half, y: 0 }, { x: half, y: 0 }]
    : [{ x: 0, y: -half }, { x: 0, y: half }];
  return local.map((l) => ({
    x: cx + l.x * cos - l.y * sin,
    y: cy + l.x * sin + l.y * cos,
  })) as [Point, Point];
}

// Wall thickness = its short side.
export function wallThickness(f: WallLike): number {
  return Math.min(f.width, f.height);
}

// Closest point to P on segment AB, with the distance to it. Used to snap a
// wall end onto ANY part of another wall (its end or anywhere along its run).
export function closestPointOnSegment(
  p: Point,
  a: Point,
  b: Point,
): { point: Point; dist: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * abx, y: a.y + t * aby };
  return { point, dist: Math.hypot(p.x - point.x, p.y - point.y) };
}

// Junction discs that make connected walls read as one fluid run. Wherever a
// wall end meets another wall — its end (an elbow) OR anywhere along it (a
// T-join) — we drop a disc the width of the wall to fill the gap the square
// rectangles leave at the corner. Coincident nodes are merged so a translucent
// wall colour doesn't double up. Returns world-space centres + diameters.
export function wallJunctions(
  walls: WallLike[],
  tol = 6,
): { x: number; y: number; size: number }[] {
  const segs = walls.map((w) => ({
    ends: wallEnds(w),
    th: wallThickness(w),
  }));
  const nodes: { x: number; y: number; size: number }[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (const end of segs[i].ends) {
      for (let j = 0; j < segs.length; j++) {
        if (i === j) continue;
        const { dist } = closestPointOnSegment(
          end,
          segs[j].ends[0],
          segs[j].ends[1],
        );
        if (dist <= tol) {
          const size = Math.max(segs[i].th, segs[j].th);
          // Merge with an existing node at (nearly) the same spot, keeping the
          // larger disc, so overlapping translucent discs don't darken.
          const near = nodes.find((n) => Math.hypot(n.x - end.x, n.y - end.y) <= tol);
          if (near) near.size = Math.max(near.size, size);
          else nodes.push({ x: end.x, y: end.y, size });
          break;
        }
      }
    }
  }
  return nodes;
}
