// @ts-nocheck
export function createProposalPrinting(dependencies) {
  const {
    calculateEntrySchedule,
    calculatePaymentPlan,
    compactConditionParcelRanges,
    enterpriseOfficialUrl,
    entrySettingsForConditions,
    escapeHtml,
    fmtBRL,
    getLastSimulationResults,
    getPaymentPlanRules,
    getPreRegistrationDraft,
    paymentMethodLabel,
    paymentPlanContext,
    pctBR,
    reservationBlockLabel,
    reservationPropertyNumber,
    selectPaymentRule,
    varandaCategory,
  } = dependencies;

  function printWhenLogoIsReady(sheet) {
    const logo = sheet.querySelector(".print-logo");
    const doPrint = () => setTimeout(() => window.print(), 150);
    if (logo && !logo.complete) {
      logo.addEventListener("load", doPrint, { once: true });
      logo.addEventListener("error", doPrint, { once: true });
      return;
    }
    doPrint();
  }

  function getOrCreatePrintSheet(id) {
    let sheet = document.querySelector(`#${id}`);
    if (!sheet) {
      sheet = document.createElement("section");
      sheet.id = id;
      document.body.appendChild(sheet);
    }
    return sheet;
  }

  function printSimulation() {
    document.body.classList.remove("print-plan");
    const storedResults = getLastSimulationResults();
    const results = Array.isArray(storedResults) ? storedResults : [];
    if (!results.length) {
      alert("Gere as possibilidades antes de imprimir a simulação.");
      return;
    }

    const first = results[0] || {};
    const clientId = String(first.clientId || "").trim();
    const clientName = String(first.clientName || "").trim();
    const financingApproved = Math.max(0, Number(first.financingApproved || 0));
    const subsidy = Math.max(0, Number(first.subsidy || 0));
    const sheet = getOrCreatePrintSheet("simPrintSheet");

    const rows = results
      .map((result, index) => {
        const category = varandaCategory(result.unit);
        const typology = category
          ? category.charAt(0).toUpperCase() +
            category.slice(1).replace("-", " ")
          : result.unit?.developmentType?.toLowerCase().includes("casa")
            ? "Casa"
            : "—";
        return `<tr>
      <td>${String(index + 1).padStart(2, "0")}</td>
      <td><b>${escapeHtml(result.unit?.enterpriseName || "—")}</b></td>
      <td>${escapeHtml(typology)}</td>
      <td>${fmtBRL(result.sale)}</td>
      <td>${result.appraisal ? fmtBRL(result.appraisal) : "—"}</td>
      <td>${fmtBRL(result.financingEffective)}</td>
      <td>${fmtBRL(result.subsidy)}</td>
      <td><b>${fmtBRL(result.entry)}</b></td>
    </tr>`;
      })
      .join("");

    sheet.innerHTML = `
    <div class="sim-print-header">
      <div class="sim-print-brand">
        <img class="print-logo" src="/assets/logo-estacao1.png?v=7.0" alt="Estação 1">
        <div><strong>ESTAÇÃO 1 | SIMULAÇÃO COMERCIAL</strong><span>Opções comerciais em ordem de menor entrada</span></div>
      </div>
    </div>
    <div class="sim-print-client-grid">
      <div><span>Cliente</span><b>${escapeHtml(clientName || "Não informado")}</b></div>
      <div><span>ID</span><b>${escapeHtml(clientId || "Não informado")}</b></div>
      <div><span>Crédito aprovado</span><b>${fmtBRL(financingApproved)}</b></div>
      <div><span>Subsídio</span><b>${fmtBRL(subsidy)}</b></div>
    </div>
    ${enterpriseOfficialUrl(first.unit?.enterpriseName) ? `<div class="sim-print-best"><div><span>Melhor entrada encontrada</span><b>${escapeHtml(dependencies.commercialRowLabel(first.unit))} • ${fmtBRL(first.entry)}</b></div><div><img src="/api/qr?text=${encodeURIComponent(enterpriseOfficialUrl(first.unit.enterpriseName))}" alt="QR Code"><small>Detalhes do empreendimento</small></div></div>` : ""}
    <div class="sim-print-section-title"><span>Todas as opções calculadas</span><b>${results.length.toLocaleString("pt-BR")} possibilidades</b></div>
    <table class="sim-print-table">
      <thead><tr><th>#</th><th>Empreendimento</th><th>Tipologia</th><th>Valor</th><th>Avaliação</th><th>Financ. efetivo</th><th>Subsídio</th><th>Entrada</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sim-print-note">Simulação comercial informativa. Valores sujeitos à análise de crédito, avaliação do imóvel, regras do agente financeiro e condições vigentes.</div>`;

    printWhenLogoIsReady(sheet);
  }

  function printReservationProposal(form, plan, unit, typology, rule) {
    if (!form || !unit) return;
    const data = Object.fromEntries(new FormData(form));
    const fgts = Math.max(0, dependencies.parseMoney(data.fgts));
    const installments = Math.max(1, Number(data.entryInstallments) || 1);
    const entry = Math.max(
      0,
      plan.sale - plan.financingEffective - plan.subsidy - fgts,
    );
    const schedule = calculateEntrySchedule(
      {
        sale: plan.sale,
        entryRequired: entry,
        commercialRemuneration: plan.commercialRemuneration,
        monthlyIncome: dependencies.parseMoney(data.totalIncome),
      },
      { ...entrySettingsForConditions(rule), installments },
    );
    const financingConsidered = Math.max(
      0,
      plan.financingEffective - schedule.financingAdjustment,
    );
    const parcelSummary = compactConditionParcelRanges(schedule.parcelValues)
      .map(
        (range) =>
          `${range.start === range.end ? `Parcela ${range.start}` : `Parcelas ${range.start} a ${range.end}`}: ${fmtBRL(range.value)}`,
      )
      .join(" • ");
    const draft = getPreRegistrationDraft();
    const sheet = getOrCreatePrintSheet("reservationProposalPrintSheet");

    sheet.innerHTML = `
    <div class="print-head"><div class="print-brand"><img class="print-logo" src="/assets/logo-estacao1.png?v=7.0" alt="Estação 1"><div><strong>Estação 1</strong><span>Simulador Comercial</span></div></div><div class="print-doc"><b>PROPOSTA DE RESERVA</b></div></div>
    <div class="print-title"><span>Proposta para conferência do cliente</span><h1>${escapeHtml(unit.enterpriseName)}</h1><p>${escapeHtml(typology)}</p></div>
    <div class="proposal-print-status"><b>Pré-cadastro ${escapeHtml(draft.preRegistrationStatus || "—")}</b><span>ID ${escapeHtml(data.preRegistrationId || "—")} • validade da aprovação: ${escapeHtml(data.approvalExpiry || "não informada")}</span></div>
    <div class="print-grid plan-print-grid"><div><span>Cliente</span><b>${escapeHtml(data.clientName || "—")}</b></div><div><span>CPF/CNPJ</span><b>${escapeHtml(data.document || "—")}</b></div><div><span>Empreendimento</span><b>${escapeHtml(unit.enterpriseName)}</b></div><div><span>Bloco</span><b>${escapeHtml(reservationBlockLabel(unit))}</b></div><div><span>Número do imóvel</span><b>${escapeHtml(reservationPropertyNumber(unit))}</b></div><div><span>Valor de venda</span><b>${fmtBRL(plan.sale)}</b></div><div><span>Valor da avaliação</span><b>${fmtBRL(plan.appraisal)}</b></div></div>
    <div class="proposal-print-table"><div><b>Fonte de pagamento</b><b>Quantidade</b><b>Valor</b><b>Primeiro vencimento</b></div><div><span>Financiamento bancário considerado</span><span>1</span><span>${fmtBRL(financingConsidered)}</span><span>Conforme contrato bancário</span></div><div><span>Subsídio</span><span>1</span><span>${fmtBRL(plan.subsidy)}</span><span>Na contratação</span></div><div><span>FGTS</span><span>1</span><span>${fmtBRL(fgts)}</span><span>Na contratação</span></div><div><span>Pagamento inicial</span><span>1</span><span>${fmtBRL(schedule.signal)} • ${escapeHtml(paymentMethodLabel(schedule.signalPaymentMethod))}</span><span>No ato</span></div><div><span>Saldo da entrada</span><span>${schedule.installments}</span><span>${escapeHtml(parcelSummary || "Sem saldo parcelado")}</span><span>${escapeHtml(data.firstDueDate || `Em ${schedule.firstDueDays} dias`)}</span></div></div>
    <div class="print-formula"><span>Composição da proposta</span><b>${fmtBRL(financingConsidered)} + ${fmtBRL(plan.subsidy)} + ${fmtBRL(fgts)} + ${fmtBRL(schedule.totalEntry)} = ${fmtBRL(plan.sale)}</b></div>
    <div class="print-validation"><b>Conferência do cliente</b><p>Esta proposta resume as condições comerciais apresentadas e não substitui o contrato definitivo nem realiza o bloqueio da unidade.</p></div>
    <div class="proposal-signatures"><div>Cliente</div><div>Corretor responsável</div></div>`;

    document.body.classList.add("print-reservation-proposal");
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove("print-reservation-proposal"),
      { once: true },
    );
    printWhenLogoIsReady(sheet);
  }

  function printPaymentPlan() {
    const ctx = paymentPlanContext();
    const unit = ctx.unit;
    if (!unit || !ctx.sale || !ctx.appraisal) {
      alert(
        "Selecione um empreendimento e gere um Plano de Pagamento válido antes de imprimir.",
      );
      return;
    }

    const category = varandaCategory(unit);
    const typology =
      category ||
      (unit.developmentType?.toLowerCase().includes("casa")
        ? "Casa"
        : "Não especificada");
    const rule = selectPaymentRule(getPaymentPlanRules(), {
      enterpriseName: unit.enterpriseName,
      typology: `${category} ${unit.typology || ""}`,
      developmentType: unit.developmentType || "",
    });
    const result = calculatePaymentPlan(ctx, rule);
    const blocked = result.remunerationExceedsLimit;
    const status = blocked ? "OPERAÇÃO BLOQUEADA" : result.status;
    const ownMessage =
      result.ownResourcesMinimum > 0
        ? `O cliente deverá aportar ${fmtBRL(result.ownResourcesMinimum)} além da capacidade comercial disponível no plano.`
        : "A entrada calculada pode ser estruturada integralmente dentro da capacidade comercial do plano.";
    const fixed = rule.remunerationType === "fixed";
    const sheet = getOrCreatePrintSheet("planPrintSheet");

    sheet.innerHTML = `
    <div class="print-head"><div class="print-brand"><img class="print-logo" src="/assets/logo-estacao1.png?v=7.0" alt="Estação 1"><div><strong>Estação 1</strong><span>Simulador Comercial</span></div></div><div class="print-doc"><b>PLANO DE PAGAMENTO</b></div></div>
    <div class="print-title"><span>Plano de Pagamento</span><h1>${escapeHtml(unit.enterpriseName)}</h1>${typology === "Não especificada" ? "" : `<p>${escapeHtml(typology)}</p>`}</div>
    <div class="plan-print-status ${blocked ? "blocked" : result.ownResourcesMinimum > 0 ? "warning" : "ok"}"><span>STATUS FINAL DA OPERAÇÃO</span><strong>${escapeHtml(status)}</strong><p>${escapeHtml(blocked ? "A remuneração cadastrada ultrapassa o limite máximo de risco da operação." : ownMessage)}</p></div>
    <div class="print-grid plan-print-grid"><div><span>Valor do imóvel</span><b>${fmtBRL(result.sale)}</b></div><div><span>Valor da avaliação</span><b>${fmtBRL(result.appraisal)}</b></div><div><span>Fontes aprovadas</span><b>${fmtBRL(result.approvedSources)}</b></div><div><span>Financiamento considerado</span><b>${fmtBRL(result.financingEffective)}</b></div><div><span>Subsídio + FGTS</span><b>${fmtBRL(result.subsidy + result.fgts + result.fgtsFuture)}</b></div><div><span>Entrada calculada</span><b>${fmtBRL(result.entryRequired)}</b></div><div><span>Capacidade máxima do plano</span><b>${fmtBRL(result.maxPlanCapacity)}</b></div><div><span>Recursos próprios adicionais</span><b>${fmtBRL(result.ownResourcesMinimum)}</b></div></div>
    <div class="plan-print-breakdown"><div><span>Remuneração da imobiliária</span><b>${fixed ? "Fixa • " : ""}${fmtBRL(result.realEstateCommission)}</b></div><div><span>Coordenação comercial</span><b>${pctBR(rule.coordinationPercent || 0)} • ${fmtBRL(result.coordination)}</b></div><div><span>Capacidade comercial da construtora</span><b>${fmtBRL(result.builderRisk)}</b></div><div><span>Regra aplicada</span><b>${escapeHtml(result.ruleName)}</b></div></div>
    <div class="print-validation"><b>Validação do financiamento</b><p>Limite de 80% da avaliação: ${fmtBRL(result.appraisalFinancingLimit)}. Financiamento efetivo utilizado: ${fmtBRL(result.financingEffective)}.</p></div>
    <div class="print-formula"><span>Cálculo da entrada</span><b>${fmtBRL(result.sale)} − ${fmtBRL(result.financingEffective)} − ${fmtBRL(result.subsidy)} − ${fmtBRL(result.fgts + result.fgtsFuture)} = ${fmtBRL(result.entryRequired)}</b></div>`;

    document.body.classList.add("print-plan");
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove("print-plan"),
      { once: true },
    );
    printWhenLogoIsReady(sheet);
  }

  return { printPaymentPlan, printReservationProposal, printSimulation };
}
