import type { PageMatiere } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { EntetePublic } from "@/components/entete-public";
import { FilAriane } from "@/components/fil-ariane";
import { lirePublic } from "@/lib/api-public";

type Params = Promise<{ niveau: string; matiere: string }>;

const lirePage = cache((niveau: string, matiere: string) =>
  lirePublic<PageMatiere>(`/catalogue/${encodeURIComponent(niveau)}/${encodeURIComponent(matiere)}`),
);

async function charger(params: Params): Promise<PageMatiere | null> {
  const { niveau, matiere } = await params;
  return lirePage(niveau, matiere);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await charger(params);
  if (!page) return {};
  return {
    title: `${page.matiere.nom} ${page.niveau} : les cours — Xel-E`,
    description: `Les leçons de ${page.matiere.nom} de la classe de ${page.niveau}, chapitre par chapitre.`,
    alternates: { canonical: `/cours/${page.niveau}/${page.matiere.slug}` },
  };
}

export default async function PageMatiereNiveau({ params }: { params: Params }) {
  const page = await charger(params);
  if (!page) notFound();
  const base = `/cours/${page.niveau}/${page.matiere.slug}`;

  return (
    <>
      <EntetePublic />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <FilAriane
          etapes={[
            { libelle: "Accueil", href: "/" },
            { libelle: "Cours", href: "/cours" },
            { libelle: page.niveau, href: `/cours/${page.niveau}` },
            { libelle: page.matiere.nom },
          ]}
        />
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">
          {page.matiere.nom} — {page.niveau}
        </h1>
        {page.chapitres.length === 0 ? (
          <p className="text-gray-600">Les leçons de cette matière arrivent bientôt.</p>
        ) : (
          <ol className="space-y-5">
            {page.chapitres.map((chapitre, index) => (
              <li key={`${chapitre.titre}-${index}`} className="rounded-xl border border-gray-200 p-5">
                <h2 className="text-lg font-semibold text-gray-900">
                  <span className="text-brand-texte">Chapitre {index + 1} · </span>
                  {chapitre.titre}
                </h2>
                <ol className="mt-3 space-y-1">
                  {chapitre.lecons.map((lecon) => (
                    <li key={lecon.slug}>
                      <Link
                        href={`${base}/${lecon.slug}`}
                        className="block rounded-lg px-3 py-2 text-gray-800 hover:bg-brand-wash hover:text-brand-dark"
                      >
                        {lecon.titre}
                      </Link>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  );
}
