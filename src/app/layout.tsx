import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ChatWidget } from "@/components/ChatWidget";
import { ToastProvider } from "@/components/Toast";
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

// Runs before paint to apply the saved (or system) theme and avoid a flash of
// the wrong colour scheme on first load.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const booker = await getCurrentBooker();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        {/* Apply saved/system theme before paint (no flash). Runs once on the
            initial HTML load; the dev-only "script tag" warning is expected. */}
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
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
        </ToastProvider>
      </body>
    </html>
  );
}
