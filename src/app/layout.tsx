import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Dashboard Monitoring Program Studi Teknik Informatika | UNISSULA",
  description:
    "Sistem Monitoring Program Studi Teknik Informatika, Universitas Islam Sultan Agung (UNISSULA)",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${geist.variable}`}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
