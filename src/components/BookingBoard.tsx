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
import { ZONE_META, type ZoneType } from "@/lib/types";
import type { DeskState } from "@/lib/floor";
import { weekdayLabel } from "@/lib/time";
import type { Occupancy } from "@/app/book/page";

type Desk = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
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
  zones,
  desks,
  fixtures = [],
  occupancy,
  dates,
}: {
  me: { id: string; name: string; team: string };
  mapWidth: number;
  mapHeight: number;
  backgroundUrl?: string | null;
  zones: ZoneVM[];
  desks: Desk[];
  fixtures?: FixtureVM[];
  occupancy: Occupancy;
  dates: string[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(dates[0]);
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [openDeskId, setOpenDeskId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{
    deskId: string;
    message: string;
  } | null>(null);

  const occToday = occupancy[date] ?? {};

  const matchesFilter = (d: Desk) =>
    (zoneFilter === "ALL" || d.zoneType === zoneFilter) &&
    tagFilters.every((t) => d.tags.includes(t));

  const isFree = (d: Desk) => d.isAvailable && !occToday[d.id];

  // ---- Smart "find me a desk" ------------------------------------------------
  function suggest(intent: Intent) {
    const free = desks.filter((d) => d.type === "DESK" && isFree(d));
    let chosen: Desk | undefined;
    let message = "";

    if (intent === "team") {
      // Rank zones by how many teammates are in today, pick a free desk there.
      const teamByZone = new Map<string, number>();
      for (const [bid, occ] of Object.entries(occToday)) {
        if (occ.team !== me.team || occ.mine) continue;
        const z = desks.find((d) => d.id === bid)?.zoneId;
        if (z) teamByZone.set(z, (teamByZone.get(z) ?? 0) + 1);
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
      setSuggestion({ deskId: chosen.id, message });
    } else {
      setSuggestion({
        deskId: "",
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
  const deskVMs: DeskVM[] = useMemo(() => {
    return desks.map((d) => {
      const occ = occToday[d.id];
      let state: DeskState;
      let subtitle: string | undefined;
      if (!d.isAvailable) {
        state = "unavailable";
      } else if (occ?.mine) {
        state = "mine";
        subtitle = "You";
      } else if (occ) {
        state = "booked";
        subtitle = occ.name.split(" ")[0];
      } else if (suggestion?.deskId === d.id) {
        state = "selected";
      } else if (matchesFilter(d)) {
        state = "available";
      } else {
        state = "dimmed";
      }
      return { id: d.id, name: d.name, type: d.type, x: d.x, y: d.y, state, subtitle };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desks, occToday, suggestion, zoneFilter, tagFilters]);

  const freeCount = desks.filter((d) => d.type === "DESK" && isFree(d)).length;
  const deskTotal = desks.filter((d) => d.type === "DESK").length;
  const presentTags = useMemo(
    () => [...new Set(desks.flatMap((d) => d.tags))].sort(),
    [desks],
  );
  const presentZoneTypes = useMemo(
    () => [...new Set(zones.map((z) => z.type))],
    [zones],
  );

  const openDesk = desks.find((d) => d.id === openDeskId);

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Book a desk</h1>
          <p className="text-sm text-muted">
            {freeCount} of {deskTotal} desks free on {weekdayLabel(date)}{" "}
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
          zones={zones}
          desks={deskVMs}
          fixtures={fixtures}
          onSelectDesk={(id) => setOpenDeskId(id)}
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
                    onClick={() => setOpenDeskId(suggestion.deskId)}
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
            <h3 className="label mb-2">Legend</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft">
              <Legend color="#14b8a6" label="Free" />
              <Legend color="#f59e0b" label="Taken" />
              <Legend color="#0d9488" label="Yours" filled />
              <Legend color="#cbd5d8" label="Unavailable" />
            </div>
          </div>
        </aside>
      </div>

      {openDesk && (
        <BookingDialog
          desk={openDesk}
          me={me}
          date={date}
          alreadyMine={!!occToday[openDesk.id]?.mine}
          onClose={() => setOpenDeskId(null)}
          onBooked={() => {
            setOpenDeskId(null);
            setSuggestion(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Legend({
  color,
  label,
  filled,
}: {
  color: string;
  label: string;
  filled?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded"
        style={{
          background: filled ? color : "#fff",
          border: `1.5px solid ${color}`,
        }}
      />
      {label}
    </span>
  );
}
