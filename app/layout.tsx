import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const themeScript = `
(() => {
  try {
    const key = "creator-content-library-theme";
    const stored = window.localStorage.getItem(key);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch {
  }
})();
`;

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
    <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable)}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
