import { PrismaClient } from "@prisma/client";

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

type ZoneSpec = {
  key: string;
  name: string;
  type: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  desks: number; // how many of the grid cells to fill
  tagPool: string[];
};

const DESK_W = 66;
const DESK_H = 48;

const ZONES: ZoneSpec[] = [
  {
    key: "QUIET",
    name: "Quiet Zone",
    type: "QUIET",
    color: "#0ea5e9",
    x: 40,
    y: 70,
    width: 360,
    height: 300,
    cols: 2,
    rows: 3,
    desks: 6,
    tagPool: ["single-monitor", "window", "ergonomic-chair", "accessible"],
  },
  {
    key: "FOCUS",
    name: "Focus Pods",
    type: "FOCUS",
    color: "#14b8a6",
    x: 40,
    y: 410,
    width: 360,
    height: 330,
    cols: 2,
    rows: 3,
    desks: 6,
    tagPool: ["dual-monitor", "ergonomic-chair", "dock", "power-dense"],
  },
  {
    key: "COLLAB",
    name: "Collaboration",
    type: "COLLAB",
    color: "#f59e0b",
    x: 440,
    y: 70,
    width: 440,
    height: 300,
    cols: 3,
    rows: 2,
    desks: 6,
    tagPool: ["dual-monitor", "dock", "near-meeting-room", "near-kitchen"],
  },
  {
    key: "STANDING",
    name: "Standing Bank",
    type: "STANDING",
    color: "#8b5cf6",
    x: 440,
    y: 410,
    width: 440,
    height: 330,
    cols: 3,
    rows: 2,
    desks: 6,
    tagPool: ["standing", "dual-monitor", "dock", "window"],
  },
];

async function main() {
  console.log("Resetting database…");
  await prisma.booking.deleteMany();
  await prisma.bookable.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.booker.deleteMany();
  await prisma.premise.deleteMany();
  await prisma.appSettings.deleteMany();

  await prisma.appSettings.create({
    data: { id: "singleton", autoReleaseMinutes: 30 },
  });

  const premise = await prisma.premise.create({
    data: {
      name: "Mercator London — Floor 3",
      address: "Tintagel House, 92 Albert Embankment, London SE1 7TY",
      mapWidth: 1200,
      mapHeight: 800,
    },
  });

  // Bookers — first is the default demo identity, last is the admin.
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
    bookers.push(
      await prisma.booker.create({ data: { ...b, email } }),
    );
  }
  const users = bookers.filter((b) => b.role === "USER");

  // Zones + desks laid out on a grid inside each zone.
  const desks: { id: string; zoneKey: string }[] = [];
  for (const z of ZONES) {
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
      },
    });

    const padX = 28;
    const padTop = 46; // leave room for the zone label
    const padBottom = 24;
    const cellW = (z.width - padX * 2) / z.cols;
    const cellH = (z.height - padTop - padBottom) / z.rows;
    let n = 0;
    for (let r = 0; r < z.rows; r++) {
      for (let c = 0; c < z.cols; c++) {
        if (n >= z.desks) break;
        n++;
        const x = z.x + padX + c * cellW + (cellW - DESK_W) / 2;
        const y = z.y + padTop + r * cellH + (cellH - DESK_H) / 2;
        const tags = z.tagPool.filter(() => chance(0.5));
        if (tags.length === 0) tags.push(z.tagPool[0]);
        const desk = await prisma.bookable.create({
          data: {
            premiseId: premise.id,
            zoneId: zone.id,
            name: `${z.key.slice(0, 1)}-${String(n).padStart(2, "0")}`,
            type: "DESK",
            isAvailable: true,
            tags: JSON.stringify(tags),
            textDescription: `${z.name} desk with ${tags.join(", ") || "standard setup"}.`,
            timesAvailable: JSON.stringify([
              { day: "MON-FRI", from: "08:00", to: "19:00" },
            ]),
            x: Math.round(x),
            y: Math.round(y),
          },
        });
        desks.push({ id: desk.id, zoneKey: z.key });
      }
    }
  }

  // Two meeting rooms in the right-hand strip (SOCIAL / breakout area).
  // Drawn as an angled polygon to show zones aren't limited to rectangles.
  const breakoutPoints = [
    { x: 920, y: 70 },
    { x: 1160, y: 130 },
    { x: 1160, y: 680 },
    { x: 1060, y: 740 },
    { x: 920, y: 740 },
  ];
  const bx = breakoutPoints.map((p) => p.x);
  const by = breakoutPoints.map((p) => p.y);
  await prisma.zone.create({
    data: {
      premiseId: premise.id,
      name: "Breakout & Rooms",
      type: "SOCIAL",
      color: "#ec4899",
      x: Math.min(...bx),
      y: Math.min(...by),
      width: Math.max(...bx) - Math.min(...bx),
      height: Math.max(...by) - Math.min(...by),
      points: JSON.stringify(breakoutPoints),
    },
  });
  const rooms = [
    { name: "Thames (6)", y: 120 },
    { name: "Battersea (10)", y: 360 },
  ];
  for (const room of rooms) {
    await prisma.bookable.create({
      data: {
        premiseId: premise.id,
        name: room.name,
        type: "ROOM",
        tags: JSON.stringify(["near-kitchen", "dock"]),
        textDescription: "Meeting room with screen and video bar.",
        x: 952,
        y: room.y,
      },
    });
  }

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
    const count = Math.round(desks.length * factor * (0.85 + rand() * 0.3));

    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
      const desk = pick(desks);
      if (used.has(desk.id)) continue;
      used.add(desk.id);
      const user = pick(users);

      // No-show probability: higher Mon/Fri, and quiet desks are booked
      // speculatively (people grab them "just in case").
      let noShowP = 0.14;
      if (dow === 1 || dow === 5) noShowP += 0.1;
      if (desk.zoneKey === "QUIET") noShowP += 0.06;

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
          bookingTitle: chance(0.25) ? pick(["Focus day", "Team in", "Client prep", "Sprint"]) : "",
          bookables: { connect: { id: desk.id } },
        },
      });
      created++;
    }
  }

  // ---- Live bookings for TODAY so check-in / auto-release can be demoed ----
  const me = users[0]; // Alex Rivera = default demo identity
  const todayStr = isoDate(today);
  const liveDesks = desks.slice(0, 6);

  // Start the demo reservation a few minutes from "now" so there's a real
  // check-in window (it won't be instantly auto-released). Uses the wall clock.
  const now = new Date();
  const soon = new Date(now.getTime() + 5 * 60_000);
  const hhmm = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const nowTime = hhmm(now);
  const soonTime = hhmm(soon);

  // Alex has a reserved desk today (not yet checked in) — drives the demo.
  await prisma.booking.create({
    data: {
      bookerId: me.id,
      date: todayStr,
      startTime: soonTime,
      endTime: "18:00",
      status: "RESERVED",
      bookingTitle: "Deep work — projections",
      bookingGuidance: "Quiet desk near the window, monitor needed.",
      bookables: { connect: { id: liveDesks[0].id } },
    },
  });
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
        bookables: { connect: { id: liveDesks[i].id } },
      },
    });
  }

  console.log(
    `Seeded: ${bookers.length} bookers, ${desks.length} desks + ${rooms.length} rooms, ${created} historical bookings (${noShows} no-shows).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
