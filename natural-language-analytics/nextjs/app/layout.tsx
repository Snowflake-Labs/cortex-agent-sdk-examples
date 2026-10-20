import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Natural Language Analytics",
  description: "Ask questions about your data in plain English",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
