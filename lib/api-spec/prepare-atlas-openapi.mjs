import { readFile, writeFile } from "node:fs/promises";

const basePath = new URL("./openapi.yaml", import.meta.url);
const overlayPath = new URL("./atlas-v4-wave-e.openapi.yaml", import.meta.url);
const outputPath = new URL("./.atlas-openapi.generated.yaml", import.meta.url);
const base = (await readFile(basePath, "utf8")).split("\n");
const overlay = (await readFile(overlayPath, "utf8")).split("\n");

function pathBlocks(lines) {
  const start = lines.findIndex((line) => line === "paths:");
  if (start < 0) throw new Error("OpenAPI document has no paths section");
  const endCandidate = lines.findIndex((line, index) => index > start && /^[a-zA-Z][\w-]*:$/.test(line));
  const end = endCandidate < 0 ? lines.length : endCandidate;
  const blocks = new Map();
  let key = null; let bucket = [];
  const flush = () => { if (key) blocks.set(key, bucket); };
  for (let i = start + 1; i < end; i += 1) {
    const match = /^  (\/[^:]+):$/.exec(lines[i]);
    if (match) { flush(); key = match[1]; bucket = [lines[i]]; }
    else if (key) bucket.push(lines[i]);
  }
  flush();
  return { start, end, blocks };
}

const basePaths = pathBlocks(base);
const overlayPaths = pathBlocks(overlay);
for (const [key, block] of overlayPaths.blocks) basePaths.blocks.set(key, block);
const mergedPaths = [...basePaths.blocks.values()].flat();
const output = [...base.slice(0, basePaths.start + 1), ...mergedPaths, ...base.slice(basePaths.end)].join("\n");
await writeFile(outputPath, output);
console.log(`Prepared Atlas OpenAPI with ${overlayPaths.blocks.size} Wave E path overrides/additions.`);
