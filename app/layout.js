import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata = {
  title: "PHMG & Associates",
  description: "Practice management for PHMG & Associates",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

/* Applies the saved theme and density before first paint, so the page never
   flashes the wrong theme. Inline because it must run before the body renders. */
const preferenceScript = `try{var d=document.documentElement,s=localStorage;
var t=s.getItem('phmg-theme');if(t)d.dataset.theme=t;
var n=s.getItem('phmg-density');if(n)d.dataset.density=n;}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* The extension-injected-script case: suppressHydrationWarning on
            <html> does not reach here, so it is repeated on the tag itself. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: preferenceScript }}
        />
      </head>
      <body
        className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
