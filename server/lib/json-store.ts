// @ts-nocheck
import fs from "node:fs";

const jsonCache = new Map();

export function readJson(file, fallback) {
  try {
    const stat = fs.statSync(file);
    const cached = jsonCache.get(file);

    if (
      cached &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size
    ) {
      return cached.value;
    }

    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    jsonCache.set(file, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      value,
    });
    return value;
  } catch {
    jsonCache.delete(file);
    return fallback;
  }
}

export function writeJson(file, value) {
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporaryFile, file);

  const stat = fs.statSync(file);
  jsonCache.set(file, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    value,
  });
}
