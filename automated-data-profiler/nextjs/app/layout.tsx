import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Automated Data Profiler",
  description: "Comprehensive table quality reports powered by AI",
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
