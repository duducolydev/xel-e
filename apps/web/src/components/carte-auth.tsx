import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function CarteAuth({
  titre,
  sousTitre,
  children,
  pied,
}: {
  titre: string;
  sousTitre?: string;
  children: ReactNode;
  pied?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-brand-wash to-white px-4 py-10">
      <Link href="/" aria-label="Accueil Xel-E" className="mb-6">
        <Image src="/logo-xele.png" alt="Xel-E" width={88} height={129} priority />
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-lg shadow-brand-dark/5 sm:p-8">
        <h1 className="text-2xl font-bold text-brand-dark">{titre}</h1>
        {sousTitre ? <p className="mt-1 text-sm text-gray-600">{sousTitre}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {pied ? <div className="mt-6 text-center text-sm text-gray-600">{pied}</div> : null}
    </main>
  );
}
