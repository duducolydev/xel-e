import sanitizeHtml from "sanitize-html";
import { describe, expect, it } from "vitest";
import { decouperSections, rendreLecon } from "./rendu-markdown";

const html = (markdown: string) => rendreLecon(markdown).sections.map((s) => s.html).join("");

interface Element {
  tag: string;
  attribs: Record<string, string>;
}

// Analyse réelle du HTML produit (le texte échappé comme « &lt;script&gt; » est inoffensif) :
// on inspecte les éléments et attributs que le navigateur interpréterait.
function elements(rendu: string): Element[] {
  const trouves: Element[] = [];
  // onOpenTag reçoit les attributs bruts, avant tout filtrage de schéma par sanitize-html
  // (copie indispensable : l'objet est ensuite modifié en place).
  sanitizeHtml(rendu, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    onOpenTag: (tag, attribs) => {
      trouves.push({ tag, attribs: { ...attribs } });
    },
  });
  return trouves;
}

const BALISES_INTERDITES = new Set(["script", "iframe", "object", "embed", "style", "form", "base", "link", "meta"]);
const URL_DANGEREUSE = /^\s*(javascript|vbscript|data):/i;

function expectSain(rendu: string) {
  for (const { tag, attribs } of elements(rendu)) {
    expect(BALISES_INTERDITES.has(tag), `balise <${tag}>`).toBe(false);
    for (const [nom, valeur] of Object.entries(attribs)) {
      expect(/^on/i.test(nom), `attribut ${nom} sur <${tag}>`).toBe(false);
      if (["href", "src", "xlink:href", "action", "formaction"].includes(nom)) {
        expect(URL_DANGEREUSE.test(valeur), `${nom}="${valeur}"`).toBe(false);
      }
    }
  }
}

describe("conversion Markdown → HTML : neutralisation XSS", () => {
  const charges: [string, string][] = [
    ["balise script", "<script>alert(1)</script>"],
    ["image avec onerror", '<img src=x onerror="alert(1)">'],
    ["svg onload", "<svg onload=alert(1)></svg>"],
    ["iframe", '<iframe src="https://evil.example"></iframe>'],
    ["lien javascript:", "[clique](javascript:alert(1))"],
    ["lien javascript: encodé", "[clique](jav&#x61;script:alert(1))"],
    ["lien javascript: casse mixte", "[clique](JaVaScRiPt:alert(1))"],
    ["image javascript:", "![x](javascript:alert(1))"],
    ["lien data:", "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"],
    ["html brut dans un titre", "## <img src=x onerror=alert(1)>\ntexte"],
    ["html dans un tableau", "| a |\n|---|\n| <script>alert(1)</script> |"],
    ["formule \\href javascript", "$\\href{javascript:alert(1)}{clic}$"],
    ["formule \\url", "$$\\url{javascript:alert(1)}$$"],
    ["style injecté", "<style>body{display:none}</style>"],
    ["attribut en autolien", "<https://ok.example\" onmouseover=\"alert(1)>"],
  ];

  it.each(charges)("neutralise : %s", (_nom, markdown) => {
    expectSain(html(markdown));
  });

  it("le détecteur repère bien du HTML actif dangereux (contrôle du test lui-même)", () => {
    expect(() => expectSain('<img src="x" onerror="alert(1)">')).toThrow();
    expect(() => expectSain('<a href="javascript:alert(1)">x</a>')).toThrow();
    expect(() => expectSain("<script>alert(1)</script>")).toThrow();
  });

  it("affiche le HTML brut comme du texte au lieu de l'interpréter", () => {
    expect(html("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });

  it("ne garde que les images servies par nos médias", () => {
    expect(html("![schéma](/api/medias/abc.png)")).toContain('src="/api/medias/abc.png"');
    expect(html("![pixel](https://tracker.example/p.gif)")).not.toContain("<img");
  });

  it("charge les images en différé (économie de données)", () => {
    expect(html("![schéma](/api/medias/abc.png)")).toContain('loading="lazy"');
  });

  it("ouvre les liens externes dans un nouvel onglet sans fuite de référent", () => {
    const rendu = html("[source](https://fr.wikipedia.org/wiki/Pythagore)");
    expect(rendu).toContain('target="_blank"');
    expect(rendu).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe("formules KaTeX", () => {
  it("rend une formule en ligne", () => {
    const rendu = html("On a $a^2 + b^2 = c^2$ dans un triangle rectangle.");
    expect(rendu).toContain('class="katex"');
    expect(rendu).toContain("<math");
  });

  it("rend une formule centrée", () => {
    expect(html("$$\\frac{1}{2}$$")).toContain('<div class="formule"><span class="katex-display">');
  });

  it("affiche une formule invalide sans faire échouer le rendu", () => {
    expect(() => html("$\\frac{1}{$")).not.toThrow();
  });
});

describe("découpage en sections", () => {
  it("crée une section par titre de niveau 2", () => {
    const sections = decouperSections("## Définition\nTexte A\n## Exemple\nTexte B");
    expect(sections.map((s) => s.titre)).toEqual(["Définition", "Exemple"]);
  });

  it("garde l'introduction avant le premier titre dans une section sans titre", () => {
    const sections = decouperSections("Intro\n## Suite\nTexte");
    expect(sections).toHaveLength(2);
    expect(sections[0]?.titre).toBeNull();
  });

  it("ignore les ## à l'intérieur d'un bloc de code", () => {
    const sections = decouperSections("## Code\n```\n## pas un titre\n```\nfin");
    expect(sections).toHaveLength(1);
  });

  it("ne coupe pas sur les titres de niveau 3", () => {
    expect(decouperSections("## A\n### A.1\ntexte")).toHaveLength(1);
  });
});

describe("résumé pour le référencement", () => {
  it("prend le texte brut de la première section, sans balises", () => {
    const { resume } = rendreLecon("## Définition\nDans un **triangle rectangle**, l'hypoténuse est le plus grand côté.");
    expect(resume).toBe("Dans un triangle rectangle, l'hypoténuse est le plus grand côté.");
  });

  it("tronque proprement sur un mot au-delà de 160 caractères", () => {
    const { resume } = rendreLecon("mot ".repeat(100));
    expect(resume.length).toBeLessThanOrEqual(161);
    expect(resume.endsWith("…")).toBe(true);
  });
});
