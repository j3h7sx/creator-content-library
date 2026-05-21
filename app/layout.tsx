import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator Content Library",
  description: "Local-first visual asset library for carousel creators and app marketers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
