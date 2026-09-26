import { NIVEAUX, type NiveauCatalogue } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntetePublic } from "@/components/entete-public";
import { FilAriane } from "@/components/fil-ariane";
import { lirePublic } from "@/lib/api-public";

type Params = Promise<{ niveau: string }>;

function niveauValide(niveau: string): boolean {
  return (NIVEAUX as readonly string[]).includes(niveau);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { niveau } = await params;
  if (!niveauValide(niveau)) return {};
  return {
    title: `Cours de ${niveau} : Maths, Physique-Chimie, SVT — Xel-E`,
    description: `Tous les cours de la classe de ${niveau} en Mathématiques, Physique-Chimie et SVT.`,
    alternates: { canonical: `/cours/${niveau}` },
  };
}

export default async function PageNiveau({ params }: { params: Params }) {
  const { niveau } = await params;
  if (!niveauValide(niveau)) notFound();
  const catalogue = (await lirePublic<NiveauCatalogue[]>("/catalogue")) ?? [];
  const matieres = catalogue.find((entree) => entree.niveau === niveau)?.matieres ?? [];

  return (
    <>
      <EntetePublic />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <FilAriane
          etapes={[
            { libelle: "Accueil", href: "/" },
            { libelle: "Cours", href: "/cours" },
            { libelle: niveau },
          ]}
        />
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Classe de {niveau}</h1>
        <ul className="grid gap-4 sm:grid-cols-3">
          {matieres.map((matiere) => (
            <li key={matiere.slug}>
              <Link
                href={`/cours/${niveau}/${matiere.slug}`}
                className="block h-full rounded-xl border border-gray-200 p-5 hover:border-brand hover:bg-brand-wash"
              >
                <span className="block text-lg font-semibold text-gray-900">{matiere.nom}</span>
                <span className="mt-1 block text-sm text-gray-600">
                  {matiere.nombreLecons} leçon{matiere.nombreLecons > 1 ? "s" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
