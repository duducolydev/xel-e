import type { Metadata } from "next";
import { ActionJeton } from "@/components/action-jeton";
import { CarteAuth } from "@/components/carte-auth";

export const metadata: Metadata = { title: "Confirmer mon email — Xel-E" };

export default async function PageConfirmerEmail({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <CarteAuth titre="Confirmer ton adresse email">
      <ActionJeton
        chemin="/auth/confirmer-email"
        token={typeof token === "string" ? token : undefined}
        libelle="Confirmer mon adresse email"
        suite={{ href: "/tableau-de-bord", libelle: "Aller à mon tableau de bord" }}
      />
    </CarteAuth>
  );
}
