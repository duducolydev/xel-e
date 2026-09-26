declare module "markdown-it-texmath" {
  import type MarkdownIt from "markdown-it";

  interface RegleTexmath {
    name: string;
    displayMode?: boolean;
  }

  interface Texmath {
    (md: MarkdownIt, options?: { delimiters?: string | string[]; engine?: unknown }): void;
    rules: Record<string, { inline: RegleTexmath[]; block: RegleTexmath[] }>;
  }

  const texmath: Texmath;
  export = texmath;
}
