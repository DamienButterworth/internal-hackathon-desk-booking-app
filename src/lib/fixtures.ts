// Catalogue of non-bookable office layout elements (walls, doors, windows,
// toilets, fire exits, stairs, plants…). Pure data so both server actions and
// client components can import it; the icon string is resolved to a component
// in <FixtureIcon> (client-only).

export type FixtureKind = "wall" | "window" | "icon";

export type FixtureType =
  | "WALL"
  | "WINDOW"
  | "DOOR"
  | "ENTRANCE"
  | "TOILET"
  | "FIRE_EXIT"
  | "EXTINGUISHER"
  | "STAIRS"
  | "ELEVATOR"
  | "KITCHEN"
  | "COFFEE"
  | "PRINTER"
  | "PLANT"
  | "SOFA"
  | "COLUMN";

export type FixtureMeta = {
  label: string; // human label shown in the picker
  kind: FixtureKind; // how it is drawn
  icon: string; // key resolved by <FixtureIcon> (icon kind only)
  color: string; // stroke / icon colour
  fill?: string; // tile background (icon kind)
  defaultLabel?: string; // pre-filled caption when placed
  w: number; // default width in map units
  h: number; // default height in map units
};

export const FIXTURE_META: Record<FixtureType, FixtureMeta> = {
  WALL: {
    label: "Wall",
    kind: "wall",
    icon: "wall",
    color: "#334155",
    w: 200,
    h: 14,
  },
  WINDOW: {
    label: "Window",
    kind: "window",
    icon: "window",
    color: "#38bdf8",
    w: 140,
    h: 12,
  },
  DOOR: {
    label: "Door",
    kind: "icon",
    icon: "door",
    color: "#0f766e",
    fill: "#ffffff",
    w: 52,
    h: 52,
  },
  ENTRANCE: {
    label: "Entrance",
    kind: "icon",
    icon: "entrance",
    color: "#0d9488",
    fill: "#e7f6f3",
    defaultLabel: "Entrance",
    w: 64,
    h: 56,
  },
  TOILET: {
    label: "Toilet",
    kind: "icon",
    icon: "toilet",
    color: "#2563eb",
    fill: "#eef4ff",
    defaultLabel: "Restroom",
    w: 64,
    h: 64,
  },
  FIRE_EXIT: {
    label: "Fire exit",
    kind: "icon",
    icon: "fireExit",
    color: "#16a34a",
    fill: "#e9f9ef",
    defaultLabel: "Fire exit",
    w: 64,
    h: 56,
  },
  EXTINGUISHER: {
    label: "Extinguisher",
    kind: "icon",
    icon: "extinguisher",
    color: "#dc2626",
    fill: "#fdeaea",
    w: 44,
    h: 56,
  },
  STAIRS: {
    label: "Stairs",
    kind: "icon",
    icon: "stairs",
    color: "#475569",
    fill: "#f1f5f9",
    defaultLabel: "Stairs",
    w: 72,
    h: 64,
  },
  ELEVATOR: {
    label: "Elevator",
    kind: "icon",
    icon: "elevator",
    color: "#475569",
    fill: "#f1f5f9",
    defaultLabel: "Lift",
    w: 64,
    h: 64,
  },
  KITCHEN: {
    label: "Kitchen",
    kind: "icon",
    icon: "kitchen",
    color: "#ea580c",
    fill: "#fdf0e6",
    defaultLabel: "Kitchen",
    w: 72,
    h: 64,
  },
  COFFEE: {
    label: "Coffee point",
    kind: "icon",
    icon: "coffee",
    color: "#92400e",
    fill: "#f7efe6",
    defaultLabel: "Coffee",
    w: 56,
    h: 56,
  },
  PRINTER: {
    label: "Printer",
    kind: "icon",
    icon: "printer",
    color: "#475569",
    fill: "#f1f5f9",
    w: 56,
    h: 56,
  },
  PLANT: {
    label: "Plant",
    kind: "icon",
    icon: "plant",
    color: "#15803d",
    fill: "#ecf7ee",
    w: 48,
    h: 48,
  },
  SOFA: {
    label: "Sofa",
    kind: "icon",
    icon: "sofa",
    color: "#7c3aed",
    fill: "#f2edfe",
    w: 84,
    h: 56,
  },
  COLUMN: {
    label: "Column",
    kind: "icon",
    icon: "column",
    color: "#64748b",
    fill: "#e2e8f0",
    w: 40,
    h: 40,
  },
};

export const FIXTURE_TYPES = Object.keys(FIXTURE_META) as FixtureType[];

export function fixtureMeta(type: string): FixtureMeta {
  return FIXTURE_META[(type as FixtureType)] ?? FIXTURE_META.WALL;
}
