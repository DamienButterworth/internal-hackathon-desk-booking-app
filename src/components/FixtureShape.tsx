"use client";

import { fixtureMeta } from "@/lib/fixtures";
import { FixtureIcon } from "./FixtureIcon";

// Renders the visual of a single fixture, filling its parent box (the parent
// owns position, size and rotation). Shared by the editor and the read-only
// floor view so both look identical.
export function FixtureShape({
  type,
  label,
  selected = false,
  width,
  height,
  wallColor,
  wallOpacity,
}: {
  type: string;
  label?: string;
  selected?: boolean;
  // The fixture's box size (world units). Used to scale the glyph for icon
  // fixtures so a resized element (e.g. a bigger fire extinguisher) keeps its
  // icon proportional instead of pinned at a fixed size.
  width?: number;
  height?: number;
  // Global wall appearance (applies to WALL fixtures only).
  wallColor?: string;
  wallOpacity?: number;
}) {
  const m = fixtureMeta(type);

  if (m.kind === "wall") {
    return (
      <div
        className="h-full w-full rounded-[3px]"
        style={{
          background: wallColor ?? m.color,
          opacity: wallOpacity ?? 1,
          boxShadow: selected ? `0 0 0 2px #0d9488` : undefined,
        }}
      />
    );
  }

  if (m.kind === "window") {
    return (
      <div
        className="flex h-full w-full items-center rounded-[3px] border-2"
        style={{
          borderColor: m.color,
          background: "rgba(56,189,248,0.18)",
          boxShadow: selected ? `0 0 0 2px #0d9488` : undefined,
        }}
      >
        <div className="h-[2px] w-full" style={{ background: m.color }} />
      </div>
    );
  }

  // Icon tile — the glyph scales with the box so resizing the fixture resizes
  // its icon. Leave a little headroom for a caption when one is present.
  const base = Math.min(width ?? m.w, height ?? m.h);
  const iconSize = Math.max(12, Math.round(base * (label ? 0.46 : 0.56)));
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-lg border text-center"
      style={{
        background: m.fill ?? "#ffffff",
        borderColor: selected ? "#0d9488" : m.color,
        borderWidth: selected ? 2 : 1.5,
        color: m.color,
      }}
    >
      <FixtureIcon name={m.icon} size={iconSize} />
      {label ? (
        <span className="max-w-[94%] truncate text-[9px] font-semibold leading-none">
          {label}
        </span>
      ) : null}
    </div>
  );
}
