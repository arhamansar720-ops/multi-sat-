import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "sonner";
import { AppProvider } from "@/components/providers/app-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { getServerConfig, PRODUCT } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${PRODUCT.name} · ${PRODUCT.tagline}`, template: `%s · ${PRODUCT.name}` },
  description: PRODUCT.description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#16171c" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <ThemeProvider>
          <AppProvider config={getServerConfig()}>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
