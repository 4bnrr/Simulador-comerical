// @ts-nocheck
export function createSessionManager({ adminSessions, managerSessions }) {
  function parseCookies(req) {
    const raw = req.headers.cookie || "";
    return Object.fromEntries(
      raw
        .split(";")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => {
          const separator = value.indexOf("=");
          return separator >= 0
            ? [
                decodeURIComponent(value.slice(0, separator)),
                decodeURIComponent(value.slice(separator + 1)),
              ]
            : [value, ""];
        }),
    );
  }

  function getSession(req, cookieName, sessions, durationMs) {
    const sessionId = parseCookies(req)[cookieName];
    if (!sessionId) return null;
    const session = sessions.get(sessionId);
    if (!session) return null;
    if (session.expires < Date.now()) {
      sessions.delete(sessionId);
      return null;
    }
    session.expires = Date.now() + durationMs;
    return session;
  }

  function getAdminSession(req) {
    return getSession(req, "estacao_admin", adminSessions, 8 * 60 * 60 * 1000);
  }

  function requireAdmin(req, res, next) {
    if (getAdminSession(req)) return next();
    res.status(401).json({ error: "Não autorizado" });
  }

  function getManagerSession(req) {
    return getSession(
      req,
      "estacao_manager",
      managerSessions,
      6 * 60 * 60 * 1000,
    );
  }

  function requireManager(req, res, next) {
    if (getManagerSession(req)) return next();
    res.status(401).json({
      error: "Entre com uma conta do painel Gestor do CVCRM para continuar.",
    });
  }

  return {
    getAdminSession,
    getManagerSession,
    parseCookies,
    requireAdmin,
    requireManager,
  };
}
