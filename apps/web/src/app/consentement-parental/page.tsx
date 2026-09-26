import type { Metadata } from "next";
import { ActionJeton } from "@/components/action-jeton";
import { CarteAuth } from "@/components/carte-auth";

export const metadata: Metadata = { title: "Accord parental — Xel-E" };

export default async function PageConsentementParental({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <CarteAuth
      titre="Accord parental"
      sousTitre="Votre enfant s'est inscrit sur Xel-E et vous a indiqué comme contact parent."
    >
      <div className="mb-5 space-y-3 text-sm text-gray-700">
        <p>
          Xel-E propose des cours, exercices et quiz de Maths, Physique-Chimie et SVT pour les
          collégiens. Votre enfant y a déjà accès.
        </p>
        <p>
          Votre accord ouvre en plus le <strong>forum d&apos;entraide</strong>, modéré, où les élèves
          échangent sous pseudonyme : ni leur nom ni leur email n&apos;y sont jamais affichés.
        </p>
      </div>
      <ActionJeton
        chemin="/auth/consentement-parental"
        token={typeof token === "string" ? token : undefined}
        libelle="Je donne mon accord"
      />
    </CarteAuth>
  );
}
