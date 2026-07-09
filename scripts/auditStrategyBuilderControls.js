#!/usr/bin/env node

const contract = require("../shared/strategyJson.contract.json");

const controls = Object.entries(contract.builderControls || {});
const failures = [];

for (const [field, config] of controls) {
  if (!config.path) {
    failures.push(`${field}: missing strategyJson path`);
  }

  if (typeof config.executable !== "boolean") {
    failures.push(`${field}: missing executable true/false classification`);
  }

  if (config.executable && !config.consumedBy) {
    failures.push(`${field}: executable control must name consumedBy`);
  }

  if (!config.executable && !config.label) {
    failures.push(`${field}: non-executable control must include visible label`);
  }
}

const executable = controls.filter(([, config]) => config.executable).map(([field]) => field);
const designNotes = controls.filter(([, config]) => !config.executable).map(([field]) => field);

console.log("Strategy Builder Control Audit");
console.log(`Contract: ${contract.schemaVersion}`);
console.log(`Total controls: ${controls.length}`);
console.log(`Executable controls: ${executable.length}`);
console.log(executable.map((field) => `  ✓ ${field} -> ${contract.builderControls[field].path}`).join("\n"));
console.log(`Design-note controls: ${designNotes.length}`);
console.log(designNotes.map((field) => `  • ${field} -> ${contract.builderControls[field].label}`).join("\n"));

if (failures.length > 0) {
  console.error("\nAudit failed:");
  console.error(failures.map((failure) => `  - ${failure}`).join("\n"));
  process.exit(1);
}

console.log("\nAudit passed: every builder control maps to strategyJson and is classified.");
