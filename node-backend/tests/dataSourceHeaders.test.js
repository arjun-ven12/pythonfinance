const assert = require("node:assert/strict");
const test = require("node:test");
const dataSourceHeaders = require("../middleware/dataSourceHeaders");

test("data source metadata is mirrored into response headers", () => {
  const headers = {};
  const res = {
    json(body) {
      return body;
    },
    setHeader(name, value) {
      headers[name] = value;
    },
  };

  dataSourceHeaders({}, res, () => {});
  const body = res.json({
    dataSource: "UNAVAILABLE",
    degradedMode: true,
  });

  assert.equal(headers["X-Data-Source"], "UNAVAILABLE");
  assert.equal(headers["X-Degraded-Mode"], "true");
  assert.equal(body.degradedMode, true);
});
