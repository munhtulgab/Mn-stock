import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import TickerTape from "@/components/TickerTape";
import PwaRegister from "@/components/PwaRegister";
import InstallPwaButton from "@/components/InstallPwaButton";
import NotificationBell from "@/components/NotificationBell";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MSE TERMINAL",
  description:
    "Монголын хөрөнгийн биржийн (MSE) бодит өгөгдөлд үндэслэсэн ханшийн шинжилгээ, авах/зарах санал",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MSE Terminal",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="mn"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-term-bg text-term-text text-sm">
        <PwaRegister />
        <header className="sticky top-0 z-20 border-b-2 border-term-amber bg-black">
          <div className="mx-auto max-w-7xl px-3 py-2 flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Image
                src="/icons/icon-192.png"
                alt=""
                width={26}
                height={26}
                className="rounded-sm"
              />
              <span className="font-bold tracking-widest text-term-amber text-sm">
                MSE&nbsp;TERMINAL
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-[11px] uppercase tracking-wider">
              <Link href="/" className="text-term-text hover:text-term-amber">
                F1 Dashboard
              </Link>
              <Link
                href="/settings"
                className="text-term-muted hover:text-term-amber"
              >
                F2 Settings
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <InstallPwaButton />
            </div>
          </div>
        </header>
        <TickerTape />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-term-border py-3 px-4 text-center text-[10px] text-term-muted uppercase tracking-wider">
          Эх сурвалж: open.mse.mn // Энэхүү систем нь хөрөнгө оруулалтын албан
          ёсны зөвлөгөө биш, зөвхөн мэдээллийн зорилготой.
        </footer>
      </body>
    </html>
  );
}
