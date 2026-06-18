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
