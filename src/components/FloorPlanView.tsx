"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { CanvasFrame } from "./CanvasFrame";
import { FixtureShape } from "./FixtureShape";
import {
  DESK_W,
  DESK_H,
  DESK_STATE_STYLE,
  layoutCanvasSize,
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

export type FixtureVM = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
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
  backgroundUrl,
  zones,
  desks,
  fixtures = [],
  onSelectDesk,
}: {
  mapWidth: number;
  mapHeight: number;
  backgroundUrl?: string | null;
  zones: ZoneVM[];
  desks: DeskVM[];
  fixtures?: FixtureVM[];
  onSelectDesk?: (id: string) => void;
}) {
  // Size the canvas to the office layout (premise size as a floor) so it shows
  // the whole plan with no arbitrary cap, matching the editor.
  const size = useMemo(
    () =>
      layoutCanvasSize(desks, zones, fixtures, {
        pad: 40,
        minWidth: mapWidth,
        minHeight: mapHeight,
      }),
    [desks, zones, fixtures, mapWidth, mapHeight],
  );

  return (
    <CanvasFrame
      mapWidth={size.width}
      mapHeight={size.height}
      originX={size.originX}
      originY={size.originY}
      zoomable
    >
      {() => (
        <>
          {backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backgroundUrl}
              alt=""
              className="pointer-events-none absolute object-contain"
              style={{
                left: size.originX,
                top: size.originY,
                width: size.width,
                height: size.height,
                zIndex: 0,
              }}
            />
          )}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={size.width}
            height={size.height}
            style={{ overflow: "visible" }}
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

          {fixtures.map((f) => (
            <div
              key={f.id}
              className="pointer-events-none absolute"
              style={{
                left: f.x,
                top: f.y,
                width: f.width,
                height: f.height,
                transform: f.rotation ? `rotate(${f.rotation}deg)` : undefined,
              }}
            >
              <FixtureShape type={f.type} label={f.label} />
            </div>
          ))}

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
