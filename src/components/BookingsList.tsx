"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LogIn,
  LogOut,
  X,
  Clock,
  CalendarPlus,
  AlarmClock,
} from "lucide-react";
import clsx from "clsx";
import { checkIn, checkOut, cancelBooking } from "@/server/actions";
import { STATUS_META, ZONE_META, type BookingStatus, type ZoneType } from "@/lib/types";
import { todayIso, dateTimeOf, weekdayLabel } from "@/lib/time";

type Booking = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  title: string;
  guidance: string;
  checkInAt: string | null;
  desks: { name: string; zoneType: string | null; zoneName: string | null }[];
};

export function BookingsList({
  bookings,
  autoReleaseMinutes,
}: {
  bookings: Booking[];
  autoReleaseMinutes: number;
}) {
  const today = todayIso();
  const todays = bookings.filter((b) => b.date === today);
  const upcoming = bookings
    .filter((b) => b.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = bookings.filter((b) => b.date < today);

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">My bookings</h1>
          <p className="text-sm text-muted">
            Check in to keep your desk — unclaimed desks auto-release after{" "}
            {autoReleaseMinutes} min.
          </p>
        </div>
        <Link href="/book" className="btn btn-primary">
          <CalendarPlus size={15} /> New booking
        </Link>
      </div>

      <Section title="Today" empty="Nothing booked for today.">
        {todays.map((b) => (
          <Card key={b.id} b={b} autoReleaseMinutes={autoReleaseMinutes} isToday />
        ))}
      </Section>
      <Section title="Upcoming" empty="No upcoming bookings.">
        {upcoming.map((b) => (
          <Card key={b.id} b={b} autoReleaseMinutes={autoReleaseMinutes} />
        ))}
      </Section>
      {past.length > 0 && (
        <Section title="Past">
          {past.slice(0, 12).map((b) => (
            <Card key={b.id} b={b} autoReleaseMinutes={autoReleaseMinutes} past />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.flat().filter(Boolean).length === 0;
  return (
    <section className="mb-6">
      <h2 className="label mb-2">{title}</h2>
      {isEmpty ? (
        empty ? (
          <p className="card p-4 text-sm text-muted">{empty}</p>
        ) : null
      ) : (
        <div className="space-y-2.5">{children}</div>
      )}
    </section>
  );
}

function Card({
  b,
  autoReleaseMinutes,
  isToday,
  past,
}: {
  b: Booking;
  autoReleaseMinutes: number;
  isToday?: boolean;
  past?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  const isCountingDown = isToday && b.status === "RESERVED";
  useEffect(() => {
    if (!isCountingDown) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isCountingDown]);

  const meta = STATUS_META[b.status as BookingStatus];
  const deadline =
    dateTimeOf(b.date, b.startTime).getTime() + autoReleaseMinutes * 60_000;
  const msLeft = deadline - now;

  function act(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="card flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">
            {b.desks.map((d) => d.name).join(", ")}
          </span>
          <span
            className="chip"
            style={{ color: meta.color, borderColor: meta.color + "55" }}
          >
            {meta.label}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="flex items-center gap-1">
            <Clock size={13} />
            {weekdayLabel(b.date)} {b.date.slice(5)} · {b.startTime}–{b.endTime}
          </span>
          {b.desks[0]?.zoneType && (
            <span
              className="chip"
              style={{
                background: ZONE_META[(b.desks[0].zoneType as ZoneType)]?.tint,
                color: ZONE_META[(b.desks[0].zoneType as ZoneType)]?.color,
                borderColor: "transparent",
              }}
            >
              {ZONE_META[(b.desks[0].zoneType as ZoneType)]?.label}
            </span>
          )}
        </div>
        {b.title && <p className="mt-1 text-sm text-ink-soft">{b.title}</p>}

        {isCountingDown && (
          <p
            className={clsx(
              "mt-1.5 flex items-center gap-1 text-xs font-semibold",
              msLeft > 0 ? "text-accent" : "text-danger",
            )}
          >
            <AlarmClock size={13} />
            {msLeft > 0
              ? `Check in within ${fmt(msLeft)} or this desk auto-releases`
              : "Past the check-in window — releasing shortly"}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {b.status === "RESERVED" && isToday && (
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={() => act(() => checkIn(b.id))}
          >
            <LogIn size={15} /> Check in
          </button>
        )}
        {b.status === "CHECKED_IN" && (
          <button
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => act(() => checkOut(b.id))}
          >
            <LogOut size={15} /> Check out
          </button>
        )}
        {!past && b.status !== "RELEASED" && b.status !== "CHECKED_OUT" && (
          <button
            className="btn btn-ghost text-danger"
            title="Cancel booking"
            disabled={pending}
            onClick={() => act(() => cancelBooking(b.id))}
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function fmt(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
