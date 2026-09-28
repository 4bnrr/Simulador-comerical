// @ts-nocheck
export function createPreRegistrationLab(dependencies) {
  const {
    api,
    calculateEntrySchedule,
    calculatePaymentPlan,
    cssKey,
    enterpriseDisplayName,
    entrySettingsForConditions,
    escapeHtml,
    fmtBRL,
    parseMoney,
    paymentPlanContext,
    preRegistrationDate,
    preRegistrationMaritalStatus,
    preRegistrationMoney,
    renderPaymentPlan,
    reservationBlockLabel,
    reservationPropertyNumber,
    selectPaymentRule,
    showSimulatorTab,
    simulatorUnits,
    toast,
    varandaCategory,
    wireMoneyField,
  } = dependencies;
  const { state } = dependencies;
  function renderPreRegistrationLab() {
    const area = document.querySelector("#paymentPlanTab");
    const ctx = paymentPlanContext();
    const u = ctx.unit;
    if (!area || !u || !ctx.sale || !ctx.appraisal) return;

    const rule = selectPaymentRule(state.paymentPlanRules, {
      enterpriseName: u.enterpriseName,
      typology: `${varandaCategory(u) || ""} ${u.typology || ""}`,
      developmentType: u.developmentType || "",
    });
    const plan = calculatePaymentPlan(ctx, rule);
    const entryPolicy = entrySettingsForConditions(rule);
    const typologyInterest =
      [u.commercialType, varandaCategory(u), u.typology]
        .map((x) => String(x || "").trim())
        .filter((x, i, list) => x && list.indexOf(x) === i)
        .join(" • ") || "Não especificada";
    const clientName = String(
      document.querySelector("#clientName")?.value ||
        state.lastSimulation?.clientName ||
        "",
    ).trim();
    const draft = {
      clientName,
      preRegistrationId: "",
      preRegistrationStatus: "",
      reservationEnterprise: u.enterpriseName,
      reservationBlock: reservationBlockLabel(u),
      reservationUnitId: String(u.id || ""),
      document: "",
      birthDate: "",
      maritalStatus: "",
      phone: "",
      email: "",
      mainIncome: "",
      totalIncome: "",
      fgts: "0",
      installment: "",
      financingTerm: "",
      approvalExpiry: "",
      purchaseIntentId: "",
      entryInstallments: String(entryPolicy.installments || 1),
      firstDueDate: "",
      notes: "",
      linkUnit: "N",
      clientConfirmed: "N",
      ...state.preRegistrationDraft,
    };
    state.preRegistrationDraft = draft;
    const reservationUnits = simulatorUnits();
    const reservationEnterprises = [
      ...new Set(reservationUnits.map((unit) => unit.enterpriseName)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const selectedReservationEnterprise = reservationEnterprises.includes(
      draft.reservationEnterprise,
    )
      ? draft.reservationEnterprise
      : u.enterpriseName;
    const enterpriseReservationUnits = reservationUnits.filter(
      (unit) => unit.enterpriseName === selectedReservationEnterprise,
    );
    const reservationBlocks = [
      ...new Set(enterpriseReservationUnits.map(reservationBlockLabel)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    const selectedReservationBlock = reservationBlocks.includes(
      draft.reservationBlock,
    )
      ? draft.reservationBlock
      : reservationBlockLabel(u);
    const blockReservationUnits = enterpriseReservationUnits.filter(
      (unit) => reservationBlockLabel(unit) === selectedReservationBlock,
    );
    const importedPreRegistration = state.eligiblePreRegistrations[0] || null;
    const documentCheck = importedPreRegistration?.documentCheck || {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      reviewRequired: true,
      documents: [],
    };
    const documentsReady =
      !documentCheck.error &&
      documentCheck.total > 0 &&
      !documentCheck.reviewRequired;
    const documentState = documentCheck.error
      ? "error"
      : documentCheck.reviewRequired
        ? "warning"
        : "ok";
    const documentTitle = documentCheck.error
      ? "Consulta documental indisponível"
      : documentCheck.total === 0
        ? "Nenhum documento encontrado"
        : documentCheck.reviewRequired
          ? "Documentos exigem conferência"
          : "Documentos sem pendências encontradas";
    const initialFinancialEntry = Math.max(
      0,
      plan.sale -
        plan.financingEffective -
        plan.subsidy -
        parseMoney(draft.fgts),
    );
    const proposalSchedule = calculateEntrySchedule(
      {
        sale: plan.sale,
        entryRequired: initialFinancialEntry,
        commercialRemuneration: plan.commercialRemuneration,
        monthlyIncome: parseMoney(draft.totalIncome),
      },
      {
        ...entryPolicy,
        installments:
          Number(draft.entryInstallments) || entryPolicy.installments,
      },
    );
    const proposalFinancing = Math.max(
      0,
      plan.financingEffective - proposalSchedule.financingAdjustment,
    );

    area.insertAdjacentHTML(
      "beforeend",
      `<section class="pre-reg-lab" id="preRegistrationLab">
    <div class="pre-reg-head">
      <div><div class="eyebrow">integração CVCRM • laboratório</div><h2>Preparação da reserva</h2><p>Continuação dos pré-cadastros aprovados ou condicionados, com conferência comercial antes da criação da reserva.</p></div>
      <span class="pre-reg-mode">ENVIO PROTEGIDO</span>
    </div>
    <div class="pre-reg-flow" aria-label="Esteira do pré-cadastro">
      <span>Aprovado / Condicionado</span><i>→</i><span>Revalidar documentos</span><i>→</i><span>Selecionar unidade</span><i>→</i><span>Reserva</span><i>→</i><span>Conferir documentos</span><i>→</i><span>Contrato</span>
    </div>
    <form id="preRegistrationForm" novalidate>
      <fieldset><legend>Origem do pré-cadastro</legend><div class="pre-reg-grid">
        <div class="field client-lookup-field"><label>ID da consulta do pré-cadastro *</label><div class="client-lookup-control"><input class="input" name="preRegistrationId" inputmode="numeric" value="${escapeHtml(draft.preRegistrationId)}" placeholder="Informe o ID da consulta" required><button id="lookupClientBtn" class="btn secondary compact" type="button">Buscar no CV</button></div></div>
        <div class="field"><label>Nome do cliente *</label><input class="input" name="clientName" value="${escapeHtml(draft.clientName)}" required></div>
        <div class="field"><label>Corretor responsável</label><input class="input" value="${escapeHtml(draft.brokerName || "Importado do pré-cadastro")}" readonly></div>
        <div class="field"><label>Empreendimento disponível *</label><select class="select" name="reservationEnterprise" required>${reservationEnterprises.map((name) => `<option value="${escapeHtml(name)}" ${name === selectedReservationEnterprise ? "selected" : ""}>${escapeHtml(enterpriseDisplayName(name))}</option>`).join("")}</select></div>
        <div class="field"><label>Bloco com disponibilidade *</label><select class="select" name="reservationBlock" required>${reservationBlocks.map((name) => `<option value="${escapeHtml(name)}" ${name === selectedReservationBlock ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></div>
        <div class="field"><label>Número do imóvel disponível *</label><select class="select" name="reservationUnitId" required>${blockReservationUnits.map((unit) => `<option value="${escapeHtml(unit.id)}" ${String(unit.id) === String(draft.reservationUnitId || u.id) ? "selected" : ""}>Imóvel ${escapeHtml(reservationPropertyNumber(unit))} • ${escapeHtml([unit.commercialType, unit.typology].filter(Boolean).join(" • "))} • ${fmtBRL(unit.price)}</option>`).join("")}</select></div>
      </div>${importedPreRegistration ? `<div class="pre-reg-info"><b>Pré-cadastro #${escapeHtml(importedPreRegistration.id)} apto para reserva.</b><span>${escapeHtml(importedPreRegistration.status)} • ${escapeHtml(importedPreRegistration.enterprise?.name || "Empreendimento não informado")} • aprovação ${escapeHtml(preRegistrationDate(importedPreRegistration.approvalExpiry) || "sem vencimento informado")}</span></div>` : ""}<label class="pre-reg-unit-choice"><input type="checkbox" name="linkUnit" value="S" ${draft.linkUnit === "S" ? "checked" : ""} required><span>Confirmar esta unidade para a proposta de reserva</span></label><div class="pre-reg-info"><b>A unidade ainda não será bloqueada.</b><span>O bloqueio ocorrerá somente quando o envio real da reserva for habilitado e confirmado.</span></div></fieldset>

      <fieldset class="document-check pre-reg-collapsible"><legend><button type="button" class="pre-reg-collapse-toggle" aria-expanded="false" aria-controls="preRegDocumentsContent"><span>Documentos e anexos do pré-cadastro</span><span class="pre-reg-collapse-arrow" aria-hidden="true">⌄</span></button></legend>
        <div id="preRegDocumentsContent" class="pre-reg-collapse-content" hidden>
        <div class="document-check-summary ${documentState}">
          <div><b>${escapeHtml(documentTitle)}</b><span>Consulta realizada diretamente no pré-cadastro do CVCRM.</span></div>
          <div class="document-check-counts"><span><b>${Number(documentCheck.total || 0)}</b> encontrados</span><span><b>${Number(documentCheck.approved || 0)}</b> aprovados</span><span><b>${Number(documentCheck.pending || 0)}</b> pendentes</span><span><b>${Number(documentCheck.rejected || 0)}</b> reprovados</span></div>
        </div>
        ${documentCheck.error ? `<div class="plan-alert error"><b>Falha na consulta documental</b><p>${escapeHtml(documentCheck.error)}</p></div>` : ""}
        ${documentCheck.documents?.length ? `<div class="document-list">${documentCheck.documents.map((document) => `<article><div><small>${escapeHtml(document.group || "Titular")}</small><b>${escapeHtml(document.name || "Documento")}</b><span>${escapeHtml(document.type || "Tipo não informado")}</span></div><span class="document-status ${cssKey(document.status)}">${escapeHtml(document.status || "Não informado")}</span></article>`).join("")}</div>` : '<div class="pre-reg-info"><b>Nenhum anexo retornado.</b><span>A criação da reserva deve permanecer condicionada à conferência documental no CVCRM.</span></div>'}
        <div class="plan-note"><b>Importante:</b> esta conferência identifica os arquivos existentes e suas situações. A ausência de um documento obrigatório só poderá ser bloqueada automaticamente quando a relação de documentos exigidos por empreendimento estiver configurada.</div>
        </div>
      </fieldset>

      <fieldset class="pre-reg-collapsible"><legend><button type="button" class="pre-reg-collapse-toggle" aria-expanded="false" aria-controls="preRegHolderContent"><span>Dados do titular</span><span class="pre-reg-collapse-arrow" aria-hidden="true">⌄</span></button></legend><div id="preRegHolderContent" class="pre-reg-collapse-content" hidden><div class="pre-reg-grid">
        <div class="field"><label>CPF ou CNPJ *</label><input class="input" name="document" inputmode="numeric" value="${escapeHtml(draft.document)}" required></div>
        <div class="field"><label>Data de nascimento *</label><input class="input" name="birthDate" type="date" value="${escapeHtml(draft.birthDate)}" required></div>
        <div class="field"><label>Estado civil *</label><select class="select" name="maritalStatus" required><option value="">Selecione</option>${[
          ["4", "Solteiro(a)"],
          ["1", "Casado(a) — comunhão parcial"],
          ["8", "Casado(a) — comunhão total"],
          ["9", "Casado(a) — separação total"],
          ["7", "União estável"],
          ["2", "Divorciado(a)"],
          ["3", "Separado(a)"],
          ["5", "Viúvo(a)"],
          ["6", "Outros"],
        ]
          .map(
            ([v, l]) =>
              `<option value="${v}" ${draft.maritalStatus === v ? "selected" : ""}>${l}</option>`,
          )
          .join("")}</select></div>
        <div class="field"><label>Telefone *</label><input class="input" name="phone" inputmode="tel" value="${escapeHtml(draft.phone)}" required></div>
        <div class="field"><label>E-mail *</label><input class="input" name="email" type="email" value="${escapeHtml(draft.email)}" required></div>
        <div class="field"><label>Renda do titular *</label><input class="input pre-reg-money" name="mainIncome" inputmode="decimal" value="${escapeHtml(draft.mainIncome)}" required></div>
        <div class="field"><label>Renda total *</label><input class="input pre-reg-money" name="totalIncome" inputmode="decimal" value="${escapeHtml(draft.totalIncome)}" required></div>
      </div><div class="client-automation-bar"><div><b>Dados herdados do pré-cadastro</b><span>Nome, documento, nascimento, estado civil, contato e renda devem ser apenas conferidos antes da proposta.</span></div></div></div></fieldset>

      <fieldset><legend>Crédito e condição comercial</legend><div class="pre-reg-grid">
        <div class="field"><label>FGTS</label><input class="input pre-reg-money" name="fgts" inputmode="decimal" value="${escapeHtml(draft.fgts)}"></div>
        <div class="field"><label>Valor da prestação *</label><input class="input pre-reg-money" name="installment" inputmode="decimal" value="${escapeHtml(draft.installment)}" required></div>
        <div class="field"><label>Prazo do financiamento *</label><input class="input" name="financingTerm" value="${escapeHtml(draft.financingTerm)}" placeholder="Ex.: 360 meses" required></div>
        <div class="field"><label>Vencimento da aprovação *</label><input class="input" name="approvalExpiry" type="date" value="${escapeHtml(draft.approvalExpiry)}" required></div>
        <div class="field"><label>Parcelas do saldo da entrada *</label><input class="input" name="entryInstallments" inputmode="numeric" min="1" max="${Number(entryPolicy.maximumInstallments || 48)}" value="${escapeHtml(draft.entryInstallments)}" required></div>
        <div class="field"><label>Primeiro vencimento *</label><input class="input" name="firstDueDate" type="date" value="${escapeHtml(draft.firstDueDate)}" required></div>
      </div></fieldset>

      <fieldset><legend>Condições da proposta</legend><div class="proposal-condition-grid">
        <div><span>Valor de venda</span><b>${fmtBRL(plan.sale)}</b></div>
        <div><span>Financiamento considerado</span><b id="proposalFinancing">${fmtBRL(proposalFinancing)}</b></div>
        <div class="highlight"><span>Entrada considerada</span><b id="proposalEntry">${fmtBRL(proposalSchedule.totalEntry)}</b></div>
        <div><span>Pagamento inicial</span><b id="proposalInitialPayment">${fmtBRL(proposalSchedule.signal)}</b></div>
        <div><span>Saldo parcelado da entrada</span><b id="proposalEntryBalance">${fmtBRL(proposalSchedule.balance)}</b></div>
      </div><div id="proposalCheck" class="proposal-check ok"><b>Condição equilibrada</b><span>A soma das fontes de pagamento corresponde ao valor de venda.</span></div></fieldset>

      <fieldset><legend>Prontidão para o contrato</legend><div class="pre-reg-grid one-wide">
        <div class="field"><label>Observações do correspondente bancário</label><textarea class="input" name="notes" rows="4">${escapeHtml(draft.notes)}</textarea></div>
      </div></fieldset>

      <label class="proposal-confirm"><input type="checkbox" name="clientConfirmed" value="S" ${draft.clientConfirmed === "S" ? "checked" : ""}><span>Cliente conferiu os dados e está de acordo com esta proposta.</span></label>
      <div id="preRegValidation" class="pre-reg-validation" hidden></div>
      <div class="buttons proposal-actions"><button id="validatePreRegistrationBtn" class="btn primary action-animated" type="button" ${documentsReady ? "" : "disabled"} title="${documentsReady ? "Validar dados da proposta" : "Aguardando aprovação integral dos documentos no CVCRM"}">Validar proposta</button><button id="uploadProposalBtn" class="action-animated" type="button" hidden ${documentsReady ? "" : "disabled"} aria-hidden="true">Simular criação no CVCRM</button><span class="pre-reg-caption">${documentsReady ? "Após conferir os dados, conclua a simulação na aba Condições de Pagamento. Nenhum dado será enviado ao CVCRM." : "Validação bloqueada até todos os documentos estarem aprovados no CVCRM."}</span></div>
    </form>
  </section>`,
    );

    const rerenderPreRegistration = () => {
      const current = area.querySelector("#preRegistrationForm");
      if (current) {
        const saved = Object.fromEntries(new FormData(current));
        saved.linkUnit = current.elements.linkUnit?.checked ? "S" : "N";
        saved.clientConfirmed = current.elements.clientConfirmed?.checked
          ? "S"
          : "N";
        state.preRegistrationDraft = {
          ...state.preRegistrationDraft,
          ...saved,
        };
      }
      renderPaymentPlan();
      renderPreRegistrationLab();
      document
        .querySelector("#preRegistrationLab")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const form = area.querySelector("#preRegistrationForm");
    form?.querySelectorAll(".pre-reg-collapse-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        const content = document.getElementById(
          button.getAttribute("aria-controls"),
        );
        if (!content) return;
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        content.hidden = expanded;
      });
    });
    const applyEligiblePreRegistration = (record) => {
      if (!record) return;
      state.selectedEligiblePreRegistrationId = String(record.id || "");
      const client = record.client || {};
      const matchingUnit =
        reservationUnits.find(
          (unit) =>
            String(unit.enterpriseId || "") ===
            String(record.enterprise?.id || ""),
        ) ||
        reservationUnits.find(
          (unit) =>
            String(unit.enterpriseName || "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase() ===
            String(record.enterprise?.name || "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase(),
        );
      if (matchingUnit) state.selectedSimulationUnit = matchingUnit;
      state.lastSimulation = {
        ...(state.lastSimulation || {}),
        financingApproved: Number(record.approvedCredit || 0),
        subsidy: Number(record.subsidy || 0),
        preRegistrationAppraisal: Number(record.appraisal || 0) || undefined,
      };
      state.preRegistrationDraft = {
        ...state.preRegistrationDraft,
        preRegistrationId: String(record.id || ""),
        preRegistrationStatus: record.status || "Aprovado",
        clientName: client.name || state.preRegistrationDraft.clientName || "",
        document: client.document || state.preRegistrationDraft.document || "",
        birthDate:
          preRegistrationDate(client.birthDate) ||
          state.preRegistrationDraft.birthDate ||
          "",
        maritalStatus:
          preRegistrationMaritalStatus(client.maritalStatus) ||
          state.preRegistrationDraft.maritalStatus ||
          "",
        phone: client.phone || state.preRegistrationDraft.phone || "",
        email: client.email || state.preRegistrationDraft.email || "",
        mainIncome: preRegistrationMoney(record.mainIncome),
        totalIncome: preRegistrationMoney(record.totalIncome),
        fgts: preRegistrationMoney(record.fgts),
        installment: preRegistrationMoney(record.installment),
        financingTerm: String(record.financingTerm || ""),
        approvalExpiry: preRegistrationDate(record.approvalExpiry),
        notes: record.notes || state.preRegistrationDraft.notes || "",
        brokerName:
          record.broker?.name || state.preRegistrationDraft.brokerName || "",
        reservationEnterprise:
          matchingUnit?.enterpriseName ||
          state.preRegistrationDraft.reservationEnterprise,
        reservationBlock: matchingUnit
          ? reservationBlockLabel(matchingUnit)
          : state.preRegistrationDraft.reservationBlock,
        reservationUnitId: matchingUnit
          ? String(matchingUnit.id)
          : state.preRegistrationDraft.reservationUnitId,
      };
    };
    form?.elements.reservationEnterprise?.addEventListener(
      "change",
      (event) => {
        const next = reservationUnits.find(
          (unit) => unit.enterpriseName === event.currentTarget.value,
        );
        if (!next) return;
        state.selectedSimulationUnit = next;
        state.preRegistrationDraft = {
          ...state.preRegistrationDraft,
          reservationEnterprise: next.enterpriseName,
          reservationBlock: reservationBlockLabel(next),
          reservationUnitId: String(next.id),
        };
        rerenderPreRegistration();
      },
    );
    form?.elements.reservationBlock?.addEventListener("change", (event) => {
      const enterprise = form.elements.reservationEnterprise.value;
      const next = reservationUnits.find(
        (unit) =>
          unit.enterpriseName === enterprise &&
          reservationBlockLabel(unit) === event.currentTarget.value,
      );
      if (!next) return;
      state.selectedSimulationUnit = next;
      state.preRegistrationDraft = {
        ...state.preRegistrationDraft,
        reservationEnterprise: next.enterpriseName,
        reservationBlock: reservationBlockLabel(next),
        reservationUnitId: String(next.id),
      };
      rerenderPreRegistration();
    });
    form?.elements.reservationUnitId?.addEventListener("change", (event) => {
      const next = reservationUnits.find(
        (unit) => String(unit.id) === String(event.currentTarget.value),
      );
      if (!next) return;
      state.selectedSimulationUnit = next;
      state.preRegistrationDraft = {
        ...state.preRegistrationDraft,
        reservationEnterprise: next.enterpriseName,
        reservationBlock: reservationBlockLabel(next),
        reservationUnitId: String(next.id),
      };
      rerenderPreRegistration();
    });
    form?.querySelectorAll(".pre-reg-money").forEach(wireMoneyField);
    form
      ?.querySelector("#lookupClientBtn")
      ?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const id = String(form.elements.preRegistrationId?.value || "").replace(
          /\D/g,
          "",
        );
        if (!id)
          return toast("Informe o ID da consulta do pré-cadastro.", true);
        button.disabled = true;
        button.textContent = "Consultando…";
        try {
          const result = await api(
            `/api/pre-registration/${encodeURIComponent(id)}`,
          );
          if (!result.found || !result.record)
            return toast("Pré-cadastro não localizado no CVCRM.", true);
          state.eligiblePreRegistrations = [result.record];
          state.selectedEligiblePreRegistrationId = String(
            result.record.id || id,
          );
          applyEligiblePreRegistration(result.record);
          renderPaymentPlan();
          renderPreRegistrationLab();
          document
            .querySelector("#preRegistrationLab")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
          toast(
            `Pré-cadastro #${result.record.id || id} ${result.record.status} carregado do CVCRM.`,
          );
        } catch (error) {
          toast(error.message, true);
        } finally {
          button.disabled = false;
          button.textContent = "Buscar no CV";
        }
      });
    const reservationIssues = () => {
      const required = [...form.querySelectorAll("[required]")];
      const missing = required
        .filter((field) => {
          if (field.type === "checkbox") return !field.checked;
          if (!String(field.value || "").trim()) return true;
          return (
            ["mainIncome", "totalIncome", "installment"].includes(field.name) &&
            parseMoney(field.value) <= 0
          );
        })
        .map(
          (field) =>
            field
              .closest(".field")
              ?.querySelector("label")
              ?.textContent?.replace(" *", "") ||
            field.closest("label")?.textContent?.trim(),
        )
        .filter(Boolean);
      const documentValue = String(form.elements.document?.value || "").replace(
        /\D/g,
        "",
      );
      const importedId = String(state.eligiblePreRegistrations[0]?.id || "");
      const informedId = String(
        form.elements.preRegistrationId?.value || "",
      ).replace(/\D/g, "");
      if (
        !importedId ||
        importedId !== informedId ||
        !["Aprovado", "Condicionado"].includes(
          state.preRegistrationDraft.preRegistrationStatus,
        )
      )
        missing.unshift(
          "Pré-cadastro Aprovado ou Condicionado consultado no CVCRM",
        );
      if (documentValue && ![11, 14].includes(documentValue.length))
        missing.push("CPF ou CNPJ válido");
      if (
        state.preRegistrationDraft.preRegistrationStatus === "Condicionado" &&
        !String(form.elements.notes?.value || "").trim()
      )
        missing.push("Condição ou pendência do pré-cadastro");
      if (documentCheck.error) missing.push("Consulta dos documentos no CVCRM");
      else if (documentCheck.total === 0)
        missing.push("Documentos anexados ao pré-cadastro");
      else {
        if (documentCheck.rejected > 0)
          missing.push(`${documentCheck.rejected} documento(s) reprovado(s)`);
        if (documentCheck.pending > 0)
          missing.push(
            `${documentCheck.pending} documento(s) pendente(s) de aprovação`,
          );
      }
      const expiry = Date.parse(form.elements.approvalExpiry?.value || "");
      if (Number.isFinite(expiry) && expiry < Date.now() - 86400000)
        missing.push("Aprovação financeira dentro da validade");
      const currentEntry = Math.max(
        0,
        plan.sale -
          plan.financingEffective -
          plan.subsidy -
          parseMoney(form.elements.fgts?.value),
      );
      const currentSchedule = calculateEntrySchedule(
        {
          sale: plan.sale,
          entryRequired: currentEntry,
          commercialRemuneration: plan.commercialRemuneration,
          monthlyIncome: parseMoney(form.elements.totalIncome?.value),
        },
        {
          ...entryPolicy,
          installments: Number(form.elements.entryInstallments?.value) || 1,
        },
      );
      if (
        Number(form.elements.entryInstallments?.value) >
        Number(entryPolicy.maximumInstallments || 48)
      )
        missing.push(
          `Parcelamento dentro do limite de ${Number(entryPolicy.maximumInstallments || 48)} parcelas`,
        );
      if (currentSchedule.incomeStatus === "critical")
        missing.push(
          `Comprometimento de renda abaixo de ${currentSchedule.incomeAlertPercent}%`,
        );
      if (!currentSchedule.isBalanced)
        missing.push(
          "Conciliação integral do pagamento inicial e das parcelas",
        );
      return [...new Set(missing)];
    };
    const showReservationAudit = (issues, readyText) => {
      const result = form.querySelector("#preRegValidation");
      if (!result) return;
      result.hidden = false;
      result.className = `pre-reg-validation ${issues.length ? "error" : "ok"}`;
      result.innerHTML = issues.length
        ? `<b>${issues.length} pendência(s) antes do contrato.</b><p>${escapeHtml(issues.join(", "))}</p>`
        : `<b>Conferência concluída: proposta pronta.</b><p>${escapeHtml(readyText)}</p>`;
    };
    form?.addEventListener("input", () => {
      const data = Object.fromEntries(new FormData(form));
      data.linkUnit = form.elements.linkUnit?.checked ? "S" : "N";
      data.clientConfirmed = form.elements.clientConfirmed?.checked ? "S" : "N";
      state.preRegistrationDraft = { ...state.preRegistrationDraft, ...data };
      const fgts = Math.max(0, parseMoney(data.fgts));
      const entry = Math.max(
        0,
        plan.sale - plan.financingEffective - plan.subsidy - fgts,
      );
      const schedule = calculateEntrySchedule(
        {
          sale: plan.sale,
          entryRequired: entry,
          commercialRemuneration: plan.commercialRemuneration,
          monthlyIncome: parseMoney(data.totalIncome),
        },
        { ...entryPolicy, installments: Number(data.entryInstallments) || 1 },
      );
      const financingConsidered = Math.max(
        0,
        plan.financingEffective - schedule.financingAdjustment,
      );
      const total = financingConsidered + plan.subsidy + fgts;
      const totalField = form.querySelector("#preRegTotal");
      const balanceField = form.querySelector("#preRegBalance");
      if (totalField) totalField.value = fmtBRL(total);
      if (balanceField) balanceField.value = fmtBRL(schedule.totalEntry);
      const proposalFgts = form.querySelector("#proposalFgts");
      const proposalEntry = form.querySelector("#proposalEntry");
      const proposalFinancing = form.querySelector("#proposalFinancing");
      const proposalInitialPayment = form.querySelector(
        "#proposalInitialPayment",
      );
      const proposalEntryBalance = form.querySelector("#proposalEntryBalance");
      if (proposalFgts) proposalFgts.textContent = fmtBRL(fgts);
      if (proposalEntry)
        proposalEntry.textContent = fmtBRL(schedule.totalEntry);
      if (proposalFinancing)
        proposalFinancing.textContent = fmtBRL(financingConsidered);
      if (proposalInitialPayment)
        proposalInitialPayment.textContent = fmtBRL(schedule.signal);
      if (proposalEntryBalance)
        proposalEntryBalance.textContent = fmtBRL(schedule.balance);
    });
    form
      ?.querySelector("#validatePreRegistrationBtn")
      ?.addEventListener("click", (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.classList.remove("is-success", "is-error");
        button.classList.add("is-loading");
        button.textContent = "Validando proposta…";
        setTimeout(() => {
          const data = Object.fromEntries(new FormData(form));
          data.linkUnit = form.elements.linkUnit?.checked ? "S" : "N";
          data.clientConfirmed = form.elements.clientConfirmed?.checked
            ? "S"
            : "N";
          state.preRegistrationDraft = {
            ...state.preRegistrationDraft,
            ...data,
          };
          const issues = reservationIssues();
          showReservationAudit(
            issues,
            "Dados pessoais, crédito, unidade e condição de pagamento estão consistentes para a preparação do contrato.",
          );
          button.classList.remove("is-loading");
          if (issues.length) {
            button.classList.add("is-error");
            button.textContent = "Revisar pendências";
            toast("Revise as pendências indicadas antes de continuar.", true);
            setTimeout(() => {
              button.classList.remove("is-error");
              button.textContent = "Validar proposta";
              button.disabled = false;
            }, 1400);
            return;
          }
          button.classList.add("is-success");
          button.textContent = "Proposta validada";
          toast(
            "Proposta validada. Confira as condições de pagamento para criar a reserva.",
          );
          setTimeout(() => {
            showSimulatorTab("conditions");
            document
              .querySelector("#paymentConditionsTab")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 450);
        }, 700);
      });
    form
      ?.querySelector("#uploadProposalBtn")
      ?.addEventListener("click", (event) => {
        const button = event.currentTarget;
        const issues = reservationIssues();
        if (!form.elements.clientConfirmed?.checked)
          issues.push("Confirmação do cliente");
        if (issues.length) {
          showReservationAudit([...new Set(issues)], "");
          button.classList.remove("is-loading", "is-success");
          button.classList.add("is-error");
          button.textContent = "Revisar pendências";
          toast(
            "Corrija as pendências antes de simular a criação da reserva.",
            true,
          );
          setTimeout(() => {
            button.classList.remove("is-error");
            button.textContent = "Simular criação no CVCRM";
            button.disabled = false;
          }, 1400);
          return;
        }
        button.disabled = true;
        button.classList.remove("is-success", "is-error");
        button.classList.add("is-loading");
        button.textContent = "Simulando criação…";
        setTimeout(() => {
          showReservationAudit(
            [],
            "Simulação concluída com sucesso. A proposta está pronta para a futura integração, mas nenhum dado foi enviado ao CVCRM.",
          );
          button.classList.remove("is-loading");
          button.classList.add("is-success");
          button.textContent = "Simulação concluída";
          toast("Simulação concluída. Nenhum dado foi enviado ao CVCRM.");
          setTimeout(() => {
            button.classList.remove("is-success");
            button.textContent = "Simular criação no CVCRM";
            button.disabled = false;
          }, 1600);
        }, 900);
      });
  }
  return renderPreRegistrationLab;
}
