import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MSE Хөрөнгийн Зөвлөх",
  description:
    "Монголын хөрөнгийн биржийн (MSE) бодит өгөгдөлд үндэслэсэн ханшийн шинжилгээ, авах/зарах санал",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="mn"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">
              MSE Хөрөнгийн Зөвлөх
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-xs text-neutral-400 hidden sm:inline">
                Монголын хөрөнгийн биржийн нээлттэй өгөгдөлд үндэслэсэн
              </span>
              <Link
                href="/settings"
                className="text-xs text-neutral-400 hover:text-neutral-200"
              >
                Тохиргоо
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-800 py-4 text-center text-xs text-neutral-500">
          Эх сурвалж: open.mse.mn · Энэхүү систем нь хөрөнгө оруулалтын албан
          ёсны зөвлөгөө биш, зөвхөн мэдээллийн зорилготой.
        </footer>
      </body>
    </html>
  );
}
