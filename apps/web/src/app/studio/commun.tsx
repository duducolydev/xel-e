import type { StatutLeconStudio } from "@xel-e/shared";

const STATUTS: Record<StatutLeconStudio, { libelle: string; classe: string }> = {
  BROUILLON: { libelle: "Brouillon", classe: "bg-gray-100 text-gray-800" },
  EN_REVUE: { libelle: "En revue", classe: "bg-amber-100 text-amber-900" },
  PUBLIE: { libelle: "Publiée", classe: "bg-green-100 text-green-800" },
};

// Une leçon déjà en ligne qui repasse en brouillon garde sa version publiée : on le rappelle.
export function BadgeStatut({ statut, version }: { statut: StatutLeconStudio; version: number }) {
  const { libelle, classe } = STATUTS[statut];
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className={`rounded-full px-2.5 py-0.5 font-semibold ${classe}`} data-testid="statut-lecon">
        {libelle}
      </span>
      {version > 0 && statut !== "PUBLIE" ? <span className="text-gray-500">v{version} en ligne</span> : null}
    </span>
  );
}

export function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Africa/Dakar" });
}
