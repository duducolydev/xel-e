import katex from "katex";
import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import sanitizeHtml from "sanitize-html";

export interface SectionRendue {
  titre: string | null;
  html: string;
}

export interface LeconRendue {
  sections: SectionRendue[];
  resume: string;
}

interface SectionSource {
  titre: string | null;
  markdown: string;
}

interface EnvRendu {
  formules: { tex: string; affichee: boolean }[];
}

export const PREFIXE_MEDIAS = "/api/medias/";
const LONGUEUR_RESUME = 160;

// markdown-it-texmath ne sert qu'à reconnaître $…$ et $$…$$ : chaque formule devient un marqueur
// neutre, le HTML est assaini, puis les marqueurs sont remplacés par le rendu KaTeX (trust: false).
const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
md.use(texmath, { delimiters: "dollars", engine: katex });
const reglesFormules = [
  ...texmath.rules.dollars!.inline.map((regle) => ({ nom: regle.name, affichee: !!regle.displayMode })),
  ...texmath.rules.dollars!.block.map((regle) => ({ nom: regle.name, affichee: true })),
];
for (const { nom, affichee } of reglesFormules) {
  md.renderer.rules[nom] = (tokens, idx, _options, env: EnvRendu) => {
    env.formules.push({ tex: tokens[idx]?.content ?? "", affichee });
    return `<span data-formule="${env.formules.length - 1}"></span>`;
  };
}

const OPTIONS_ASSAINISSEMENT: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "h3", "h4", "h5", "h6", "strong", "em", "s", "code", "pre", "blockquote",
    "ul", "ol", "li", "a", "img", "table", "thead", "tbody", "tr", "th", "td", "span",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "loading"],
    span: ["data-formule"],
    code: ["class"],
    th: ["style"],
    td: ["style"],
  },
  allowedClasses: { code: [/^language-[a-z0-9-]+$/] },
  allowedStyles: { "*": { "text-align": [/^(left|right|center)$/] } },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  transformTags: {
    // Les titres de section sont des h2 : on décale ceux du contenu pour garder une hiérarchie propre.
    h1: "h3",
    h2: "h3",
    a: (tagName, attribs) => {
      const externe = /^https?:\/\//i.test(attribs.href ?? "");
      return {
        tagName,
        attribs: externe ? { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" } : attribs,
      };
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy" } }),
  },
  // Images uniquement depuis nos médias : pas de pixels de suivi ni de données coûteuses d'un tiers.
  exclusiveFilter: (frame) => frame.tag === "img" && !(frame.attribs.src ?? "").startsWith(PREFIXE_MEDIAS),
};

function rendreFormule(tex: string, affichee: boolean): string {
  const html = katex.renderToString(tex, {
    displayMode: affichee,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    maxSize: 20,
    maxExpand: 500,
    output: "htmlAndMathml",
  });
  return affichee ? `<div class="formule">${html}</div>` : html;
}

function rendreMarkdown(markdown: string): { html: string; texte: string } {
  const env: EnvRendu = { formules: [] };
  const assaini = sanitizeHtml(md.render(markdown, env), OPTIONS_ASSAINISSEMENT);
  const texte = sanitizeHtml(assaini.replace(/<span data-formule="\d+"><\/span>/g, " "), {
    allowedTags: [],
    allowedAttributes: {},
  });
  const html = assaini.replace(/<span data-formule="(\d+)"><\/span>/g, (_tout, indice: string) => {
    const formule = env.formules[Number(indice)];
    return formule ? rendreFormule(formule.tex, formule.affichee) : "";
  });
  return { html, texte };
}

const TITRE_SECTION = /^##(?!#)\s+(.+?)\s*#*\s*$/;
const CLOTURE_CODE = /^\s*(```|~~~)/;

export function decouperSections(markdown: string): SectionSource[] {
  const sections: SectionSource[] = [];
  let courante: SectionSource = { titre: null, markdown: "" };
  let dansCode = false;

  for (const ligne of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (CLOTURE_CODE.test(ligne)) dansCode = !dansCode;
    const titre = dansCode ? null : TITRE_SECTION.exec(ligne);
    if (titre?.[1]) {
      if (courante.titre !== null || courante.markdown.trim() !== "") sections.push(courante);
      courante = { titre: titre[1], markdown: "" };
    } else {
      courante.markdown += `${ligne}\n`;
    }
  }
  if (courante.titre !== null || courante.markdown.trim() !== "") sections.push(courante);
  return sections;
}

function resumer(texte: string): string {
  const compact = texte.replace(/\s+/g, " ").trim();
  if (compact.length <= LONGUEUR_RESUME) return compact;
  const coupe = compact.slice(0, LONGUEUR_RESUME);
  return `${coupe.slice(0, Math.max(coupe.lastIndexOf(" "), LONGUEUR_RESUME - 20))}…`;
}

export function rendreLecon(markdown: string): LeconRendue {
  const sections = decouperSections(markdown).map((section) => ({
    titre: section.titre,
    ...rendreMarkdown(section.markdown),
  }));
  const premierTexte = sections.find((section) => section.texte.trim() !== "")?.texte ?? "";
  return {
    sections: sections.map(({ titre, html }) => ({ titre, html })),
    resume: resumer(premierTexte),
  };
}
