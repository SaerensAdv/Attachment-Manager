import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { createHighlighter, type Highlighter, type BundledLanguage } from "shiki";

// Mermaid is configured once, for the whole app. The neutral theme reads well on
// the cream/ink newsroom paper, and strict security keeps rendered SVG inert.
let mermaidReady = false;
function ensureMermaid() {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    securityLevel: "strict",
    flowchart: { useMaxWidth: true },
  });
  mermaidReady = true;
}

// One shared Shiki highlighter for the entire app, created lazily on first use.
const SHIKI_THEME = "github-light";
const SHIKI_LANGS = [
  "ts",
  "tsx",
  "js",
  "json",
  "bash",
  "md",
  "yaml",
  "html",
  "css",
] as const;

let highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [SHIKI_THEME],
      langs: SHIKI_LANGS as unknown as BundledLanguage[],
    });
  }
  return highlighterPromise;
}

function RawCode({ code }: { code: string }) {
  return (
    <pre className="not-prose my-4 overflow-x-auto border border-foreground bg-card p-4 font-['Space_Mono'] text-xs leading-relaxed text-foreground">
      <code>{code}</code>
    </pre>
  );
}

// Renders a Mermaid fenced block as an SVG diagram. The render call is async and
// guarded; if it throws (invalid syntax, etc.) we fall back to the raw source so
// the document never breaks.
function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureMermaid();
    setSvg(null);
    setFailed(false);
    const id = `mmd-${Math.random().toString(36).slice(2)}`;
    mermaid
      .render(id, code)
      .then((result) => {
        if (!cancelled) setSvg(result.svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) return <RawCode code={code} />;
  if (!svg) return <RawCode code={code} />;

  return (
    <div
      className="not-prose my-4 flex justify-center overflow-x-auto border border-foreground bg-card p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Syntax-highlights a fenced block with Shiki. Shiki emits trusted, escaped HTML
// (no rehype-raw needed). While highlighting (or if the language is unknown) we
// show the plain source so content is never blocked on the highlighter.
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    getHighlighter()
      .then((hl) => {
        if (cancelled) return;
        const loaded = hl.getLoadedLanguages();
        if (!loaded.includes(lang)) return;
        const out = hl.codeToHtml(code, {
          lang: lang as BundledLanguage,
          theme: SHIKI_THEME,
        });
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        /* fall back to raw source */
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  if (!html) return <RawCode code={code} />;

  return (
    <div
      className="not-prose my-4 overflow-x-auto border border-foreground text-xs leading-relaxed [&_pre]:m-0 [&_pre]:p-4 [&_pre]:font-['Space_Mono']"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface MarkdownViewProps {
  content: string;
  components?: Components;
  // Optional hook for inline `code` spans. Return a node to override the default
  // rendering (e.g. a clickable doc reference), or null/undefined to fall back.
  renderInlineCode?: (text: string) => ReactNode | null | undefined;
}

export default function MarkdownView({
  content,
  components,
  renderInlineCode,
}: MarkdownViewProps) {
  const mergedComponents: Components = {
    ...components,
    // Unwrap the default <pre>: fenced blocks are rendered fully by `code` below
    // (Shiki emits its own <pre>, Mermaid a <div>), so a wrapper would nest.
    pre({ children }) {
      return <>{children}</>;
    },
    code({ className, children, ...props }) {
      const text = String(children ?? "").replace(/\n$/, "");
      const match = /language-(\w+)/.exec(className ?? "");
      if (match) {
        const lang = match[1].toLowerCase();
        if (lang === "mermaid") return <MermaidDiagram code={text} />;
        return <CodeBlock code={text} lang={lang} />;
      }
      // Inline code — let the caller optionally take over.
      if (renderInlineCode) {
        const custom = renderInlineCode(text);
        if (custom != null) return <>{custom}</>;
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mergedComponents}>
      {content}
    </ReactMarkdown>
  );
}
