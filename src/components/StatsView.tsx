"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Ghost,
  CalendarX,
  Gauge,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import clsx from "clsx";
import type { Stats } from "@/lib/stats";

const TEAL = "#0d9488";
const AMBER = "#f59e0b";
const TINT = "#bfe7e2";

export function StatsView({
  stats,
  deskCount,
  premiseName,
}: {
  stats: Stats;
  deskCount: number;
  premiseName: string;
}) {
  const { kpis, weekday, zones, trend, projection, recommendations } = stats;

  // Band as two stacked areas (invisible base + tinted band) so it always
  // renders contiguously regardless of values.
  const forecastData = projection.map((p) => ({
    ...p,
    base: p.low,
    band: Math.max(0, p.high - p.low),
  }));

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-ink">Insights</h1>
        <p className="text-sm text-muted">
          {premiseName} · {deskCount} desks · reserved vs. actually used
        </p>
      </div>

      {/* KPI cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Gauge}
          label="Avg real occupancy"
          value={`${kpis.avgUtilPct}%`}
          sub={`${kpis.avgCheckins} desks/day checked in`}
        />
        <Kpi
          icon={CalendarX}
          label="No-show rate"
          value={`${kpis.noShowRatePct}%`}
          sub="reserved, never checked in"
          tone={kpis.noShowRatePct >= 15 ? "warn" : "ok"}
        />
        <Kpi
          icon={Ghost}
          label="Ghost desk-days"
          value={`${kpis.ghostDeskDays}`}
          sub={`~${kpis.reclaimablePerWeek}/week reclaimable`}
        />
        <Kpi
          icon={TrendingUp}
          label="Reserved vs used gap"
          value={`${kpis.slackVsReserved}`}
          sub="fewer desks could meet demand"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Forecast */}
        <div className="card p-4 lg:col-span-2">
          <ChartTitle
            icon={Sparkles}
            title="7-day occupancy forecast"
            note="weekday seasonality × recent trend, with a confidence band"
          />
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={forecastData} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid stroke="#eef3f4" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine
                y={deskCount}
                stroke="#cbd5d8"
                strokeDasharray="4 4"
                label={{ value: "capacity", fill: "#94a3a8", fontSize: 11, position: "insideTopRight" }}
              />
              <Area dataKey="base" stackId="band" stroke="none" fill="transparent" name="range" isAnimationActive={false} />
              <Area dataKey="band" stackId="band" stroke="none" fill={TINT} fillOpacity={0.6} name="range" isAnimationActive={false} />
              <Line
                dataKey="forecast"
                stroke={TEAL}
                strokeWidth={2.5}
                dot={{ r: 3, fill: TEAL }}
                name="forecast"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Daily trend */}
        <div className="card p-4">
          <ChartTitle icon={TrendingUp} title="Reserved vs used" note="last 21 days" />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid stroke="#eef3f4" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="reserved" stroke={AMBER} strokeWidth={2} dot={false} name="Reserved" isAnimationActive={false} />
              <Line dataKey="checkedIn" stroke={TEAL} strokeWidth={2} dot={false} name="Used" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Weekday */}
        <div className="card p-4">
          <ChartTitle icon={Gauge} title="By weekday" note="average desks, reserved vs used" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekday} margin={{ left: -18, right: 8, top: 8 }} barGap={2}>
              <CartesianGrid stroke="#eef3f4" vertical={false} />
              <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="reserved" fill={AMBER} radius={[3, 3, 0, 0]} name="Reserved" isAnimationActive={false} />
              <Bar dataKey="checkedIn" fill={TEAL} radius={[3, 3, 0, 0]} name="Used" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Zone usage */}
        <div className="card p-4">
          <ChartTitle icon={Gauge} title="Zone health" note="% of bookings that get used" />
          <div className="space-y-3 pt-1">
            {zones.map((z) => (
              <div key={z.type}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color }} />
                    {z.label}
                  </span>
                  <span className="text-muted">
                    {z.usePct}% used · {z.noShowPct}% no-show
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${z.usePct}%`, background: z.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="card p-4">
          <ChartTitle icon={Lightbulb} title="What the data suggests" note="auto-generated" />
          <div className="space-y-2.5 pt-1">
            {recommendations.map((r, i) => (
              <Reco key={i} {...r} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const axisTick = { fontSize: 11, fill: "#5f7178" };

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  sub: string;
  tone?: "warn" | "ok";
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon size={15} className={tone === "warn" ? "text-accent" : "text-brand"} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div
        className={clsx(
          "mt-1 text-2xl font-semibold",
          tone === "warn" ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}

function ChartTitle({
  icon: Icon,
  title,
  note,
}: {
  icon: typeof Gauge;
  title: string;
  note: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Icon size={15} className="text-brand" />
        {title}
      </h3>
      <span className="text-xs text-muted">{note}</span>
    </div>
  );
}

function Reco({
  title,
  detail,
  severity,
}: {
  title: string;
  detail: string;
  severity: "high" | "med" | "info";
}) {
  const cfg = {
    high: { icon: AlertTriangle, color: "#ef4444", bg: "rgba(239,68,68,0.08)" },
    med: { icon: Lightbulb, color: "#f59e0b", bg: "rgba(245,158,11,0.10)" },
    info: { icon: CheckCircle2, color: "#0d9488", bg: "rgba(13,148,136,0.08)" },
  }[severity];
  const Icon = cfg.icon;
  return (
    <div className="flex gap-2.5 rounded-lg p-2.5" style={{ background: cfg.bg }}>
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: cfg.color }} />
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-ink-soft">{detail}</p>
      </div>
    </div>
  );
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-0.5 font-semibold text-ink">{label}</div>
      {payload
        .filter((p) => p.name !== "range")
        .map((p) => (
          <div key={p.name} className="flex items-center gap-1.5 text-ink-soft">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}: <span className="font-medium text-ink">{p.value}</span>
          </div>
        ))}
    </div>
  );
}
