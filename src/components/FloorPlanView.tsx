"use client";

import clsx from "clsx";
import { CanvasFrame } from "./CanvasFrame";
import { DESK_W, DESK_H, DESK_STATE_STYLE, zoneVisual } from "@/lib/floor";
import type { DeskState } from "@/lib/floor";

export type ZoneVM = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DeskVM = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  state: DeskState;
  subtitle?: string;
};

export function FloorPlanView({
  mapWidth,
  mapHeight,
  zones,
  desks,
  onSelectDesk,
}: {
  mapWidth: number;
  mapHeight: number;
  zones: ZoneVM[];
  desks: DeskVM[];
  onSelectDesk?: (id: string) => void;
}) {
  return (
    <CanvasFrame mapWidth={mapWidth} mapHeight={mapHeight}>
      {() => (
        <>
          {zones.map((z) => {
            const v = zoneVisual(z.type);
            return (
              <div
                key={z.id}
                className="absolute rounded-xl"
                style={{
                  left: z.x,
                  top: z.y,
                  width: z.width,
                  height: z.height,
                  background: v.tint,
                  border: `1.5px dashed ${v.color}`,
                }}
              >
                <span
                  className="absolute left-3 top-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: v.color, color: "#fff" }}
                >
                  {z.name}
                </span>
              </div>
            );
          })}

          {desks.map((d) => {
            const s = DESK_STATE_STYLE[d.state];
            const interactive =
              d.state === "available" ||
              d.state === "mine" ||
              d.state === "selected";
            const isRoom = d.type === "ROOM";
            return (
              <button
                key={d.id}
                disabled={!interactive || !onSelectDesk}
                onClick={() => onSelectDesk?.(d.id)}
                className={clsx(
                  "absolute flex flex-col items-center justify-center rounded-lg text-[11px] font-semibold shadow-sm transition",
                  interactive &&
                    onSelectDesk &&
                    "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
                  !interactive && "cursor-default",
                )}
                style={{
                  left: d.x,
                  top: d.y,
                  width: isRoom ? DESK_W + 60 : DESK_W,
                  height: isRoom ? DESK_H + 70 : DESK_H,
                  background: s.bg,
                  border: `1.5px solid ${s.border}`,
                  color: s.text,
                }}
                title={d.subtitle}
              >
                <span className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: s.dot }}
                  />
                  {d.name}
                </span>
                {d.subtitle && (
                  <span className="max-w-[90%] truncate text-[9px] font-medium opacity-80">
                    {d.subtitle}
                  </span>
                )}
              </button>
            );
          })}
        </>
      )}
    </CanvasFrame>
  );
}
