import type { Metadata } from "next";
import { CarteAuth } from "@/components/carte-auth";
import { FormulaireReinitialisation } from "./formulaire-reinitialisation";

export const metadata: Metadata = { title: "Nouveau mot de passe — Xel-E" };

export default async function PageReinitialisation({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <CarteAuth titre="Choisir un nouveau mot de passe">
      <FormulaireReinitialisation token={typeof token === "string" ? token : undefined} />
    </CarteAuth>
  );
}
