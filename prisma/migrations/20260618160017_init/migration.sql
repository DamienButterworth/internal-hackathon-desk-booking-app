-- CreateTable
CREATE TABLE "Premise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "mapWidth" INTEGER NOT NULL DEFAULT 1200,
    "mapHeight" INTEGER NOT NULL DEFAULT 800,
    "backgroundUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "premiseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FOCUS',
    "color" TEXT NOT NULL DEFAULT '#14b8a6',
    "x" REAL NOT NULL DEFAULT 40,
    "y" REAL NOT NULL DEFAULT 40,
    "width" REAL NOT NULL DEFAULT 280,
    "height" REAL NOT NULL DEFAULT 220,
    CONSTRAINT "Zone_premiseId_fkey" FOREIGN KEY ("premiseId") REFERENCES "Premise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bookable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "premiseId" TEXT NOT NULL,
    "zoneId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DESK',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "timesAvailable" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "textDescription" TEXT NOT NULL DEFAULT '',
    "x" REAL NOT NULL DEFAULT 100,
    "y" REAL NOT NULL DEFAULT 100,
    CONSTRAINT "Bookable_premiseId_fkey" FOREIGN KEY ("premiseId") REFERENCES "Premise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bookable_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER'
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "endTime" TEXT NOT NULL DEFAULT '17:00',
    "repeat" TEXT NOT NULL DEFAULT 'NONE',
    "bookingTitle" TEXT NOT NULL DEFAULT '',
    "bookingGuidance" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "checkInAt" DATETIME,
    "checkOutAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_bookerId_fkey" FOREIGN KEY ("bookerId") REFERENCES "Booker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "autoReleaseMinutes" INTEGER NOT NULL DEFAULT 30
);

-- CreateTable
CREATE TABLE "_BookingBookables" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BookingBookables_A_fkey" FOREIGN KEY ("A") REFERENCES "Bookable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BookingBookables_B_fkey" FOREIGN KEY ("B") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Booker_email_key" ON "Booker"("email");

-- CreateIndex
CREATE UNIQUE INDEX "_BookingBookables_AB_unique" ON "_BookingBookables"("A", "B");

-- CreateIndex
CREATE INDEX "_BookingBookables_B_index" ON "_BookingBookables"("B");
