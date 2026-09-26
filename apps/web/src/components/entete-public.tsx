import Link from "next/link";

export function EntetePublic() {
  return (
    <header className="border-b border-gray-100 bg-white">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3"
      >
        <Link href="/" className="text-xl font-bold tracking-tight text-brand-dark">
          xel<span className="text-brand">-e</span>
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link href="/cours" className="text-gray-700 hover:text-brand-dark">
            Les cours
          </Link>
          <Link
            href="/tableau-de-bord"
            className="rounded-lg bg-brand-dark px-3 py-2 text-white hover:bg-brand"
          >
            Mon espace
          </Link>
        </div>
      </nav>
    </header>
  );
}
