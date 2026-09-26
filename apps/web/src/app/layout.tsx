import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/api-public";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Xel-E — Maths, PC et SVT pour les collégiens",
  description:
    "Xeeli ci xel — cours, exercices et quiz de Mathématiques, Physique-Chimie et SVT pour les collégiens sénégalais, de la 6e à la 3e.",
  applicationName: "Xel-E",
  icons: { icon: "/logo-xele.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e4478",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
