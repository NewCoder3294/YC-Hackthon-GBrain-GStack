import { RegistrationForm } from "./registration-form";

export const dynamic = "force-static";

export default function ContributePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-md border border-neutral-200 p-8">
        <h1 className="font-mono text-sm uppercase tracking-widest">
          WatchDog · OpenContribution
        </h1>
        <p className="mt-2 font-mono text-xs text-neutral-500">
          Register a camera. We text you a 6-digit code; your feed goes live after you confirm.
        </p>
        <div className="mt-6">
          <RegistrationForm />
        </div>
      </div>
    </main>
  );
}
