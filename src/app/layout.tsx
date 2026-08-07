import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const title = "GetGoList | Sua lista de compras";
const description =
  "Organize produtos, quantidades e valores em uma lista de compras simples.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://www.getgolist.com"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/icon.png", type: "image/png" }],
  },
  openGraph: {
    title,
    description,
    url: "https://www.getgolist.com",
    siteName: "GetGoList",
    images: [{ url: "/icon.png", width: 192, height: 192 }],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/icon.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={geist.variable}>
        <Script
          async
          strategy="beforeInteractive"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8312406358027338"
          crossOrigin="anonymous"
        />
        {children}
      </body>
    </html>
  );
}
