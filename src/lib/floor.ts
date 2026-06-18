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
