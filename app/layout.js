import { IBM_Plex_Sans, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";

/**
 * Three faces, each with one job (D78).
 *
 * Plex Sans is every word; Plex Mono is every figure, which is the firm's
 * own face and the reason the mono weights are no longer optional; and
 * Fraunces comes back from the ledger language it was dropped with in
 * D35 — but only for the sign-in screen, where the firm's name is set.
 *
 * Fraunces costs nothing on the screens behind the sign-in: `next/font`
 * emits a variable that only `/login` reads, so the file is requested on
 * the one route whose markup uses it.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/* The sign-in screen only, and loaded as the variable font it is: at 72px
   its optical size axis sets itself, so the firm's name is cut for display
   rather than being a text face scaled up. Passing `weight` here would pin
   it to static instances and `next/font` refuses the axes alongside it. */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
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
var n=s.getItem('phmg-density');if(n)d.dataset.density=n;
var m=s.getItem('phmg-moments');if(m)d.dataset.moments=m;}catch(e){}`;

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
        className={`${plexSans.variable} ${plexMono.variable} ${fraunces.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
