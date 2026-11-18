import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DJI FLIGHT STUDIO",
    short_name: "Flight Studio",
    description: "Real World Cinematic Flight Planner — préparation et Companion de vol.",
    start_url: "/companion",
    display: "standalone",
    background_color: "#06090f",
    theme_color: "#06090f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
