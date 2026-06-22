import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentBooker } from "@/lib/identity";
import { sweepExpiredBookings } from "@/lib/release";
import { parseTags } from "@/lib/types";
import { isoDate } from "@/lib/time";
import { DEFAULT_LEGEND_COLORS } from "@/lib/floor";
import { CalendarView } from "@/components/CalendarView";
import { AutoReleasePoller } from "@/components/AutoReleasePoller";
import type { Occupancy } from "@/app/book/page";

export default async function CalendarPage() {
  const booker = await getCurrentBooker();
  if (!booker) redirect("/");
  await sweepExpiredBookings();

  const [premise, settings] = await Promise.all([
    prisma.premise.findFirst({
      include: {
        zones: { orderBy: { name: "asc" } },
        bookables: { orderBy: { name: "asc" } },
      },
    }),
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!premise) redirect("/");

  // Window: 1st of the current month through the end of +2 months, so the
  // month tab can page forward a little and the week tab always has data.
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 3, 1); // exclusive
  const dates: string[] = [];
  for (
    const d = new Date(windowStart);
    d < windowEnd;
    d.setDate(d.getDate() + 1)
  ) {
    dates.push(isoDate(d));
  }

  const bookings = await prisma.booking.findMany({
    where: { date: { in: dates }, status: { in: ["RESERVED", "CHECKED_IN"] } },
    include: { booker: true, bookables: { select: { id: true } } },
  });

  const occupancy: Occupancy = {};
  for (const b of bookings) {
    occupancy[b.date] ??= {};
    for (const bk of b.bookables) {
      (occupancy[b.date][bk.id] ??= {})[b.seatIndex] = {
        name: b.booker.name,
        team: b.booker.team,
        mine: b.bookerId === booker.id,
      };
    }
  }

  const zoneById = new Map(premise.zones.map((z) => [z.id, z]));
  const desks = premise.bookables
    .filter((b) => b.type === "DESK")
    .map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      seats: b.seats,
      zoneType: b.zoneId ? zoneById.get(b.zoneId)?.type ?? null : null,
      zoneName: b.zoneId ? zoneById.get(b.zoneId)?.name ?? null : null,
      tags: parseTags(b.tags),
      isAvailable: b.isAvailable,
      description: b.textDescription,
    }));

  // The current user's own active bookings (for the "My schedule" tab).
  const mine = await prisma.booking.findMany({
    where: { bookerId: booker.id, status: { in: ["RESERVED", "CHECKED_IN"] } },
    include: { bookables: { include: { zone: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  const myBookings = mine.map((b) => ({
    id: b.id,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    seatIndex: b.seatIndex,
    desks: b.bookables.map((bk) => ({
      name: bk.name,
      zoneName: bk.zone?.name ?? null,
      zoneType: bk.zone?.type ?? null,
    })),
  }));

  const legendColors = {
    free: settings?.freeColor ?? DEFAULT_LEGEND_COLORS.free,
    taken: settings?.takenColor ?? DEFAULT_LEGEND_COLORS.taken,
    yours: settings?.yoursColor ?? DEFAULT_LEGEND_COLORS.yours,
    unavailable: settings?.unavailableColor ?? DEFAULT_LEGEND_COLORS.unavailable,
  };

  return (
    <>
      <AutoReleasePoller />
      <CalendarView
        me={{ id: booker.id, name: booker.name, team: booker.team }}
        desks={desks}
        occupancy={occupancy}
        dates={dates}
        myBookings={myBookings}
        legendColors={legendColors}
        today={isoDate(now)}
      />
    </>
  );
}
