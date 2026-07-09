const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Alert model has lifecycle, severity, source, and dedupe ownership fields", () => {
  const schema = read("prisma/schema.prisma");

  assert.match(schema, /enum AlertCategory/);
  assert.match(schema, /enum AlertSeverity/);
  assert.match(schema, /enum AlertStatus/);
  assert.match(schema, /enum AlertSource/);
  assert.match(schema, /category\s+AlertCategory/);
  assert.match(schema, /severity\s+AlertSeverity/);
  assert.match(schema, /status\s+AlertStatus/);
  assert.match(schema, /occurrences\s+Int\s+@default\(1\)/);
  assert.match(schema, /scoreBucket\s+String\?/);
  assert.match(schema, /model AlertDelivery/);
  assert.match(schema, /model AlertRule/);
  assert.match(schema, /model AlertDigest/);
  assert.match(schema, /@@unique\(\[userId, dedupeKey\]\)/);
});

test("Alert repository dedupes via upsert and exposes lifecycle actions", () => {
  const repository = read("repositories/alertRepository.js");

  assert.match(repository, /db\.alert\.upsert/);
  assert.doesNotMatch(repository, /db\.alert\.createMany/);
  assert.match(repository, /function buildDedupeKey/);
  assert.match(repository, /async function action/);
  assert.match(repository, /ACKNOWLEDGED/);
  assert.match(repository, /SNOOZED/);
  assert.match(repository, /RESOLVED/);
});

test("Alert routes expose action and health endpoints", () => {
  const routes = read("features/alerts/routes/alerts.routes.js");

  assert.match(routes, /router\.get\("\/alerts\/health"/);
  assert.match(routes, /router\.post\("\/alerts\/:id\/acknowledge"/);
  assert.match(routes, /router\.post\("\/alerts\/:id\/snooze"/);
  assert.match(routes, /router\.post\("\/alerts\/:id\/resolve"/);
  assert.match(routes, /router\.post\("\/alerts\/:id\/dismiss"/);
  assert.match(routes, /router\.post\("\/alerts\/mute-category"/);
  assert.match(routes, /router\.post\("\/notification-channels\/telegram"/);
  assert.match(routes, /router\.post\("\/notification-channels\/telegram\/verify"/);
  assert.match(routes, /router\.post\("\/alert-rules"/);
});

test("Scan persistence converts scanner artifacts into deduped alerts only above threshold", () => {
  const persistence = read("services/scanPersistenceService.js");

  assert.match(persistence, /alertRepository\.upsertAlert/);
  assert.match(persistence, /if \(score < 60\)/);
  assert.doesNotMatch(persistence, /db\.alert\.createMany/);
  assert.doesNotMatch(persistence, /await deliverTelegramAlerts\(userId, alerts\)/);
});
