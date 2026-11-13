import type { Metadata } from "next";
import "./globals.css";
import "./extra.css";
import "maplibre-gl/dist/maplibre-gl.css";
export const metadata: Metadata = {
  title: "O4O — Good finds, closer to home",
  description:
    "Discover local retailers, verified offers and shopping catalogues across Kerala.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
