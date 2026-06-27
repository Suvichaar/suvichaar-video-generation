import type { Metadata } from "next";
import { Baloo_2, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LTX-2 Studio",
  description: "Generate AI videos with LTX-2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${baloo.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className={`${baloo.className} bg-background text-foreground min-h-full`}>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
