"use client";

import { useState, useTransition } from "react";
import { X, MapPin, Tag, Check } from "lucide-react";
import { createBooking } from "@/server/actions";
import { ZONE_META, type ZoneType } from "@/lib/types";

export type DeskForDialog = {
  id: string;
  name: string;
  type: string;
  seats: number;
  zoneType: string | null;
  tags: string[];
  description: string;
};

export function BookingDialog({
  desk,
  me,
  date,
  seatIndex,
  alreadyMine,
  onClose,
  onBooked,
}: {
  desk: DeskForDialog;
  me: { id: string; name: string };
  date: string;
  seatIndex: number;
  alreadyMine: boolean;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [title, setTitle] = useState("");
  const [guidance, setGuidance] = useState("");
  const [repeat, setRepeat] = useState("NONE");
  const [pending, startTransition] = useTransition();

  const zone = desk.zoneType
    ? ZONE_META[(desk.zoneType as ZoneType)]
    : null;

  function confirm() {
    startTransition(async () => {
      await createBooking({
        bookerId: me.id,
        bookableIds: [desk.id],
        date,
        seatIndex,
        startTime,
        endTime,
        bookingTitle: title,
        bookingGuidance: guidance,
        repeat,
      });
      onBooked();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-ink">
              {desk.seats > 1
                ? `Seat ${seatIndex + 1} · ${desk.name}`
                : `${desk.type === "ROOM" ? "Room" : "Desk"} ${desk.name}`}
            </h3>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <MapPin size={13} className="text-brand" />
              {zone ? zone.label : "Unzoned"}
              {zone && <span className="text-muted">· {zone.hint}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {desk.description && (
          <p className="mb-3 text-sm text-ink-soft">{desk.description}</p>
        )}
        {desk.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {desk.tags.map((t) => (
              <span key={t} className="chip">
                <Tag size={11} />
                {t}
              </span>
            ))}
          </div>
        )}

        {alreadyMine ? (
          <div className="rounded-lg bg-brand-tint p-3 text-sm text-brand-strong">
            You already have this desk on {date}. Manage it under{" "}
            <span className="font-semibold">My bookings</span>.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">From</label>
                <input
                  type="time"
                  className="field mt-1"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  type="time"
                  className="field mt-1"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="label">Title (optional)</label>
              <input
                className="field mt-1"
                placeholder="e.g. Focus day, Sprint planning"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <label className="label">Guidance for others (optional)</label>
              <input
                className="field mt-1"
                placeholder="e.g. Happy to be interrupted after 2pm"
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <label className="label">Repeat</label>
              <select
                className="field mt-1"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              >
                <option value="NONE">Just this day</option>
                <option value="DAILY">Every weekday</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={confirm}
                disabled={pending}
              >
                <Check size={15} />
                {pending ? "Booking…" : `Book for ${date}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
