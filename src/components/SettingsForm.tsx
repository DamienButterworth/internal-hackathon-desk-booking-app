"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, Building2, Check, Palette, RotateCcw } from "lucide-react";
import clsx from "clsx";
import {
  updateSettings,
  updatePremise,
  updateLegendColors,
} from "@/server/actions";
import {
  buildDeskStateStyle,
  DEFAULT_LEGEND_COLORS,
  type LegendColors,
} from "@/lib/floor";

const PRESETS = [1, 5, 15, 30, 60];

const LEGEND_FIELDS: { key: keyof LegendColors; label: string }[] = [
  { key: "free", label: "Free" },
  { key: "taken", label: "Taken" },
  { key: "yours", label: "Yours" },
  { key: "unavailable", label: "Unavailable" },
];

export function SettingsForm({
  premise,
  autoReleaseMinutes,
  legendColors,
  reclaimedCount,
  deskCount,
}: {
  premise: { id: string; name: string; address: string };
  autoReleaseMinutes: number;
  legendColors: LegendColors;
  reclaimedCount: number;
  deskCount: number;
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(autoReleaseMinutes);
  const [name, setName] = useState(premise.name);
  const [address, setAddress] = useState(premise.address);
  const [colors, setColors] = useState<LegendColors>(legendColors);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const preview = buildDeskStateStyle(colors);
  const previewByKey = {
    free: preview.available,
    taken: preview.booked,
    yours: preview.mine,
    unavailable: preview.unavailable,
  } satisfies Record<keyof LegendColors, (typeof preview)["available"]>;

  function save() {
    startTransition(async () => {
      await updateSettings(minutes);
      await updatePremise(premise.id, { name, address });
      await updateLegendColors(colors);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      <h1 className="text-xl font-semibold text-ink">Settings</h1>
      <p className="mb-6 text-sm text-muted">
        Tune how the office behaves. Changes apply immediately.
      </p>

      <section className="card mb-4 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <AlarmClock size={17} className="text-brand" />
          Auto-release
        </h2>
        <p className="mt-1 text-sm text-muted">
          If someone doesn&apos;t check in within this window after their start
          time, the desk is handed back automatically.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={clsx(
                "btn",
                minutes === m ? "btn-primary" : "btn-ghost",
              )}
            >
              {m} min
            </button>
          ))}
          <div className="ml-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value) || 1)}
              className="field w-20"
            />
            <span className="text-sm text-muted">minutes</span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-brand-tint p-3 text-sm text-brand-strong">
          <RotateCcw size={15} />
          <span>
            <strong>{reclaimedCount}</strong> desk-days already reclaimed from
            no-shows across {deskCount} desks. Tighten this window to recover
            more.
          </span>
        </div>
      </section>

      <section className="card mb-6 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Building2 size={17} className="text-brand" />
          Premise
        </h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className="label">Name</label>
            <input
              className="field mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Address</label>
            <input
              className="field mt-1"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="card mb-6 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Palette size={17} className="text-brand" />
          Floor-plan legend colours
        </h2>
        <p className="mt-1 text-sm text-muted">
          These colour the desks on the booking floor plan by status. Use
          distinct hues so they stay easy to tell apart.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {LEGEND_FIELDS.map(({ key, label }) => {
            const p = previewByKey[key];
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-lg border border-line p-3"
              >
                <input
                  type="color"
                  value={colors[key]}
                  onChange={(e) =>
                    setColors((c) => ({ ...c, [key]: e.target.value }))
                  }
                  className="h-9 w-9 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
                  aria-label={`${label} colour`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{label}</div>
                  <div className="font-mono text-xs uppercase text-muted">
                    {colors[key]}
                  </div>
                </div>
                {/* Live preview of how a desk in this state will look. */}
                <span
                  className="flex h-8 w-16 shrink-0 items-center justify-center rounded text-[10px] font-semibold"
                  style={{
                    background: p.bg,
                    border: `1.5px solid ${p.border}`,
                    color: p.text,
                  }}
                >
                  Desk
                </span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setColors(DEFAULT_LEGEND_COLORS)}
          className="btn btn-ghost mt-3"
        >
          <RotateCcw size={14} />
          Reset to defaults
        </button>
      </section>

      <button className="btn btn-primary" onClick={save} disabled={pending}>
        <Check size={15} />
        {saved ? "Saved" : pending ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}
