import Link from "next/link";
import { EntetePublic } from "@/components/entete-public";

export default function PageIntrouvable() {
  return (
    <>
      <EntetePublic />
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="text-5xl font-bold text-brand">404</p>
        <h1 className="text-2xl font-bold text-brand-dark">Page introuvable</h1>
        <p className="text-gray-600">
          Cette page n&apos;existe pas, ou la leçon n&apos;est pas encore publiée.
        </p>
        <Link href="/cours" className="rounded-lg bg-brand-dark px-4 py-3 font-semibold text-white hover:bg-brand">
          Voir tous les cours
        </Link>
      </main>
    </>
  );
}
