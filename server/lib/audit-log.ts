// @ts-nocheck
import crypto from "node:crypto";

export function createAuditLog({
  getAdminSession,
  getManagerSession,
  historyFile,
  maxHistory,
  readJson,
  textValue,
  writeJson,
}) {
  function addHistory(action, detail, meta = {}) {
    const history = readJson(historyFile, []);
    history.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      action,
      detail,
      ...meta,
    });
    writeJson(historyFile, history.slice(0, maxHistory));
  }

  function auditActor(req) {
    const manager = getManagerSession(req)?.user;
    if (manager)
      return {
        actorType: "manager",
        actorId: String(manager.id || ""),
        actorName: textValue(manager.name, "Gestor"),
      };
    const admin = getAdminSession(req);
    if (admin)
      return {
        actorType: "admin",
        actorId: textValue(admin.username),
        actorName: textValue(admin.username, "Administrador"),
      };
    return { actorType: "system", actorId: "", actorName: "Sistema" };
  }

  function addAudit(req, action, detail, meta = {}) {
    addHistory(action, detail, { ...auditActor(req), ...meta });
  }

  return { addAudit, addHistory, auditActor };
}
