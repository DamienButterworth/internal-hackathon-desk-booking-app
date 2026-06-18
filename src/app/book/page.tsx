import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentBooker } from "@/lib/identity";
import { sweepExpiredBookings } from "@/lib/release";
import { parseTags } from "@/lib/types";
import { isoDate } from "@/lib/time";
import { BookingBoard } from "@/components/BookingBoard";
import { AutoReleasePoller } from "@/components/AutoReleasePoller";

// occupancy[date][bookableId] = who has it (active bookings only)
export type Occupant = { name: string; team: string; mine: boolean };
export type Occupancy = Record<string, Record<string, Occupant>>;

export default async function BookPage() {
  const booker = await getCurrentBooker();
  if (!booker) redirect("/");
  await sweepExpiredBookings();

  const premise = await prisma.premise.findFirst({
    include: {
      zones: { orderBy: { name: "asc" } },
      bookables: { orderBy: { name: "asc" } },
    },
  });
  if (!premise) redirect("/");

  // 14-day window of active bookings, so date switching is instant client-side.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const dates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
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
      occupancy[b.date][bk.id] = {
        name: b.booker.name,
        team: b.booker.team,
        mine: b.bookerId === booker.id,
      };
    }
  }

  const zoneType = new Map(premise.zones.map((z) => [z.id, z.type]));
  const desks = premise.bookables.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    x: b.x,
    y: b.y,
    zoneId: b.zoneId,
    zoneType: b.zoneId ? zoneType.get(b.zoneId) ?? null : null,
    tags: parseTags(b.tags),
    isAvailable: b.isAvailable,
    description: b.textDescription,
  }));
  const zones = premise.zones.map((z) => ({
    id: z.id,
    name: z.name,
    type: z.type,
    x: z.x,
    y: z.y,
    width: z.width,
    height: z.height,
  }));

  return (
    <>
      <AutoReleasePoller />
      <BookingBoard
        me={{ id: booker.id, name: booker.name, team: booker.team }}
        mapWidth={premise.mapWidth}
        mapHeight={premise.mapHeight}
        zones={zones}
        desks={desks}
        occupancy={occupancy}
        dates={dates}
      />
    </>
  );
}
