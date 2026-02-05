import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ask Questions",
  description: "An AI that responds only with thought-provoking questions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-stone-50 text-stone-900 min-h-screen">{children}</body>
    </html>
  );
}
