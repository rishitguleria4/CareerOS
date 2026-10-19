import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { NavLinks } from "@/components/nav-links";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Career OS — AI Full-Stack & Early-Stage Workbench",
  description: "Private job discovery, fit calibration, LaTeX resume tailoring, and founder outreach.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body className="flex h-screen overflow-hidden bg-background text-foreground antialiased" suppressHydrationWarning>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-border bg-sidebar px-3 py-2.5 md:hidden">
            <NavLinks />
          </div>
          <main className="flex-1 overflow-y-auto px-5 py-7 md:px-10 md:py-9">
            <div className="mx-auto max-w-[1140px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
