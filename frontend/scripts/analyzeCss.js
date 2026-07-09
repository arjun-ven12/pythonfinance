import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, "src");
const strict = process.argv.includes("--strict");
const maxFeatureLines = 1000;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    if (entry.isFile() && entry.name.endsWith(".css")) files.push(fullPath);
  }
  return files;
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function getSelectorBlocks(css) {
  const clean = stripComments(css);
  const blocks = [];
  const regex = /([^{}@][^{}]*)\{([^{}]*)\}/g;
  let match;
  while ((match = regex.exec(clean))) {
    blocks.push({ selector: match[1].trim(), body: match[2].trim() });
  }
  return blocks;
}

function declarationKey(body) {
  return body
    .split(";")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort()
    .join(";");
}

function isGlobalSelector(selector) {
  const normalized = selector.replace(/:where\([^)]*\)/g, "").trim();
  if (!normalized) return false;
  if (normalized.startsWith("@")) return false;
  if (normalized.startsWith(":root")) return false;
  if (normalized.startsWith("[data-theme")) return false;
  if (normalized.startsWith("html[data-theme")) return false;
  return normalized
    .split(",")
    .map((part) => part.trim())
    .some((part) => /^(html|body|button|input|select|textarea|a|p|h[1-6]|div|span|table|th|td|\*)\b/.test(part));
}

function specificityScore(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) || []).length;
  const elements = (selector.match(/(^|\s|>|\+|~)([a-z]+)\b/gi) || []).length;
  return ids * 100 + classes * 10 + elements;
}

const files = walk(srcRoot);
const fileReports = files.map((file) => {
  const css = fs.readFileSync(file, "utf8");
  const rel = path.relative(projectRoot, file);
  const lines = css.split(/\r?\n/).length;
  const blocks = getSelectorBlocks(css);
  const colors = css.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [];
  const globalSelectors = blocks.filter((block) => isGlobalSelector(block.selector));
  const maxSpecificity = blocks.reduce((max, block) => Math.max(max, specificityScore(block.selector)), 0);
  return { rel, lines, blocks, colors, globalSelectors, maxSpecificity };
});

const duplicateMap = new Map();
for (const report of fileReports) {
  for (const block of report.blocks) {
    const key = declarationKey(block.body);
    if (!key || key.length < 20) continue;
    const current = duplicateMap.get(key) || [];
    current.push(`${report.rel} :: ${block.selector}`);
    duplicateMap.set(key, current);
  }
}
const duplicates = [...duplicateMap.entries()]
  .filter(([, locations]) => locations.length > 1)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 12);

const largest = [...fileReports].sort((a, b) => b.lines - a.lines).slice(0, 12);
const hardcodedColorCount = fileReports.reduce((sum, report) => sum + report.colors.length, 0);
const globalSelectorCount = fileReports.reduce((sum, report) => sum + report.globalSelectors.length, 0);
const largestFeature = fileReports
  .filter((report) => report.rel.includes("src/features/"))
  .sort((a, b) => b.lines - a.lines)[0];
const featureGlobalSelectorCount = fileReports
  .filter((report) => report.rel.includes("src/features/"))
  .reduce((sum, report) => sum + report.globalSelectors.length, 0);

console.log("CSS Audit");
console.log("=========");
console.log(`CSS files: ${fileReports.length}`);
console.log(`Hardcoded color literals: ${hardcodedColorCount}`);
console.log(`Global selector findings: ${globalSelectorCount}`);
console.log(`Feature selector-class-pattern findings: ${featureGlobalSelectorCount}`);
console.log(`Largest feature CSS: ${largestFeature?.rel ?? "n/a"} (${largestFeature?.lines ?? 0} lines)`);
console.log("");
console.log("Largest files:");
for (const report of largest) {
  console.log(`- ${report.rel}: ${report.lines} lines, max specificity ${report.maxSpecificity}`);
}
console.log("");
console.log("Duplicate declaration groups:");
for (const [body, locations] of duplicates) {
  const preview = body.slice(0, 100).replace(/\s+/g, " ");
  console.log(`- ${locations.length}x ${preview}${body.length > 100 ? "..." : ""}`);
  for (const location of locations.slice(0, 4)) console.log(`  · ${location}`);
}
console.log("");
console.log("Global selector examples:");
for (const report of fileReports) {
  for (const block of report.globalSelectors.slice(0, 4)) {
    console.log(`- ${report.rel}: ${block.selector}`);
  }
}

let failed = false;
if (strict) {
  if (largestFeature && largestFeature.lines > maxFeatureLines) {
    console.error(`\nFAIL: largest feature CSS exceeds ${maxFeatureLines} lines.`);
    failed = true;
  }
  if (globalSelectorCount > 80) {
    console.error("\nFAIL: global selector findings exceed current migration budget of 80.");
    failed = true;
  }
  if (featureGlobalSelectorCount > 0) {
    console.error("\nFAIL: feature CSS contains selectors that do not follow the class-scoped pattern.");
    failed = true;
  }
}
if (failed) process.exit(1);
