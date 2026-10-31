import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Marmik type system: Space Grotesk (display/headings/buttons), Inter (body),
// JetBrains Mono (everything technical). Served from the repo as variable
// fonts (latin subset) so the build never depends on fonts.googleapis.com,
// which failed a production build on 2026-10-30 inside next/font/google.
const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/Inter.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HoldCo OS",
  description:
    "Back-office operating system for a multi-entity holding company.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
