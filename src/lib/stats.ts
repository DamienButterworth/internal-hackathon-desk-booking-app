// Pure heuristic analytics over check-in/out history. No external calls — every
// number here is derived from the bookings themselves. The "intelligence" is in
// separating *reserved* from *actually used*, and projecting forward by weekday
// seasonality nudged by a recent-vs-older trend.

import { ZONE_META, type ZoneType } from "./types";
import { todayIso, isoDate, WEEKDAYS } from "./time";

export type StatBooking = {
  date: string;
  status: string;
  zoneType: string | null;
};

export type Stats = ReturnType<typeof computeStats>;

const WORKDAYS = [1, 2, 3, 4, 5]; // Mon..Fri

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function computeStats(bookings: StatBooking[], capacity: number) {
  const today = todayIso();
  const past = bookings.filter((b) => b.date < today);
  const isCheckedIn = (s: string) => s === "CHECKED_IN" || s === "CHECKED_OUT";

  // ---- Per-date aggregates (historical) ----
  const byDate = new Map<string, { reserved: number; checkedIn: number }>();
  for (const b of past) {
    const e = byDate.get(b.date) ?? { reserved: 0, checkedIn: 0 };
    e.reserved += 1;
    if (isCheckedIn(b.status)) e.checkedIn += 1;
    byDate.set(b.date, e);
  }

  const released = past.filter((b) => b.status === "RELEASED").length;
  const totalPast = past.length || 1;
  const noShowRate = released / totalPast;

  const dayEntries = [...byDate.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const avgCheckins = mean(dayEntries.map(([, e]) => e.checkedIn));
  const avgReserved = mean(dayEntries.map(([, e]) => e.reserved));

  // ---- Weekday seasonality (Mon..Fri averages) ----
  const weekday = WORKDAYS.map((dow) => {
    const days = dayEntries.filter(([d]) => weekdayNum(d) === dow);
    const reserved = mean(days.map(([, e]) => e.reserved));
    const checkedIn = mean(days.map(([, e]) => e.checkedIn));
    return {
      day: WEEKDAYS[dow],
      dow,
      reserved: round(reserved),
      checkedIn: round(checkedIn),
      utilPct: capacity ? Math.round((checkedIn / capacity) * 100) : 0,
    };
  });

  // ---- Zone breakdown ----
  const zoneAgg = new Map<
    string,
    { reserved: number; checkedIn: number; released: number }
  >();
  for (const b of past) {
    const key = b.zoneType ?? "UNZONED";
    const e = zoneAgg.get(key) ?? { reserved: 0, checkedIn: 0, released: 0 };
    e.reserved += 1;
    if (isCheckedIn(b.status)) e.checkedIn += 1;
    if (b.status === "RELEASED") e.released += 1;
    zoneAgg.set(key, e);
  }
  const zones = [...zoneAgg.entries()]
    .map(([type, e]) => {
      const meta = ZONE_META[(type as ZoneType)];
      return {
        type,
        label: meta?.label ?? "Unzoned",
        color: meta?.color ?? "#94a3a8",
        reserved: e.reserved,
        checkedIn: e.checkedIn,
        noShowPct: e.reserved ? Math.round((e.released / e.reserved) * 100) : 0,
        usePct: e.reserved ? Math.round((e.checkedIn / e.reserved) * 100) : 0,
      };
    })
    .sort((a, b) => b.reserved - a.reserved);

  // ---- Daily trend (last 21 days) ----
  const trend = dayEntries.slice(-21).map(([date, e]) => ({
    date,
    label: date.slice(5),
    reserved: e.reserved,
    checkedIn: e.checkedIn,
  }));

  // ---- Forecast next 7 weekdays ----
  // weekday baseline nudged by recent (last 2wks) vs older check-in trend.
  const recent = dayEntries.slice(-10).map(([, e]) => e.checkedIn);
  const older = dayEntries.slice(-20, -10).map(([, e]) => e.checkedIn);
  const trendRatio = clamp(
    older.length && mean(older) > 0 ? mean(recent) / mean(older) : 1,
    0.8,
    1.3,
  );
  const wdMap = new Map(weekday.map((w) => [w.dow, w.checkedIn]));

  const projection: {
    date: string;
    label: string;
    forecast: number;
    low: number;
    high: number;
    capacity: number;
  }[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (projection.length < 7) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (!WORKDAYS.includes(dow)) continue;
    const base = (wdMap.get(dow) ?? avgCheckins) * trendRatio;
    const f = Math.min(capacity, Math.round(base));
    projection.push({
      date: isoDate(cursor),
      label: `${WEEKDAYS[dow]} ${isoDate(cursor).slice(8)}`,
      forecast: f,
      low: Math.max(0, Math.round(f * 0.82)),
      high: Math.min(capacity, Math.round(f * 1.18)),
      capacity,
    });
  }

  // ---- Derived KPIs ----
  const ghostDeskDays = released; // reserved-but-never-used desk-days
  const reclaimablePerWeek = Math.round((released / Math.max(1, dayEntries.length)) * 5);
  const peakWeekday = [...weekday].sort((a, b) => b.utilPct - a.utilPct)[0];
  const slackVsReserved = Math.round(avgReserved - avgCheckins);

  const kpis = {
    pastBookings: past.length,
    noShowRatePct: Math.round(noShowRate * 100),
    avgCheckins: round(avgCheckins),
    avgUtilPct: capacity ? Math.round((avgCheckins / capacity) * 100) : 0,
    ghostDeskDays,
    reclaimablePerWeek,
    slackVsReserved,
  };

  // ---- Rule-based recommendations ----
  const recommendations: {
    title: string;
    detail: string;
    severity: "high" | "med" | "info";
  }[] = [];

  if (kpis.noShowRatePct >= 15) {
    recommendations.push({
      title: `${kpis.noShowRatePct}% of bookings are no-shows`,
      detail: `That's ~${reclaimablePerWeek} desk-days a week sitting empty but marked full. A tighter auto-release window would hand most of them back automatically.`,
      severity: "high",
    });
  }
  if (peakWeekday && peakWeekday.utilPct >= 85) {
    recommendations.push({
      title: `${peakWeekday.day} runs hot at ${peakWeekday.utilPct}% real occupancy`,
      detail: `Mid-week peaks are near capacity. Encourage spillover to lighter days or open an overflow zone for ${peakWeekday.day}s.`,
      severity: "med",
    });
  }
  const coldZone = zones
    .filter((z) => z.reserved >= 5)
    .sort((a, b) => a.usePct - b.usePct)[0];
  if (coldZone && coldZone.usePct < 60) {
    recommendations.push({
      title: `${coldZone.label} is under-used (${coldZone.usePct}% of its bookings get used)`,
      detail: `People reserve here then don't turn up. Consider shrinking it or converting a few desks to ${coldZone.type === "QUIET" ? "collaboration" : "quiet"} space.`,
      severity: "med",
    });
  }
  if (slackVsReserved >= 2) {
    recommendations.push({
      title: `You could run with ~${slackVsReserved} fewer desks`,
      detail: `On an average day, ${slackVsReserved} more desks are reserved than actually used. Real demand is lower than the booking sheet suggests.`,
      severity: "info",
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      title: "Healthy utilisation",
      detail: "No-shows are low and demand is well spread across the week.",
      severity: "info",
    });
  }

  return { kpis, weekday, zones, trend, projection, recommendations };
}

function weekdayNum(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
}
function round(n: number) {
  return Math.round(n * 10) / 10;
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
