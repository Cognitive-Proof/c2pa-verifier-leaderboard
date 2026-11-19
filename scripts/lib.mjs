// Shared helpers for the repository scripts. No dependencies, so the scripts run with plain Node.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const AI_STATUSES = ["AI", "Edited with AI", "Unknown", "No AI"];
export const VERSION_RE = /^\d+\.\d+$/;
export const COMPANY_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Walks a directory and returns file paths relative to it, with forward slashes.
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith(".")) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

// Classifies a path relative to testfiles/. Returns null when it is not in an allowed place.
export function describeTestFile(path) {
  const parts = path.split("/");
  if (!["conformant", "experimental"].includes(parts[0]) || parts.length < 3 || !VERSION_RE.test(parts[1])) {
    return null;
  }
  return { path, category: parts[0], version: parts[1], name: parts.slice(2).join("/") };
}

const isDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().startsWith(s);

// Checks a results document against schema/result.schema.json. Returns a list of error strings.
export function validateResults(doc, { expectedCompany, knownFiles } = {}) {
  const errors = [];
  const fail = (where, msg) => errors.push(`${where}: ${msg}`);

  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return ["file must contain a JSON object"];
  }
  for (const key of Object.keys(doc)) {
    if (!["$schema", "company", "date", "results"].includes(key)) fail(key, "unknown field");
  }
  if (typeof doc.company !== "string" || !doc.company) fail("company", "must be a non-empty string");
  else if (expectedCompany && doc.company !== expectedCompany) {
    fail("company", `must be "${expectedCompany}" (the name in owners.json)`);
  }
  if (!isDate(doc.date)) fail("date", "must be a date written as YYYY-MM-DD");
  if (!Array.isArray(doc.results)) {
    fail("results", "must be an array");
    return errors;
  }

  const seen = new Set();
  doc.results.forEach((r, i) => {
    const at = `results[${i}]`;
    if (typeof r !== "object" || r === null || Array.isArray(r)) return fail(at, "must be an object");
    const allowed = ["file", "c2paValid", "aiStatus", "userMessage", "error", "signals"];
    for (const key of Object.keys(r)) if (!allowed.includes(key)) fail(`${at}.${key}`, "unknown field");
    for (const key of allowed) if (!(key in r)) fail(`${at}.${key}`, "is required");

    if (typeof r.file !== "string" || !describeTestFile(r.file)) {
      fail(`${at}.file`, "must be a path under conformant/<version>/ or experimental/<version>/");
    } else {
      if (seen.has(r.file)) fail(`${at}.file`, `"${r.file}" is listed more than once`);
      seen.add(r.file);
      if (knownFiles && !knownFiles.has(r.file)) fail(`${at}.file`, `"${r.file}" is not in testfiles/`);
    }
    if ("c2paValid" in r && typeof r.c2paValid !== "boolean") fail(`${at}.c2paValid`, "must be true or false");
    if ("aiStatus" in r && !AI_STATUSES.includes(r.aiStatus)) {
      fail(`${at}.aiStatus`, `must be one of ${AI_STATUSES.map((s) => `"${s}"`).join(", ")}`);
    }
    if ("userMessage" in r && typeof r.userMessage !== "string") fail(`${at}.userMessage`, "must be a string");
    if ("error" in r && r.error !== null && typeof r.error !== "string") {
      fail(`${at}.error`, "must be a string or null");
    }
    if ("signals" in r && (!Array.isArray(r.signals) || r.signals.some((s) => typeof s !== "string"))) {
      fail(`${at}.signals`, "must be an array of strings");
    }
  });
  return errors;
}
