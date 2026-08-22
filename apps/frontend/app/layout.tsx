import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PULSO — Ruteo de urgencias",
  description:
    "Motor predictivo de ruteo e inferencia de urgencias hospitalarias. Platanus Hack 2026.",
};

export const viewport: Viewport = {
  themeColor: "#0a0e14",
  width: "device-width",
  initialScale: 1,
  // La app se usa en un celular en movimiento: no queremos zoom accidental.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  );
}
