import type { SectionLecon } from "@xel-e/shared";

// Rendu HTML produit (et assaini) par l'API, identique à celui que liront les élèves.
export function ApercuLecon({ sections }: { sections: SectionLecon[] }) {
  if (sections.length === 0) return <p className="text-sm text-gray-600">Le contenu est vide.</p>;
  return (
    <div className="space-y-6">
      {sections.map((section, index) => (
        <section key={index} className="space-y-3">
          <h3 className="text-lg font-bold text-gray-900">{section.titre ?? "Introduction"}</h3>
          <div className="contenu-lecon" dangerouslySetInnerHTML={{ __html: section.html }} />
        </section>
      ))}
    </div>
  );
}
