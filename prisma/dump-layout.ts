import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

// Snapshots the current floor plan (premise canvas, zones, desks/tables and
// fixtures) from the database into prisma/layout.json, which seed.ts imports.
// Run after building/adjusting the layout in the admin editor:
//   npm run db:dump-layout   then   npm run db:seed
const prisma = new PrismaClient();

async function main() {
  const premise = await prisma.premise.findFirst({
    include: {
      zones: { orderBy: { name: "asc" } },
      bookables: { orderBy: { name: "asc" } },
      fixtures: true,
    },
  });
  if (!premise) throw new Error("No premise found — nothing to dump.");

  const zoneName = new Map(premise.zones.map((z) => [z.id, z.name]));
  const layout = {
    premise: {
      name: premise.name,
      address: premise.address,
      mapWidth: premise.mapWidth,
      mapHeight: premise.mapHeight,
      backgroundUrl: premise.backgroundUrl,
      bgX: premise.bgX,
      bgY: premise.bgY,
      bgWidth: premise.bgWidth,
      bgHeight: premise.bgHeight,
      wallColor: premise.wallColor,
      wallOpacity: premise.wallOpacity,
    },
    zones: premise.zones.map((z) => ({
      name: z.name,
      type: z.type,
      color: z.color,
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      points: z.points,
    })),
    bookables: premise.bookables.map((b) => ({
      name: b.name,
      type: b.type,
      zone: b.zoneId ? (zoneName.get(b.zoneId) ?? null) : null,
      seats: b.seats,
      shape: b.shape,
      width: b.width,
      height: b.height,
      seatSize: b.seatSize,
      seatGap: b.seatGap,
      seatShape: b.seatShape,
      seatSide: b.seatSide,
      fontSize: b.fontSize,
      endSeats: b.endSeats,
      isAvailable: b.isAvailable,
      timesAvailable: b.timesAvailable,
      tags: b.tags,
      textDescription: b.textDescription,
      x: b.x,
      y: b.y,
    })),
    fixtures: premise.fixtures.map((f) => ({
      type: f.type,
      label: f.label,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      rotation: f.rotation,
    })),
  };

  writeFileSync(
    "prisma/layout.json",
    JSON.stringify(layout, null, 2) + "\n",
  );
  console.log(
    `Dumped prisma/layout.json: ${layout.zones.length} zones · ${layout.bookables.length} bookables · ${layout.fixtures.length} fixtures.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
