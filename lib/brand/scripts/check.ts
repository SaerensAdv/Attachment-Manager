import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderBrandCss } from "../src/css";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "brand.css");
const committed = readFileSync(out, "utf8");
if (committed !== renderBrandCss()) {
  console.error(
    "brand.css is stale — run `pnpm --filter @workspace/brand run generate`.",
  );
  process.exit(1);
}
console.log("brand.css is up to date.");
