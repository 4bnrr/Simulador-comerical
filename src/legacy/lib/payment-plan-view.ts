// @ts-nocheck
export function createPaymentPlanView(dependencies) {
  const {
    calculatePaymentPlan,
    escapeHtml,
    fmtBRL,
    getEligiblePreRegistrations,
    getLastSimulation,
    getPaymentPlanRules,
    getPreRegistrationDraft,
    getSelectedSimulationUnit,
    parseMoney,
    pctBR,
    preRegistrationDate,
    selectPaymentRule,
    varandaCategory,
  } = dependencies;
  function paymentPlanContext() {
    const base = getLastSimulation() || {};
    const record = getEligiblePreRegistrations()[0] || {};
    const unit = getSelectedSimulationUnit() || base.unit || null;
    const financingApproved = Math.max(
      0,
      parseMoney(document.querySelector("#financing")?.value) ||
        Number(base.financingApproved || 0),
    );
    const subsidy = Math.max(
      0,
      parseMoney(document.querySelector("#subsidy")?.value) ||
        Number(base.subsidy || 0),
    );
    const sale = Math.max(0, Number(unit?.price ?? base.sale ?? 0));
    const appraisal = Math.max(
      0,
      Number(
        base.preRegistrationAppraisal ?? unit?.appraisal ?? base.appraisal ?? 0,
      ),
    );
    const fgts = Math.max(
      0,
      parseMoney(getPreRegistrationDraft()?.fgts) ||
        Number(record.fgts || base.fgts || 0),
    );
    const fgtsFuture = Math.max(
      0,
      Number(record.fgtsFuture || base.fgtsFuture || 0),
    );
    const promotionalDiscount = Math.max(
      0,
      Number(base.promotionalDiscount || 0),
    );
    return {
      unit,
      sale,
      appraisal,
      financingApproved,
      subsidy,
      fgts,
      fgtsFuture,
      promotionalDiscount,
      maxFinancingPercent: 80,
    };
  }
  function renderPaymentPlan() {
    const area = document.querySelector("#paymentPlanTab");
    if (!area) return;
    const ctx = paymentPlanContext();
    const u = ctx.unit;
    if (!u) {
      area.innerHTML =
        '<div class="empty"><b>Selecione um empreendimento no Simulador.</b><p>Os dados do Plano de Pagamento serão carregados automaticamente.</p></div>';
      return;
    }
    if (!ctx.sale) {
      area.innerHTML =
        '<div class="empty"><b>Valor do imóvel indisponível.</b><p>Não é possível montar o Plano de Pagamento sem o valor de venda da opção selecionada.</p></div>';
      return;
    }
    if (!ctx.appraisal) {
      area.innerHTML =
        '<div class="plan-alert error"><b>Valor de avaliação não identificado.</b><p>O Plano de Pagamento exige o VALOR DO IMÓVEL (1x) da tabela detalhada para validar o limite de financiamento de 80%.</p></div>';
      return;
    }
    const category = varandaCategory(u);
    const typology =
      category ||
      (u.developmentType?.toLowerCase().includes("casa")
        ? "Casa"
        : "Não especificada");
    const rule = selectPaymentRule(getPaymentPlanRules(), {
      enterpriseName: u.enterpriseName,
      typology: `${category} ${u.typology || ""}`,
      developmentType: u.developmentType || "",
    });
    const r = calculatePaymentPlan(ctx, rule);
    const blocked = r.remunerationExceedsLimit;
    const status = blocked ? "OPERAÇÃO BLOQUEADA" : r.status;
    const ownMsg =
      r.ownResourcesMinimum > 0
        ? `O cliente deverá aportar ${fmtBRL(r.ownResourcesMinimum)} além da capacidade comercial disponível no plano.`
        : "A entrada calculada pode ser estruturada integralmente dentro da capacidade comercial do plano.";
    const fixed = rule.remunerationType === "fixed";
    const imported = getEligiblePreRegistrations()[0] || null;
    const apiSummary = imported
      ? `<section class="api-import-summary">
    <div class="api-import-head">
      <div><div class="eyebrow">dados do pré-cadastro</div><h2>#${escapeHtml(imported.id || "—")} • ${escapeHtml(imported.client?.name || "Cliente não informado")}</h2></div>
      <span class="plan-status ok">${escapeHtml(imported.status || "Situação não informada")}</span>
    </div>
    <div class="plan-grid plan-grid-refined api-import-grid">
      <div><small>Validade da aprovação</small><b>${escapeHtml(preRegistrationDate(imported.approvalExpiry) || "Não informada")}</b></div>
      <div><small>Conferência documental</small><b>${imported.documentCheck?.error ? "Consulta indisponível" : imported.documentCheck?.reviewRequired ? "Requer conferência" : "Sem pendências encontradas"}</b></div>
    </div>
  </section>`
      : "";
    area.innerHTML = `${apiSummary}<div class="plan-shell plan-shell-refined"><div class="plan-head plan-head-refined"><div><div class="eyebrow">plano de pagamento</div><h2>${escapeHtml(u.enterpriseName)}</h2><p>${typology === "Não especificada" ? "" : escapeHtml(typology)}</p></div><span class="plan-status ${blocked ? "blocked" : r.ownResourcesMinimum > 0 ? "warning" : "ok"}">${escapeHtml(status)}</span></div>${blocked ? '<div class="plan-alert error"><b>A remuneração cadastrada ultrapassa a capacidade máxima do plano.</b><p>A conclusão do Plano de Pagamento foi bloqueada.</p></div>' : ""}<div class="plan-grid plan-grid-refined"><div><small>Valor do imóvel</small><b>${fmtBRL(r.sale)}</b></div><div><small>Valor da avaliação</small><b>${fmtBRL(r.appraisal)}</b></div><div><small>Financiamento considerado</small><b>${fmtBRL(r.financingEffective)}</b></div><div><small>Subsídio + FGTS</small><b>${fmtBRL(r.subsidy + r.fgts + r.fgtsFuture)}</b></div><div class="plan-kpi plan-kpi-entry"><small>Entrada calculada</small><b>${fmtBRL(r.entryRequired)}</b></div>${r.ownResourcesMinimum > 0 ? `<div class="plan-kpi plan-kpi-own"><small>Recursos próprios adicionais</small><b>${fmtBRL(r.ownResourcesMinimum)}</b></div>` : ""}<div><small>Regra aplicada</small><b>${escapeHtml(r.ruleName)}</b></div></div><div class="plan-summary ${blocked ? "blocked" : r.ownResourcesMinimum > 0 ? "warning" : "ok"}"><div><small>Status da operação</small><strong>${escapeHtml(status)}</strong></div><p>${blocked ? "A operação não pode ser concluída enquanto a remuneração ultrapassar o teto global de 13,5%." : escapeHtml(ownMsg)}</p></div><div class="buttons plan-print-actions"><button class="btn secondary" type="button" onclick="printPaymentPlan()">Imprimir / Salvar PDF</button></div></div>`;
  }
  return { paymentPlanContext, renderPaymentPlan };
}
