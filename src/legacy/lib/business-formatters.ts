// @ts-nocheck
export function pctBR(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}%`;
}

export function preRegistrationDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const brazilianDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilianDate)
    return `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`;
  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return isoDate ? isoDate[1] : "";
}

export function preRegistrationMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function preRegistrationMaritalStatus(value) {
  const raw = String(value || "").trim();
  if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(raw)) return raw;
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (key.includes("uniao")) return "7";
  if (key.includes("divorci")) return "2";
  if (key.includes("separad")) return "3";
  if (key.includes("viuv")) return "5";
  if (key.includes("solteir")) return "4";
  if (key.includes("comunhao universal") || key.includes("comunhao total"))
    return "8";
  if (key.includes("separacao total")) return "9";
  if (key.includes("casad")) return "1";
  return raw ? "6" : "";
}
