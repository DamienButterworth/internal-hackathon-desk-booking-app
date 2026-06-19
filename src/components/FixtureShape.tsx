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
}: {
  type: string;
  label?: string;
  selected?: boolean;
}) {
  const m = fixtureMeta(type);

  if (m.kind === "wall") {
    return (
      <div
        className="h-full w-full rounded-[3px]"
        style={{
          background: m.color,
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

  // Icon tile.
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
      <FixtureIcon name={m.icon} size={20} />
      {label ? (
        <span className="max-w-[94%] truncate text-[9px] font-semibold leading-none">
          {label}
        </span>
      ) : null}
    </div>
  );
}
