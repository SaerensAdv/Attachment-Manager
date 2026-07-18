import { loadBrainHierarchy } from "../src/lib/brain-hierarchy";
import { listDocFiles } from "../src/lib/docs";

const sources = listDocFiles().map((file) => file.path);
const result = loadBrainHierarchy(sources);
if (result.issues.length) {
  console.error(`Brain hierarchy validation failed with ${result.issues.length} issue(s):`);
  for (const issue of result.issues) console.error(`- [${issue.code}] ${issue.message}`);
  process.exit(1);
}
console.log(`Brain hierarchy valid: ${result.nodes.length} nodes, ${result.mappedSourceCount}/${result.sourceCount} sources mapped.`);
