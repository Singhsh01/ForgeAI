import { Backdrop } from "@/components/fx/backdrop";
import { AppNav } from "@/components/app/app-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Backdrop intensity="quiet" />
      <AppNav />
      <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pb-20 pt-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
