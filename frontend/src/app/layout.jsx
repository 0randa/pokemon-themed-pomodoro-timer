import { Press_Start_2P, VT323 } from "next/font/google";
import Providers from "@/components/providers";
import ServiceWorkerRegistration from "@/components/service-worker-registration";
import "./globals.css";

const pressStart2P = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

const vt323 = VT323({
  variable: "--font-pixel-body",
  subsets: ["latin"],
  weight: "400",
});

export const metadata = {
  title: "PomoPet",
  description: "Gamified pomodoro productivity app",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export const viewport = {
  themeColor: "#c97c28",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${pressStart2P.variable} ${vt323.variable}`}>
        <ServiceWorkerRegistration />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
