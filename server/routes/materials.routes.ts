// @ts-nocheck
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function registerMaterialsRoutes(app, dependencies) {
  const {
    addHistory,
    cacheFile,
    materialsFile,
    readJson,
    textValue,
    upload,
    uploadDir,
    writeJson,
  } = dependencies;

  app.get("/api/materials", (_, res) => res.json(readJson(materialsFile, [])));

  app.post("/api/materials", upload.single("file"), (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "Selecione um arquivo." });
    const materials = readJson(materialsFile, []);
    const item = {
      id: crypto.randomUUID(),
      title: textValue(req.body.title, req.file.originalname),
      category: textValue(req.body.category, "outro"),
      enterpriseId: textValue(req.body.enterpriseId),
      enterpriseName: textValue(req.body.enterpriseName),
      fileName: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      mimeType: req.file.mimetype,
      createdAt: new Date().toISOString(),
    };
    materials.unshift(item);
    writeJson(materialsFile, materials);
    addHistory("Material publicado", item.title);
    res.json(item);
  });

  app.delete("/api/materials/:id", (req, res) => {
    const materials = readJson(materialsFile, []);
    const item = materials.find((material) => material.id === req.params.id);
    if (!item)
      return res.status(404).json({ error: "Material não encontrado." });
    const filename = path.basename(item.url || "");
    try {
      if (filename) fs.unlinkSync(path.join(uploadDir, filename));
    } catch {}
    writeJson(
      materialsFile,
      materials.filter((material) => material.id !== req.params.id),
    );
    addHistory("Material removido", item.title);
    res.json({ ok: true });
  });

  app.get("/api/export/catalog.json", (_, res) =>
    res.download(cacheFile, "catalogo-estacao1.json"),
  );
}
