// @ts-nocheck
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function registerAdministrationRoutes(app, dependencies) {
  const {
    ADMIN_PASSWORD,
    ADMIN_USER,
    BACKUP_DIR,
    ENTERPRISE_MEDIA_FILE,
    HISTORY_FILE,
    PRICE_HISTORY_FILE,
    addHistory,
    adminSessions,
    backupFiles,
    enterpriseMediaSummary,
    getAdminSession,
    normKey,
    parseCookies,
    readJson,
    requireAdmin,
    requireManager,
    startSync,
    textValue,
    uploadEnterpriseImage,
    writeJson,
  } = dependencies;
  app.get("/api/admin/auth", (req, res) => {
    res.json({ authenticated: Boolean(getAdminSession(req)) });
  });

  app.post("/api/admin/login", (req, res) => {
    const username = textValue(req.body?.username);
    const password = textValue(req.body?.password);
    if (!ADMIN_PASSWORD) {
      return res.status(503).json({
        error:
          "Defina ADMIN_PASSWORD no arquivo .env antes de usar a Administração.",
      });
    }
    const uOk = username === ADMIN_USER;
    const pA = Buffer.from(password);
    const pB = Buffer.from(ADMIN_PASSWORD);
    const pOk = pA.length === pB.length && crypto.timingSafeEqual(pA, pB);
    if (!uOk || !pOk)
      return res.status(401).json({ error: "Usuário ou senha inválidos" });
    const sid = crypto.randomBytes(32).toString("hex");
    adminSessions.set(sid, {
      username,
      expires: Date.now() + 8 * 60 * 60 * 1000,
    });
    res.setHeader(
      "Set-Cookie",
      `estacao_admin=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 60 * 60}`,
    );
    res.json({ ok: true });
  });

  app.post("/api/admin/logout", (req, res) => {
    const sid = parseCookies(req).estacao_admin;
    if (sid) adminSessions.delete(sid);
    res.setHeader(
      "Set-Cookie",
      "estacao_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    res.json({ ok: true });
  });

  app.get("/api/admin/enterprises", requireAdmin, (_, res) => {
    res.json(enterpriseMediaSummary());
  });

  app.post("/api/admin/enterprise", requireAdmin, (req, res) => {
    const sourceName = textValue(req.body?.sourceName);
    if (!sourceName)
      return res
        .status(400)
        .json({ error: "Informe o nome de origem do empreendimento." });
    try {
      backupFiles("admin-empreendimento");
    } catch {}
    const config = readJson(ENTERPRISE_MEDIA_FILE, {});
    const key = normKey(sourceName);
    const prev = config[key] || {};
    config[key] = {
      ...prev,
      sourceName,
      displayName: textValue(req.body?.displayName, sourceName),
      url: textValue(req.body?.url),
      image: textValue(req.body?.image, prev.image || ""),
      visible: req.body?.visible !== false,
      highlights: Array.isArray(req.body?.highlights)
        ? req.body.highlights
            .map((x) => textValue(x))
            .filter(Boolean)
            .slice(0, 5)
        : prev.highlights || [],
      updatedAt: new Date().toISOString(),
    };
    writeJson(ENTERPRISE_MEDIA_FILE, config);
    addHistory("Empreendimento atualizado", sourceName, {
      area: "administracao",
    });
    res.json(config[key]);
  });

  app.post(
    "/api/admin/enterprise-image",
    requireAdmin,
    uploadEnterpriseImage.single("image"),
    (req, res) => {
      const sourceName = textValue(req.body?.sourceName);
      if (!sourceName)
        return res.status(400).json({ error: "Informe o empreendimento." });
      if (!req.file)
        return res.status(400).json({ error: "Selecione uma imagem." });
      try {
        backupFiles("admin-imagem");
      } catch {}
      const config = readJson(ENTERPRISE_MEDIA_FILE, {});
      const key = normKey(sourceName);
      const prev = config[key] || {};
      const image = `/assets/empreendimentos/${req.file.filename}`;
      config[key] = {
        ...prev,
        sourceName,
        displayName: textValue(prev.displayName, sourceName),
        image,
        visible: prev.visible !== false,
        highlights: Array.isArray(prev.highlights) ? prev.highlights : [],
        updatedAt: new Date().toISOString(),
      };
      writeJson(ENTERPRISE_MEDIA_FILE, config);
      addHistory("Imagem do empreendimento atualizada", sourceName, {
        area: "administracao",
      });
      res.json({ ok: true, image, config: config[key] });
    },
  );

  app.get("/api/price-history", requireManager, (_, res) => {
    const rows = readJson(PRICE_HISTORY_FILE, []);
    const byEnterprise = new Map();
    for (const row of rows) {
      const key = normKey(row.enterpriseName);
      if (!byEnterprise.has(key)) byEnterprise.set(key, []);
      byEnterprise.get(key).push(row);
    }
    const summary = [...byEnterprise.values()]
      .map((list) => {
        list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
        const latest = list.at(-1);
        const previous = list.length > 1 ? list.at(-2) : null;
        return {
          enterpriseName: latest.enterpriseName,
          latestPrice: latest.lowestPrice,
          previousPrice: previous?.lowestPrice ?? null,
          change: previous
            ? Number(latest.lowestPrice) - Number(previous.lowestPrice)
            : 0,
          at: latest.at,
          points: list.slice(-60),
        };
      })
      .sort((a, b) =>
        a.enterpriseName.localeCompare(b.enterpriseName, "pt-BR"),
      );
    res.json({ rows, summary });
  });

  app.get("/api/backups", requireAdmin, (_, res) => {
    const items = fs
      .readdirSync(BACKUP_DIR, { withFileTypes: true })
      .filter((x) => x.isDirectory())
      .map((x) => {
        const p = path.join(BACKUP_DIR, x.name);
        return { name: x.name, at: fs.statSync(p).mtime.toISOString() };
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    res.json(items);
  });

  app.post("/api/admin/backup", requireAdmin, (_, res) => {
    const folder = backupFiles("manual");
    addHistory("Backup manual criado", path.basename(folder), {
      area: "administracao",
    });
    res.json({ ok: true, name: path.basename(folder) });
  });

  app.get("/api/qr", async (req, res) => {
    const text = textValue(req.query.text);
    if (!text) return res.status(400).send("Texto não informado");
    try {
      const { default: QRCode } = await import("qrcode");
      const png = await QRCode.toBuffer(text, {
        type: "png",
        width: 220,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      res.type("png").set("Cache-Control", "public, max-age=86400").send(png);
    } catch (error) {
      res.status(500).json({
        error:
          "Componente de QR Code não instalado. Execute ATUALIZAR_DEPENDENCIAS.bat.",
        detail: error.message,
      });
    }
  });
  app.get("/api/history", requireAdmin, (_, res) =>
    res.json(readJson(HISTORY_FILE, [])),
  );
  app.post("/api/sync", requireAdmin, (_, res) => {
    try {
      res.status(202).json(startSync("manual"));
    } catch (e) {
      res
        .status(500)
        .json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
