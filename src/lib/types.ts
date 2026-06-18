// Shared domain types, enums and presentation metadata for Deskly.

export type ZoneType = "QUIET" | "COLLAB" | "STANDING" | "FOCUS" | "SOCIAL";
export type BookableType = "DESK" | "ROOM";
export type BookingStatus =
  | "RESERVED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "RELEASED";
export type Role = "USER" | "ADMIN";
export type Repeat = "NONE" | "DAILY" | "WEEKLY";

// Visual identity for each zone type — colour + short label.
export const ZONE_META: Record<
  ZoneType,
  { label: string; color: string; tint: string; hint: string }
> = {
  QUIET: {
    label: "Quiet zone",
    color: "#0ea5e9",
    tint: "rgba(14,165,233,0.10)",
    hint: "Heads-down, low noise",
  },
  FOCUS: {
    label: "Focus",
    color: "#14b8a6",
    tint: "rgba(20,184,166,0.10)",
    hint: "Solo deep work",
  },
  COLLAB: {
    label: "Collaboration",
    color: "#f59e0b",
    tint: "rgba(245,158,11,0.12)",
    hint: "Talk, pair, whiteboard",
  },
  STANDING: {
    label: "Standing",
    color: "#8b5cf6",
    tint: "rgba(139,92,246,0.12)",
    hint: "Sit-stand desks",
  },
  SOCIAL: {
    label: "Social",
    color: "#ec4899",
    tint: "rgba(236,72,153,0.12)",
    hint: "Coffee, casual, breakout",
  },
};

export const ZONE_TYPES = Object.keys(ZONE_META) as ZoneType[];

// Catalogue of tags an admin can attach to a desk (contentDescriptionTags).
export const TAG_CATALOG = [
  "dual-monitor",
  "single-monitor",
  "standing",
  "window",
  "dock",
  "ergonomic-chair",
  "near-kitchen",
  "near-meeting-room",
  "power-dense",
  "accessible",
] as const;

export const STATUS_META: Record<
  BookingStatus,
  { label: string; color: string }
> = {
  RESERVED: { label: "Reserved", color: "#f59e0b" },
  CHECKED_IN: { label: "Checked in", color: "#14b8a6" },
  CHECKED_OUT: { label: "Checked out", color: "#64748b" },
  RELEASED: { label: "Auto-released", color: "#ef4444" },
};

export const TEAMS = [
  "Engineering",
  "QA",
  "Design",
  "Product",
  "Delivery",
] as const;

export function parseTags(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
