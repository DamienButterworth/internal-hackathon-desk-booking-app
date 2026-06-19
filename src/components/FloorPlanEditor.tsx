"use client";

import { useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { RotateCw } from "lucide-react";
import clsx from "clsx";
import { CanvasFrame } from "./CanvasFrame";
import { FixtureShape } from "./FixtureShape";
import {
  SEAT,
  SEAT_GAP,
  FONT,
  deskBox,
  seatSlots,
  zoneVisual,
  pointsToAttr,
  labelAnchor,
  closestPointOnSegment,
  wallJunctions,
  type Point,
} from "@/lib/floor";

export type EditDesk = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: string;
  seats: number;
  seatSize: number;
  seatGap: number;
  seatShape: string;
  seatSide: string;
  fontSize: number;
  endSeats: boolean;
  zoneId: string | null;
  isAvailable: boolean;
};

export type DeskGeom = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};
export type EditZone = {
  id: string;
  name: string;
  type: string;
  points: Point[];
};
export type EditFixture = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type SelKind = "desk" | "zone" | "fixture";
export type SelItem = { kind: SelKind; id: string };
// Selection is now a (possibly empty) multi-selection.
export type Selection = SelItem[];

export type FixtureGeom = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Tracks an in-progress drag of either a single vertex or a whole zone.
type Drag = {
  zoneId: string;
  vertex: number | null; // null = dragging the whole shape
  startX: number;
  startY: number;
  origin: Point[];
};

// Snapshot of every selected entity's geometry at the start of a group drag,
// so a delta can be applied uniformly to the whole selection.
type GroupOrigin = {
  anchor: SelItem;
  desks: Map<string, { x: number; y: number }>;
  fixtures: Map<string, FixtureGeom>;
  zones: Map<string, Point[]>;
};

// Rubber-band marquee (world coords) for select-by-area.
type Marquee = { x0: number; y0: number; x1: number; y1: number };

export function FloorPlanEditor({
  mapWidth,
  mapHeight,
  originX = 0,
  originY = 0,
  backgroundUrl,
  bg,
  bgEdit = false,
  onBgChange,
  onViewChange,
  snapGrid = 0,
  align = false,
  wallColor,
  wallOpacity,
  zones,
  desks,
  fixtures,
  selection,
  onSelectionChange,
  onZoneChange,
  onDeskChange,
  onFixtureChange,
  onFixtureRotate,
}: {
  mapWidth: number;
  mapHeight: number;
  originX?: number;
  originY?: number;
  backgroundUrl?: string | null;
  // World-space placement of the background image.
  bg: { x: number; y: number; width: number; height: number };
  // When true the background is draggable/resizable and entities are inert.
  bgEdit?: boolean;
  onBgChange?: (rect: { x: number; y: number; width: number; height: number }) => void;
  onViewChange?: (center: { x: number; y: number }) => void;
  // Snap-to-grid spacing in world units; 0 disables snapping.
  snapGrid?: number;
  // When on, a dragged element snaps so its edges/centres line up with other
  // elements, with guide lines shown while dragging.
  align?: boolean;
  // Global wall appearance.
  wallColor?: string;
  wallOpacity?: number;
  zones: EditZone[];
  desks: EditDesk[];
  fixtures: EditFixture[];
  selection: Selection;
  onSelectionChange: (s: Selection) => void;
  onZoneChange: (id: string, points: Point[]) => void;
  onDeskChange: (id: string, geom: DeskGeom) => void;
  onFixtureChange: (id: string, geom: FixtureGeom) => void;
  onFixtureRotate: (id: string, rotation: number, commit: boolean) => void;
}) {
  const sel = (kind: SelKind, id: string) =>
    selection.some((s) => s.kind === kind && s.id === id);

  // Select a single entity, or toggle it in/out when additive (Shift/Ctrl).
  // A plain click on an entity that's already part of a multi-selection keeps
  // the whole selection, so the group can be dragged together.
  function pick(item: SelItem, additive: boolean) {
    const has = selection.some((s) => s.kind === item.kind && s.id === item.id);
    if (additive) {
      onSelectionChange(
        has
          ? selection.filter(
              (s) => !(s.kind === item.kind && s.id === item.id),
            )
          : [...selection, item],
      );
    } else if (!(has && selection.length > 1)) {
      onSelectionChange([item]);
    }
  }

  // Used at drag start: make sure the item is selected without ever toggling it
  // off, so a group stays intact and can be dragged.
  function ensureSelected(item: SelItem, additive: boolean) {
    const has = selection.some((s) => s.kind === item.kind && s.id === item.id);
    if (has) return;
    onSelectionChange(additive ? [...selection, item] : [item]);
  }

  // The CanvasFrame scales its children by CSS transform; we read that scale so
  // pointer deltas (screen px) can be converted back into map coordinates.
  const scaleRef = useRef(1);
  const [drag, setDrag] = useState<Drag | null>(null);

  // Alignment guide lines (world coords) shown while dragging with `align` on.
  const [guides, setGuides] = useState<{ x: number | null; y: number | null } | null>(null);

  // Group move (multi-selection) + rubber-band marquee state.
  const groupRef = useRef<GroupOrigin | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const marqueeRef = useRef<{ additive: boolean } | null>(null);
  // Suppresses the click-to-select that fires right after a drag.
  const didDragRef = useRef(false);

  // Tracks an in-progress drag of a fixture's rotation handle.
  const originRef = useRef<SVGSVGElement | null>(null);
  const [rotating, setRotating] = useState<{
    id: string;
    cx: number;
    cy: number;
  } | null>(null);

  // Tracks an in-progress drag of a thin fixture's length (endpoint) handle.
  // `pinned` is the opposite end, held fixed in map coords while we extend.
  const [lengthDrag, setLengthDrag] = useState<{
    id: string;
    which: 0 | 1;
    pinned: Point;
    horizontal: boolean;
    thickness: number;
  } | null>(null);
  // The endpoint currently being snapped to (highlighted while extending).
  const [snapAt, setSnapAt] = useState<Point | null>(null);


  // No restriction: entities may be moved freely in any direction (the canvas
  // window grows to follow them), so coordinates are passed through unclamped.
  const clampX = (x: number) => x;
  const clampY = (y: number) => y;

  // Snap a world coordinate to the nearest grid line when snapping is on.
  const snap = (v: number) =>
    snapGrid > 0 ? Math.round(v / snapGrid) * snapGrid : v;
  const grid: [number, number] | undefined =
    snapGrid > 0 ? [snapGrid, snapGrid] : undefined;

  // Convert a screen pointer position into map coordinates. The SVG layer is
  // pinned to map (0,0) and visually scaled, so its bounding rect gives the
  // on-screen origin and we divide the offset back out by the scale.
  function toMap(e: React.PointerEvent) {
    const rect = originRef.current?.getBoundingClientRect();
    const scale = scaleRef.current || 1;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }

  // ---- Align to other elements ---------------------------------------------
  // Snap a dragged element's box so one of its edges/centres lines up with
  // another element's (within a zoom-independent tolerance). Returns the
  // adjusted top-left plus the guide lines (world coords) that matched.
  function alignSnap(
    box: { x: number; y: number; w: number; h: number },
    exclude: SelItem,
  ): { x: number; y: number; gx: number | null; gy: number | null } {
    const tol = 6 / (scaleRef.current || 1);
    const vx: number[] = []; // candidate vertical guide x's
    const hy: number[] = []; // candidate horizontal guide y's
    for (const d of desks) {
      if (exclude.kind === "desk" && d.id === exclude.id) continue;
      const { w, h } = deskBox(d);
      vx.push(d.x, d.x + w / 2, d.x + w);
      hy.push(d.y, d.y + h / 2, d.y + h);
    }
    for (const f of fixtures) {
      if (exclude.kind === "fixture" && f.id === exclude.id) continue;
      vx.push(f.x, f.x + f.width / 2, f.x + f.width);
      hy.push(f.y, f.y + f.height / 2, f.y + f.height);
    }
    const ex = [box.x, box.x + box.w / 2, box.x + box.w];
    const ey = [box.y, box.y + box.h / 2, box.y + box.h];
    let bestX = tol;
    let dx = 0;
    let gx: number | null = null;
    for (const e of ex)
      for (const g of vx) {
        const d = Math.abs(g - e);
        if (d < bestX) {
          bestX = d;
          dx = g - e;
          gx = g;
        }
      }
    let bestY = tol;
    let dy = 0;
    let gy: number | null = null;
    for (const e of ey)
      for (const g of hy) {
        const d = Math.abs(g - e);
        if (d < bestY) {
          bestY = d;
          dy = g - e;
          gy = g;
        }
      }
    return { x: Math.round(box.x + dx), y: Math.round(box.y + dy), gx, gy };
  }

  // ---- Group move (multi-selection) ----------------------------------------
  // Returns true if a group drag should take over (anchor is part of a 2+
  // selection); records each selected entity's starting geometry.
  function captureGroup(anchor: SelItem): boolean {
    const has = selection.some(
      (s) => s.kind === anchor.kind && s.id === anchor.id,
    );
    if (!has || selection.length < 2) return false;
    const g: GroupOrigin = {
      anchor,
      desks: new Map(),
      fixtures: new Map(),
      zones: new Map(),
    };
    for (const s of selection) {
      if (s.kind === "desk") {
        const d = desks.find((x) => x.id === s.id);
        if (d) g.desks.set(d.id, { x: d.x, y: d.y });
      } else if (s.kind === "fixture") {
        const f = fixtures.find((x) => x.id === s.id);
        if (f)
          g.fixtures.set(f.id, {
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
          });
      } else {
        const z = zones.find((x) => x.id === s.id);
        if (z) g.zones.set(z.id, z.points);
      }
    }
    groupRef.current = g;
    return true;
  }

  // Apply a world-space delta to every entity in the captured group. The anchor
  // is excluded during live drag (react-rnd / the zone drag moves it visually)
  // and included on commit.
  function applyGroupDelta(dx: number, dy: number, includeAnchor: boolean) {
    const g = groupRef.current;
    if (!g) return;
    const isAnchor = (kind: SelKind, id: string) =>
      g.anchor.kind === kind && g.anchor.id === id;
    g.desks.forEach((o, id) => {
      if (!includeAnchor && isAnchor("desk", id)) return;
      onDeskChange(id, { x: Math.round(o.x + dx), y: Math.round(o.y + dy) });
    });
    g.fixtures.forEach((o, id) => {
      if (!includeAnchor && isAnchor("fixture", id)) return;
      onFixtureChange(id, {
        x: Math.round(o.x + dx),
        y: Math.round(o.y + dy),
        width: o.width,
        height: o.height,
      });
    });
    g.zones.forEach((pts, id) => {
      if (!includeAnchor && isAnchor("zone", id)) return;
      onZoneChange(
        id,
        pts.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) })),
      );
    });
  }

  // ---- Rubber-band marquee --------------------------------------------------
  function beginMarquee(e: React.PointerEvent) {
    if (e.button !== 0) return; // left button only
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toMap(e);
    marqueeRef.current = { additive: e.shiftKey || e.metaKey || e.ctrlKey };
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }

  function moveMarquee(e: React.PointerEvent) {
    if (!marqueeRef.current) return;
    const p = toMap(e);
    setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
  }

  function endMarquee() {
    const m = marquee;
    const opts = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!m || !opts) return;
    const minX = Math.min(m.x0, m.x1);
    const maxX = Math.max(m.x0, m.x1);
    const minY = Math.min(m.y0, m.y1);
    const maxY = Math.max(m.y0, m.y1);
    // Ignore an incidental click (tiny rect) — that's handled as deselect.
    if (maxX - minX < 4 && maxY - minY < 4) {
      if (!opts.additive) onSelectionChange([]);
      return;
    }
    const hit = (
      bx0: number,
      by0: number,
      bx1: number,
      by1: number,
    ): boolean => bx0 <= maxX && bx1 >= minX && by0 <= maxY && by1 >= minY;
    const found: SelItem[] = [];
    for (const d of desks) {
      const { w, h } = deskBox(d);
      if (hit(d.x, d.y, d.x + w, d.y + h)) found.push({ kind: "desk", id: d.id });
    }
    for (const f of fixtures) {
      if (hit(f.x, f.y, f.x + f.width, f.y + f.height))
        found.push({ kind: "fixture", id: f.id });
    }
    for (const z of zones) {
      const xs = z.points.map((p) => p.x);
      const ys = z.points.map((p) => p.y);
      if (
        hit(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
      )
        found.push({ kind: "zone", id: z.id });
    }
    if (opts.additive) {
      const merged = [...selection];
      for (const it of found)
        if (!merged.some((s) => s.kind === it.kind && s.id === it.id))
          merged.push(it);
      onSelectionChange(merged);
    } else {
      onSelectionChange(found);
    }
  }

  // Angle (deg, 0 = pointing up, clockwise) from the fixture centre to the
  // pointer; Shift snaps to 15° increments for clean orthogonal/diagonal runs.
  function rotationFor(e: React.PointerEvent) {
    if (!rotating) return 0;
    const p = toMap(e);
    let deg =
      (Math.atan2(p.x - rotating.cx, -(p.y - rotating.cy)) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    if (e.shiftKey) deg = (Math.round(deg / 15) * 15) % 360;
    return Math.round(deg);
  }

  function beginRotate(e: React.PointerEvent, f: EditFixture) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelectionChange([{ kind: "fixture", id: f.id }]);
    setRotating({
      id: f.id,
      cx: f.x + f.width / 2,
      cy: f.y + f.height / 2,
    });
  }

  function moveRotate(e: React.PointerEvent) {
    if (!rotating) return;
    onFixtureRotate(rotating.id, rotationFor(e), false);
  }

  function endRotate(e: React.PointerEvent) {
    if (!rotating) return;
    onFixtureRotate(rotating.id, rotationFor(e), true);
    setRotating(null);
  }

  // The two long-axis endpoints of a fixture, in map coords, accounting for its
  // rotation about the centre (CSS rotate). Index 0 = negative end (left/top in
  // the unrotated frame), 1 = positive end (right/bottom).
  function fixtureEnds(f: EditFixture): [Point, Point] {
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

  function beginEndDrag(e: React.PointerEvent, f: EditFixture, which: 0 | 1) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelectionChange([{ kind: "fixture", id: f.id }]);
    didDragRef.current = false;
    const horizontal = f.width >= f.height;
    setLengthDrag({
      id: f.id,
      which,
      pinned: fixtureEnds(f)[which === 1 ? 0 : 1],
      horizontal,
      thickness: horizontal ? f.height : f.width,
    });
  }

  // Nearest point on ANY part of another thin fixture within ~12 screen px
  // (zoom-independent): projecting onto each wall's centreline segment means an
  // end snaps to another wall's end (a connected run) OR to anywhere along it
  // (a T-junction), not just to its endpoints.
  function snapEnd(x: number, y: number, excludeId: string): Point | null {
    const radius = 12 / (scaleRef.current || 1);
    let best: Point | null = null;
    let bestD = radius;
    for (const f of fixtures) {
      if (f.id === excludeId || Math.min(f.width, f.height) > 20) continue;
      const [a, b] = fixtureEnds(f);
      const { point, dist } = closestPointOnSegment({ x, y }, a, b);
      if (dist <= bestD) {
        bestD = dist;
        best = point;
      }
    }
    return best;
  }

  // Drag one end of a thin fixture: the pinned end stays put while the wall
  // re-aims and extends toward the pointer. The free end snaps to a nearby wall
  // endpoint when close; otherwise length follows the pointer and Shift snaps
  // the angle to 15°. Length sets the long-axis size, rotation the angle.
  function endpointGeom(e: React.PointerEvent) {
    if (!lengthDrag) return null;
    const { pinned, which, horizontal, thickness } = lengthDrag;
    const p = toMap(e);
    const snap = snapEnd(p.x, p.y, lengthDrag.id);
    let dragged: Point;
    if (snap) {
      dragged = snap;
    } else {
      const reach = Math.max(16, Math.hypot(p.x - pinned.x, p.y - pinned.y));
      let ang = Math.atan2(p.y - pinned.y, p.x - pinned.x);
      if (e.shiftKey) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
      dragged = {
        x: pinned.x + reach * Math.cos(ang),
        y: pinned.y + reach * Math.sin(ang),
      };
    }
    const len = Math.max(1, Math.hypot(dragged.x - pinned.x, dragged.y - pinned.y));
    const center = {
      x: (pinned.x + dragged.x) / 2,
      y: (pinned.y + dragged.y) / 2,
    };
    // Axis pointing from the negative/top end to the positive/bottom end.
    const pos = which === 1 ? dragged : pinned;
    const neg = which === 1 ? pinned : dragged;
    const ax = pos.x - neg.x;
    const ay = pos.y - neg.y;
    const width = horizontal ? len : thickness;
    const height = horizontal ? thickness : len;
    // Solve the CSS-rotate angle that lines the local long axis up with (ax,ay).
    let rot = horizontal
      ? (Math.atan2(ay, ax) * 180) / Math.PI
      : (Math.atan2(-ax, ay) * 180) / Math.PI;
    rot = Math.round(rot);
    if (rot < 0) rot += 360;
    return {
      geom: {
        x: Math.round(center.x - width / 2),
        y: Math.round(center.y - height / 2),
        width: Math.round(width),
        height: Math.round(height),
      },
      rot,
      snap,
    };
  }

  function moveEndDrag(e: React.PointerEvent) {
    const r = endpointGeom(e);
    if (!r || !lengthDrag) return;
    didDragRef.current = true;
    setSnapAt(r.snap);
    onFixtureChange(lengthDrag.id, r.geom);
    onFixtureRotate(lengthDrag.id, r.rot, false);
  }

  function endEndDrag(e: React.PointerEvent) {
    const r = endpointGeom(e);
    if (r && lengthDrag) {
      onFixtureChange(lengthDrag.id, r.geom);
      onFixtureRotate(lengthDrag.id, r.rot, true);
    }
    setSnapAt(null);
    setLengthDrag(null);
  }

  function beginDrag(
    e: React.PointerEvent,
    zone: EditZone,
    vertex: number | null,
  ) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    didDragRef.current = false;
    if (vertex === null) {
      pick({ kind: "zone", id: zone.id }, e.shiftKey);
      captureGroup({ kind: "zone", id: zone.id });
    } else {
      // Reshaping a vertex is always single-zone.
      onSelectionChange([{ kind: "zone", id: zone.id }]);
      groupRef.current = null;
    }
    setDrag({
      zoneId: zone.id,
      vertex,
      startX: e.clientX,
      startY: e.clientY,
      origin: zone.points,
    });
  }

  // For a whole-zone translate, snap so the zone's bounding-box top-left lands
  // on the grid (mirrors how react-rnd snaps a desk's top-left); returns the
  // effective grid-aligned delta so any grouped entities move in lockstep.
  function zoneTranslate(dx: number, dy: number) {
    if (snapGrid <= 0 || !drag) return { ax: dx, ay: dy };
    const minX = Math.min(...drag.origin.map((p) => p.x));
    const minY = Math.min(...drag.origin.map((p) => p.y));
    return { ax: snap(minX + dx) - minX, ay: snap(minY + dy) - minY };
  }

  function dragZonePoints(dx: number, dy: number, round: boolean): Point[] {
    const r = round ? Math.round : (v: number) => v;
    if (!drag) return [];
    if (drag.vertex === null) {
      const { ax, ay } = zoneTranslate(dx, dy);
      return drag.origin.map((p) => ({
        x: r(clampX(p.x + ax)),
        y: r(clampY(p.y + ay)),
      }));
    }
    // A single vertex snaps to the grid directly.
    return drag.origin.map((p, i) =>
      i === drag.vertex
        ? { x: r(clampX(snap(p.x + dx))), y: r(clampY(snap(p.y + dy))) }
        : p,
    );
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    didDragRef.current = true;
    const scale = scaleRef.current || 1;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    onZoneChange(drag.zoneId, dragZonePoints(dx, dy, false));
    if (drag.vertex === null && groupRef.current) {
      const { ax, ay } = zoneTranslate(dx, dy);
      applyGroupDelta(ax, ay, false);
    }
  }

  function endDrag(e: React.PointerEvent) {
    if (!drag) return;
    const scale = scaleRef.current || 1;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    onZoneChange(drag.zoneId, dragZonePoints(dx, dy, true));
    if (drag.vertex === null && groupRef.current) {
      const { ax, ay } = zoneTranslate(dx, dy);
      applyGroupDelta(ax, ay, false);
      groupRef.current = null;
    }
    setDrag(null);
  }

  // Insert a vertex at the midpoint of edge i → i+1.
  function addVertex(zone: EditZone, edge: number) {
    const a = zone.points[edge];
    const b = zone.points[(edge + 1) % zone.points.length];
    const mid = {
      x: Math.round((a.x + b.x) / 2),
      y: Math.round((a.y + b.y) / 2),
    };
    const next = [...zone.points];
    next.splice(edge + 1, 0, mid);
    onZoneChange(zone.id, next);
  }

  // Remove a vertex (keep at least a triangle).
  function removeVertex(zone: EditZone, vertex: number) {
    if (zone.points.length <= 3) return;
    onZoneChange(
      zone.id,
      zone.points.filter((_, i) => i !== vertex),
    );
  }

  // Discs that fill the corner/elbow/T gaps so connected walls read as one run.
  const wallNodes = wallJunctions(fixtures.filter((f) => f.type === "WALL"));

  return (
    <CanvasFrame
      mapWidth={mapWidth}
      mapHeight={mapHeight}
      originX={originX}
      originY={originY}
      onViewChange={onViewChange}
      zoomable
    >
      {(scale) => {
        scaleRef.current = scale;
        return (
          <>
            {/* Background image — interactive (drag/resize) while adjusting,
                otherwise a static layer behind the plan, drawn at its own
                world-space rect so it can be lined up with the layout. */}
            {backgroundUrl &&
              (bgEdit ? (
                <Rnd
                  scale={scale}
                  lockAspectRatio
                  position={{ x: bg.x, y: bg.y }}
                  size={{ width: bg.width, height: bg.height }}
                  minWidth={40}
                  minHeight={40}
                  onDragStop={(_e, p) =>
                    onBgChange?.({
                      x: Math.round(p.x),
                      y: Math.round(p.y),
                      width: Math.round(bg.width),
                      height: Math.round(bg.height),
                    })
                  }
                  onResizeStop={(_e, _dir, ref, _delta, pos) =>
                    onBgChange?.({
                      x: Math.round(pos.x),
                      y: Math.round(pos.y),
                      width: Math.round(ref.offsetWidth),
                      height: Math.round(ref.offsetHeight),
                    })
                  }
                  style={{ zIndex: 60 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={backgroundUrl}
                    alt=""
                    draggable={false}
                    className="h-full w-full cursor-move select-none rounded ring-2 ring-brand"
                    style={{ objectFit: "fill" }}
                  />
                </Rnd>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={backgroundUrl}
                  alt=""
                  className="pointer-events-none absolute object-contain"
                  style={{
                    left: bg.x,
                    top: bg.y,
                    width: bg.width,
                    height: bg.height,
                    zIndex: 0,
                  }}
                />
              ))}

            {/* Snap grid overlay (world-space, so it scales with zoom). */}
            {snapGrid > 0 && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: originX,
                  top: originY,
                  width: mapWidth,
                  height: mapHeight,
                  zIndex: 1,
                  backgroundPosition: `${-originX}px ${-originY}px`,
                  backgroundImage:
                    "repeating-linear-gradient(0deg, transparent 0, transparent " +
                    `${snapGrid - 1}px, rgba(13,148,136,0.10) ${snapGrid - 1}px, rgba(13,148,136,0.10) ${snapGrid}px),` +
                    "repeating-linear-gradient(90deg, transparent 0, transparent " +
                    `${snapGrid - 1}px, rgba(13,148,136,0.10) ${snapGrid - 1}px, rgba(13,148,136,0.10) ${snapGrid}px)`,
                }}
              />
            )}

            {/* Entities layer — made inert while the background is being
                adjusted so only the image responds to the pointer. */}
            <div
              className={bgEdit ? "pointer-events-none" : undefined}
              style={{ position: "absolute", inset: 0 }}
            >
            {/* Empty-canvas catcher: left-drag draws a marquee, click deselects. */}
            <div
              className="absolute"
              style={{
                left: originX,
                top: originY,
                width: mapWidth,
                height: mapHeight,
                zIndex: 0,
              }}
              onPointerDown={beginMarquee}
              onPointerMove={moveMarquee}
              onPointerUp={endMarquee}
            />

            {marquee && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-brand"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                  background: "rgba(13,148,136,0.12)",
                  zIndex: 50,
                }}
              />
            )}

            <svg
              ref={originRef}
              className="absolute left-0 top-0"
              width={mapWidth}
              height={mapHeight}
              style={{ pointerEvents: "none", zIndex: 1, overflow: "visible" }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
            >
              {zones.map((z) => {
                const v = zoneVisual(z.type);
                const selected = sel("zone", z.id);
                const anchor = labelAnchor(z.points);
                return (
                  <g key={z.id}>
                    <polygon
                      points={pointsToAttr(z.points)}
                      fill={v.tint}
                      stroke={v.color}
                      strokeWidth={2}
                      strokeDasharray={selected ? undefined : "6 4"}
                      style={{ cursor: "move", pointerEvents: "all" }}
                      onPointerDown={(e) => beginDrag(e, z, null)}
                    />

                    <foreignObject
                      x={anchor.x + 8}
                      y={anchor.y + 8}
                      width={Math.max(60, z.name.length * 8 + 24)}
                      height={24}
                      style={{ pointerEvents: "none" }}
                    >
                      <span
                        className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: v.color, color: "#fff" }}
                      >
                        {z.name}
                      </span>
                    </foreignObject>

                    {/* Edit handles only on the selected zone. */}
                    {selected && (
                      <>
                        {/* Midpoint "+" markers — click to add a vertex. */}
                        {z.points.map((p, i) => {
                          const b = z.points[(i + 1) % z.points.length];
                          const mx = (p.x + b.x) / 2;
                          const my = (p.y + b.y) / 2;
                          return (
                            <g
                              key={`mid-${i}`}
                              style={{ cursor: "copy", pointerEvents: "all" }}
                              onClick={() => addVertex(z, i)}
                            >
                              <circle
                                cx={mx}
                                cy={my}
                                r={6}
                                fill="#fff"
                                stroke={v.color}
                                strokeWidth={1.5}
                              />
                              <line
                                x1={mx - 3}
                                y1={my}
                                x2={mx + 3}
                                y2={my}
                                stroke={v.color}
                                strokeWidth={1.5}
                              />
                              <line
                                x1={mx}
                                y1={my - 3}
                                x2={mx}
                                y2={my + 3}
                                stroke={v.color}
                                strokeWidth={1.5}
                              />
                            </g>
                          );
                        })}

                        {/* Vertex handles — drag to reshape, double-click to remove. */}
                        {z.points.map((p, i) => (
                          <circle
                            key={`v-${i}`}
                            cx={p.x}
                            cy={p.y}
                            r={7}
                            fill="#fff"
                            stroke={v.color}
                            strokeWidth={2.5}
                            style={{
                              cursor: "grab",
                              pointerEvents: "all",
                            }}
                            onPointerDown={(e) => beginDrag(e, z, i)}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              removeVertex(z, i);
                            }}
                          />
                        ))}
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {fixtures.map((f) => {
              const selected = sel("fixture", f.id);
              const horizontal = f.width >= f.height;
              const minW = horizontal ? 24 : 8;
              const minH = horizontal ? 8 : 24;
              // Thin elements (walls/windows) keep react-rnd resizing OFF — its
              // handles are axis-aligned and ignore rotation, so you can't extend
              // an angled wall. Instead the whole body drags and dedicated
              // endpoint handles (below) stretch it along its own axis. Solid
              // fixtures keep the default react-rnd resize.
              const thin = Math.min(f.width, f.height) <= 20;
              const enableResizing = thin ? false : undefined;
              return (
                <Rnd
                  key={f.id}
                  scale={scale}
                  enableResizing={enableResizing}
                  dragGrid={grid}
                  resizeGrid={grid}
                  size={{ width: f.width, height: f.height }}
                  position={{ x: f.x, y: f.y }}
                  minWidth={minW}
                  minHeight={minH}
                  onDragStart={(e) => {
                    didDragRef.current = false;
                    // Shift-selection is handled on click (toggle); here we only
                    // make a plain drag of an unselected item grab it.
                    if (!(e as MouseEvent).shiftKey)
                      ensureSelected({ kind: "fixture", id: f.id }, false);
                    captureGroup({ kind: "fixture", id: f.id });
                  }}
                  onDrag={(_e, data) => {
                    didDragRef.current = true;
                    const g = groupRef.current;
                    if (g) {
                      const o = g.fixtures.get(f.id);
                      if (o) applyGroupDelta(data.x - o.x, data.y - o.y, false);
                    } else if (align) {
                      const a = alignSnap(
                        { x: data.x, y: data.y, w: f.width, h: f.height },
                        { kind: "fixture", id: f.id },
                      );
                      setGuides({ x: a.gx, y: a.gy });
                    }
                  }}
                  onDragStop={(_e, p) => {
                    const g = groupRef.current;
                    groupRef.current = null;
                    setGuides(null);
                    if (!didDragRef.current) return;
                    if (g) {
                      const o = g.fixtures.get(f.id);
                      if (o)
                        applyGroupDelta(
                          Math.round(p.x) - o.x,
                          Math.round(p.y) - o.y,
                          true,
                        );
                    } else {
                      let x = Math.round(p.x);
                      let y = Math.round(p.y);
                      if (align) {
                        const a = alignSnap(
                          { x, y, w: f.width, h: f.height },
                          { kind: "fixture", id: f.id },
                        );
                        x = a.x;
                        y = a.y;
                      }
                      onFixtureChange(f.id, {
                        x,
                        y,
                        width: f.width,
                        height: f.height,
                      });
                    }
                  }}
                  onResizeStart={() => {
                    onSelectionChange([{ kind: "fixture", id: f.id }]);
                  }}
                  onResizeStop={(_e, _dir, ref, _delta, pos) =>
                    onFixtureChange(f.id, {
                      x: Math.round(pos.x),
                      y: Math.round(pos.y),
                      width: Math.round(ref.offsetWidth),
                      height: Math.round(ref.offsetHeight),
                    })
                  }
                  onClick={(e: React.MouseEvent) => {
                    if (didDragRef.current) return;
                    pick({ kind: "fixture", id: f.id }, e.shiftKey);
                  }}
                  style={{ zIndex: selected ? 28 : 10 }}
                >
                  <div
                    className="relative h-full w-full cursor-move"
                    style={{
                      transform: f.rotation
                        ? `rotate(${f.rotation}deg)`
                        : undefined,
                    }}
                  >
                    {/* Invisible grab strip so thin walls are easy to drag. */}
                    {thin && (
                      <span
                        aria-hidden
                        className="absolute"
                        style={
                          horizontal
                            ? { left: 12, right: 12, top: -9, bottom: -9 }
                            : { top: 12, bottom: 12, left: -9, right: -9 }
                        }
                      />
                    )}
                    <FixtureShape
                      type={f.type}
                      label={f.label}
                      selected={selected}
                      width={f.width}
                      height={f.height}
                      wallColor={wallColor}
                      wallOpacity={wallOpacity}
                    />
                  </div>
                </Rnd>
              );
            })}

            {/* Junction discs — fill the gap where walls meet so a run of
                connected walls reads as one fluid wall. */}
            {wallNodes.map((n, i) => (
              <div
                key={`wj-${i}`}
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: n.x - n.size / 2,
                  top: n.y - n.size / 2,
                  width: n.size,
                  height: n.size,
                  background: wallColor ?? "#334155",
                  opacity: wallOpacity ?? 1,
                  zIndex: 11,
                }}
              />
            ))}

            {/* Drag-to-rotate handle on the single selected fixture. */}
            {selection.length === 1 &&
              selection[0].kind === "fixture" &&
              (() => {
                const f = fixtures.find((x) => x.id === selection[0].id);
                if (!f) return null;
                const cx = f.x + f.width / 2;
                const cy = f.y + f.height / 2;
                const r = ((f.rotation || 0) * Math.PI) / 180;
                const dist = f.height / 2 + 30;
                const hx = cx + dist * Math.sin(r);
                const hy = cy - dist * Math.cos(r);
                return (
                  <>
                    <svg
                      className="pointer-events-none absolute left-0 top-0"
                      width={mapWidth}
                      height={mapHeight}
                      style={{ zIndex: 34, overflow: "visible" }}
                    >
                      <line
                        x1={cx}
                        y1={cy}
                        x2={hx}
                        y2={hy}
                        stroke="#0f766e"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                      />
                    </svg>
                    <div
                      className="absolute flex items-center justify-center rounded-full bg-white shadow ring-2 ring-brand"
                      style={{
                        left: hx - 12,
                        top: hy - 12,
                        width: 24,
                        height: 24,
                        zIndex: 40,
                        cursor: "grab",
                        touchAction: "none",
                      }}
                      title="Drag to rotate · hold Shift to snap to 15°"
                      onPointerDown={(e) => beginRotate(e, f)}
                      onPointerMove={moveRotate}
                      onPointerUp={endRotate}
                    >
                      <RotateCw size={13} className="text-brand-strong" />
                    </div>
                    {rotating?.id === f.id && (
                      <div
                        className="pointer-events-none absolute rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ left: hx + 16, top: hy - 8, zIndex: 41 }}
                      >
                        {Math.round(f.rotation)}°
                      </div>
                    )}
                  </>
                );
              })()}

            {/* Length (endpoint) handles on the single selected thin fixture —
                drag an end to extend/re-aim the wall along its own axis. */}
            {selection.length === 1 &&
              selection[0].kind === "fixture" &&
              (() => {
                const f = fixtures.find((x) => x.id === selection[0].id);
                if (!f || Math.min(f.width, f.height) > 20) return null;
                const ends = fixtureEnds(f);
                return (
                  <>
                    {ends.map((p, i) => (
                      <div
                        key={i}
                        className="absolute rounded-full bg-white shadow ring-2 ring-brand"
                        style={{
                          left: p.x - 8,
                          top: p.y - 8,
                          width: 16,
                          height: 16,
                          zIndex: 40,
                          cursor: "crosshair",
                          touchAction: "none",
                        }}
                        title="Drag to extend · hold Shift to snap to 15°"
                        onPointerDown={(e) => beginEndDrag(e, f, i as 0 | 1)}
                        onPointerMove={moveEndDrag}
                        onPointerUp={endEndDrag}
                      />
                    ))}
                  </>
                );
              })()}

            {/* Alignment guides — shown while dragging with "Align" on, marking
                the edge/centre line a moved element is snapping to. */}
            {guides?.x != null && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: guides.x,
                  top: originY,
                  width: 1,
                  height: mapHeight,
                  background: "#f43f5e",
                  zIndex: 45,
                }}
              />
            )}
            {guides?.y != null && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: originX,
                  top: guides.y,
                  width: mapWidth,
                  height: 1,
                  background: "#f43f5e",
                  zIndex: 45,
                }}
              />
            )}

            {/* Snap target highlight — shown while an endpoint locks onto an
                adjacent wall end. */}
            {lengthDrag && snapAt && (
              <div
                className="pointer-events-none absolute rounded-full ring-2 ring-emerald-500"
                style={{
                  left: snapAt.x - 9,
                  top: snapAt.y - 9,
                  width: 18,
                  height: 18,
                  background: "rgba(16,185,129,0.25)",
                  zIndex: 42,
                }}
              />
            )}

            {desks.map((d) => {
              const isRoom = d.type === "ROOM";
              const isTable = d.seats > 1 && !isRoom;
              const round = d.shape === "ROUND";
              const selected = sel("desk", d.id);
              const { w, h } = deskBox(d);
              const seatSize = d.seatSize || SEAT;
              const seatGap = d.seatGap ?? SEAT_GAP;
              // Show seat markers for any desk (incl. a single-seat desk, which
              // gets one chair at its front), but not for rooms.
              const slots = !isRoom
                ? seatSlots(
                    d.shape,
                    w,
                    h,
                    d.seats,
                    seatSize,
                    d.endSeats,
                    seatGap,
                    d.seatSide,
                  )
                : [];
              return (
                <Rnd
                  key={d.id}
                  scale={scale}
                  enableResizing={!isRoom}
                  dragGrid={grid}
                  resizeGrid={grid}
                  size={{ width: w, height: h }}
                  minWidth={40}
                  minHeight={36}
                  position={{ x: d.x, y: d.y }}
                  onDragStart={(e) => {
                    didDragRef.current = false;
                    if (!(e as MouseEvent).shiftKey)
                      ensureSelected({ kind: "desk", id: d.id }, false);
                    captureGroup({ kind: "desk", id: d.id });
                  }}
                  onDrag={(_e, data) => {
                    didDragRef.current = true;
                    const g = groupRef.current;
                    if (g) {
                      const o = g.desks.get(d.id);
                      if (o) applyGroupDelta(data.x - o.x, data.y - o.y, false);
                    } else if (align) {
                      const a = alignSnap(
                        { x: data.x, y: data.y, w, h },
                        { kind: "desk", id: d.id },
                      );
                      setGuides({ x: a.gx, y: a.gy });
                    }
                  }}
                  onDragStop={(_e, p) => {
                    const g = groupRef.current;
                    groupRef.current = null;
                    setGuides(null);
                    if (!didDragRef.current) return;
                    if (g) {
                      const o = g.desks.get(d.id);
                      if (o)
                        applyGroupDelta(
                          Math.round(p.x) - o.x,
                          Math.round(p.y) - o.y,
                          true,
                        );
                    } else {
                      let x = Math.round(p.x);
                      let y = Math.round(p.y);
                      if (align) {
                        const a = alignSnap(
                          { x, y, w, h },
                          { kind: "desk", id: d.id },
                        );
                        x = a.x;
                        y = a.y;
                      }
                      onDeskChange(d.id, { x, y });
                    }
                  }}
                  onResizeStart={() => {
                    onSelectionChange([{ kind: "desk", id: d.id }]);
                  }}
                  onResizeStop={(_e, _dir, ref, _delta, pos) =>
                    onDeskChange(d.id, {
                      x: Math.round(pos.x),
                      y: Math.round(pos.y),
                      width: Math.round(ref.offsetWidth),
                      height: Math.round(ref.offsetHeight),
                    })
                  }
                  onClick={(e: React.MouseEvent) => {
                    if (didDragRef.current) return;
                    pick({ kind: "desk", id: d.id }, e.shiftKey);
                  }}
                  style={{ zIndex: selected ? 30 : 20, overflow: "visible" }}
                >
                  <div
                    className={clsx(
                      "flex h-full w-full cursor-move flex-col items-center justify-center text-[11px] font-semibold shadow-sm",
                      round ? "rounded-full" : "rounded-lg",
                      selected
                        ? "ring-2 ring-brand"
                        : "border border-[#cbd5d8]",
                      !d.isAvailable && "opacity-50",
                    )}
                    style={{
                      color: "#0b2b33",
                      background: isTable ? "#eef4f4" : "#ffffff",
                      fontSize: d.fontSize || FONT,
                    }}
                  >
                    {d.name}
                    {isRoom && (
                      <span className="text-[9px] font-medium text-muted">
                        room
                      </span>
                    )}
                    {/* Seat markers (preview only — not interactive in editor). */}
                    {slots.map((p, i) => (
                      <span
                        key={i}
                        className={clsx(
                          "absolute border border-[#cbd5d8] bg-white",
                          d.seatShape === "RECT"
                            ? "rounded-[3px]"
                            : "rounded-full",
                        )}
                        style={{
                          left: p.x - seatSize / 2,
                          top: p.y - seatSize / 2,
                          width: seatSize,
                          height: seatSize,
                        }}
                      />
                    ))}
                  </div>
                </Rnd>
              );
            })}
            </div>
          </>
        );
      }}
    </CanvasFrame>
  );
}
