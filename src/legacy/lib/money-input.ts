// @ts-nocheck
import { formatBRL } from "./formatters";

export function parseMoney(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  let normalized = String(value || "").replace(/R\$|\s/g, "");
  normalized =
    normalized.includes(",") && normalized.includes(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(",", ".");

  const number = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

export function formatMoneyField(element) {
  if (!element) return;
  element.value = formatBRL(Math.max(0, parseMoney(element.value)));
}

export function formatMoneyWhileTyping(element) {
  if (!element) return;

  const digits = String(element.value || "").replace(/\D/g, "");
  element.value = formatBRL(Number(digits || "0") / 100);

  try {
    element.setSelectionRange(element.value.length, element.value.length);
  } catch {}
}

export function wireMoneyField(element, submitSelector = "#calcBtn") {
  if (!element) return;

  element.value = formatBRL(Math.max(0, parseMoney(element.value)));
  element.addEventListener("focus", () => {
    try {
      element.setSelectionRange(element.value.length, element.value.length);
    } catch {}
  });
  element.addEventListener("input", () => formatMoneyWhileTyping(element));
  element.addEventListener("paste", () => {
    setTimeout(() => formatMoneyWhileTyping(element), 0);
  });
  element.addEventListener("blur", () => formatMoneyField(element));
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    document.querySelector(submitSelector)?.click();
  });
}
