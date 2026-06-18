"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Save,
  Trash2,
  Square,
  Armchair,
  Check,
  Info,
  Image as ImageIcon,
  X,
} from "lucide-react";
import clsx from "clsx";
import { FloorPlanEditor, type Selection } from "./FloorPlanEditor";
import type { Point } from "@/lib/floor";
import {
  ZONE_TYPES,
  ZONE_META,
  TAG_CATALOG,
  type ZoneType,
} from "@/lib/types";
import {
  saveLayout,
  updateBookable,
  updateZone,
  createBookable,
  createZone,
  deleteBookable,
  deleteZone,
  updatePremiseBackground,
} from "@/server/actions";

type DeskRecord = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  zoneId: string | null;
  isAvailable: boolean;
  tags: string[];
  textDescription: string;
};
type ZoneRecord = {
  id: string;
  name: string;
  type: string;
  color: string;
  points: Point[];
};

export function AdminEditor({
  premiseId,
  premiseName,
  mapWidth,
  mapHeight,
  backgroundUrl,
  initialDesks,
  initialZones,
}: {
  premiseId: string;
  premiseName: string;
  mapWidth: number;
  mapHeight: number;
  backgroundUrl: string | null;
  initialDesks: DeskRecord[];
  initialZones: ZoneRecord[];
}) {
  const router = useRouter();
  const [desks, setDesks] = useState(initialDesks);
  const [zones, setZones] = useState(initialZones);
  const [selection, setSelection] = useState<Selection>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [background, setBackground] = useState<string | null>(backgroundUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read the chosen image, downscale it to the map's coordinate space (it is
  // rendered object-contain anyway), and persist the compact data URL inline on
  // the premise. Downscaling keeps the payload well under the server-action body
  // size limit even for large source images.
  function handleBackgroundFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(
          1,
          mapWidth / img.width,
          mapHeight / img.height,
        );
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        // PNG preserves transparency for line drawings; JPEG is smaller for
        // photos. Prefer JPEG unless the source is already a PNG/SVG.
        const useJpeg = !/png|svg/i.test(file.type);
        const dataUrl = canvas.toDataURL(
          useJpeg ? "image/jpeg" : "image/png",
          0.85,
        );
        setBackground(dataUrl);
        startTransition(() => updatePremiseBackground(premiseId, dataUrl));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function clearBackground() {
    setBackground(null);
    startTransition(() => updatePremiseBackground(premiseId, null));
  }

  // Re-sync from the server after structural changes (add/delete) refresh.
  const sig = useRef("");
  useEffect(() => {
    const next = JSON.stringify({
      d: initialDesks.map((d) => d.id),
      z: initialZones.map((z) => z.id),
    });
    if (next !== sig.current) {
      sig.current = next;
      setDesks(initialDesks);
      setZones(initialZones);
      setDirty(false);
    }
  }, [initialDesks, initialZones]);

  const selDesk =
    selection?.kind === "desk"
      ? desks.find((d) => d.id === selection.id)
      : undefined;
  const selZone =
    selection?.kind === "zone"
      ? zones.find((z) => z.id === selection.id)
      : undefined;

  function patchDesk(id: string, patch: Partial<DeskRecord>) {
    setDesks((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function patchZone(id: string, patch: Partial<ZoneRecord>) {
    setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }

  async function persistLayout() {
    await saveLayout({
      desks: desks.map((d) => ({ id: d.id, x: d.x, y: d.y })),
      zones: zones.map((z) => ({ id: z.id, points: z.points })),
    });
  }

  function handleSave() {
    startTransition(async () => {
      await persistLayout();
      setDirty(false);
    });
  }

  // For add/delete we save current positions first so drags aren't lost on refresh.
  function structural(fn: () => Promise<void>) {
    startTransition(async () => {
      if (dirty) await persistLayout();
      await fn();
      setDirty(false);
      router.refresh();
    });
  }

  const zoneOf = (id: string | null) =>
    zones.find((z) => z.id === id)?.name ?? "Unzoned";

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-ink">Floor plan editor</h1>
          <p className="text-sm text-muted">
            {premiseName} · drag desks &amp; zones, reshape zone corners, then
            save
          </p>
        </div>
        <button
          className="btn btn-ghost"
          disabled={pending}
          onClick={() =>
            structural(() =>
              createBookable({
                premiseId,
                zoneId: null,
                x: Math.round(mapWidth / 2 - 33),
                y: Math.round(mapHeight / 2 - 24),
                name: `D-${desks.length + 1}`,
              }),
            )
          }
        >
          <Armchair size={15} /> Add desk
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBackgroundFile}
        />
        <button
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon size={15} /> {background ? "Replace background" : "Background"}
        </button>
        {background && (
          <button
            className="btn btn-ghost text-danger"
            disabled={pending}
            title="Remove background image"
            onClick={clearBackground}
          >
            <X size={15} /> Clear
          </button>
        )}
        <button
          className="btn btn-ghost"
          disabled={pending}
          onClick={() =>
            structural(() =>
              createZone({
                premiseId,
                name: "New zone",
                type: "FOCUS",
                color: ZONE_META.FOCUS.color,
              }),
            )
          }
        >
          <Square size={15} /> Add zone
        </button>
        <button
          className={clsx("btn", dirty ? "btn-primary" : "btn-ghost")}
          disabled={pending || !dirty}
          onClick={handleSave}
        >
          {dirty ? <Save size={15} /> : <Check size={15} />}
          {dirty ? "Save layout" : "Saved"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <FloorPlanEditor
          mapWidth={mapWidth}
          mapHeight={mapHeight}
          backgroundUrl={background}
          zones={zones}
          desks={desks}
          selection={selection}
          onSelect={setSelection}
          onZoneChange={(id, points) => {
            patchZone(id, { points });
            setDirty(true);
          }}
          onDeskChange={(id, pos) => {
            patchDesk(id, pos);
            setDirty(true);
          }}
        />

        <aside className="card h-fit p-4">
          {!selection && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
              <Info size={20} className="text-brand" />
              Select a desk or zone to edit its details.
            </div>
          )}

          {selDesk && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink">Desk</h3>
                <button
                  className="text-danger hover:opacity-70"
                  title="Delete desk"
                  onClick={() =>
                    structural(async () => {
                      await deleteBookable(selDesk.id);
                      setSelection(null);
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div>
                <label className="label">Name</label>
                <input
                  className="field mt-1"
                  value={selDesk.name}
                  onChange={(e) => patchDesk(selDesk.id, { name: e.target.value })}
                  onBlur={(e) =>
                    updateBookable(selDesk.id, { name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Type</label>
                  <select
                    className="field mt-1"
                    value={selDesk.type}
                    onChange={(e) => {
                      patchDesk(selDesk.id, { type: e.target.value });
                      updateBookable(selDesk.id, { type: e.target.value });
                    }}
                  >
                    <option value="DESK">Desk</option>
                    <option value="ROOM">Room</option>
                  </select>
                </div>
                <div>
                  <label className="label">Zone</label>
                  <select
                    className="field mt-1"
                    value={selDesk.zoneId ?? ""}
                    onChange={(e) => {
                      const zoneId = e.target.value || null;
                      patchDesk(selDesk.id, { zoneId });
                      updateBookable(selDesk.id, { zoneId });
                    }}
                  >
                    <option value="">Unzoned</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={selDesk.isAvailable}
                  onChange={(e) => {
                    patchDesk(selDesk.id, { isAvailable: e.target.checked });
                    updateBookable(selDesk.id, { isAvailable: e.target.checked });
                  }}
                />
                Available for booking
              </label>
              <div>
                <label className="label">Tags</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {TAG_CATALOG.map((tag) => {
                    const on = selDesk.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          const tags = on
                            ? selDesk.tags.filter((t) => t !== tag)
                            : [...selDesk.tags, tag];
                          patchDesk(selDesk.id, { tags });
                          updateBookable(selDesk.id, { tags });
                        }}
                        className={clsx(
                          "chip cursor-pointer",
                          on &&
                            "border-brand bg-brand-tint text-brand-strong",
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="field mt-1 resize-none"
                  rows={2}
                  value={selDesk.textDescription}
                  onChange={(e) =>
                    patchDesk(selDesk.id, { textDescription: e.target.value })
                  }
                  onBlur={(e) =>
                    updateBookable(selDesk.id, {
                      textDescription: e.target.value,
                    })
                  }
                />
              </div>
              <p className="text-xs text-muted">In {zoneOf(selDesk.zoneId)}</p>
            </div>
          )}

          {selZone && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink">Zone</h3>
                <button
                  className="text-danger hover:opacity-70"
                  title="Delete zone"
                  onClick={() =>
                    structural(async () => {
                      await deleteZone(selZone.id);
                      setSelection(null);
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div>
                <label className="label">Name</label>
                <input
                  className="field mt-1"
                  value={selZone.name}
                  onChange={(e) => patchZone(selZone.id, { name: e.target.value })}
                  onBlur={(e) =>
                    updateZone(selZone.id, { name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Zone type</label>
                <select
                  className="field mt-1"
                  value={selZone.type}
                  onChange={(e) => {
                    const type = e.target.value as ZoneType;
                    const color = ZONE_META[type].color;
                    patchZone(selZone.id, { type, color });
                    updateZone(selZone.id, { type, color });
                  }}
                >
                  {ZONE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ZONE_META[t].label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">
                  {ZONE_META[(selZone.type as ZoneType)]?.hint}
                </p>
              </div>
              <p className="rounded-lg bg-brand-tint px-3 py-2 text-xs text-ink-soft">
                Drag corner handles to reshape. Click a{" "}
                <span className="font-semibold">+</span> on an edge to add a
                corner; double-click a corner to remove it.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
