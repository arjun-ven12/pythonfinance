const { normalizeArtifactPayload } = require("./artifacts/artifactValidator");

function appendOutput(current, chunk) {
  const next = current + chunk.toString();
  return next.slice(-8000);
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonLine = trimmed
      .split("\n")
      .reverse()
      .find((line) => line.trim().startsWith("{") || line.trim().startsWith("["));

    if (!jsonLine) {
      throw new Error("Process did not return valid JSON.");
    }

    return JSON.parse(jsonLine);
  }
}

function parseScanArtifacts(stdout) {
  const marker = "__SCAN_ARTIFACTS__=";
  const line = String(stdout || "")
    .split("\n")
    .reverse()
    .find((entry) => entry.startsWith(marker));

  if (!line) {
    throw new Error("Scanner did not return execution artifacts.");
  }

  return normalizeArtifactPayload(JSON.parse(line.slice(marker.length)));
}

function getProcessFailureMessage(defaultMessage, stderr = "") {
  const usefulLine = String(stderr || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()
    .find((line) => !line.startsWith("File ") && !line.startsWith("Traceback "));

  return usefulLine ? `${defaultMessage}: ${usefulLine}` : defaultMessage;
}

module.exports = {
  appendOutput,
  getProcessFailureMessage,
  parseJsonOutput,
  parseScanArtifacts,
};
