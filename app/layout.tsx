import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// Mismo diseño que sistema-evaluaciones: DM Sans 300–700.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Ejercicios · Speak Easy", template: "%s · Speak Easy" },
  description: "Ejercicios diarios de inglés de Speak Easy",
  icons: { icon: { url: "/logo.webp", type: "image/webp" } },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
