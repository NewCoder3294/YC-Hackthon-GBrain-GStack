export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-sm border border-neutral-200 p-8">{children}</div>
    </main>
  );
}
