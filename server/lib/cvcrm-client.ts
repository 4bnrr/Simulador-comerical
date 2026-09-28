// @ts-nocheck
export function createCvcrmClient(dependencies) {
  const {
    baseUrl,
    configured,
    paginationInfo,
    pick,
    rateLimitFile,
    readJson,
    recordArray,
    textValue,
    writeJson,
  } = dependencies;
  async function findBrokerByEmail(email) {
    if (!configured())
      throw new Error("A integração técnica do CVCRM não está configurada.");
    const wanted = String(email || "")
      .trim()
      .toLowerCase();
    for (let page = 1; page <= 100; page += 1) {
      const response = await fetch(
        `${baseUrl()}/api/v1/cvdw/corretores?pagina=${page}&registros_por_pagina=100`,
        {
          headers: {
            accept: "application/json",
            email: process.env.CVCRM_EMAIL,
            token: process.env.CVCRM_TOKEN,
          },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Não foi possível consultar os corretores no CVCRM (HTTP ${response.status}).`,
        );
      const payload = await response.json().catch(() => null);
      const rows = recordArray(payload);
      const broker = rows.find(
        (row) => textValue(pick(row, ["email"])).toLowerCase() === wanted,
      );
      if (broker) {
        return {
          id: String(pick(broker, ["idcorretor", "id_corretor", "id"]) || ""),
          name: textValue(
            pick(broker, ["nome", "corretor", "nomecorretor"]),
            email,
          ),
          email: textValue(pick(broker, ["email"]), email),
        };
      }
      const pagination = paginationInfo(payload, page);
      if (!rows.length || page >= pagination.totalPages) break;
    }
    return null;
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let lastCvRequestAt = 0;
  const CVCRM_MIN_GAP_MS = Math.max(
    3200,
    Number(process.env.CVCRM_REQUEST_GAP_MS || 3200),
  );
  const CVCRM_PHASE_GAP_MS = Math.max(
    0,
    Number(process.env.CVCRM_PHASE_GAP_MS || 0),
  );
  const CVCRM_429_MIN_COOLDOWN_MS = Math.max(
    60000,
    Number(process.env.CVCRM_429_COOLDOWN_MS || 60000),
  );

  let syncProgress = {
    phase: "idle",
    label: "",
    currentPage: 0,
    totalPages: 0,
    loaded: 0,
    totalRecords: 0,
    retryWaitSeconds: null,
    warning: null,
    endpoint: null,
  };

  function setProgress(patch) {
    syncProgress = { ...syncProgress, ...patch };
  }

  function readRateLimitState() {
    return readJson(rateLimitFile, {
      blockedUntil: null,
      last429At: null,
      count429: 0,
    });
  }

  function setRateLimitCooldown(ms, response = null) {
    const now = Date.now();
    const prev = readRateLimitState();
    const prevUntil = prev.blockedUntil
      ? Date.parse(prev.blockedUntil) || 0
      : 0;
    const blockedUntilMs = Math.max(prevUntil, now + ms);
    const next = {
      blockedUntil: new Date(blockedUntilMs).toISOString(),
      last429At: new Date(now).toISOString(),
      count429: Number(prev.count429 || 0) + 1,
      retryAfter: response?.headers?.get?.("retry-after") || null,
    };
    writeJson(rateLimitFile, next);
    return blockedUntilMs;
  }

  function clearExpiredRateLimit() {
    const state = readRateLimitState();
    const until = state.blockedUntil ? Date.parse(state.blockedUntil) : 0;
    if (until && until <= Date.now()) {
      writeJson(rateLimitFile, { ...state, blockedUntil: null });
    }
  }

  async function waitCountdown(ms, label) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const remaining = Math.max(0, end - Date.now());
      setProgress({
        phase: "waiting",
        label,
        retryWaitSeconds: Math.ceil(remaining / 1000),
      });
      await sleep(Math.min(1000, remaining));
    }
    setProgress({ retryWaitSeconds: null });
  }

  async function respectPersistentCooldown() {
    const state = readRateLimitState();
    const until = state.blockedUntil ? Date.parse(state.blockedUntil) : 0;
    if (until > Date.now()) {
      await waitCountdown(
        until - Date.now(),
        "Proteção contra limite do CVCRM",
      );
    } else {
      clearExpiredRateLimit();
    }
  }

  async function waitCvcrmSlot() {
    await respectPersistentCooldown();
    const elapsed = Date.now() - lastCvRequestAt;
    const wait = Math.max(0, CVCRM_MIN_GAP_MS - elapsed);
    if (wait) await sleep(wait);
    lastCvRequestAt = Date.now();
  }

  function retryAfterMs(response, attempt) {
    const raw = response.headers.get("retry-after");
    let serverWait = 0;

    if (raw) {
      const seconds = Number(raw);
      if (Number.isFinite(seconds) && seconds >= 0) {
        serverWait = seconds * 1000;
      } else {
        const when = Date.parse(raw);
        if (Number.isFinite(when)) serverWait = Math.max(0, when - Date.now());
      }
    }

    const escalating = [60000, 90000, 120000, 180000][Math.min(attempt, 3)];
    return Math.max(CVCRM_429_MIN_COOLDOWN_MS, serverWait + 10000, escalating);
  }

  async function cvGet(endpoint, page, pageSize = 500) {
    const url = new URL(endpoint, baseUrl());
    url.searchParams.set("pagina", String(page));
    url.searchParams.set("registros_por_pagina", String(pageSize));

    for (let attempt = 0; attempt < 4; attempt++) {
      await waitCvcrmSlot();
      setProgress({ endpoint, phase: "requesting" });

      const started = Date.now();
      let response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            email: process.env.CVCRM_EMAIL,
            token: process.env.CVCRM_TOKEN,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(60000),
        });
      } catch (error) {
        const err = new Error(
          `Falha de rede ao consultar CVCRM: ${error instanceof Error ? error.message : String(error)}`,
        );
        err.cause = error;
        throw err;
      }

      const bodyText = await response.text();
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = { mensagem: bodyText.slice(0, 3000) };
      }

      console.log(
        `[CVCRM] GET ${endpoint} página ${page} -> HTTP ${response.status} (${Date.now() - started} ms)`,
      );

      if (response.ok) return body;

      if (response.status === 429) {
        const waitMs = retryAfterMs(response, attempt);
        const blockedUntil = setRateLimitCooldown(waitMs, response);
        console.warn(
          `[CVCRM] HTTP 429 em ${endpoint}. Bloqueio de proteção até ${new Date(blockedUntil).toLocaleTimeString("pt-BR")}.`,
        );

        if (attempt < 3) {
          await respectPersistentCooldown();
          continue;
        }

        const err = new Error(
          "CVCRM 429: limite de requisições persistiu após as tentativas de proteção.",
        );
        err.status = 429;
        throw err;
      }

      const msg = textValue(
        body?.message ||
          body?.mensagem ||
          body?.Response ||
          response.statusText,
        `HTTP ${response.status}`,
      );
      const err = new Error(`CVCRM ${response.status}: ${msg}`);
      err.status = response.status;
      throw err;
    }

    throw new Error("CVCRM: número máximo de tentativas excedido.");
  }

  async function fetchAll(endpoint, label) {
    const rows = [];
    let page = 1;
    let totalPages = 1;

    do {
      setProgress({
        phase: "fetching",
        endpoint,
        label,
        currentPage: page,
        totalPages,
        loaded: rows.length,
        retryWaitSeconds: null,
      });

      const payload = await cvGet(endpoint, page, 500);
      const chunk = recordArray(payload);
      const info = paginationInfo(payload, page);

      if (page === 1) {
        totalPages = Math.max(1, info.totalPages);
        setProgress({ totalPages, totalRecords: info.totalRecords });
      }

      rows.push(...chunk);

      setProgress({
        phase: "fetching",
        endpoint,
        label,
        currentPage: page,
        totalPages,
        loaded: rows.length,
        totalRecords: info.totalRecords || rows.length,
      });

      if (chunk.length === 0 || page >= totalPages) break;
      page++;
    } while (page <= 1000);

    return rows;
  }

  async function waitBetweenPhases(nextLabel) {
    if (CVCRM_PHASE_GAP_MS <= 0) return;
    await waitCountdown(CVCRM_PHASE_GAP_MS, `Aguardando antes de ${nextLabel}`);
  }

  async function cvGetConventional(endpoint, params = {}) {
    const url = new URL(endpoint, baseUrl());
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "")
        url.searchParams.set(key, String(value));
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      // Mantemos o mesmo espaçamento conservador entre chamadas para não disputar
      // requisições com o CVDW, mesmo a API convencional possuindo limite próprio.
      await waitCvcrmSlot();
      setProgress({ endpoint, phase: "requesting" });
      const started = Date.now();
      let response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            email: process.env.CVCRM_EMAIL,
            token: process.env.CVCRM_TOKEN,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(90000),
        });
      } catch (error) {
        throw new Error(
          `Falha de rede ao consultar tabela detalhada do CVCRM: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const bodyText = await response.text();
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = { mensagem: bodyText.slice(0, 5000) };
      }

      console.log(
        `[CVCRM] GET ${endpoint} -> HTTP ${response.status} (${Date.now() - started} ms)`,
      );
      if (response.ok) return body;

      if (response.status === 429) {
        const waitMs = retryAfterMs(response, attempt);
        setRateLimitCooldown(waitMs, response);
        if (attempt < 2) {
          await respectPersistentCooldown();
          continue;
        }
      }

      const msg = textValue(
        body?.message ||
          body?.mensagem ||
          body?.Response ||
          response.statusText,
        `HTTP ${response.status}`,
      );
      const err = new Error(`CVCRM ${response.status}: ${msg}`);
      err.status = response.status;
      throw err;
    }
    throw new Error(
      "CVCRM: número máximo de tentativas excedido na tabela detalhada.",
    );
  }
  function getSyncProgress() {
    return { ...syncProgress };
  }

  return {
    cvGetConventional,
    fetchAll,
    findBrokerByEmail,
    getSyncProgress,
    readRateLimitState,
    respectPersistentCooldown,
    setProgress,
    waitBetweenPhases,
    waitCvcrmSlot,
  };
}
