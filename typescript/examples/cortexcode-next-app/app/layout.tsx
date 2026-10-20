import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CodingAgent Browser Demo",
  description: "Next.js browser demo for @snowflake/cortex-agent-sdk",
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
