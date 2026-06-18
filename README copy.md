# Deskly — a smarter desk booking POC

Built for the Mercator office hackathon. Deskly reimagines desk booking as a
**map-first** experience that knows your team, respects the quiet zone, and
**hands back the desks nobody shows up to**.

![Mercator](https://img.shields.io/badge/Mercator-teal?style=flat&color=0d9488)

## What's in it

- 🗺️ **Map-first booking** — pick a desk on a real floor plan, see who's in and
  where the free seats are at a glance.
- 🧠 **"Find me a desk"** — smart finder that ranks free desks by where your
  team is sitting, the quiet zone, standing desks or dual monitors.
- 🛠️ **Admin floor-plan editor** — drag & resize desks and zones, tag desks,
  mark out a Quiet zone, all saved live.
- ⏱️ **Check-in / auto-release** — reservations you don't check into are handed
  back automatically after an admin-configurable window. No more ghost desks.
- 📊 **Insights** — utilisation, no-show rate, ghost desk-days, a 7-day forecast
  and plain-English recommendations — all computed from check-in data, no AI
  spend.

## Run it

Requires Node 18+ (built on Node 24).

```bash
cd deskly
cp .env.example .env        # DATABASE_URL for the local SQLite db
npm install
npx prisma migrate deploy   # create the SQLite schema
npm run db:seed             # seed Mercator London + ~4 weeks of history
npm run dev                 # http://localhost:3000
```

> Re-running `npm run db:seed` resets the demo data. The seed uses the wall
> clock so today's "reserved, not yet checked in" desk always has a live
> check-in window.

## Demo path (5 minutes)

1. **Land** → pick **Alex Rivera**. You're on the floor map.
2. **Find me a desk → Near my team** — watch it pick a free desk next to
   teammates and explain why. Book it.
3. **My bookings** — check in. Then go to **Settings** (switch to the **Dana
   Brooks · Admin** profile from the top-right avatar → home) and set
   **auto-release to 1–2 min**.
4. Leave a reservation un-checked-in → it **auto-releases** and the desk goes
   green again on the map.
5. **Floor plan** (admin) — drag a desk, resize the Quiet zone, save.
6. **Insights** — no-show rate, the reserved-vs-used gap, 7-day forecast and the
   "what the data suggests" recommendations.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · Prisma + SQLite ·
Tailwind v4 · react-rnd (editor) · Recharts (insights).

## Data model

`Premise → Zone → Bookable`, `Booker`, `Booking` (many-to-many to bookables),
and a singleton `AppSettings` for the auto-release window. See
`prisma/schema.prisma`.

## Branding

Mercator-inspired teal/navy palette lives as CSS variables in
`src/app/globals.css` (`--color-brand`, `--color-ink`, …). Drop in exact brand
hex codes there and the whole app follows.
