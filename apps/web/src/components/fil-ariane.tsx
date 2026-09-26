import Link from "next/link";
import { SITE_URL } from "@/lib/api-public";

export interface Etape {
  libelle: string;
  href?: string;
}

// Données structurées BreadcrumbList : les moteurs de recherche affichent le chemin dans leurs résultats.
function jsonLd(etapes: Etape[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: etapes.map((etape, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: etape.libelle,
      ...(etape.href ? { item: `${SITE_URL}${etape.href}` } : {}),
    })),
  }).replace(/</g, "\\u003c");
}

export function FilAriane({ etapes }: { etapes: Etape[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="text-sm text-gray-600">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {etapes.map((etape, index) => (
          <li key={`${etape.libelle}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true">›</span> : null}
            {etape.href ? (
              <Link href={etape.href} className="text-brand-dark underline-offset-2 hover:underline">
                {etape.libelle}
              </Link>
            ) : (
              <span aria-current={index === etapes.length - 1 ? "page" : undefined}>{etape.libelle}</span>
            )}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(etapes) }} />
    </nav>
  );
}
