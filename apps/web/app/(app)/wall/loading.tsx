export default function WallLoading() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] border-t border-neutral-200 bg-white">
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center px-6 py-20">
        <div className="h-3 w-28 animate-pulse bg-neutral-100" />
        <div className="mt-5 h-8 w-72 max-w-full animate-pulse bg-neutral-100" />
        <div className="mt-6 h-4 w-full max-w-xl animate-pulse bg-neutral-100" />
      </section>
    </main>
  );
}
