// Combines every results/<company-id>.json into one file, together with the list of test files.
//
//   node scripts/combine.mjs [output]      default output: combined.json
//
// Exits with status 1 if any results file is invalid; the valid ones are still written.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describeTestFile, listFiles, readJson, validateResults } from "./lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] ?? join(root, "combined.json"));

const owners = readJson(join(root, "owners.json"));
const testFiles = listFiles(join(root, "testfiles")).map(describeTestFile).filter(Boolean);
const knownFiles = new Set(testFiles.map((f) => f.path));

const companies = [];
const results = [];
const problems = [];

const resultsDir = join(root, "results");
const resultFiles = existsSync(resultsDir) ? listFiles(resultsDir).filter((f) => f.endsWith(".json")) : [];

for (const name of resultFiles) {
  const id = name.replace(/\.json$/, "");
  const owner = owners.companies?.[id];
  if (!owner) {
    problems.push(`results/${name}: "${id}" is not listed in owners.json`);
    continue;
  }
  let doc;
  try {
    doc = readJson(join(resultsDir, name));
  } catch (e) {
    problems.push(`results/${name}: not valid JSON (${e.message})`);
    continue;
  }
  const errors = validateResults(doc, { expectedCompany: owner.name, knownFiles });
  if (errors.length) {
    problems.push(...errors.map((e) => `results/${name}: ${e}`));
    continue;
  }
  companies.push({ id, name: doc.company, date: doc.date });
  for (const r of doc.results) results.push({ company: id, ...r });
}

const combined = {
  generatedAt: new Date().toISOString(),
  testFiles,
  companies,
  results,
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(combined, null, 2) + "\n");
console.log(
  `Wrote ${output}: ${testFiles.length} test files, ${companies.length} companies, ${results.length} results.`,
);
if (problems.length) {
  console.error(`\n${problems.length} problem(s) (those files were left out):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
