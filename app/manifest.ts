import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MSE Invest — Хөрөнгийн Зөвлөх",
    short_name: "MSE Invest",
    description:
      "Монголын хөрөнгийн биржийн бодит өгөгдөлд үндэслэсэн ханшийн шинжилгээ, авах/зарах санал",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0f14",
    theme_color: "#0d0f14",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
