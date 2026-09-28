// @ts-nocheck
import crypto from "node:crypto";

export function registerClientRoutes(app, dependencies) {
  const {
    compactPreRegistration,
    configured,
    cvGetConventional,
    eligiblePreRegistrationCache,
    eligiblePreRegistrationCacheMs,
    getManagerSession,
    historyFile,
    normKey,
    pick,
    preRegistrationRows,
    readJson,
    requireManager,
    textValue,
  } = dependencies;
  app.get("/api/audit-history", requireManager, (req, res) => {
    const session = getManagerSession(req);
    const actorId = String(session?.user?.id || "");
    const rows = readJson(historyFile, [])
      .filter(
        (item) =>
          item.actorType === "manager" &&
          String(item.actorId || "") === actorId,
      )
      .slice(0, 100)
      .map((item) => ({
        id: item.id,
        at: item.at,
        action: item.action,
        detail: item.detail,
        actorName: item.actorName,
        preRegistrationId: item.preRegistrationId || "",
        reservationId: item.reservationId || "",
        result:
          item.contractReady === true
            ? "ready"
            : item.contractReady === false
              ? "blocked"
              : "",
      }));
    res.json({ rows, count: rows.length });
  });

  app.get("/api/client/:id/eligible-pre-registrations", async (req, res) => {
    const clientId = textValue(req.params.id).replace(/\D/g, "");
    if (!clientId)
      return res
        .status(400)
        .json({ error: "Informe um ID de cliente válido." });
    if (!configured())
      return res
        .status(503)
        .json({ error: "A integração técnica do CVCRM não está configurada." });
    const cacheKey = clientId;
    const cached = eligiblePreRegistrationCache.get(cacheKey);
    if (cached && cached.expires > Date.now())
      return res.json({ ...cached.value, cached: true });
    try {
      const clientPayload = await cvGetConventional(
        "/api/v1/cadastros/clientes",
        { idcliente: clientId },
      );
      const clientRow = Array.isArray(clientPayload?.dados)
        ? clientPayload.dados[0]
        : Array.isArray(clientPayload)
          ? clientPayload[0]
          : clientPayload?.dados && typeof clientPayload.dados === "object"
            ? clientPayload.dados
            : clientPayload;
      if (!clientRow || typeof clientRow !== "object")
        return res
          .status(404)
          .json({ error: "Cliente não localizado no CVCRM." });
      const client = {
        id: String(
          pick(clientRow, ["idcliente", "idpessoa", "id"]) || clientId,
        ),
        name: textValue(pick(clientRow, ["nome", "nomecliente", "cliente"])),
        document: textValue(pick(clientRow, ["documento", "cpf", "cnpj"])),
        birthDate: textValue(
          pick(clientRow, ["data_nasc", "data_nascimento", "datanascimento"]),
        ),
        phone: textValue(pick(clientRow, ["telefone", "celular", "telefone1"])),
        email: textValue(pick(clientRow, ["email"])),
        maritalStatus: textValue(
          pick(clientRow, ["idestadocivil", "estado_civil", "estadocivil"]),
        ),
      };
      if (!client.document)
        return res.status(422).json({
          error:
            "O cliente foi localizado, mas não possui CPF/CNPJ disponível para consultar o pré-cadastro.",
        });
      const preRegistrationPayload = await cvGetConventional(
        `/api/v1/comercial/precadastro/${encodeURIComponent(client.document.replace(/\D/g, ""))}`,
      );
      const allRecords = preRegistrationRows(preRegistrationPayload).map(
        compactPreRegistration,
      );
      const records = allRecords.filter((record) => {
        const eligible = ["aprovado", "condicionado"].includes(
          normKey(record.status),
        );
        const sameClient = !record.client.id || record.client.id === clientId;
        return eligible && sameClient;
      });
      const value = {
        found: true,
        client,
        records,
        count: records.length,
      };
      eligiblePreRegistrationCache.set(cacheKey, {
        expires: Date.now() + eligiblePreRegistrationCacheMs,
        value,
      });
      res.json(value);
    } catch (error) {
      if (error?.status === 404)
        return res
          .status(404)
          .json({ error: "Não há pré-cadastro localizado para este cliente." });
      res.status(error?.status === 429 ? 429 : 502).json({
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar o pré-cadastro no CVCRM.",
      });
    }
  });

  app.post("/api/client/prepare", requireManager, (req, res) => {
    const name = textValue(req.body?.name);
    const document = textValue(req.body?.document).replace(/\D/g, "");
    if (!name || ![11, 14].includes(document.length))
      return res.status(400).json({
        error: "Informe o nome e um CPF/CNPJ válido para preparar o cadastro.",
      });
    const internalId = `portal-${crypto.createHash("sha256").update(document).digest("hex").slice(0, 16)}`;
    res.json({
      ready: true,
      writeEnabled: false,
      internalId,
      message:
        "Cadastro validado no laboratório. O envio real ao CVCRM permanece bloqueado.",
    });
  });
}
