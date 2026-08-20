import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Nav from "../components/Nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Manim Studio",
  description: "Describe an animation, or edit its code directly, and render it with Manim.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#25272d",
          colorText: "#151619",
          colorTextSecondary: "#7f8491",
          colorBackground: "#ffffff",
          colorInputBackground: "#ffffff",
          colorInputText: "#151619",
          borderRadius: "8px",
          fontFamily: "var(--font-sans)",
        },
      }}
    >
      <html lang="en" className={`${inter.variable} ${oswald.variable}`}>
        <body className="bg-paper font-sans text-ink antialiased">
          <Nav />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
