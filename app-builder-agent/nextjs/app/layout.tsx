import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "App Builder Agent",
  description: "Describe the app you want — an AI agent builds it",
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
