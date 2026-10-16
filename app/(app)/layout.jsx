import LeftRail, { MobileNav } from "@/components/shell/LeftRail";
import TopBar from "@/components/shell/TopBar";

export default function AppLayout({ children }) {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="relative z-10 min-h-0 flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
