// Presentation helpers shared by the read-only floor view and the admin editor.
import type { ZoneType } from "./types";
import { ZONE_META } from "./types";

export const DESK_W = 66;
export const DESK_H = 48;

export type DeskState =
  | "available"
  | "booked" // taken by someone else (reserved / checked-in) today
  | "mine" // current user has it today
  | "selected" // currently selected to book
  | "unavailable" // admin disabled it
  | "dimmed"; // filtered out

export const DESK_STATE_STYLE: Record<
  DeskState,
  { bg: string; border: string; text: string; dot: string }
> = {
  available: {
    bg: "#ffffff",
    border: "#cbd5d8",
    text: "#0b2b33",
    dot: "#14b8a6",
  },
  selected: {
    bg: "#0d9488",
    border: "#0f766e",
    text: "#ffffff",
    dot: "#ffffff",
  },
  mine: {
    bg: "#d8f1ee",
    border: "#0d9488",
    text: "#0f766e",
    dot: "#0d9488",
  },
  booked: {
    bg: "#f1f5f6",
    border: "#dbe3e5",
    text: "#94a3a8",
    dot: "#f59e0b",
  },
  unavailable: {
    bg: "#f8fafa",
    border: "#e2e9ea",
    text: "#c2cccf",
    dot: "#cbd5d8",
  },
  dimmed: {
    bg: "#ffffff",
    border: "#e8eded",
    text: "#c2cccf",
    dot: "#dde5e6",
  },
};

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
type DeskLike = { x: number; y: number; type: string };
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
  opts: { pad?: number; minWidth?: number; minHeight?: number } = {},
): { originX: number; originY: number; width: number; height: number } {
  const { pad = 0, minWidth = 0, minHeight = 0 } = opts;
  // Seed at 0,0 so the premise origin is always included in the window.
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const acc = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const d of desks) {
    const isRoom = d.type === "ROOM";
    acc(d.x, d.y);
    acc(d.x + (isRoom ? DESK_W + 60 : DESK_W), d.y + (isRoom ? DESK_H + 70 : DESK_H));
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
