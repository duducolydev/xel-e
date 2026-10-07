import type { Metadata } from "next";
import { CarteAuth } from "@/components/carte-auth";
import { BoutonDesinscription } from "./bouton";

export const metadata: Metadata = { title: "Se désinscrire du résumé — Xel-E", robots: { index: false } };

export default async function PageDesinscription({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  return (
    <CarteAuth titre="Résumé d'activité">
      {typeof token === "string" && token ? (
        <BoutonDesinscription token={token} />
      ) : (
        <p className="text-sm text-gray-700">Ce lien est incomplet. Ouvrez à nouveau le lien reçu par email.</p>
      )}
    </CarteAuth>
  );
}
