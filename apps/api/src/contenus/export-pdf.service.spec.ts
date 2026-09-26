import type { LeconPubliee } from "@xel-e/shared";
import { describe, expect, it, vi } from "vitest";
import type { CatalogueService } from "./catalogue.service";
import { ExportPdfService } from "./export-pdf.service";
import type { PdfService } from "./pdf.service";
import type { StockageService } from "./stockage.service";

const IMAGE = `${"a".repeat(64)}.png`;

const lecon: LeconPubliee = {
  slug: "pythagore",
  titre: "Le théorème de Pythagore",
  resume: "Résumé",
  version: 3,
  publieLe: "2026-09-26T10:00:00.000Z",
  niveau: "4e",
  matiere: { libelle: "Maths", slug: "maths", nom: "Mathématiques" },
  chapitre: "Le triangle rectangle",
  sections: [{ titre: "Figure", html: `<p><img src="/api/medias/${IMAGE}" alt="triangle"></p>` }],
  aUnQuiz: false,
  precedente: null,
  suivante: null,
};

function creerService() {
  const catalogue = {
    versionEnLigne: vi.fn().mockResolvedValue({ lecon, version: { id: "version-3", numero: 3 } }),
  };
  const stockage = { lire: vi.fn().mockResolvedValue(null), ecrire: vi.fn().mockResolvedValue(undefined) };
  const pdf = { genererDepuisHtml: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.7 genere")) };
  const service = new ExportPdfService(
    catalogue as unknown as CatalogueService,
    stockage as unknown as StockageService,
    pdf as unknown as PdfService,
  );
  return { service, stockage, pdf };
}

describe("ExportPdfService", () => {
  it("sert le PDF depuis le cache sans relancer Chromium", async () => {
    const { service, stockage, pdf } = creerService();
    stockage.lire.mockResolvedValueOnce({ corps: Buffer.from("%PDF-cache"), type: "application/pdf" });

    const resultat = await service.pdfLecon("pythagore");

    expect(resultat).toEqual({ nomFichier: "pythagore-v3.pdf", contenu: Buffer.from("%PDF-cache") });
    expect(stockage.lire).toHaveBeenCalledWith("pdf/lecons/version-3.pdf");
    expect(pdf.genererDepuisHtml).not.toHaveBeenCalled();
  });

  it("génère le PDF au premier téléchargement puis le met en cache sous l'identifiant de la version", async () => {
    const { service, stockage, pdf } = creerService();

    const resultat = await service.pdfLecon("pythagore");

    expect(pdf.genererDepuisHtml).toHaveBeenCalledTimes(1);
    expect(stockage.ecrire).toHaveBeenCalledWith("pdf/lecons/version-3.pdf", resultat.contenu, "application/pdf");
  });

  it("intègre les images de la leçon en data URI (aucun accès réseau pendant le rendu)", async () => {
    const { service, stockage, pdf } = creerService();
    stockage.lire.mockImplementation(async (cle: string) =>
      cle === `medias/${IMAGE}` ? { corps: Buffer.from("png"), type: "image/png" } : null,
    );

    await service.pdfLecon("pythagore");

    const html = pdf.genererDepuisHtml.mock.calls[0]?.[0] as string;
    expect(html).toContain(`src="data:image/png;base64,${Buffer.from("png").toString("base64")}"`);
    expect(html).not.toContain("/api/medias/");
  });

  it("échappe le titre dans le gabarit", async () => {
    const { service, pdf } = creerService();
    lecon.titre = "<script>alert(1)</script>";

    await service.pdfLecon("pythagore");

    const html = pdf.genererDepuisHtml.mock.calls[0]?.[0] as string;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)");
    lecon.titre = "Le théorème de Pythagore";
  });

  it("renvoie quand même le PDF si la mise en cache échoue", async () => {
    const { service, stockage } = creerService();
    stockage.ecrire.mockRejectedValue(new Error("S3 indisponible"));

    await expect(service.pdfLecon("pythagore")).resolves.toMatchObject({ nomFichier: "pythagore-v3.pdf" });
  });

  it("génère quand même si la lecture du cache échoue", async () => {
    const { service, stockage, pdf } = creerService();
    stockage.lire.mockRejectedValue(new Error("S3 indisponible"));

    await service.pdfLecon("pythagore");

    expect(pdf.genererDepuisHtml).toHaveBeenCalled();
  });
});
