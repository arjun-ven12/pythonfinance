function dataSourceHeaders(req, res, next) {
  const sendJson = res.json.bind(res);

  res.json = (body) => {
    if (body?.dataSource) {
      res.setHeader("X-Data-Source", body.dataSource);
      res.setHeader("X-Degraded-Mode", body.degradedMode ? "true" : "false");
    }

    return sendJson(body);
  };

  next();
}

module.exports = dataSourceHeaders;
