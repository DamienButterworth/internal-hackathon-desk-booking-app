import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentBooker } from "@/lib/identity";
import { sweepExpiredBookings } from "@/lib/release";
import { BookingsList } from "@/components/BookingsList";
import { AutoReleasePoller } from "@/components/AutoReleasePoller";

export default async function BookingsPage() {
  const booker = await getCurrentBooker();
  if (!booker) redirect("/");
  await sweepExpiredBookings();

  const [bookings, settings] = await Promise.all([
    prisma.booking.findMany({
      where: { bookerId: booker.id },
      include: { bookables: { include: { zone: true } } },
      orderBy: [{ date: "desc" }, { startTime: "asc" }],
    }),
    prisma.appSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  const items = bookings.map((b) => ({
    id: b.id,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    title: b.bookingTitle,
    guidance: b.bookingGuidance,
    checkInAt: b.checkInAt ? b.checkInAt.toISOString() : null,
    desks: b.bookables.map((bk) => ({
      name: bk.name,
      zoneType: bk.zone?.type ?? null,
      zoneName: bk.zone?.name ?? null,
    })),
  }));

  return (
    <>
      <AutoReleasePoller />
      <BookingsList
        bookings={items}
        autoReleaseMinutes={settings?.autoReleaseMinutes ?? 30}
      />
    </>
  );
}
