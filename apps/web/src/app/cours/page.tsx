import type { NiveauCatalogue } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EntetePublic } from "@/components/entete-public";
import { FilAriane } from "@/components/fil-ariane";
import { lirePublic } from "@/lib/api-public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Les cours de Maths, PC et SVT de la 6e à la 3e — Xel-E",
  description:
    "Cours gratuits de Mathématiques, Physique-Chimie et SVT pour les collégiens sénégalais, de la 6e à la 3e.",
  alternates: { canonical: "/cours" },
};

export default async function PageCours() {
  const niveaux = (await lirePublic<NiveauCatalogue[]>("/catalogue")) ?? [];
  return (
    <>
      <EntetePublic />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <FilAriane etapes={[{ libelle: "Accueil", href: "/" }, { libelle: "Cours" }]} />
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Les cours</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {niveaux.map(({ niveau, matieres }) => (
            <section key={niveau} className="rounded-xl border border-gray-200 p-5">
              <h2 className="text-xl font-bold text-gray-900">
                <Link href={`/cours/${niveau}`} className="hover:text-brand-dark">
                  Classe de {niveau}
                </Link>
              </h2>
              <ul className="mt-3 space-y-2">
                {matieres.map((matiere) => (
                  <li key={matiere.slug}>
                    <Link
                      href={`/cours/${niveau}/${matiere.slug}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-gray-800 hover:bg-brand-wash"
                    >
                      <span>{matiere.nom}</span>
                      <span className="text-sm text-gray-500">
                        {matiere.nombreLecons} leçon{matiere.nombreLecons > 1 ? "s" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
