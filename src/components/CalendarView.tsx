"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  MapPin,
  Trash2,
  CalendarRange,
} from "lucide-react";
import clsx from "clsx";
import { BookingDialog } from "./BookingDialog";
import { cancelBooking } from "@/server/actions";
import { buildDeskStateStyle, type DeskState, type LegendColors } from "@/lib/floor";
import { isoDate, weekdayLabel } from "@/lib/time";
import type { Occupancy } from "@/app/book/page";

type Desk = {
  id: string;
  name: string;
  type: string;
  seats: number;
  zoneType: string | null;
  zoneName: string | null;
  tags: string[];
  isAvailable: boolean;
  description: string;
};

type MyBooking = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  seatIndex: number;
  desks: { name: string; zoneName: string | null; zoneType: string | null }[];
};

type Tab = "month" | "week" | "schedule";

// ---- date helpers ----------------------------------------------------------
function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
// Monday-based start of week.
function startOfWeek(d: Date) {
  const wd = (d.getDay() + 6) % 7;
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -wd);
}
function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
const WEEK_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({
  me,
  desks,
  occupancy,
  dates,
  myBookings,
  legendColors,
  today,
}: {
  me: { id: string; name: string; team: string };
  desks: Desk[];
  occupancy: Occupancy;
  dates: string[];
  myBookings: MyBooking[];
  legendColors: LegendColors;
  today: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("month");
  const [monthCursor, setMonthCursor] = useState(() =>
    startOfMonth(parseISO(today)),
  );
  const [weekCursor, setWeekCursor] = useState(() => startOfWeek(parseISO(today)));
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [openSeat, setOpenSeat] = useState<{
    deskId: string;
    seatIndex: number;
    date: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const style = useMemo(() => buildDeskStateStyle(legendColors), [legendColors]);

  // Window bounds (data is only loaded for these dates).
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  // ---- occupancy helpers ---------------------------------------------------
  const seatOcc = (date: string, deskId: string) =>
    occupancy[date]?.[deskId] ?? {};
  const isSeatFree = (d: Desk, date: string, i: number) =>
    d.isAvailable && !seatOcc(date, d.id)[i];
  const freeSeats = (d: Desk, date: string) => {
    let n = 0;
    for (let i = 0; i < d.seats; i++) if (isSeatFree(d, date, i)) n++;
    return n;
  };
  const firstFreeSeat = (d: Desk, date: string) => {
    for (let i = 0; i < d.seats; i++) if (isSeatFree(d, date, i)) return i;
    return 0;
  };
  // Seat index the current user holds at this desk on this date, or -1.
  const mySeat = (d: Desk, date: string) => {
    const occ = seatOcc(date, d.id);
    for (const [i, who] of Object.entries(occ)) if (who.mine) return Number(i);
    return -1;
  };

  const capacity = useMemo(
    () => desks.reduce((n, d) => n + (d.isAvailable ? d.seats : 0), 0),
    [desks],
  );
  const dayFree = (date: string) =>
    desks.reduce((n, d) => n + freeSeats(d, date), 0);
  const iBookedOn = (date: string) => desks.some((d) => mySeat(d, date) >= 0);

  const cellState = (d: Desk, date: string): DeskState => {
    if (!d.isAvailable) return "unavailable";
    if (mySeat(d, date) >= 0) return "mine";
    if (freeSeats(d, date) === 0) return "booked";
    return "available";
  };

  const inWindow = (date: string) => date >= minDate && date <= maxDate;
  const isPast = (date: string) => date < today;
  const bookable = (date: string) => inWindow(date) && !isPast(date);

  function openBooking(d: Desk, date: string, seatIndex: number) {
    setOpenSeat({ deskId: d.id, seatIndex, date });
  }

  const openDesk = openSeat ? desks.find((d) => d.id === openSeat.deskId) : null;

  // ---- month grid ----------------------------------------------------------
  const monthCells = useMemo(() => {
    const first = monthCursor;
    const lead = (first.getDay() + 6) % 7; // days before the 1st (Mon-based)
    const gridStart = addDays(first, -lead);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [monthCursor]);

  const canPrevMonth = monthCursor > startOfMonth(parseISO(minDate));
  const canNextMonth = monthCursor < startOfMonth(parseISO(maxDate));
  const canPrevWeek = weekCursor > startOfWeek(parseISO(minDate));
  const canNextWeek = addDays(weekCursor, 6) < parseISO(maxDate);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekCursor, i)),
    [weekCursor],
  );

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Calendar</h1>
          <p className="text-sm text-muted">
            Browse availability and your bookings over time.
          </p>
        </div>
        {/* Tab switch */}
        <div className="flex gap-1 rounded-xl border border-line bg-card p-1">
          {(
            [
              { key: "month", label: "Month", icon: CalendarDays },
              { key: "week", label: "Week grid", icon: LayoutGrid },
              { key: "schedule", label: "My schedule", icon: CalendarRange },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                tab === key
                  ? "bg-brand text-white"
                  : "text-ink-soft hover:bg-surface",
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "month" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <button
                className="btn btn-ghost"
                disabled={!canPrevMonth}
                onClick={() =>
                  setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
              >
                <ChevronLeft size={16} />
              </button>
              <h2 className="text-sm font-semibold text-ink">
                {monthLabel(monthCursor)}
              </h2>
              <button
                className="btn btn-ghost"
                disabled={!canNextMonth}
                onClick={() =>
                  setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEK_HEADS.map((w) => (
                <div
                  key={w}
                  className="pb-1 text-center text-[11px] font-semibold uppercase text-muted"
                >
                  {w}
                </div>
              ))}
              {monthCells.map((d) => {
                const iso = isoDate(d);
                const inMonth = d.getMonth() === monthCursor.getMonth();
                const free = inWindow(iso) ? dayFree(iso) : null;
                const mineHere = inWindow(iso) && iBookedOn(iso);
                const selected = iso === selectedDate;
                const selectable = inWindow(iso);
                return (
                  <button
                    key={iso}
                    disabled={!selectable}
                    onClick={() => setSelectedDate(iso)}
                    className={clsx(
                      "relative flex h-16 flex-col items-start rounded-lg border p-1.5 text-left transition",
                      !inMonth && "opacity-40",
                      selected
                        ? "border-brand bg-brand-tint"
                        : "border-line bg-card hover:bg-surface",
                      !selectable && "cursor-default opacity-30 hover:bg-card",
                    )}
                  >
                    <span
                      className={clsx(
                        "text-xs font-semibold",
                        iso === today ? "text-brand-strong" : "text-ink",
                      )}
                    >
                      {d.getDate()}
                    </span>
                    {free !== null && !isPast(iso) && (
                      <span
                        className={clsx(
                          "mt-auto text-[11px] font-medium",
                          free > 0 ? "text-ink-soft" : "text-muted",
                        )}
                      >
                        {free > 0 ? `${free} free` : "Full"}
                      </span>
                    )}
                    {mineHere && (
                      <span
                        className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
                        style={{ background: legendColors.yours }}
                        title="You're booked"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: legendColors.yours }}
              />
              A dot marks days you have a booking.
            </p>
          </div>

          {/* Day detail — free desks for the selected day. */}
          <aside className="card h-fit p-4">
            <h3 className="text-sm font-semibold text-ink">
              {parseISO(selectedDate).toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </h3>
            <p className="mb-3 text-xs text-muted">
              {dayFree(selectedDate)} of {capacity} seats free
            </p>
            {isPast(selectedDate) ? (
              <p className="text-sm text-muted">This day is in the past.</p>
            ) : (
              <div className="space-y-1.5">
                {desks
                  .filter((d) => d.isAvailable && freeSeats(d, selectedDate) > 0)
                  .map((d) => (
                    <button
                      key={d.id}
                      onClick={() =>
                        openBooking(d, selectedDate, firstFreeSeat(d, selectedDate))
                      }
                      className="flex w-full items-center justify-between rounded-lg border border-line p-2.5 text-left text-sm hover:bg-surface"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {d.name}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {d.zoneName ?? "No zone"}
                          {d.seats > 1
                            ? ` · ${freeSeats(d, selectedDate)}/${d.seats} free`
                            : ""}
                        </span>
                      </span>
                      <span className="btn btn-primary shrink-0 px-2.5 py-1 text-xs">
                        Book
                      </span>
                    </button>
                  ))}
                {desks.filter(
                  (d) => d.isAvailable && freeSeats(d, selectedDate) > 0,
                ).length === 0 && (
                  <p className="text-sm text-muted">No desks free this day.</p>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === "week" && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              className="btn btn-ghost"
              disabled={!canPrevWeek}
              onClick={() => setWeekCursor((w) => addDays(w, -7))}
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-sm font-semibold text-ink">
              Week of{" "}
              {weekCursor.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </h2>
            <button
              className="btn btn-ghost"
              disabled={!canNextWeek}
              onClick={() => setWeekCursor((w) => addDays(w, 7))}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card text-left text-xs font-semibold text-muted" />
                  {weekDays.map((d) => {
                    const iso = isoDate(d);
                    return (
                      <th
                        key={iso}
                        className={clsx(
                          "min-w-[68px] pb-1 text-center text-[11px] font-semibold uppercase",
                          iso === today ? "text-brand-strong" : "text-muted",
                        )}
                      >
                        {weekdayLabel(iso)}
                        <span className="block text-[10px] font-normal">
                          {d.getDate()}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {desks.map((d) => (
                  <tr key={d.id}>
                    <td className="sticky left-0 z-10 max-w-[140px] truncate bg-card pr-2 text-xs font-medium text-ink">
                      {d.name}
                      {d.zoneName && (
                        <span className="block truncate text-[10px] text-muted">
                          {d.zoneName}
                        </span>
                      )}
                    </td>
                    {weekDays.map((day) => {
                      const iso = isoDate(day);
                      const state = cellState(d, iso);
                      const s = style[state];
                      const canBook =
                        bookable(iso) &&
                        (state === "available" || state === "mine");
                      const label =
                        state === "mine"
                          ? "You"
                          : state === "unavailable"
                            ? "—"
                            : state === "booked"
                              ? d.seats > 1
                                ? "Full"
                                : (seatOcc(iso, d.id)[0]?.name.split(" ")[0] ??
                                  "Taken")
                              : d.seats > 1
                                ? `${freeSeats(d, iso)} free`
                                : "Free";
                      return (
                        <td key={iso} className="p-0">
                          <button
                            disabled={!canBook}
                            onClick={() =>
                              canBook &&
                              openBooking(
                                d,
                                iso,
                                state === "mine"
                                  ? mySeat(d, iso)
                                  : firstFreeSeat(d, iso),
                              )
                            }
                            title={`${d.name} · ${weekdayLabel(iso)} ${day.getDate()}`}
                            className={clsx(
                              "flex h-9 w-full items-center justify-center rounded text-[10px] font-semibold transition",
                              canBook && "cursor-pointer hover:brightness-95",
                              !canBook && "cursor-default",
                              isPast(iso) && "opacity-40",
                            )}
                            style={{
                              background: s.bg,
                              border: `1.5px solid ${s.border}`,
                              color: s.text,
                            }}
                          >
                            {label}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-soft">
            <LegendDot s={style.available} label="Free" />
            <LegendDot s={style.booked} label="Taken" />
            <LegendDot s={style.mine} label="Yours" />
            <LegendDot s={style.unavailable} label="Unavailable" />
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <ScheduleTab
          myBookings={myBookings.filter((b) => b.date >= today)}
          today={today}
          pending={pending}
          onCancel={(id) =>
            startTransition(async () => {
              await cancelBooking(id);
              router.refresh();
            })
          }
        />
      )}

      {openDesk && openSeat && (
        <BookingDialog
          desk={openDesk}
          me={me}
          date={openSeat.date}
          seatIndex={openSeat.seatIndex}
          alreadyMine={!!seatOcc(openSeat.date, openDesk.id)[openSeat.seatIndex]?.mine}
          onClose={() => setOpenSeat(null)}
          onBooked={() => {
            setOpenSeat(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LegendDot({
  s,
  label,
}: {
  s: { bg: string; border: string };
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded"
        style={{ background: s.bg, border: `1.5px solid ${s.border}` }}
      />
      {label}
    </span>
  );
}

function ScheduleTab({
  myBookings,
  today,
  pending,
  onCancel,
}: {
  myBookings: MyBooking[];
  today: string;
  pending: boolean;
  onCancel: (id: string) => void;
}) {
  if (myBookings.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 p-10 text-center">
        <CalendarRange size={28} className="text-muted" />
        <p className="text-sm text-muted">
          You have no upcoming bookings. Book a desk to see it here.
        </p>
      </div>
    );
  }
  // Group by date so each day reads as one calendar row.
  const byDate = new Map<string, MyBooking[]>();
  for (const b of myBookings) {
    (byDate.get(b.date) ?? byDate.set(b.date, []).get(b.date)!).push(b);
  }
  return (
    <div className="space-y-3">
      {[...byDate.entries()].map(([date, items]) => (
        <div key={date} className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarDays size={15} className="text-brand" />
            {parseISO(date).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
            {date === today && (
              <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-semibold text-brand-strong">
                Today
              </span>
            )}
          </h3>
          <div className="space-y-1.5">
            {items.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-line p-2.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                    <MapPin size={13} className="shrink-0 text-brand" />
                    {b.desks.map((d) => d.name).join(", ")}
                    {b.desks[0]?.zoneName && (
                      <span className="text-xs font-normal text-muted">
                        · {b.desks[0].zoneName}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <Clock size={12} />
                    {b.startTime}–{b.endTime}
                    <span
                      className={clsx(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        b.status === "CHECKED_IN"
                          ? "bg-brand-tint text-brand-strong"
                          : "bg-surface text-muted",
                      )}
                    >
                      {b.status === "CHECKED_IN" ? "Checked in" : "Reserved"}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => onCancel(b.id)}
                  disabled={pending}
                  className="btn btn-ghost shrink-0 text-xs"
                >
                  <Trash2 size={13} />
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
