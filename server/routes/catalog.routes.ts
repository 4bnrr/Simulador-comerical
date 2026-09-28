// @ts-nocheck
export function registerCatalogRoutes(app, dependencies) {
  const {
    cacheFile,
    configured,
    emptyCache,
    enterpriseLinksFile,
    enterpriseMediaFile,
    getSyncProgress,
    getSyncing,
    integrityFile,
    paymentPlanRulesFile,
    readJson,
    readRateLimitState,
    requireManager,
  } = dependencies;

  app.get("/api/status", requireManager, (_, res) => {
    const cache = readJson(cacheFile, emptyCache);
    const rateLimit = readRateLimitState();
    const blockedUntilMs = rateLimit.blockedUntil
      ? Date.parse(rateLimit.blockedUntil)
      : 0;
    res.json({
      configured: configured(),
      syncing: getSyncing(),
      syncProgress: getSyncProgress(),
      rateLimit: {
        ...rateLimit,
        active: Boolean(blockedUntilMs && blockedUntilMs > Date.now()),
        remainingSeconds:
          blockedUntilMs > Date.now()
            ? Math.ceil((blockedUntilMs - Date.now()) / 1000)
            : 0,
      },
      domain: process.env.CVCRM_DOMAIN || null,
      autoSync: {
        enabled:
          String(process.env.CVCRM_AUTO_SYNC || "true").toLowerCase() ===
          "true",
        minutes: Math.max(30, Number(process.env.CVCRM_SYNC_MINUTES || 60)),
      },
      email: process.env.CVCRM_EMAIL || null,
      ...cache,
    });
  });

  app.get("/api/catalog", requireManager, (_, res) =>
    res.json(readJson(cacheFile, emptyCache)),
  );
  app.get("/api/integrity", requireManager, (_, res) =>
    res.json(
      readJson(integrityFile, {
        at: null,
        warnings: ["Ainda não houve sincronização V3."],
      }),
    ),
  );
  app.get("/api/enterprise-links", requireManager, (_, res) =>
    res.json(readJson(enterpriseLinksFile, {})),
  );
  app.get("/api/payment-plan-rules", requireManager, (_, res) =>
    res.json(
      readJson(paymentPlanRulesFile, {
        version: 1,
        defaultRule: {},
        rules: [],
      }),
    ),
  );
  app.get("/api/enterprise-media", requireManager, (_, res) =>
    res.json(readJson(enterpriseMediaFile, {})),
  );
}
