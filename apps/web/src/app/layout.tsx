import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Shell } from "@/components/Shell";
import { StudioProvider } from "@/lib/store";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: { default: "DJI FLIGHT STUDIO", template: "%s · DJI FLIGHT STUDIO" },
  description: "Real World Cinematic Flight Planner — préparation, visualisation et simulation de prises de vue aériennes.",
  applicationName: "DJI FLIGHT STUDIO",
  appleWebApp: { capable: true, title: "Flight Studio", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#06090f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <RegisterSW />
        <StudioProvider>
          <Shell>{children}</Shell>
        </StudioProvider>
      </body>
    </html>
  );
}
