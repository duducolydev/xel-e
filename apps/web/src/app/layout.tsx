import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xel-E",
  description: "Xeeli ci xel — plateforme e-learning pour les collégiens sénégalais.",
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
