import { listDocFiles, type DocFile } from "./docs";

export interface Backlink {
  path: string;
  title: string;
  category: string;
  snippets: string[];
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch);
}

/**
 * Exact, case-sensitive, word-boundary title match (mirrors the graph's mention
 * detection) so generic all-caps titles do not match lowercase prose.
 */
function mentionsTitle(line: string, title: string): boolean {
  if (title.length < 2) return false;
  let idx = line.indexOf(title);
  while (idx !== -1) {
    const before = idx > 0 ? line[idx - 1] : undefined;
    const after = line[idx + title.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = line.indexOf(title, idx + 1);
  }
  return false;
}

const MAX_SNIPPETS = 3;
const MAX_SNIPPET_CHARS = 220;

function collectSnippets(content: string, targetPath: string, title: string): string[] {
  const refNeedles = ["`" + targetPath + "`", "`./" + targetPath + "`"];
  const snippets: string[] = [];
  let fence: string | null = null;
  for (const raw of content.split("\n")) {
    const fenceMatch = raw.match(/^\s*(```|~~~)/);
    if (fence) {
      if (fenceMatch) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }
    if (/^\s{0,3}#{1,6}\s/.test(raw)) continue;
    const line = raw.trim();
    if (!line) continue;
    const hasRef = refNeedles.some((n) => raw.includes(n));
    const hasTitle = mentionsTitle(raw, title);
    if (!hasRef && !hasTitle) continue;
    const snippet =
      line.length > MAX_SNIPPET_CHARS ? line.slice(0, MAX_SNIPPET_CHARS - 1) + "…" : line;
    if (!snippets.includes(snippet)) snippets.push(snippet);
    if (snippets.length >= MAX_SNIPPETS) break;
  }
  return snippets;
}

/**
 * Find every document that references the target document — either through an
 * explicit backtick path reference or by naming its exact title in prose — and
 * return the referencing doc together with the lines where the mention occurs.
 */
export function getBacklinks(targetPath: string, extra: DocFile[] = []): Backlink[] {
  const files = listDocFiles(extra);
  const target = files.find((f) => f.id === targetPath || f.path === targetPath);
  if (!target) return [];
  const out: Backlink[] = [];
  for (const src of files) {
    if (src.id === target.id) continue;
    const snippets = collectSnippets(src.content, target.path, target.title);
    if (snippets.length > 0) {
      out.push({
        path: src.path,
        title: src.title,
        category: src.category,
        snippets,
      });
    }
  }
  return out;
}
