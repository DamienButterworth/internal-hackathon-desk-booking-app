"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, VolumeX, ArrowUpDown, Monitor, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import {
  FloorPlanView,
  type DeskVM,
  type ZoneVM,
  type FixtureVM,
} from "./FloorPlanView";
import { BookingDialog } from "./BookingDialog";
import { FixtureIcon } from "./FixtureIcon";
import { ZONE_META, type ZoneType } from "@/lib/types";
import { fixtureMeta, FIXTURE_TYPES } from "@/lib/fixtures";
import {
  buildDeskStateStyle,
  DEFAULT_LEGEND_COLORS,
  type DeskState,
  type LegendColors,
} from "@/lib/floor";
import { weekdayLabel } from "@/lib/time";
import type { Occupancy } from "@/app/book/page";

type Desk = {
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
  zoneType: string | null;
  tags: string[];
  isAvailable: boolean;
  description: string;
};

type Intent = "team" | "quiet" | "standing" | "monitor";

const INTENTS: {
  key: Intent;
  label: string;
  icon: typeof Users;
}[] = [
  { key: "team", label: "Near my team", icon: Users },
  { key: "quiet", label: "Quiet & free", icon: VolumeX },
  { key: "standing", label: "Standing", icon: ArrowUpDown },
  { key: "monitor", label: "Dual monitor", icon: Monitor },
];

export function BookingBoard({
  me,
  mapWidth,
  mapHeight,
  backgroundUrl,
  bg,
  wallColor,
  wallOpacity,
  zones,
  desks,
  fixtures = [],
  occupancy,
  dates,
  legendColors = DEFAULT_LEGEND_COLORS,
}: {
  me: { id: string; name: string; team: string };
  mapWidth: number;
  mapHeight: number;
  backgroundUrl?: string | null;
  bg?: { x: number; y: number; width: number; height: number };
  wallColor?: string;
  wallOpacity?: number;
  zones: ZoneVM[];
  desks: Desk[];
  fixtures?: FixtureVM[];
  occupancy: Occupancy;
  dates: string[];
  legendColors?: LegendColors;
}) {
  const router = useRouter();
  const legendStyle = useMemo(
    () => buildDeskStateStyle(legendColors),
    [legendColors],
  );
  const [date, setDate] = useState(dates[0]);
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [openSeat, setOpenSeat] = useState<{
    deskId: string;
    seatIndex: number;
  } | null>(null);
  const [suggestion, setSuggestion] = useState<{
    deskId: string;
    seatIndex: number;
    message: string;
  } | null>(null);

  const occToday = occupancy[date] ?? {};

  const matchesFilter = (d: Desk) =>
    (zoneFilter === "ALL" || d.zoneType === zoneFilter) &&
    tagFilters.every((t) => d.tags.includes(t));

  // Seat-level occupancy helpers. Single desks/rooms use seat 0.
  const seatOcc = (d: Desk) => occToday[d.id] ?? {};
  const isSeatFree = (d: Desk, i: number) => d.isAvailable && !seatOcc(d)[i];
  const freeSeats = (d: Desk) => {
    let n = 0;
    for (let i = 0; i < d.seats; i++) if (isSeatFree(d, i)) n++;
    return n;
  };
  const firstFreeSeat = (d: Desk) => {
    for (let i = 0; i < d.seats; i++) if (isSeatFree(d, i)) return i;
    return 0;
  };
  const isFree = (d: Desk) => freeSeats(d) > 0;

  // ---- Smart "find me a desk" ------------------------------------------------
  function suggest(intent: Intent) {
    const free = desks.filter((d) => d.type === "DESK" && isFree(d));
    let chosen: Desk | undefined;
    let message = "";

    if (intent === "team") {
      // Rank zones by how many teammates are in today, pick a free desk there.
      const teamByZone = new Map<string, number>();
      for (const [bid, seats] of Object.entries(occToday)) {
        const z = desks.find((d) => d.id === bid)?.zoneId;
        if (!z) continue;
        for (const occ of Object.values(seats)) {
          if (occ.team !== me.team || occ.mine) continue;
          teamByZone.set(z, (teamByZone.get(z) ?? 0) + 1);
        }
      }
      const ranked = [...teamByZone.entries()].sort((a, b) => b[1] - a[1]);
      for (const [zoneId, count] of ranked) {
        const desk = free.find((d) => d.zoneId === zoneId);
        if (desk) {
          chosen = desk;
          const zoneName = zones.find((z) => z.id === zoneId)?.name ?? "that zone";
          message = `${count} of ${me.team} ${count === 1 ? "is" : "are"} in ${zoneName} — ${desk.name} is free right next to them.`;
          break;
        }
      }
      if (!chosen && free[0]) {
        chosen = free[0];
        message = `No teammates booked yet — ${chosen.name} is a solid open desk.`;
      }
      setZoneFilter("ALL");
      setTagFilters([]);
    } else if (intent === "quiet") {
      chosen = free.find((d) => d.zoneType === "QUIET");
      setZoneFilter("QUIET");
      setTagFilters([]);
      message = chosen
        ? `${chosen.name} in the Quiet zone is free — heads-down, low noise.`
        : "";
    } else if (intent === "standing") {
      chosen = free.find((d) => d.tags.includes("standing"));
      setZoneFilter("ALL");
      setTagFilters(["standing"]);
      message = chosen ? `${chosen.name} is a free sit-stand desk.` : "";
    } else if (intent === "monitor") {
      chosen = free.find((d) => d.tags.includes("dual-monitor"));
      setZoneFilter("ALL");
      setTagFilters(["dual-monitor"]);
      message = chosen ? `${chosen.name} has a dual-monitor setup and is free.` : "";
    }

    if (chosen) {
      setSuggestion({
        deskId: chosen.id,
        seatIndex: firstFreeSeat(chosen),
        message,
      });
    } else {
      setSuggestion({
        deskId: "",
        seatIndex: 0,
        message: "Nothing free matches that right now — try another day.",
      });
    }
  }

  function clearSmart() {
    setSuggestion(null);
    setZoneFilter("ALL");
    setTagFilters([]);
  }

  // ---- Desk view models ------------------------------------------------------
  // State of one seat at a desk/table (seat 0 == a single desk or room).
  const stateOf = (
    d: Desk,
    i: number,
  ): { state: DeskState; subtitle?: string } => {
    const occ = seatOcc(d)[i];
    if (!d.isAvailable) return { state: "unavailable" };
    if (occ?.mine) return { state: "mine", subtitle: "You" };
    if (occ) return { state: "booked", subtitle: occ.name.split(" ")[0] };
    if (suggestion?.deskId === d.id && suggestion.seatIndex === i)
      return { state: "selected" };
    if (matchesFilter(d)) return { state: "available" };
    return { state: "dimmed" };
  };

  const deskVMs: DeskVM[] = useMemo(() => {
    return desks.map((d) => {
      const base = {
        id: d.id,
        name: d.name,
        type: d.type,
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height,
        shape: d.shape,
        seats: d.seats,
        seatSize: d.seatSize,
        seatGap: d.seatGap,
        seatShape: d.seatShape,
        seatSide: d.seatSide,
        fontSize: d.fontSize,
        endSeats: d.endSeats,
      };
      if (d.seats > 1 && d.type === "DESK") {
        const seatVMs = Array.from({ length: d.seats }, (_, i) => ({
          index: i,
          ...stateOf(d, i),
        }));
        return { ...base, state: "available" as DeskState, seatVMs };
      }
      const { state, subtitle } = stateOf(d, 0);
      return { ...base, state, subtitle };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desks, occToday, suggestion, zoneFilter, tagFilters]);

  const freeCount = desks
    .filter((d) => d.type === "DESK")
    .reduce((n, d) => n + freeSeats(d), 0);
  const deskTotal = desks
    .filter((d) => d.type === "DESK")
    .reduce((n, d) => n + d.seats, 0);
  const presentTags = useMemo(
    () => [...new Set(desks.flatMap((d) => d.tags))].sort(),
    [desks],
  );
  const presentZoneTypes = useMemo(
    () => [...new Set(zones.map((z) => z.type))],
    [zones],
  );
  // Fixture types actually placed on the map, in catalogue order, for the
  // legend so people know what each icon means.
  const presentFixtureTypes = useMemo(() => {
    const set = new Set(fixtures.map((f) => f.type));
    return FIXTURE_TYPES.filter((t) => set.has(t));
  }, [fixtures]);

  const openDesk = openSeat
    ? desks.find((d) => d.id === openSeat.deskId)
    : undefined;

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Book a desk</h1>
          <p className="text-sm text-muted">
            {freeCount} of {deskTotal} seats free on {weekdayLabel(date)}{" "}
            {date.slice(5)}
          </p>
        </div>
        {/* Date strip */}
        <div className="flex gap-1.5 overflow-x-auto">
          {dates.slice(0, 7).map((d) => {
            const active = d === date;
            return (
              <button
                key={d}
                onClick={() => {
                  setDate(d);
                  setSuggestion(null);
                }}
                className={clsx(
                  "flex min-w-[52px] flex-col items-center rounded-lg border px-2.5 py-1.5 text-xs transition",
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-card text-ink-soft hover:bg-surface",
                )}
              >
                <span className="font-semibold">{weekdayLabel(d)}</span>
                <span className={active ? "text-white/90" : "text-muted"}>
                  {d.slice(8)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <FloorPlanView
          mapWidth={mapWidth}
          mapHeight={mapHeight}
          backgroundUrl={backgroundUrl}
          bg={bg}
          wallColor={wallColor}
          wallOpacity={wallOpacity}
          zones={zones}
          desks={deskVMs}
          fixtures={fixtures}
          legendColors={legendColors}
          onSelectSeat={(deskId, seatIndex) => setOpenSeat({ deskId, seatIndex })}
        />

        <aside className="space-y-4">
          {/* Smart finder */}
          <div className="card p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Sparkles size={15} className="text-brand" />
              Find me a desk
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {INTENTS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => suggest(key)}
                  className="btn btn-ghost justify-start"
                >
                  <Icon size={14} className="text-brand" />
                  {label}
                </button>
              ))}
            </div>
            {suggestion && (
              <div className="mt-3 rounded-lg bg-brand-tint p-3 text-sm text-brand-strong">
                <div className="flex items-start justify-between gap-2">
                  <p>{suggestion.message}</p>
                  <button onClick={clearSmart} className="shrink-0">
                    <X size={14} />
                  </button>
                </div>
                {suggestion.deskId && (
                  <button
                    className="btn btn-primary mt-2 w-full"
                    onClick={() =>
                      setOpenSeat({
                        deskId: suggestion.deskId,
                        seatIndex: suggestion.seatIndex,
                      })
                    }
                  >
                    Book it
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="card p-4">
            <h3 className="label mb-2">Zone</h3>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setZoneFilter("ALL")}
                className={clsx(
                  "chip cursor-pointer",
                  zoneFilter === "ALL" && "border-brand bg-brand-tint text-brand-strong",
                )}
              >
                All
              </button>
              {presentZoneTypes.map((t) => {
                const meta = ZONE_META[(t as ZoneType)];
                return (
                  <button
                    key={t}
                    onClick={() => setZoneFilter(t === zoneFilter ? "ALL" : t)}
                    className={clsx(
                      "chip cursor-pointer",
                      zoneFilter === t && "border-brand bg-brand-tint text-brand-strong",
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: meta?.color }}
                    />
                    {meta?.label ?? t}
                  </button>
                );
              })}
            </div>

            <h3 className="label mb-2 mt-4">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {presentTags.map((t) => {
                const on = tagFilters.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() =>
                      setTagFilters((f) =>
                        on ? f.filter((x) => x !== t) : [...f, t],
                      )
                    }
                    className={clsx(
                      "chip cursor-pointer",
                      on && "border-brand bg-brand-tint text-brand-strong",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="card p-4">
            <h3 className="label mb-2">Desk status</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft">
              <Legend
                fill={legendStyle.available.bg}
                border={legendStyle.available.border}
                label="Free"
              />
              <Legend
                fill={legendStyle.booked.bg}
                border={legendStyle.booked.border}
                label="Taken"
              />
              <Legend
                fill={legendStyle.mine.bg}
                border={legendStyle.mine.border}
                label="Yours"
              />
              <Legend
                fill={legendStyle.unavailable.bg}
                border={legendStyle.unavailable.border}
                label="Unavailable"
              />
            </div>

            {presentZoneTypes.length > 0 && (
              <>
                <h3 className="label mb-2 mt-4">Zones</h3>
                <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft">
                  {presentZoneTypes.map((t) => {
                    const meta = ZONE_META[t as ZoneType];
                    return (
                      <span key={t} className="flex items-center gap-1.5">
                        <span
                          className="h-3 w-3 rounded-sm border"
                          style={{
                            background: meta?.tint,
                            borderColor: meta?.color,
                          }}
                        />
                        {meta?.label ?? t}
                      </span>
                    );
                  })}
                </div>
              </>
            )}

            {presentFixtureTypes.length > 0 && (
              <>
                <h3 className="label mb-2 mt-4">On the map</h3>
                <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft">
                  {presentFixtureTypes.map((t) => (
                    <FixtureLegend key={t} type={t} />
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {openDesk && openSeat && (
        <BookingDialog
          desk={openDesk}
          me={me}
          date={date}
          seatIndex={openSeat.seatIndex}
          alreadyMine={!!seatOcc(openDesk)[openSeat.seatIndex]?.mine}
          onClose={() => setOpenSeat(null)}
          onBooked={() => {
            setOpenSeat(null);
            setSuggestion(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Legend({
  fill,
  border,
  label,
}: {
  fill: string;
  border: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded"
        style={{
          background: fill,
          border: `1.5px solid ${border}`,
        }}
      />
      {label}
    </span>
  );
}

// One legend row for a fixture type, mirroring how it's drawn on the map:
// walls/windows as a coloured bar, everything else as its icon glyph.
function FixtureLegend({ type }: { type: string }) {
  const m = fixtureMeta(type);
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded"
        style={{
          background: m.kind === "icon" ? m.fill ?? "#fff" : "transparent",
          border: m.kind === "icon" ? `1.5px solid ${m.color}` : undefined,
          color: m.color,
        }}
      >
        {m.kind === "wall" ? (
          <span
            className="h-1.5 w-4 rounded-sm"
            style={{ background: m.color }}
          />
        ) : m.kind === "window" ? (
          <span
            className="h-2.5 w-4 rounded-sm border-2"
            style={{
              borderColor: m.color,
              background: "rgba(56,189,248,0.18)",
            }}
          />
        ) : (
          <FixtureIcon name={m.icon} size={12} />
        )}
      </span>
      {m.label}
    </span>
  );
}
