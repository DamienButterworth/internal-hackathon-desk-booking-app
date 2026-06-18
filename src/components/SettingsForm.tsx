"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, Building2, Check, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { updateSettings, updatePremise } from "@/server/actions";

const PRESETS = [1, 5, 15, 30, 60];

export function SettingsForm({
  premise,
  autoReleaseMinutes,
  reclaimedCount,
  deskCount,
}: {
  premise: { id: string; name: string; address: string };
  autoReleaseMinutes: number;
  reclaimedCount: number;
  deskCount: number;
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(autoReleaseMinutes);
  const [name, setName] = useState(premise.name);
  const [address, setAddress] = useState(premise.address);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    startTransition(async () => {
      await updateSettings(minutes);
      await updatePremise(premise.id, { name, address });
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

      <button className="btn btn-primary" onClick={save} disabled={pending}>
        <Check size={15} />
        {saved ? "Saved" : pending ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}
