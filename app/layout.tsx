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

/**
 * Applies the reader's theme before the first paint.
 *
 * Inline and blocking on purpose. Anything that runs after hydration is a
 * frame too late: the page would paint dark, then flip to light in front of
 * somebody who has already told it which one they want. The attribute is the
 * same one ThemeToggle writes, and dark is the answer when nothing is stored
 * — this app is dark by default and a first visit should not depend on how
 * the phone happens to be set.
 */
const APPLY_THEME = `try{var t=localStorage.getItem("mse-theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

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
      <head>
        {/* Asked for before anything else on the page, because it is the
            first thing on the screen.

            The head is in the opening bytes of the response and the splash
            markup is two kilobytes further down, so left to the `<img>` the
            fetch would not start until the parser reached it — and on a cold
            start the rest of that stream is held behind a database
            connection. Declared here, the request goes out while the shell is
            still arriving. `as` and `type` are what let the browser match it
            to the tag when it gets there; without them it fetches the file
            twice. */}
        <link
          rel="preload"
          as="image"
          type="image/webp"
          href="/loading.webp"
          fetchPriority="high"
        />
        <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />
      </head>
      <body className="min-h-full bg-app-bg text-app-text">
        <PwaRegister />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
