import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Manim Studio",
  description: "Describe an animation, or edit its code directly, and render it with Manim.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={{ variables: { colorPrimary: "#6366f1" } }}>
      <html lang="en" className={inter.variable}>
        <body className="bg-neutral-950 font-sans text-neutral-100 antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
