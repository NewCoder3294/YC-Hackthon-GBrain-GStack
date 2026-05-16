import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-sm border border-neutral-200 p-8">
        <div className="mb-6 flex flex-col items-center justify-center gap-2">
          <Image src="/watchdog.png" alt="WatchDog" width={64} height={64} priority />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            Real-time crime intelligence
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
