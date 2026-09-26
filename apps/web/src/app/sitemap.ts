import { NIVEAUX, INFOS_MATIERES, type EntreePlanDuSite } from "@xel-e/shared";
import type { MetadataRoute } from "next";
import { lirePublic, SITE_URL } from "@/lib/api-public";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lecons = (await lirePublic<EntreePlanDuSite[]>("/catalogue/plan-du-site")) ?? [];
  const matieres = Object.values(INFOS_MATIERES);
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/cours`, changeFrequency: "weekly", priority: 0.9 },
    ...NIVEAUX.map((niveau) => ({ url: `${SITE_URL}/cours/${niveau}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...NIVEAUX.flatMap((niveau) =>
      matieres.map((matiere) => ({
        url: `${SITE_URL}/cours/${niveau}/${matiere.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ),
    ...lecons.map((lecon) => ({
      url: `${SITE_URL}/cours/${lecon.niveau}/${lecon.matiere}/${lecon.slug}`,
      lastModified: lecon.publieLe,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
