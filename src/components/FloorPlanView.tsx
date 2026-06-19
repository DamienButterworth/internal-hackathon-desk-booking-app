"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { CanvasFrame } from "./CanvasFrame";
import { FixtureShape } from "./FixtureShape";
import {
  DESK_STATE_STYLE,
  SEAT,
  SEAT_GAP,
  FONT,
  deskBox,
  seatSlots,
  layoutCanvasSize,
  zoneVisual,
  pointsToAttr,
  labelAnchor,
  wallJunctions,
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

export type SeatVM = { index: number; state: DeskState; subtitle?: string };
export type DeskVM = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  shape?: string;
  seats?: number;
  seatSize?: number;
  seatGap?: number;
  seatShape?: string;
  seatSide?: string;
  fontSize?: number;
  endSeats?: boolean;
  state: DeskState;
  subtitle?: string;
  // Present (length === seats) for multi-person tables.
  seatVMs?: SeatVM[];
};

export function FloorPlanView({
  mapWidth,
  mapHeight,
  backgroundUrl,
  bg,
  zones,
  desks,
  fixtures = [],
  wallColor,
  wallOpacity,
  onSelectSeat,
}: {
  mapWidth: number;
  mapHeight: number;
  backgroundUrl?: string | null;
  bg?: { x: number; y: number; width: number; height: number };
  zones: ZoneVM[];
  desks: DeskVM[];
  fixtures?: FixtureVM[];
  // Global wall appearance.
  wallColor?: string;
  wallOpacity?: number;
  onSelectSeat?: (id: string, seatIndex: number) => void;
}) {
  // Size the canvas tightly around the actual content (desks/zones/fixtures and
  // the background image) so the plan is maximised in the view — no premise-box
  // floor and no forced origin, which previously left empty margins.
  const size = useMemo(
    () =>
      layoutCanvasSize(desks, zones, fixtures, {
        pad: 24,
        seedOrigin: false,
        extra: backgroundUrl && bg ? [bg] : [],
        minWidth: mapWidth,
        minHeight: mapHeight,
      }),
    [desks, zones, fixtures, bg, backgroundUrl, mapWidth, mapHeight],
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
                left: bg?.x ?? size.originX,
                top: bg?.y ?? size.originY,
                width: bg?.width ?? size.width,
                height: bg?.height ?? size.height,
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

          {/* Walls drawn first (behind icon fixtures) in a single group:
              connected segments plus the junction discs read as one fluid
              wall, and the global opacity is applied once to the whole run so
              overlaps don't double up. */}
          {(() => {
            const walls = fixtures.filter((f) => f.type === "WALL");
            if (walls.length === 0) return null;
            const color = wallColor ?? "#334155";
            const nodes = wallJunctions(walls);
            return (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ opacity: wallOpacity ?? 1 }}
              >
                {walls.map((f) => (
                  <div
                    key={f.id}
                    className="absolute"
                    style={{
                      left: f.x,
                      top: f.y,
                      width: f.width,
                      height: f.height,
                      transform: f.rotation
                        ? `rotate(${f.rotation}deg)`
                        : undefined,
                    }}
                  >
                    <FixtureShape type={f.type} wallColor={color} wallOpacity={1} />
                  </div>
                ))}
                {nodes.map((n, i) => (
                  <div
                    key={`wj-${i}`}
                    className="absolute rounded-full"
                    style={{
                      left: n.x - n.size / 2,
                      top: n.y - n.size / 2,
                      width: n.size,
                      height: n.size,
                      background: color,
                    }}
                  />
                ))}
              </div>
            );
          })()}

          {/* Non-wall fixtures (doors, plants, icons…) — each at its own
              opacity, on top of the walls. */}
          {fixtures
            .filter((f) => f.type !== "WALL")
            .map((f) => (
              <div
                key={f.id}
                className="pointer-events-none absolute"
                style={{
                  left: f.x,
                  top: f.y,
                  width: f.width,
                  height: f.height,
                  transform: f.rotation
                    ? `rotate(${f.rotation}deg)`
                    : undefined,
                }}
              >
                <FixtureShape
                  type={f.type}
                  label={f.label}
                  width={f.width}
                  height={f.height}
                  wallColor={wallColor}
                  wallOpacity={wallOpacity}
                />
              </div>
            ))}

          {desks.map((d) => {
            const { w, h } = deskBox(d);
            const seats = d.seats ?? 1;
            const seatSize = d.seatSize || SEAT;
            const seatGap = d.seatGap ?? SEAT_GAP;
            const fontSize = d.fontSize || FONT;
            // Chair marker shape: a circle (sphere) or a rounded rectangle.
            const seatRounded =
              d.seatShape === "RECT" ? "rounded-[3px]" : "rounded-full";

            // Multi-person table: a passive surface ringed by bookable seats.
            if (seats > 1 && d.type !== "ROOM") {
              const round = d.shape === "ROUND";
              const slots = seatSlots(
                d.shape ?? "RECT",
                w,
                h,
                seats,
                seatSize,
                d.endSeats,
                seatGap,
              );
              return (
                <div
                  key={d.id}
                  className="absolute"
                  style={{ left: d.x, top: d.y, width: w, height: h }}
                >
                  <div
                    className={clsx(
                      "flex h-full w-full items-center justify-center text-center text-[11px] font-semibold shadow-sm",
                      round ? "rounded-full" : "rounded-xl",
                    )}
                    style={{
                      background: "#eef4f4",
                      border: "1.5px solid #cbd5d8",
                      color: "#0b2b33",
                      fontSize,
                    }}
                  >
                    {d.name}
                  </div>
                  {(d.seatVMs ?? []).map((seat, i) => {
                    const p = slots[i];
                    if (!p) return null;
                    const ss = DESK_STATE_STYLE[seat.state];
                    const interactive =
                      seat.state === "available" ||
                      seat.state === "mine" ||
                      seat.state === "selected";
                    return (
                      <button
                        key={seat.index}
                        disabled={!interactive || !onSelectSeat}
                        onClick={() => onSelectSeat?.(d.id, seat.index)}
                        title={
                          seat.subtitle
                            ? `Seat ${seat.index + 1} · ${seat.subtitle}`
                            : `Seat ${seat.index + 1}`
                        }
                        className={clsx(
                          "absolute flex items-center justify-center text-[9px] font-bold shadow-sm transition",
                          seatRounded,
                          interactive &&
                            onSelectSeat &&
                            "cursor-pointer hover:scale-110 hover:shadow-md",
                          !interactive && "cursor-default",
                        )}
                        style={{
                          left: p.x - seatSize / 2,
                          top: p.y - seatSize / 2,
                          width: seatSize,
                          height: seatSize,
                          fontSize: Math.max(8, Math.round(seatSize * 0.45)),
                          background: ss.bg,
                          border: `1.5px solid ${ss.border}`,
                          color: ss.text,
                        }}
                      >
                        {seat.index + 1}
                      </button>
                    );
                  })}
                </div>
              );
            }

            // Single desk / room.
            const s = DESK_STATE_STYLE[d.state];
            const interactive =
              d.state === "available" ||
              d.state === "mine" ||
              d.state === "selected";
            // A single desk shows one chair at its front (rooms don't).
            const seatPos =
              d.type === "DESK"
                ? seatSlots(
                    d.shape ?? "RECT",
                    w,
                    h,
                    1,
                    seatSize,
                    false,
                    seatGap,
                    d.seatSide,
                  )[0]
                : null;
            return (
              <button
                key={d.id}
                disabled={!interactive || !onSelectSeat}
                onClick={() => onSelectSeat?.(d.id, 0)}
                className={clsx(
                  "absolute flex flex-col items-center justify-center rounded-lg text-[11px] font-semibold shadow-sm transition",
                  interactive &&
                    onSelectSeat &&
                    "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
                  !interactive && "cursor-default",
                )}
                style={{
                  left: d.x,
                  top: d.y,
                  width: w,
                  height: h,
                  background: s.bg,
                  border: `1.5px solid ${s.border}`,
                  color: s.text,
                  fontSize,
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
                {seatPos && (
                  <span
                    aria-hidden
                    className={clsx(
                      "pointer-events-none absolute",
                      seatRounded,
                    )}
                    style={{
                      left: seatPos.x - seatSize / 2,
                      top: seatPos.y - seatSize / 2,
                      width: seatSize,
                      height: seatSize,
                      background: s.bg,
                      border: `1.5px solid ${s.border}`,
                    }}
                  />
                )}
              </button>
            );
          })}
        </>
      )}
    </CanvasFrame>
  );
}
