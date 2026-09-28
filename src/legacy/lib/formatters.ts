// @ts-nocheck
export function formatBRL(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";

  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

export function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  };

  return String(value ?? "").replace(/[&<>'"]/g, (character) => {
    return entities[character];
  });
}

export function toCssKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}
