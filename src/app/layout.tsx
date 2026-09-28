import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estação 1 | Simulador Comercial",
  description: "Nova base em Next.js e TypeScript do Simulador Comercial.",
};

type RootLayoutProps = Readonly<{ children: ReactNode }>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="stylesheet" href="/styles.css?v=25.0" />
      </head>
      <body>{children}</body>
    </html>
  );
}
