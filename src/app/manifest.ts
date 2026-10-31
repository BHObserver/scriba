import type { MetadataRoute } from "next";

// Installable on the shopkeeper's phone. Colours are the sRGB values of --paper and the cloth red.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scriba",
    short_name: "Scriba",
    description: "হাতে লেখা খাতা থেকে মেলানো হিসাব · Your handwritten khata, checked and added up",
    lang: "bn",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf5eb",
    theme_color: "#972622",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
