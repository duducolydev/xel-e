import { formaterFcfa } from "@xel-e/shared";

export interface DonneesRecu {
  numeroRecu: string;
  confirmeLe: Date;
  montant: number;
  fournisseur: string;
  referenceInterne: string;
  plan: { libelle: string };
  payeur: { nomComplet: string; email: string | null; identifiant: string | null };
  beneficiaire: { nomComplet: string };
  periode: { debutLe: Date; expireLe: Date | null };
}

const FOURNISSEURS: Record<string, string> = { WAVE: "Wave", ORANGE_MONEY: "Orange Money", SIMULE: "Paiement simulé (test)" };

function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const date = (d: Date) => d.toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Dakar" });

// Reçu de paiement (HTML rendu en PDF). Toutes les valeurs dynamiques sont échappées.
export function gabaritRecu(recu: DonneesRecu): string {
  const contact = recu.payeur.email ?? recu.payeur.identifiant ?? "";
  const lignes: [string, string][] = [
    ["Reçu n°", recu.numeroRecu],
    ["Date du paiement", date(recu.confirmeLe)],
    ["Payé par", `${recu.payeur.nomComplet}${contact ? ` (${contact})` : ""}`],
    ["Bénéficiaire", recu.beneficiaire.nomComplet],
    ["Offre", recu.plan.libelle],
    ["Période d'accès", `du ${date(recu.periode.debutLe)} au ${recu.periode.expireLe ? date(recu.periode.expireLe) : "—"}`],
    ["Moyen de paiement", FOURNISSEURS[recu.fournisseur] ?? recu.fournisseur],
    ["Référence", recu.referenceInterne],
  ];
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Reçu ${echapper(recu.numeroRecu)}</title>
<style>
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1f2937; font-size: 12pt; }
  h1 { color: #0b4f6c; font-size: 20pt; margin: 0 0 4mm; }
  .entete { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0b4f6c; padding-bottom: 6mm; margin-bottom: 8mm; }
  .marque { font-size: 22pt; font-weight: bold; color: #0b4f6c; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; color: #4b5563; font-weight: normal; width: 40%; padding: 3mm 0; border-bottom: 1px solid #e5e7eb; }
  td { padding: 3mm 0; border-bottom: 1px solid #e5e7eb; }
  .total { margin-top: 8mm; text-align: right; font-size: 16pt; font-weight: bold; }
  footer { margin-top: 16mm; color: #6b7280; font-size: 9pt; }
</style></head><body>
<div class="entete"><div><div class="marque">Xel-E</div><div>Xeeli ci xel — soutien scolaire</div></div><div><h1>Reçu de paiement</h1></div></div>
<table>${lignes.map(([cle, valeur]) => `<tr><th>${echapper(cle)}</th><td>${echapper(valeur)}</td></tr>`).join("")}</table>
<p class="total">Montant payé : ${echapper(formaterFcfa(recu.montant))}</p>
<footer>Ce reçu atteste du paiement de l'accès Premium Xel-E pour la période indiquée. Conservez-le pour toute réclamation.</footer>
</body></html>`;
}
