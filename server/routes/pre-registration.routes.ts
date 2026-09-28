// @ts-nocheck
export function registerPreRegistrationRoutes(app, dependencies) {
  const {
    addAudit,
    baseUrl,
    compactPreRegistration,
    compactPreRegistrationDocuments,
    compareReservationDocuments,
    configured,
    cvGetConventional,
    eligiblePreRegistrationCache,
    eligiblePreRegistrationCacheMs,
    normKey,
    pick,
    preRegistrationRows,
    requireManager,
    textValue,
  } = dependencies;
  app.get("/api/client/lookup", requireManager, async (req, res) => {
    const id = textValue(req.query.id).replace(/\D/g, "");
    const document = textValue(req.query.document).replace(/\D/g, "");
    if (!id && !document)
      return res
        .status(400)
        .json({ error: "Informe o ID ou o CPF/CNPJ do cliente." });
    if (!configured())
      return res
        .status(503)
        .json({ error: "A integração técnica do CVCRM não está configurada." });
    const query = id
      ? `idcliente=${encodeURIComponent(id)}`
      : `documento=${encodeURIComponent(document)}`;
    try {
      const response = await fetch(
        `${baseUrl()}/api/v1/cadastros/clientes?${query}`,
        {
          headers: {
            accept: "application/json",
            email: process.env.CVCRM_EMAIL,
            token: process.env.CVCRM_TOKEN,
          },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (response.status === 404)
        return res.json({ found: false, client: null });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        return res
          .status(response.status)
          .json({ error: "O CVCRM não conseguiu consultar este cliente." });
      const row = Array.isArray(payload?.dados)
        ? payload.dados[0]
        : Array.isArray(payload)
          ? payload[0]
          : payload?.dados && typeof payload.dados === "object"
            ? payload.dados
            : payload;
      if (!row || typeof row !== "object")
        return res.json({ found: false, client: null });
      const client = {
        id: String(pick(row, ["idcliente", "idpessoa", "id"]) || ""),
        name: textValue(pick(row, ["nome", "nomecliente", "cliente"])),
        document: textValue(pick(row, ["documento", "cpf", "cnpj"])),
        birthDate: textValue(
          pick(row, ["data_nasc", "data_nascimento", "datanascimento"]),
        ),
        phone: textValue(pick(row, ["telefone", "celular", "telefone1"])),
        email: textValue(pick(row, ["email"])),
        maritalStatus: textValue(
          pick(row, ["idestadocivil", "estado_civil", "estadocivil"]),
        ),
      };
      res.json({ found: Boolean(client.id || client.document), client });
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar o cliente no CVCRM.",
      });
    }
  });

  async function auditReservationDocuments(preRegistrationId, reservationId) {
    const prePayload = await cvGetConventional(
      `/api/v1/comercial/precadastro/${encodeURIComponent(preRegistrationId)}/documentos`,
    );
    const reservationPayload = await cvGetConventional(
      `/api/v1/comercial/reservas/${encodeURIComponent(reservationId)}/documentos`,
    );
    const preRegistrationCheck = compactPreRegistrationDocuments(prePayload);
    const reservationCheck =
      compactPreRegistrationDocuments(reservationPayload);
    return {
      preRegistrationId: String(preRegistrationId),
      reservationId: String(reservationId),
      ...compareReservationDocuments(preRegistrationCheck, reservationCheck),
    };
  }

  app.get("/api/pre-registration/:id", requireManager, async (req, res) => {
    const preRegistrationId = textValue(req.params.id).replace(/\D/g, "");
    if (!preRegistrationId)
      return res
        .status(400)
        .json({ error: "Informe um ID de pré-cadastro válido." });
    if (!configured())
      return res
        .status(503)
        .json({ error: "A integração técnica do CVCRM não está configurada." });
    const cacheKey = `pre-registration:${preRegistrationId}`;
    const cached = eligiblePreRegistrationCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      addAudit(
        req,
        "pre_registration.view",
        `Pré-cadastro #${preRegistrationId} consultado.`,
        {
          preRegistrationId,
          status: cached.value?.record?.status || "",
          documentTotal: cached.value?.record?.documentCheck?.total || 0,
          cached: true,
        },
      );
      return res.json({ ...cached.value, cached: true });
    }
    try {
      const payload = await cvGetConventional(
        `/api/v1/comercial/precadastro/${encodeURIComponent(preRegistrationId)}`,
      );
      const rows = preRegistrationRows(payload);
      const record =
        rows
          .map(compactPreRegistration)
          .find((item) => !item.id || item.id === preRegistrationId) || null;
      if (!record)
        return res
          .status(404)
          .json({ error: "Pré-cadastro não localizado no CVCRM." });
      if (!["aprovado", "condicionado"].includes(normKey(record.status))) {
        const currentStatus = record.status || "não informada";
        return res.status(422).json({
          error: `Pré-cadastro #${preRegistrationId} não elegível. Situação atual no CVCRM: ${currentStatus}. Somente Aprovado ou Condicionado podem seguir para a preparação da reserva.`,
          status: currentStatus,
        });
      }
      let documentCheck = {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        reviewRequired: true,
        documents: [],
      };
      try {
        const documentPayload = await cvGetConventional(
          `/api/v1/comercial/precadastro/${encodeURIComponent(preRegistrationId)}/documentos`,
        );
        documentCheck = compactPreRegistrationDocuments(documentPayload);
      } catch (documentError) {
        if (documentError?.status !== 204) {
          documentCheck = {
            ...documentCheck,
            error:
              "Não foi possível consultar os documentos do pré-cadastro no CVCRM.",
          };
        }
      }
      record.documentCheck = documentCheck;
      const value = { found: true, record };
      eligiblePreRegistrationCache.set(cacheKey, {
        expires: Date.now() + eligiblePreRegistrationCacheMs,
        value,
      });
      addAudit(
        req,
        "pre_registration.view",
        `Pré-cadastro #${preRegistrationId} consultado.`,
        {
          preRegistrationId,
          status: record.status,
          documentTotal: documentCheck.total,
        },
      );
      res.json(value);
    } catch (error) {
      if (error?.status === 404)
        return res
          .status(404)
          .json({ error: "Pré-cadastro não localizado no CVCRM." });
      res.status(error?.status === 429 ? 429 : 502).json({
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar o pré-cadastro no CVCRM.",
      });
    }
  });

  app.get(
    "/api/pre-registration/:id/documents",
    requireManager,
    async (req, res) => {
      const preRegistrationId = textValue(req.params.id).replace(/\D/g, "");
      if (!preRegistrationId)
        return res
          .status(400)
          .json({ error: "Informe um ID de pré-cadastro válido." });
      if (!configured())
        return res.status(503).json({
          error: "A integração técnica do CVCRM não está configurada.",
        });
      try {
        const payload = await cvGetConventional(
          `/api/v1/comercial/precadastro/${encodeURIComponent(preRegistrationId)}/documentos`,
        );
        const documentCheck = compactPreRegistrationDocuments(payload);
        addAudit(
          req,
          "pre_registration.documents",
          `Documentos do pré-cadastro #${preRegistrationId} consultados.`,
          {
            preRegistrationId,
            documentTotal: documentCheck.total,
            pending: documentCheck.pending,
            rejected: documentCheck.rejected,
          },
        );
        res.json({ found: true, preRegistrationId, documentCheck });
      } catch (error) {
        if (error?.status === 204)
          return res.json({
            found: true,
            preRegistrationId,
            documentCheck: compactPreRegistrationDocuments({}),
          });
        res.status(error?.status === 429 ? 429 : 502).json({
          error:
            error instanceof Error
              ? error.message
              : "Falha ao consultar os documentos do pré-cadastro no CVCRM.",
        });
      }
    },
  );

  app.get(
    "/api/reservations/:id/document-audit",
    requireManager,
    async (req, res) => {
      const reservationId = textValue(req.params.id).replace(/\D/g, "");
      const preRegistrationId = textValue(req.query?.preRegistrationId).replace(
        /\D/g,
        "",
      );
      if (!reservationId || !preRegistrationId)
        return res
          .status(400)
          .json({ error: "Informe o ID da reserva e o ID do pré-cadastro." });
      if (!configured())
        return res.status(503).json({
          error: "A integração técnica do CVCRM não está configurada.",
        });
      try {
        const audit = await auditReservationDocuments(
          preRegistrationId,
          reservationId,
        );
        addAudit(
          req,
          "reservation.documents",
          `Documentos da reserva #${reservationId} comparados com o pré-cadastro #${preRegistrationId}.`,
          {
            preRegistrationId,
            reservationId,
            contractReady: audit.ready,
            missingDocuments: audit.missingInReservation.length,
          },
        );
        res.json({ found: true, audit });
      } catch (error) {
        res.status(error?.status === 429 ? 429 : 502).json({
          error:
            error instanceof Error
              ? error.message
              : "Falha ao conferir os documentos da reserva.",
        });
      }
    },
  );
  return { auditReservationDocuments };
}
