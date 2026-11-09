import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "DunningEngine | Wisora Innovations",
  description: "Automated payment recovery and dunning SaaS platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-neutral-950">
      <body className="h-full bg-neutral-950 text-neutral-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
        
        {/* Load Paystack Inline SDK */}
        <Script
          src="https://js.paystack.co/v1/inline.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}