const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PROMPT_DIR = path.join(__dirname, "..", "..", "..", "..", "prompts");
const promptCache = new Map();

function loadFilePrompt(promptDir, promptFile) {
  const filePath = path.join(promptDir, promptFile);
  const fileStat = fs.statSync(filePath);
  const cached = promptCache.get(filePath);

  if (cached && cached.mtimeMs === fileStat.mtimeMs) {
    return cached.content;
  }

  const content = fs.readFileSync(filePath, "utf8");
  promptCache.set(filePath, {
    mtimeMs: fileStat.mtimeMs,
    content,
  });
  return content;
}

function interpolatePrompt(template, variables = {}) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) =>
    key in variables ? String(variables[key]) : ""
  );
}

function createPromptRegistry({ promptDir = DEFAULT_PROMPT_DIR } = {}) {
  return {
    buildPrompt({ template, variables = {} }) {
      if (!template) {
        throw new Error("Prompt template is required.");
      }

      if (typeof template === "string") {
        return interpolatePrompt(loadFilePrompt(promptDir, template), variables);
      }

      if (template.type === "file") {
        return interpolatePrompt(loadFilePrompt(promptDir, template.file), variables);
      }

      if (template.type === "inline") {
        return interpolatePrompt(template.template, variables);
      }

      throw new Error("Unsupported prompt template configuration.");
    },
  };
}

module.exports = {
  DEFAULT_PROMPT_DIR,
  createPromptRegistry,
  interpolatePrompt,
};
