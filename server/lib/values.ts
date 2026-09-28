// @ts-nocheck
export function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function indexObject(object) {
  const index = new Map();

  if (!object || typeof object !== "object") return index;

  for (const [key, value] of Object.entries(object)) {
    index.set(normalizeKey(key), value);
  }

  return index;
}

export function pickValue(object, keys, fallback = null) {
  const index = indexObject(object);

  for (const key of keys) {
    const value = index.get(normalizeKey(key));
    const hasValue =
      value !== undefined && value !== null && String(value).trim() !== "";

    if (hasValue) return value;
  }

  return fallback;
}

export function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === "") return null;

  let normalized = String(value)
    .trim()
    .replace(/R\$|\s/g, "");

  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+,\d+$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else {
    normalized = normalized.replace(/[^0-9.-]/g, "");
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function toInteger(value) {
  const number = toNumber(value);
  return number === null ? null : Math.round(number);
}

export function toText(value, fallback = "") {
  return value === null || value === undefined
    ? fallback
    : String(value).trim();
}

export function recordArray(payload) {
  return Array.isArray(payload?.dados) ? payload.dados : [];
}

export function paginationInfo(payload, fallbackPage = 1) {
  return {
    page: toInteger(payload?.pagina) || fallbackPage,
    pageSize: toInteger(payload?.registros) || 0,
    totalRecords: toInteger(payload?.total_de_registros) || 0,
    totalPages: toInteger(payload?.total_de_paginas) || 1,
  };
}
