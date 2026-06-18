import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentBooker } from "@/lib/identity";
import { parseTags } from "@/lib/types";
import { AdminEditor } from "@/components/AdminEditor";

export default async function AdminPage() {
  const booker = await getCurrentBooker();
  if (booker?.role !== "ADMIN") redirect("/");

  const premise = await prisma.premise.findFirst({
    include: {
      zones: { orderBy: { name: "asc" } },
      bookables: { orderBy: { name: "asc" } },
    },
  });
  if (!premise) redirect("/");

  const desks = premise.bookables.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    x: b.x,
    y: b.y,
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
    x: z.x,
    y: z.y,
    width: z.width,
    height: z.height,
  }));

  return (
    <AdminEditor
      premiseId={premise.id}
      premiseName={premise.name}
      mapWidth={premise.mapWidth}
      mapHeight={premise.mapHeight}
      initialDesks={desks}
      initialZones={zones}
    />
  );
}
