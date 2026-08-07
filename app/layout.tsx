import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import PwaRegister from "@/components/PwaRegister";
import ToastProvider from "@/components/Toast";
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
  title: "MSE Invest",
  description:
    "Монголын хөрөнгийн биржийн (MSE) бодит өгөгдөлд үндэслэсэн ханшийн шинжилгээ, авах/зарах санал",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MSE Invest",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0f14",
  width: "device-width",
  initialScale: 1,
  /**
   * The on-screen keyboard shrinks the layout viewport rather than sliding
   * over the page, so anything fixed to the bottom — the tab bar, a trade
   * ticket's buttons — comes up with it and stays reachable. This is the
   * declarative version of what the tab bar used to attempt in JavaScript by
   * measuring the visual viewport, which is what left it stranded across the
   * middle of the screen.
   */
  interactiveWidget: "resizes-content",
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
      <body className="min-h-full bg-app-bg text-app-text">
        <PwaRegister />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
