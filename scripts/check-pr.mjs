// Checks a pull request: who may change which files, and that results files match the schema.
//
//   git diff --name-status --no-renames BASE...HEAD | \
//     node scripts/check-pr.mjs --author <github-login> --base <dir> --pr <dir>
//
// --base is a checkout of the target branch. owners.json is read from it, never from the pull
// request, so a pull request cannot give itself permission. --pr is a checkout of the pull
// request; its files are only read as data. Both default to the repository this script is in.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describeTestFile, listFiles, readJson, validateResults } from "./lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseDir = resolve(args.base ?? here);
const prDir = resolve(args.pr ?? here);
const author = (args.author ?? "").toLowerCase();
if (!author) {
  console.error("--author is required");
  process.exit(2);
}

const owners = readJson(join(baseDir, "owners.json"));
const lower = (list) => (list ?? []).map((s) => s.toLowerCase());
const isMaintainer = lower(owners.maintainers).includes(author);

const changes = readFileSync(0, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [status, path] = line.split("\t");
    return { status: status[0], path };
  });

const prTestFiles = new Set(
  existsSync(join(prDir, "testfiles")) ? listFiles(join(prDir, "testfiles")) : [],
);
const errors = [];
const notes = [];

for (const { status, path } of changes) {
  if (path.startsWith("testfiles/")) {
    const rel = path.slice("testfiles/".length);
    if (rel.split("/").pop().startsWith(".")) continue; // .gitkeep and friends
    if (status !== "A" && !isMaintainer) {
      errors.push(`${path}: only maintainers can change or remove a test file that is already in the repository.`);
    } else if (status !== "D" && !describeTestFile(rel)) {
      errors.push(
        `${path}: put conformant files in testfiles/conformant/<version>/ and non-conformant files in testfiles/experimental/<version>/ (for example testfiles/experimental/2.5/).`,
      );
    } else {
      notes.push(`${path}: test file ${status === "A" ? "added" : status === "D" ? "removed" : "changed"}.`);
    }
    continue;
  }

  const m = /^results\/([^/]+)\.json$/.exec(path);
  if (m) {
    const id = m[1];
    if (status === "D" && isMaintainer) {
      notes.push(`${path}: removed by a maintainer.`);
      continue;
    }
    // A maintainer may add a company to owners.json and its results in the same pull request.
    const prOwners = isMaintainer && existsSync(join(prDir, "owners.json")) ? readJson(join(prDir, "owners.json")) : null;
    const company = owners.companies?.[id] ?? prOwners?.companies?.[id];
    if (!company) {
      errors.push(`${path}: "${id}" is not in owners.json. Ask a maintainer to add your company and GitHub login first.`);
      continue;
    }
    if (!isMaintainer && !lower(company.github).includes(author)) {
      errors.push(`${path}: belongs to ${company.name}. @${author} is not listed as an owner of it in owners.json.`);
      continue;
    }
    if (status === "D") {
      notes.push(`${path}: removed by its owner.`);
      continue;
    }
    let doc;
    try {
      doc = readJson(join(prDir, path));
    } catch (e) {
      errors.push(`${path}: not valid JSON (${e.message}).`);
      continue;
    }
    const problems = validateResults(doc, { expectedCompany: company.name, knownFiles: prTestFiles });
    if (problems.length) errors.push(...problems.map((p) => `${path}: ${p}`));
    else notes.push(`${path}: ${doc.results.length} results for ${company.name}, valid.`);
    continue;
  }

  if (!isMaintainer) {
    errors.push(`${path}: only maintainers can change this file. Pull requests can add test files and update your own results file.`);
  }
}

const report = [
  `## Pull request check for @${author}${isMaintainer ? " (maintainer)" : ""}`,
  "",
  ...(errors.length ? ["### Problems", "", ...errors.map((e) => `- ${e}`), ""] : ["All changes are allowed.", ""]),
  ...(notes.length ? ["### Changes", "", ...notes.map((n) => `- ${n}`), ""] : []),
].join("\n");

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
process.exit(errors.length ? 1 : 0);
