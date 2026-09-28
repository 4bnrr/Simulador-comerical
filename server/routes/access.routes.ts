// @ts-nocheck
import crypto from "node:crypto";

export function registerAccessRoutes(app, dependencies) {
  const {
    addAudit,
    addHistory,
    baseUrl,
    findToken,
    getManagerSession,
    jwtSubject,
    managerLoginAttempts,
    managerSessions,
    parseCookies,
    textValue,
  } = dependencies;

  app.get("/api/access/auth", (req, res) => {
    const session = getManagerSession(req);
    res.json(
      session
        ? { authenticated: true, user: session.user }
        : { authenticated: false, user: null },
    );
  });

  app.post("/api/access/login", async (req, res) => {
    const email = textValue(req.body?.email).toLowerCase();
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password)
      return res.status(400).json({
        error: "Informe o e-mail e a senha usados no painel Gestor.",
      });
    if (!process.env.CVCRM_DOMAIN)
      return res
        .status(503)
        .json({ error: "O domínio do CVCRM não está configurado." });

    const attemptKey = `${req.ip || req.socket?.remoteAddress || "local"}|${email}`;
    const attempt = managerLoginAttempts.get(attemptKey);
    if (attempt?.blockedUntil > Date.now())
      return res.status(429).json({
        error:
          "Muitas tentativas de acesso. Aguarde 15 minutos antes de tentar novamente.",
      });

    try {
      const response = await fetch(`${baseUrl()}/api/v3/auth/token`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, senha: password, painel: "gestor" }),
        signal: AbortSignal.timeout(30000),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const failures = (attempt?.failures || 0) + 1;
        managerLoginAttempts.set(attemptKey, {
          failures,
          blockedUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
        });
        return res.status(401).json({
          error:
            "Credenciais inválidas ou usuário sem acesso ao painel Gestor do CVCRM.",
        });
      }

      const accessToken = findToken(payload);
      if (!accessToken)
        return res.status(502).json({
          error:
            "O CVCRM autenticou o usuário, mas não devolveu um token reconhecível.",
        });

      const user = {
        id:
          jwtSubject(accessToken) ||
          crypto.createHash("sha256").update(email).digest("hex").slice(0, 16),
        name: email.split("@")[0],
        email,
        role: "gestor",
      };
      const sessionId = crypto.randomBytes(32).toString("hex");
      managerSessions.set(sessionId, {
        user,
        accessToken,
        expires: Date.now() + 6 * 60 * 60 * 1000,
      });
      managerLoginAttempts.delete(attemptKey);
      const secure =
        req.secure ||
        String(req.headers["x-forwarded-proto"] || "").toLowerCase() ===
          "https";
      res.setHeader(
        "Set-Cookie",
        `estacao_manager=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${6 * 60 * 60}${secure ? "; Secure" : ""}`,
      );
      addHistory("access.login", "Acesso de gestor autenticado no simulador.", {
        actorType: "manager",
        actorId: user.id,
        actorName: user.name,
      });
      res.json({ authenticated: true, user });
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível autenticar no CVCRM.",
      });
    }
  });

  app.post("/api/access/logout", (req, res) => {
    const sessionId = parseCookies(req).estacao_manager;
    addAudit(req, "access.logout", "Sessão encerrada no simulador.");
    if (sessionId) managerSessions.delete(sessionId);
    res.setHeader(
      "Set-Cookie",
      "estacao_manager=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    res.json({ ok: true });
  });
}
