import "katex/dist/katex.min.css";
import type { LeconPubliee } from "@xel-e/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { BoutonTerminerLecon } from "@/components/bouton-terminer-lecon";
import { CompteurVue } from "@/components/compteur-vue";
import { EntetePublic } from "@/components/entete-public";
import { FilAriane } from "@/components/fil-ariane";
import { lirePublic, SITE_URL } from "@/lib/api-public";

type Params = Promise<{ niveau: string; matiere: string; slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const lireLecon = cache((slug: string) => lirePublic<LeconPubliee>(`/lecons/${encodeURIComponent(slug)}`));

function cheminLecon(lecon: Pick<LeconPubliee, "niveau" | "matiere" | "slug">): string {
  return `/cours/${lecon.niveau}/${lecon.matiere.slug}/${lecon.slug}`;
}

// Section demandée (1 par défaut) ; null si le paramètre ne correspond à aucune section.
function numeroSection(brut: string | string[] | undefined, total: number): number | null {
  if (brut === undefined) return 1;
  const numero = typeof brut === "string" && /^\d+$/.test(brut) ? Number(brut) : NaN;
  return numero >= 1 && numero <= total ? numero : null;
}

function url(chemin: string, section: number): string {
  return section > 1 ? `${chemin}?section=${section}` : chemin;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const lecon = await lireLecon((await params).slug);
  if (!lecon) return {};
  const section = numeroSection((await searchParams).section, lecon.sections.length) ?? 1;
  const titreSection = section > 1 ? lecon.sections[section - 1]?.titre : null;
  const titre = `${lecon.titre}${titreSection ? ` — ${titreSection}` : ""} | ${lecon.matiere.nom} ${lecon.niveau}`;
  const canonique = url(cheminLecon(lecon), section);
  return {
    title: `${titre} — Xel-E`,
    description: lecon.resume,
    alternates: { canonical: canonique },
    openGraph: {
      type: "article",
      title: titre,
      description: lecon.resume,
      url: canonique,
      siteName: "Xel-E",
      locale: "fr_SN",
      publishedTime: lecon.publieLe,
      section: lecon.matiere.nom,
      images: [{ url: "/logo-xele.png", alt: "Xel-E" }],
    },
  };
}

function jsonLdLecon(lecon: LeconPubliee): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: lecon.titre,
    description: lecon.resume,
    inLanguage: "fr",
    educationalLevel: lecon.niveau,
    about: lecon.matiere.nom,
    learningResourceType: "Leçon",
    isAccessibleForFree: true,
    datePublished: lecon.publieLe,
    url: `${SITE_URL}${cheminLecon(lecon)}`,
    publisher: { "@type": "Organization", name: "Xel-E" },
    ...(lecon.auteur ? { author: { "@type": "Person", name: lecon.auteur } } : {}),
  }).replace(/</g, "\\u003c");
}

const classeLien =
  "inline-flex items-center gap-1 rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-brand-dark hover:border-brand hover:bg-brand-wash";

export default async function PageLecon({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { niveau, matiere, slug } = await params;
  const lecon = await lireLecon(slug);
  if (!lecon) notFound();

  const chemin = cheminLecon(lecon);
  const numero = numeroSection((await searchParams).section, lecon.sections.length);
  if (numero === null) notFound();
  // Une leçon n'a qu'une adresse : on redirige si le niveau ou la matière de l'URL ne correspondent pas.
  if (niveau !== lecon.niveau || matiere !== lecon.matiere.slug) permanentRedirect(url(chemin, numero));

  const section = lecon.sections[numero - 1];
  const total = lecon.sections.length;
  const datePublication = new Date(lecon.publieLe).toLocaleDateString("fr-FR", {
    dateStyle: "long",
    timeZone: "UTC",
  });

  return (
    <>
      <EntetePublic />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <FilAriane
          etapes={[
            { libelle: "Accueil", href: "/" },
            { libelle: "Cours", href: "/cours" },
            { libelle: lecon.niveau, href: `/cours/${lecon.niveau}` },
            { libelle: lecon.matiere.nom, href: `/cours/${lecon.niveau}/${lecon.matiere.slug}` },
            { libelle: lecon.titre },
          ]}
        />

        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-brand-texte">{lecon.chapitre}</p>
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">{lecon.titre}</h1>
          {lecon.auteur ? <p className="text-sm font-medium text-gray-700">Cours proposé par {lecon.auteur}</p> : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
            <span>
              Version {lecon.version} · publiée le {datePublication}
            </span>
            <a href={`/api/lecons/${lecon.slug}/pdf`} download className="font-medium text-brand-dark underline">
              Télécharger le PDF
            </a>
            {lecon.aUnQuiz ? (
              <Link href={`${chemin}/quiz`} className="font-medium text-brand-dark underline">
                Faire le quiz
              </Link>
            ) : null}
          </div>
        </header>

        {total > 1 ? (
          <details className="rounded-xl border border-gray-200 px-4 py-3" open={numero === 1}>
            <summary className="cursor-pointer font-semibold text-gray-900">
              Sommaire · section {numero} sur {total}
            </summary>
            <ol className="mt-2 space-y-1">
              {lecon.sections.map((s, index) => (
                <li key={index}>
                  <Link
                    href={url(chemin, index + 1)}
                    aria-current={index + 1 === numero ? "page" : undefined}
                    className={
                      "block rounded-md px-2 py-1.5 " +
                      (index + 1 === numero ? "bg-brand-wash font-semibold text-brand-dark" : "text-gray-700 hover:bg-gray-50")
                    }
                  >
                    {index + 1}. {s.titre ?? "Introduction"}
                  </Link>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <article aria-labelledby="titre-section">
          <h2 id="titre-section" className="mb-4 text-xl font-bold text-gray-900">
            {section?.titre ?? "Introduction"}
          </h2>
          <div className="contenu-lecon" dangerouslySetInnerHTML={{ __html: section?.html ?? "" }} />
        </article>

        {numero === total ? <BoutonTerminerLecon slug={lecon.slug} cheminLecon={chemin} /> : null}

        {lecon.aUnQuiz && numero === total ? (
          <section className="rounded-xl border border-brand-light bg-brand-wash p-5">
            <h2 className="text-lg font-semibold text-brand-dark">Teste tes connaissances</h2>
            <p className="mt-1 text-sm text-gray-700">Un court quiz pour vérifier que tu as bien compris la leçon.</p>
            <Link
              href={`${chemin}/quiz`}
              className="mt-3 inline-block rounded-lg bg-brand-dark px-4 py-2.5 font-semibold text-white hover:bg-brand"
            >
              Commencer le quiz
            </Link>
          </section>
        ) : null}

        <nav aria-label="Pagination de la leçon" className="flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-5">
          {numero > 1 ? (
            <Link href={url(chemin, numero - 1)} rel="prev" className={classeLien}>
              ← Section précédente
            </Link>
          ) : lecon.precedente ? (
            <Link href={cheminLecon({ ...lecon, slug: lecon.precedente.slug })} className={classeLien}>
              ← Leçon précédente
            </Link>
          ) : (
            <span />
          )}
          {numero < total ? (
            <Link href={url(chemin, numero + 1)} rel="next" className={`${classeLien} border-brand-dark bg-brand-dark text-white hover:bg-brand hover:text-white`}>
              Section suivante →
            </Link>
          ) : lecon.suivante ? (
            <Link href={cheminLecon({ ...lecon, slug: lecon.suivante.slug })} className={classeLien}>
              Leçon suivante : {lecon.suivante.titre} →
            </Link>
          ) : null}
        </nav>
      </main>
      <CompteurVue slug={lecon.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdLecon(lecon) }} />
    </>
  );
}
