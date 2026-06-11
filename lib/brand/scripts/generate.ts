import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderBrandCss } from "../src/css";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "brand.css");
writeFileSync(out, renderBrandCss(), "utf8");
console.log(`Wrote ${out}`);
