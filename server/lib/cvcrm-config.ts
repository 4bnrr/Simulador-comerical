// @ts-nocheck
export function isCvcrmConfigured(environment = process.env) {
  return Boolean(
    environment.CVCRM_DOMAIN &&
      environment.CVCRM_EMAIL &&
      environment.CVCRM_TOKEN,
  );
}

export function cvcrmBaseUrl(environment = process.env) {
  return `https://${environment.CVCRM_DOMAIN}.cvcrm.com.br`;
}

export function findToken(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return "";
  for (const key of ["token", "access_token", "accessToken"]) {
    if (typeof payload[key] === "string" && payload[key].trim())
      return payload[key].trim();
  }
  for (const value of Object.values(payload)) {
    const token = findToken(value);
    if (token) return token;
  }
  return "";
}

export function jwtSubject(token) {
  try {
    const encoded = String(token || "").split(".")[1];
    if (!encoded) return "";
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    return String(payload?.sub || payload?.idusuario || payload?.id || "");
  } catch {
    return "";
  }
}
