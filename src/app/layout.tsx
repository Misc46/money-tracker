import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Money (Liquid) Tracker",
  description: "Simple personal finance tracker — track income and expenses",
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
