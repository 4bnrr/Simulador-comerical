// @ts-nocheck
export async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || payload.message || `Erro ${response.status}`,
    );
  }

  return payload;
}
