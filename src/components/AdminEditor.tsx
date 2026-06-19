"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Trash2,
  Square,
  Armchair,
  Check,
  Info,
  Image as ImageIcon,
  X,
  Shapes,
  RotateCw,
  Copy,
} from "lucide-react";
import clsx from "clsx";
import { FloorPlanEditor, type Selection } from "./FloorPlanEditor";
import type { SelItem } from "./FloorPlanEditor";
import { FixtureIcon } from "./FixtureIcon";
import { layoutCanvasSize, type Point } from "@/lib/floor";
import {
  ZONE_TYPES,
  ZONE_META,
  TAG_CATALOG,
  type ZoneType,
} from "@/lib/types";
import {
  FIXTURE_TYPES,
  FIXTURE_META,
  fixtureMeta,
  type FixtureType,
} from "@/lib/fixtures";
import {
  saveLayout,
  updateBookable,
  updateZone,
  createBookable,
  createZone,
  createFixture,
  updateFixture,
  deleteBookable,
  deleteZone,
  deleteFixture,
  duplicateBookable,
  duplicateZone,
  duplicateFixture,
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
type FixtureRecord = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export function AdminEditor({
  premiseId,
  premiseName,
  mapWidth,
  mapHeight,
  backgroundUrl,
  initialDesks,
  initialZones,
  initialFixtures,
}: {
  premiseId: string;
  premiseName: string;
  mapWidth: number;
  mapHeight: number;
  backgroundUrl: string | null;
  initialDesks: DeskRecord[];
  initialZones: ZoneRecord[];
  initialFixtures: FixtureRecord[];
}) {
  const router = useRouter();
  const [desks, setDesks] = useState(initialDesks);
  const [zones, setZones] = useState(initialZones);
  const [fixtures, setFixtures] = useState(initialFixtures);
  const [selection, setSelection] = useState<Selection>([]);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [background, setBackground] = useState<string | null>(backgroundUrl);
  const [fixtureMenu, setFixtureMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The editable canvas grows to fit whatever the entities occupy (with drag
  // room beyond them), never shrinking below the configured premise size, so
  // the office is no longer capped at a fixed box.
  const canvas = useMemo(
    () =>
      layoutCanvasSize(desks, zones, fixtures, {
        pad: 400,
        minWidth: mapWidth,
        minHeight: mapHeight,
      }),
    [desks, zones, fixtures, mapWidth, mapHeight],
  );

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
      f: initialFixtures.map((f) => f.id),
    });
    if (next !== sig.current) {
      sig.current = next;
      setDesks(initialDesks);
      setZones(initialZones);
      setFixtures(initialFixtures);
      setDirty(false);
    }
  }, [initialDesks, initialZones, initialFixtures]);

  // Detail panels show only for a single selection; 2+ shows the bulk panel.
  const only = selection.length === 1 ? selection[0] : null;
  const selDesk =
    only?.kind === "desk" ? desks.find((d) => d.id === only.id) : undefined;
  const selZone =
    only?.kind === "zone" ? zones.find((z) => z.id === only.id) : undefined;
  const selFixture =
    only?.kind === "fixture"
      ? fixtures.find((f) => f.id === only.id)
      : undefined;

  function patchDesk(id: string, patch: Partial<DeskRecord>) {
    setDesks((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function patchZone(id: string, patch: Partial<ZoneRecord>) {
    setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }
  function patchFixture(id: string, patch: Partial<FixtureRecord>) {
    setFixtures((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function persistLayout() {
    await saveLayout({
      desks: desks.map((d) => ({ id: d.id, x: d.x, y: d.y })),
      zones: zones.map((z) => ({ id: z.id, points: z.points })),
      fixtures: fixtures.map((f) => ({
        id: f.id,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        rotation: f.rotation,
      })),
    });
  }

  function addFixture(type: FixtureType) {
    const m = FIXTURE_META[type];
    setFixtureMenu(false);
    structural(() =>
      createFixture({
        premiseId,
        type,
        label: m.defaultLabel ?? "",
        x: Math.round(mapWidth / 2 - m.w / 2),
        y: Math.round(mapHeight / 2 - m.h / 2),
        width: m.w,
        height: m.h,
      }),
    );
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

  function deleteSelected() {
    if (selection.length === 0) return;
    const items = selection;
    structural(async () => {
      for (const { kind, id } of items) {
        if (kind === "desk") await deleteBookable(id);
        else if (kind === "zone") await deleteZone(id);
        else await deleteFixture(id);
      }
      setSelection([]);
    });
  }

  function duplicateSelected() {
    if (selection.length === 0) return;
    const items = selection;
    structural(async () => {
      const copies: SelItem[] = [];
      for (const { kind, id } of items) {
        const newId =
          kind === "desk"
            ? await duplicateBookable(id)
            : kind === "zone"
              ? await duplicateZone(id)
              : await duplicateFixture(id);
        if (newId) copies.push({ kind, id: newId });
      }
      if (copies.length) setSelection(copies);
    });
  }

  // Keyboard shortcuts: Delete/Backspace removes the selection, Ctrl/⌘+D
  // duplicates it. Held in a ref so the listener always runs current logic
  // (with live `selection`/state) without re-subscribing on every render.
  const shortcutRef = useRef({ del: deleteSelected, dup: duplicateSelected });
  shortcutRef.current = { del: deleteSelected, dup: duplicateSelected };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (
        t?.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select"
      ) {
        return; // don't hijack typing in the sidebar fields
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        shortcutRef.current.del();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        shortcutRef.current.dup();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        <div className="relative">
          <button
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => setFixtureMenu((o) => !o)}
          >
            <Shapes size={15} /> Add element
          </button>
          {fixtureMenu && (
            <>
              {/* click-away backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setFixtureMenu(false)}
              />
              <div className="absolute right-0 z-50 mt-1 grid w-60 grid-cols-2 gap-1 rounded-xl border border-line bg-white p-2 shadow-lg">
                {FIXTURE_TYPES.map((t) => {
                  const m = FIXTURE_META[t];
                  return (
                    <button
                      key={t}
                      onClick={() => addFixture(t)}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-ink hover:bg-brand-tint"
                    >
                      <FixtureIcon
                        name={m.icon}
                        size={15}
                        style={{ color: m.color }}
                      />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
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
          mapWidth={canvas.width}
          mapHeight={canvas.height}
          originX={canvas.originX}
          originY={canvas.originY}
          backgroundUrl={background}
          zones={zones}
          desks={desks}
          fixtures={fixtures}
          selection={selection}
          onSelectionChange={setSelection}
          onZoneChange={(id, points) => {
            patchZone(id, { points });
            setDirty(true);
          }}
          onDeskChange={(id, pos) => {
            patchDesk(id, pos);
            setDirty(true);
          }}
          onFixtureChange={(id, geom) => {
            patchFixture(id, geom);
            setDirty(true);
          }}
          onFixtureRotate={(id, rotation, commit) => {
            patchFixture(id, { rotation });
            setDirty(true);
            if (commit) updateFixture(id, { rotation });
          }}
        />

        <aside className="card h-fit p-4">
          {selection.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
              <Info size={20} className="text-brand" />
              <span>Select a desk, zone, or element to edit its details.</span>
              <span className="text-xs leading-relaxed">
                Drag on empty space to marquee-select · Shift-click to add ·
                scroll to zoom · middle-drag to pan · <kbd>Del</kbd> to delete ·{" "}
                <kbd>⌘/Ctrl+D</kbd> to duplicate.
              </span>
            </div>
          )}

          {selection.length > 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink">
                  {selection.length} selected
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    className="text-muted hover:text-ink"
                    title="Duplicate (⌘/Ctrl+D)"
                    onClick={duplicateSelected}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="text-danger hover:opacity-70"
                    title="Delete (Del)"
                    onClick={deleteSelected}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="rounded-lg bg-brand-tint px-3 py-2 text-xs text-ink-soft">
                Drag any selected item to move them together. Shift-click an item
                to add or remove it. <kbd>Del</kbd> removes all,{" "}
                <kbd>⌘/Ctrl+D</kbd> duplicates all.
              </p>
              <button
                className="btn btn-ghost w-full justify-center text-xs"
                onClick={() => setSelection([])}
              >
                Clear selection
              </button>
            </div>
          )}

          {selDesk && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink">Desk</h3>
                <div className="flex items-center gap-2">
                  <button
                    className="text-muted hover:text-ink"
                    title="Duplicate (⌘/Ctrl+D)"
                    onClick={duplicateSelected}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="text-danger hover:opacity-70"
                    title="Delete (Del)"
                    onClick={deleteSelected}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
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
                <div className="flex items-center gap-2">
                  <button
                    className="text-muted hover:text-ink"
                    title="Duplicate (⌘/Ctrl+D)"
                    onClick={duplicateSelected}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="text-danger hover:opacity-70"
                    title="Delete (Del)"
                    onClick={deleteSelected}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
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

          {selFixture && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink">
                  {fixtureMeta(selFixture.type).label}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    className="text-muted hover:text-ink"
                    title="Duplicate (⌘/Ctrl+D)"
                    onClick={duplicateSelected}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="text-danger hover:opacity-70"
                    title="Delete (Del)"
                    onClick={deleteSelected}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Element</label>
                <select
                  className="field mt-1"
                  value={selFixture.type}
                  onChange={(e) => {
                    const type = e.target.value;
                    patchFixture(selFixture.id, { type });
                    updateFixture(selFixture.id, { type });
                  }}
                >
                  {FIXTURE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FIXTURE_META[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Label</label>
                <input
                  className="field mt-1"
                  placeholder="Optional caption"
                  value={selFixture.label}
                  onChange={(e) =>
                    patchFixture(selFixture.id, { label: e.target.value })
                  }
                  onBlur={(e) =>
                    updateFixture(selFixture.id, { label: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Rotation</label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      className="field w-24 pr-6"
                      value={Math.round(selFixture.rotation)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isNaN(n)) return;
                        patchFixture(selFixture.id, {
                          rotation: ((n % 360) + 360) % 360,
                        });
                      }}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        const rotation = Number.isNaN(n)
                          ? 0
                          : ((n % 360) + 360) % 360;
                        patchFixture(selFixture.id, { rotation });
                        updateFixture(selFixture.id, { rotation });
                      }}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">
                      °
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost px-2 py-1.5 text-xs"
                    title="Rotate 90° clockwise"
                    onClick={() => {
                      const rotation = (selFixture.rotation + 90) % 360;
                      patchFixture(selFixture.id, { rotation });
                      updateFixture(selFixture.id, { rotation });
                    }}
                  >
                    <RotateCw size={13} /> 90°
                  </button>
                  {selFixture.rotation !== 0 && (
                    <button
                      className="text-xs text-muted hover:text-ink"
                      title="Reset rotation"
                      onClick={() => {
                        patchFixture(selFixture.id, { rotation: 0 });
                        updateFixture(selFixture.id, { rotation: 0 });
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <p className="rounded-lg bg-brand-tint px-3 py-2 text-xs text-ink-soft">
                Drag to move, pull the edges to resize. To rotate, grab the
                round handle above the selected element on the plan — hold{" "}
                <span className="font-semibold">Shift</span> to snap to 15°.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
