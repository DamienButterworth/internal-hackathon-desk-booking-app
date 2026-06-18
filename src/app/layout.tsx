import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ChatWidget } from "@/components/ChatWidget";
import { getCurrentBooker } from "@/lib/identity";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Deskly · Mercator",
  description:
    "A smarter desk booking experience — map-first, no-show aware, and genuinely useful.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const booker = await getCurrentBooker();
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Nav
          booker={
            booker
              ? {
                  id: booker.id,
                  name: booker.name,
                  team: booker.team,
                  role: booker.role,
                }
              : null
          }
        />
        <main className="flex-1">{children}</main>
        {booker ? <ChatWidget /> : null}
      </body>
    </html>
  );
}
