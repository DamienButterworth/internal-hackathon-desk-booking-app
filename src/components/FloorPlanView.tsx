"use client";

import clsx from "clsx";
import { CanvasFrame } from "./CanvasFrame";
import {
  DESK_W,
  DESK_H,
  DESK_STATE_STYLE,
  zoneVisual,
  pointsToAttr,
  labelAnchor,
} from "@/lib/floor";
import type { DeskState, Point } from "@/lib/floor";

export type ZoneVM = {
  id: string;
  name: string;
  type: string;
  points: Point[];
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
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={mapWidth}
            height={mapHeight}
          >
            {zones.map((z) => {
              const v = zoneVisual(z.type);
              const anchor = labelAnchor(z.points);
              return (
                <g key={z.id}>
                  <polygon
                    points={pointsToAttr(z.points)}
                    fill={v.tint}
                    stroke={v.color}
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                  />
                  <foreignObject
                    x={anchor.x + 8}
                    y={anchor.y + 8}
                    width={Math.max(60, z.name.length * 8 + 24)}
                    height={24}
                  >
                    <span
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: v.color, color: "#fff" }}
                    >
                      {z.name}
                    </span>
                  </foreignObject>
                </g>
              );
            })}
          </svg>

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
