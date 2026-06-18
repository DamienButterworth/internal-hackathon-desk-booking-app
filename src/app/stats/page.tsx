import { prisma } from "@/lib/prisma";
import { getCurrentBooker } from "@/lib/identity";
import { computeStats, type StatBooking } from "@/lib/stats";
import { StatsView } from "@/components/StatsView";
import { redirect } from "next/navigation";

export default async function StatsPage() {
  const booker = await getCurrentBooker();
  if (!booker) redirect("/");

  const [bookings, deskCount, premise] = await Promise.all([
    prisma.booking.findMany({
      include: { bookables: { include: { zone: true } } },
    }),
    prisma.bookable.count({ where: { type: "DESK" } }),
    prisma.premise.findFirst(),
  ]);

  // Flatten to one row per (booking, desk) — utilisation is per desk-day.
  const rows: StatBooking[] = [];
  for (const b of bookings) {
    for (const bk of b.bookables) {
      if (bk.type !== "DESK") continue;
      rows.push({ date: b.date, status: b.status, zoneType: bk.zone?.type ?? null });
    }
  }

  const stats = computeStats(rows, deskCount);

  return (
    <StatsView
      stats={stats}
      deskCount={deskCount}
      premiseName={premise?.name ?? "Office"}
    />
  );
}
