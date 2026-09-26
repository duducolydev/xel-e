import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import type { LeconPubliee } from "@xel-e/shared";

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let cssKatex: Promise<string> | undefined;

// Polices KaTeX intégrées en data URI : le PDF est rendu sans aucun accès réseau.
function chargerCssKatex(): Promise<string> {
  cssKatex ??= (async () => {
    const chemin = require.resolve("katex/dist/katex.min.css");
    const css = (await readFile(chemin, "utf8")).replace(/,url\(fonts\/[^)]+\.(woff|ttf)\) format\("[^"]+"\)/g, "");
    const polices = [...new Set(css.match(/fonts\/[^)]+\.woff2/g) ?? [])];
    let resultat = css;
    for (const police of polices) {
      const donnees = (await readFile(join(dirname(chemin), police))).toString("base64");
      resultat = resultat.split(`url(${police})`).join(`url(data:font/woff2;base64,${donnees})`);
    }
    return resultat;
  })();
  return cssKatex;
}

export async function gabaritPdf(lecon: LeconPubliee): Promise<string> {
  const sections = lecon.sections
    .map((section) => `${section.titre ? `<h2>${echapper(section.titre)}</h2>` : ""}${section.html}`)
    .join("\n");
  const date = new Date(lecon.publieLe).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "UTC" });
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${echapper(lecon.titre)}</title>
<style>${await chargerCssKatex()}</style>
<style>
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1f2937; font-size: 11.5pt; line-height: 1.55; }
  header { border-bottom: 3px solid #0e4478; padding-bottom: 8px; margin-bottom: 18px; }
  .fil { color: #3a8bdb; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .04em; }
  h1 { color: #0e4478; font-size: 22pt; margin: 4px 0 0; }
  h2 { color: #0e4478; font-size: 14pt; margin: 22px 0 6px; page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 14px 0 4px; }
  img { max-width: 100%; }
  .formule { margin: 10px 0; }
  table { border-collapse: collapse; } th, td { border: 1px solid #d1d5db; padding: 4px 8px; }
  pre { background: #f3f4f6; padding: 8px; white-space: pre-wrap; }
  footer { margin-top: 28px; font-size: 8.5pt; color: #6b7280; }
</style></head>
<body>
<header>
  <div class="fil">${echapper(lecon.matiere.nom)} · ${echapper(lecon.niveau)} · ${echapper(lecon.chapitre)}</div>
  <h1>${echapper(lecon.titre)}</h1>
</header>
${sections}
<footer>Xel-E — Xeeli ci xel · Version ${lecon.version} publiée le ${date}</footer>
</body></html>`;
}

@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private navigateur: Promise<Browser> | undefined;

  private lancer(): Promise<Browser> {
    this.navigateur ??= chromium.launch().catch((error: Error) => {
      this.navigateur = undefined;
      throw error;
    });
    return this.navigateur;
  }

  async genererDepuisHtml(html: string): Promise<Buffer> {
    let navigateur: Browser;
    try {
      navigateur = await this.lancer();
    } catch (error) {
      this.logger.error(`Chromium indisponible : ${(error as Error).message}`);
      throw new ServiceUnavailableException("Le PDF n'est pas disponible pour le moment. Réessaie plus tard.");
    }
    const page = await navigateur.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      return await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
      });
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.navigateur) await (await this.navigateur.catch(() => undefined))?.close();
  }
}
