import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Generative Gaming",
  description: "A keyboard-driven, text-dense roguelike",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
