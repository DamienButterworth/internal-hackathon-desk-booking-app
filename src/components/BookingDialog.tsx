"use client";

import { useMemo, useState, useTransition } from "react";
import { X, MapPin, Tag, Check } from "lucide-react";
import { createBooking } from "@/server/actions";
import { useToast } from "./Toast";
import { ZONE_META, type ZoneType } from "@/lib/types";
import { isoDate } from "@/lib/time";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
// Round "HH:MM" up to the next quarter hour, kept within the same day.
function ceilQuarter(d: Date) {
  let mins = d.getHours() * 60 + d.getMinutes();
  mins = Math.min(Math.ceil(mins / 15) * 15, 23 * 60 + 45);
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}
function addMinutes(hm: string, delta: number) {
  const [h, m] = hm.split(":").map(Number);
  const t = Math.min(h * 60 + m + delta, 23 * 60 + 59);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

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
  // Anchor "now" once for this dialog. When booking today, the slot starts at
  // the current time (rounded up to the next quarter) and can't be set earlier.
  const now = useMemo(() => new Date(), []);
  const isToday = date === isoDate(now);
  const earliest = isToday ? hhmm(now) : "00:00";
  const defaultStart = isToday ? ceilQuarter(now) : "09:00";
  const defaultEnd =
    isToday && defaultStart >= "16:00" ? addMinutes(defaultStart, 60) : "17:00";

  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [title, setTitle] = useState("");
  const [guidance, setGuidance] = useState("");
  const [repeat, setRepeat] = useState("NONE");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const zone = desk.zoneType
    ? ZONE_META[(desk.zoneType as ZoneType)]
    : null;

  const pastStart = isToday && startTime < earliest;
  const badRange = endTime <= startTime;
  const error = pastStart
    ? "That start time has already passed — pick a later time."
    : badRange
      ? "End time must be after the start time."
      : null;

  function changeStart(v: string) {
    setStartTime(v);
    // Keep the end after the start so the range stays valid.
    if (endTime <= v) setEndTime(addMinutes(v, 60));
  }

  function confirm() {
    if (error) return;
    startTransition(async () => {
      try {
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
        toast(`Booked ${desk.name} for ${date}.`, "success");
        onBooked();
      } catch (e) {
        toast(
          e instanceof Error && e.message
            ? e.message
            : "Couldn't complete the booking — please try again.",
          "error",
        );
      }
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
                  min={earliest}
                  onChange={(e) => changeStart(e.target.value)}
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  type="time"
                  className="field mt-1"
                  value={endTime}
                  min={startTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <p className="mt-2 text-xs font-medium text-danger">{error}</p>
            )}
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
                disabled={pending || !!error}
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
