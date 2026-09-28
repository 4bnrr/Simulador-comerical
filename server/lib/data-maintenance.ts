// @ts-nocheck
import fs from "node:fs";
import path from "node:path";

export function createDataMaintenance(options) {
  const {
    backupDir,
    cacheFile,
    emptyCache,
    enterpriseLinksFile,
    enterpriseMediaFile,
    normKey,
    paymentPlanRulesFile,
    priceHistoryFile,
    readJson,
    textValue,
    writeJson,
  } = options;

  function safeSlug(value) {
    return (
      normKey(value || "empreendimento")
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "empreendimento"
    );
  }

  function backupFiles(label = "manual") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const folder = path.join(backupDir, `${stamp}-${safeSlug(label)}`);
    fs.mkdirSync(folder, { recursive: true });
    const files = [
      cacheFile,
      enterpriseLinksFile,
      enterpriseMediaFile,
      paymentPlanRulesFile,
      priceHistoryFile,
    ];
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      try {
        fs.copyFileSync(file, path.join(folder, path.basename(file)));
      } catch {}
    }

    const folders = fs
      .readdirSync(backupDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(backupDir, entry.name),
        time: fs.statSync(path.join(backupDir, entry.name)).mtimeMs,
      }))
      .sort((left, right) => right.time - left.time);
    for (const old of folders.slice(40)) {
      try {
        fs.rmSync(old.path, { recursive: true, force: true });
      } catch {}
    }
    return folder;
  }

  function recordPriceHistory(cache) {
    const history = readJson(priceHistoryFile, []);
    const at = cache.lastSuccess || new Date().toISOString();
    for (const enterprise of cache.enterprises || []) {
      if (
        !(Number(enterprise.availableUnits) > 0) ||
        !(Number(enterprise.lowestPrice) > 0)
      )
        continue;
      history.push({
        at,
        enterpriseId: String(enterprise.id ?? ""),
        enterpriseName: textValue(enterprise.name),
        lowestPrice: Number(enterprise.lowestPrice),
        availableUnits: Number(enterprise.availableUnits || 0),
      });
    }
    const cutoff = Date.now() - 400 * 24 * 60 * 60 * 1000;
    const filtered = history
      .filter((entry) => {
        const timestamp = Date.parse(entry.at || "");
        return !Number.isFinite(timestamp) || timestamp >= cutoff;
      })
      .slice(-12000);
    writeJson(priceHistoryFile, filtered);
  }

  function enterpriseMediaSummary() {
    const cache = readJson(cacheFile, emptyCache);
    const config = readJson(enterpriseMediaFile, {});
    const entries = (cache.enterprises || []).map((enterprise) => {
      const media = config[normKey(enterprise.name)] || {};
      return {
        id: String(enterprise.id ?? ""),
        sourceName: enterprise.name,
        displayName: textValue(media.displayName, enterprise.name),
        image: textValue(media.image),
        url: textValue(media.url),
        visible: media.visible !== false,
        highlights: Array.isArray(media.highlights) ? media.highlights : [],
        configured: Boolean(
          media.image ||
            media.url ||
            media.displayName ||
            (Array.isArray(media.highlights) && media.highlights.length),
        ),
        availableUnits: Number(enterprise.availableUnits || 0),
        lowestPrice: enterprise.lowestPrice,
      };
    });
    return {
      entries,
      pending: entries.filter((entry) => entry.visible && !entry.configured),
      configuredCount: entries.filter((entry) => entry.configured).length,
    };
  }

  return { backupFiles, enterpriseMediaSummary, recordPriceHistory, safeSlug };
}
