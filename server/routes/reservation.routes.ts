// @ts-nocheck
export function registerReservationRoutes(app, dependencies) {
  const {
    addAudit,
    auditReservationDocuments,
    baseUrl,
    cacheFile,
    compactPreRegistration,
    compactPreRegistrationDocuments,
    configured,
    cvGetConventional,
    emptyCache,
    findReservationId,
    normKey,
    numberValue,
    preRegistrationRows,
    readJson,
    requireManager,
    reservationDate,
    reservationSeriesId,
    textValue,
    waitCvcrmSlot,
  } = dependencies;
  app.post("/api/reservations", requireManager, async (req, res) => {
    const preRegistrationId = textValue(req.body?.preRegistrationId).replace(
      /\D/g,
      "",
    );
    const unitId = textValue(req.body?.unitId).replace(/\D/g, "");
    const firstDueDate = reservationDate(req.body?.firstDueDate);
    const entryInstallments = Math.max(
      1,
      Math.round(numberValue(req.body?.entryInstallments) || 1),
    );
    if (req.body?.confirmation !== "CREATE_RESERVATION")
      return res.status(400).json({
        error: "Confirmação explícita da criação da reserva não recebida.",
      });
    if (!preRegistrationId || !unitId || !firstDueDate)
      return res.status(400).json({
        error: "Informe o pré-cadastro, a unidade e o primeiro vencimento.",
      });
    if (!configured())
      return res
        .status(503)
        .json({ error: "A integração técnica do CVCRM não está configurada." });
    try {
      const prePayload = await cvGetConventional(
        `/api/v1/comercial/precadastro/${encodeURIComponent(preRegistrationId)}`,
      );
      const record =
        preRegistrationRows(prePayload)
          .map(compactPreRegistration)
          .find((item) => !item.id || item.id === preRegistrationId) || null;
      if (!record)
        return res
          .status(404)
          .json({ error: "Pré-cadastro não localizado no CVCRM." });
      if (!["aprovado", "condicionado"].includes(normKey(record.status)))
        return res.status(422).json({
          error: `Pré-cadastro #${preRegistrationId} está ${record.status || "sem situação"} e não pode gerar uma nova reserva.`,
        });
      const documentPayload = await cvGetConventional(
        `/api/v1/comercial/precadastro/${encodeURIComponent(preRegistrationId)}/documentos`,
      );
      const documentCheck = compactPreRegistrationDocuments(documentPayload);
      if (documentCheck.total === 0) {
        return res.status(422).json({
          error: `Pré-cadastro #${preRegistrationId} não possui documentos disponíveis para conferência. A reserva não pode ser validada.`,
          documentCheck,
        });
      }
      if (documentCheck.reviewRequired) {
        return res.status(422).json({
          error: `A reserva não pode ser validada: ${documentCheck.pending} documento(s) pendente(s) e ${documentCheck.rejected} documento(s) reprovado(s) no pré-cadastro.`,
          documentCheck,
        });
      }
      const cache = readJson(cacheFile, emptyCache);
      const unit = (cache.units || []).find(
        (item) =>
          String(item.id) === unitId &&
          normKey(item.status) === "disponivel" &&
          Number(item.price) > 0,
      );
      if (!unit)
        return res.status(409).json({
          error:
            "A unidade selecionada não consta como disponível no catálogo atual.",
        });
      if (!record.client.id || !record.broker.id || !unit.enterpriseId)
        return res.status(422).json({
          error:
            "O pré-cadastro ou a unidade não possui todos os identificadores exigidos para criar a reserva.",
        });
      const financing = Math.max(0, Number(record.approvedCredit || 0));
      const subsidy = Math.max(0, Number(record.subsidy || 0));
      const fgts = Math.max(0, Number(record.fgts || 0));
      const entry = Math.max(
        0,
        Number(unit.price || 0) - financing - subsidy - fgts,
      );
      const sources = [
        { kind: "financing", value: financing, quantity: 1 },
        { kind: "subsidy", value: subsidy, quantity: 1 },
        { kind: "fgts", value: fgts, quantity: 1 },
        { kind: "entry", value: entry, quantity: entryInstallments },
      ].filter((source) => source.value > 0);
      const missingSeries = sources
        .filter((source) => !reservationSeriesId(source.kind))
        .map((source) => source.kind);
      const conditions = sources.map((source) => ({
        idserie_cv: reservationSeriesId(source.kind),
        quantidade_parcelas: source.quantity,
        valor_parcela: Number((source.value / source.quantity).toFixed(2)),
        primeiro_vencimento: firstDueDate,
        retirar_comissao: "N",
      }));
      const reservationPayload = {
        idpessoa_cv: Number(record.client.id),
        idempreendimento_cv: Number(unit.enterpriseId),
        idunidade_cv: Number(unit.id),
        idcorretor_cv: Number(record.broker.id),
        idreserva_int: `EST1-PRE-${preRegistrationId}-UN-${unit.id}`,
        condicoes: conditions,
      };
      const writeEnabled =
        String(
          process.env.CVCRM_RESERVATION_WRITE_ENABLED || "false",
        ).toLowerCase() === "true";
      if (!writeEnabled) {
        addAudit(
          req,
          "reservation.validate",
          `Reserva do pré-cadastro #${preRegistrationId} validada no laboratório.`,
          {
            preRegistrationId,
            unitId,
            reservationTraceId: reservationPayload.idreserva_int,
            created: false,
          },
        );
        return res.json({
          ready: true,
          created: false,
          writeEnabled: false,
          missingSeries,
          preRegistrationId,
          reservationTraceId: reservationPayload.idreserva_int,
          documentCheck,
          message:
            "Reserva validada no laboratório. O envio real ao CVCRM permanece desativado.",
        });
      }
      if (missingSeries.length)
        return res.status(503).json({
          error: `Configure as séries de pagamento do CVCRM antes de habilitar reservas: ${missingSeries.join(", ")}.`,
        });
      await waitCvcrmSlot();
      const response = await fetch(`${baseUrl()}/api/v1/comercial/reservas`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          email: process.env.CVCRM_EMAIL,
          token: process.env.CVCRM_TOKEN,
        },
        body: JSON.stringify(reservationPayload),
        signal: AbortSignal.timeout(90000),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        return res.status(response.status).json({
          error: textValue(
            payload?.mensagem || payload?.error,
            `O CVCRM recusou a criação da reserva (HTTP ${response.status}).`,
          ),
        });
      const reservationId = findReservationId(payload);
      let reservationAudit = null;
      let reservationAuditError = "";
      if (reservationId) {
        try {
          reservationAudit = await auditReservationDocuments(
            preRegistrationId,
            reservationId,
          );
        } catch (auditError) {
          reservationAuditError =
            auditError instanceof Error
              ? auditError.message
              : "Falha ao conferir os documentos da reserva.";
        }
      } else {
        reservationAuditError =
          "O CVCRM criou a reserva, mas não retornou um identificador para a conferência documental automática.";
      }
      addAudit(
        req,
        "reservation.create",
        `Reserva criada a partir do pré-cadastro #${preRegistrationId}.`,
        {
          preRegistrationId,
          unitId,
          reservationId,
          reservationTraceId: reservationPayload.idreserva_int,
          contractReady: Boolean(reservationAudit?.ready),
        },
      );
      res.json({
        ready: true,
        created: true,
        writeEnabled: true,
        preRegistrationId,
        reservationId,
        reservationTraceId: reservationPayload.idreserva_int,
        reservationAudit,
        reservationAuditError,
        contractReady: Boolean(reservationAudit?.ready),
        message: textValue(payload?.mensagem, "Reserva criada no CVCRM."),
        result: payload,
      });
    } catch (error) {
      res.status(error?.status === 429 ? 429 : 502).json({
        error:
          error instanceof Error
            ? error.message
            : "Falha ao preparar a criação da reserva.",
      });
    }
  });
}
