import { PrismaClient } from "@prisma/client";
import layout from "./layout.json";

const prisma = new PrismaClient();

// Deterministic RNG so the demo data is reproducible across reseeds.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260618);
const rand = () => rng();
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  console.log("Resetting database…");
  await prisma.booking.deleteMany();
  await prisma.bookable.deleteMany();
  await prisma.fixture.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.booker.deleteMany();
  await prisma.premise.deleteMany();
  await prisma.appSettings.deleteMany();

  await prisma.appSettings.create({
    data: { id: "singleton", autoReleaseMinutes: 30 },
  });

  // ---- Floor plan: imported verbatim from the hand-built layout -------------
  // prisma/layout.json is a dump of the editor's saved plan (premise canvas,
  // zones, desks/tables and fixtures). Re-export it from the admin editor to
  // refresh this file. Everything below it (bookers + bookings) is mock data
  // generated on top of whatever desks the layout provides.
  const premise = await prisma.premise.create({
    data: {
      name: layout.premise.name,
      address: layout.premise.address,
      mapWidth: layout.premise.mapWidth,
      mapHeight: layout.premise.mapHeight,
      backgroundUrl: layout.premise.backgroundUrl,
      bgX: layout.premise.bgX,
      bgY: layout.premise.bgY,
      bgWidth: layout.premise.bgWidth,
      bgHeight: layout.premise.bgHeight,
      wallColor: layout.premise.wallColor,
      wallOpacity: layout.premise.wallOpacity,
    },
  });

  // Zones first, so bookables can be linked back to them by name.
  const zoneIdByName = new Map<string, string>();
  for (const z of layout.zones) {
    const zone = await prisma.zone.create({
      data: {
        premiseId: premise.id,
        name: z.name,
        type: z.type,
        color: z.color,
        x: z.x,
        y: z.y,
        width: z.width,
        height: z.height,
        points: z.points,
      },
    });
    zoneIdByName.set(z.name, zone.id);
  }

  // Bookables (desks, multi-seat tables, rooms) with all editor styling fields.
  const deskIds: string[] = []; // single bookable desks (for historical demand)
  const tableInfo: { id: string; seats: number }[] = []; // multi-seat tables
  for (const b of layout.bookables) {
    const created = await prisma.bookable.create({
      data: {
        premiseId: premise.id,
        zoneId: b.zone ? (zoneIdByName.get(b.zone) ?? null) : null,
        name: b.name,
        type: b.type,
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
      },
    });
    if (b.type === "DESK" && b.seats > 1) {
      tableInfo.push({ id: created.id, seats: b.seats });
    } else if (b.type === "DESK") {
      deskIds.push(created.id);
    }
  }

  // Fixtures (walls, doors, windows, amenities) — pure map decoration.
  for (const f of layout.fixtures) {
    await prisma.fixture.create({
      data: {
        premiseId: premise.id,
        type: f.type,
        label: f.label,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        rotation: f.rotation,
      },
    });
  }

  // ---- Bookers — first is the default demo identity, last is the admin. -----
  const bookerData = [
    { name: "Alex Rivera", team: "Engineering", role: "USER" },
    { name: "Priya Shah", team: "QA", role: "USER" },
    { name: "Tom Becker", team: "Design", role: "USER" },
    { name: "Maya Lindqvist", team: "Product", role: "USER" },
    { name: "Sam Okafor", team: "Engineering", role: "USER" },
    { name: "Lucy Chen", team: "Delivery", role: "USER" },
    { name: "Raj Patel", team: "Engineering", role: "USER" },
    { name: "Nina Alvarez", team: "Design", role: "USER" },
    { name: "Omar Haddad", team: "Product", role: "USER" },
    { name: "Jess Wright", team: "QA", role: "USER" },
    { name: "Dana Brooks", team: "Facilities", role: "ADMIN" },
  ];
  const bookers = [];
  for (const b of bookerData) {
    const email = `${b.name.toLowerCase().replace(/[^a-z]+/g, ".")}@mercatordigital.com`;
    bookers.push(await prisma.booker.create({ data: { ...b, email } }));
  }
  const users = bookers.filter((b) => b.role === "USER");

  // ---- Historical bookings: ~4 weeks, weekdays only, realistic patterns ----
  // Hybrid-office shape: midweek peaks, Mon/Fri light. No-shows baked in.
  const weekdayFactor: Record<number, number> = {
    1: 0.55, // Mon
    2: 0.85, // Tue
    3: 0.95, // Wed
    4: 0.8, // Thu
    5: 0.45, // Fri
  };

  let created = 0;
  let noShows = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let back = 28; back >= 1; back--) {
    const day = new Date(today);
    day.setDate(today.getDate() - back);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const date = isoDate(day);
    const factor = weekdayFactor[dow] ?? 0.6;
    const count = Math.round(deskIds.length * factor * (0.85 + rand() * 0.3));

    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
      const deskId = pick(deskIds);
      if (used.has(deskId)) continue;
      used.add(deskId);
      const user = pick(users);

      // No-show probability: higher Mon/Fri (people grab desks "just in case").
      let noShowP = 0.14;
      if (dow === 1 || dow === 5) noShowP += 0.1;

      let status = "CHECKED_OUT";
      let checkInAt: Date | null = new Date(day);
      let checkOutAt: Date | null = new Date(day);
      checkInAt.setHours(8 + Math.floor(rand() * 3), Math.floor(rand() * 59));
      checkOutAt.setHours(16 + Math.floor(rand() * 3), Math.floor(rand() * 59));

      if (chance(noShowP)) {
        status = "RELEASED"; // never checked in -> auto-released
        checkInAt = null;
        checkOutAt = null;
        noShows++;
      } else if (chance(0.14)) {
        status = "CHECKED_IN"; // came in, forgot to check out
        checkOutAt = null;
      }

      await prisma.booking.create({
        data: {
          bookerId: user.id,
          date,
          startTime: "09:00",
          endTime: "17:00",
          status,
          checkInAt,
          checkOutAt,
          bookingTitle: chance(0.25)
            ? pick(["Focus day", "Team in", "Client prep", "Sprint"])
            : "",
          bookables: { connect: { id: deskId } },
        },
      });
      created++;
    }
  }

  // ---- Live bookings for TODAY so check-in / auto-release can be demoed ----
  const me = users[0]; // Alex Rivera = default demo identity
  const todayStr = isoDate(today);
  const liveDesks = deskIds.slice(0, 6);

  // Start the demo reservation a few minutes from "now" so there's a real
  // check-in window (it won't be instantly auto-released). Uses the wall clock.
  const now = new Date();
  const soon = new Date(now.getTime() + 5 * 60_000);
  const hhmm = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const nowTime = hhmm(now);
  const soonTime = hhmm(soon);

  // Alex has a reserved desk today (not yet checked in) — drives the demo.
  if (liveDesks[0]) {
    await prisma.booking.create({
      data: {
        bookerId: me.id,
        date: todayStr,
        startTime: soonTime,
        endTime: "18:00",
        status: "RESERVED",
        bookingTitle: "Deep work — projections",
        bookingGuidance: "Quiet desk near the window, monitor needed.",
        bookables: { connect: { id: liveDesks[0] } },
      },
    });
  }
  // A few other people are in today (mix of statuses) so the map looks alive.
  for (let i = 1; i < liveDesks.length; i++) {
    const status = i % 3 === 0 ? "RESERVED" : "CHECKED_IN";
    await prisma.booking.create({
      data: {
        bookerId: pick(users).id,
        date: todayStr,
        startTime: status === "RESERVED" ? nowTime : "09:00",
        endTime: "17:00",
        status,
        checkInAt: status === "CHECKED_IN" ? new Date() : null,
        bookables: { connect: { id: liveDesks[i] } },
      },
    });
  }

  // A handful of seats already taken at the multi-seat tables today, so the
  // per-seat booking UI is visible (some seats taken, the rest free).
  for (const table of tableInfo.slice(0, 2)) {
    const taken = Math.max(1, Math.floor(table.seats / 2));
    for (let s = 0; s < taken; s++) {
      const status = s % 3 === 1 ? "RESERVED" : "CHECKED_IN";
      await prisma.booking.create({
        data: {
          bookerId: pick(users).id,
          date: todayStr,
          seatIndex: s,
          startTime: status === "RESERVED" ? nowTime : "09:00",
          endTime: "17:00",
          status,
          checkInAt: status === "CHECKED_IN" ? new Date() : null,
          bookables: { connect: { id: table.id } },
        },
      });
    }
  }

  console.log(
    `Seeded: ${bookers.length} bookers · ${deskIds.length} desks + ${tableInfo.length} multi-seat tables · ${layout.zones.length} zones · ${layout.fixtures.length} fixtures · ${created} historical bookings (${noShows} no-shows).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
