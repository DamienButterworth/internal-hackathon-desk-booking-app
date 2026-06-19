import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentBooker } from "@/lib/identity";
import { parseTags } from "@/lib/types";
import { zonePoints } from "@/lib/floor";
import { AdminEditor } from "@/components/AdminEditor";

export default async function AdminPage() {
  const booker = await getCurrentBooker();
  if (booker?.role !== "ADMIN") redirect("/");

  const premise = await prisma.premise.findFirst({
    include: {
      zones: { orderBy: { name: "asc" } },
      bookables: { orderBy: { name: "asc" } },
      fixtures: true,
    },
  });
  if (!premise) redirect("/");

  const desks = premise.bookables.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    shape: b.shape,
    seats: b.seats,
    seatSize: b.seatSize,
    seatGap: b.seatGap,
    seatShape: b.seatShape,
    seatSide: b.seatSide,
    fontSize: b.fontSize,
    endSeats: b.endSeats,
    zoneId: b.zoneId,
    isAvailable: b.isAvailable,
    tags: parseTags(b.tags),
    textDescription: b.textDescription,
  }));
  const zones = premise.zones.map((z) => ({
    id: z.id,
    name: z.name,
    type: z.type,
    color: z.color,
    points: zonePoints(z),
  }));
  const fixtures = premise.fixtures.map((f) => ({
    id: f.id,
    type: f.type,
    label: f.label,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    rotation: f.rotation,
  }));

  return (
    <AdminEditor
      premiseId={premise.id}
      premiseName={premise.name}
      mapWidth={premise.mapWidth}
      mapHeight={premise.mapHeight}
      backgroundUrl={premise.backgroundUrl}
      bg={{
        x: premise.bgX,
        y: premise.bgY,
        width: premise.bgWidth,
        height: premise.bgHeight,
      }}
      wallColor={premise.wallColor}
      wallOpacity={premise.wallOpacity}
      initialDesks={desks}
      initialZones={zones}
      initialFixtures={fixtures}
    />
  );
}
