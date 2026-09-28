// @ts-nocheck
export function createPaymentConditions(dependencies) {
  const {
    calculateEntrySchedule,
    calculatePaymentPlan,
    escapeHtml,
    fmtBRL,
    getEligiblePreRegistrations,
    getPaymentPlanRules,
    paymentPlanContext,
    selectPaymentRule,
    toast,
    varandaCategory,
  } = dependencies;
  function entrySettingsForConditions(rule) {
    return {
      ...(getPaymentPlanRules()?.defaultRule?.entrySettings || {}),
      ...(rule?.entrySettings || {}),
    };
  }
  function entryConditionsSettingsFromForm(fallback = {}) {
    const value = (id, key) =>
      document.querySelector(id)?.value ?? fallback[key];
    return {
      minimumMode: value("#conditionMinimumMode", "minimumMode"),
      minimumPercent:
        Number(value("#conditionMinimumPercent", "minimumPercent")) || 0,
      minimumFixed:
        Number(value("#conditionMinimumFixed", "minimumFixed")) || 0,
      signalMode: value("#conditionSignalMode", "signalMode"),
      signalPercent:
        Number(value("#conditionSignalPercent", "signalPercent")) || 0,
      signalFixed: Number(value("#conditionSignalFixed", "signalFixed")) || 0,
      signalPaymentMethod: value(
        "#conditionSignalPaymentMethod",
        "signalPaymentMethod",
      ),
      paymentMethod: value("#conditionPaymentMethod", "paymentMethod"),
      installments:
        Number(value("#conditionInstallments", "installments")) || 1,
      maximumInstallments:
        Number(value("#conditionMaximumInstallments", "maximumInstallments")) ||
        1,
      minimumInstallment:
        Number(value("#conditionMinimumInstallment", "minimumInstallment")) ||
        0,
      firstDueDays:
        Number(value("#conditionFirstDueDays", "firstDueDays")) || 0,
      incomeLimitPercent:
        Number(value("#conditionIncomeLimitPercent", "incomeLimitPercent")) ||
        30,
      incomeAlertPercent:
        Number(value("#conditionIncomeAlertPercent", "incomeAlertPercent")) ||
        40,
      scheduleMode: value("#conditionScheduleMode", "scheduleMode"),
      firstStageCount:
        Number(value("#conditionFirstStageCount", "firstStageCount")) || 0,
      firstStageAmount:
        Number(value("#conditionFirstStageAmount", "firstStageAmount")) || 0,
    };
  }
  function compactConditionParcelRanges(values = []) {
    const ranges = [];
    values.forEach((value, index) => {
      const cents = Math.round(Number(value || 0) * 100),
        last = ranges.at(-1);
      if (last && last.cents === cents) {
        last.end = index + 1;
        return;
      }
      ranges.push({
        start: index + 1,
        end: index + 1,
        cents,
        value: Number(value || 0),
      });
    });
    return ranges;
  }
  function paymentMethodLabel(value) {
    return (
      {
        boleto: "Boleto",
        pix: "Pix",
        transferencia: "Transferência",
        cartao: "Cartão de crédito",
      }[value] || value
    );
  }
  function renderEntryConditionsPreview(ctx, plan, rule, monthlyIncome) {
    const target = document.querySelector("#entryConditionsPreview");
    if (!target) return;
    const settings = entryConditionsSettingsFromForm(
      entrySettingsForConditions(rule),
    );
    const schedule = calculateEntrySchedule(
      {
        sale: ctx.sale,
        entryRequired: plan.entryRequired,
        commercialRemuneration: plan.commercialRemuneration,
        monthlyIncome,
      },
      settings,
    );
    const steppedFields = document.querySelector("#conditionSteppedFields");
    if (steppedFields)
      steppedFields.hidden = settings.scheduleMode !== "stepped";
    const methodLabel = paymentMethodLabel(schedule.paymentMethod);
    const signalMethodLabel = paymentMethodLabel(schedule.signalPaymentMethod);
    const ranges = compactConditionParcelRanges(schedule.parcelValues);
    target.innerHTML = `<div class="conditions-preview-summary">
    <div><small>Piso comercial</small><b>${fmtBRL(schedule.policyMinimum)}</b></div>
    <div class="conditions-preview-main"><small>Entrada considerada na proposta</small><b>${fmtBRL(schedule.totalEntry)}</b></div>
    <div><small>Pagamento inicial</small><b>${fmtBRL(schedule.signal)}</b></div>
    <div><small>Saldo da entrada</small><b>${fmtBRL(schedule.balance)}</b></div>
  </div>
  ${schedule.additionalEntry > 0 ? `<div class="conditions-rule-warning"><b>O piso comercial elevou a entrada em ${fmtBRL(schedule.additionalEntry)}.</b><span>Para manter o fechamento do valor de venda, o mesmo valor deverá deixar de ser utilizado do financiamento aprovado.</span></div>` : ""}
  <div class="conditions-crosswalk-grid">
    <div class="${schedule.incomeStatus}"><small>Comprometimento da renda</small><b>${schedule.monthlyIncome > 0 ? `${schedule.incomeCommitmentPercent.toLocaleString("pt-BR")}%` : "Não informado"}</b><span>Referência recomendada: até ${schedule.incomeLimitPercent}%</span></div>
    <div class="${schedule.isBalanced ? "ok" : "critical"}"><small>Conferência do plano</small><b>${schedule.isBalanced ? "Valores conciliados" : "Diferença de " + fmtBRL(schedule.closingDifference)}</b><span>Pagamento inicial + parcelas = entrada considerada</span></div>
  </div>
  <div class="conditions-installment-list">
    <div class="conditions-installment-row signal"><span>Pagamento inicial</span><b>${fmtBRL(schedule.signal)}</b><small>${escapeHtml(signalMethodLabel)} • no ato</small></div>
    ${ranges.map((range) => `<div class="conditions-installment-row"><span>${range.start === range.end ? `Parcela ${range.start}` : `Parcelas ${range.start} a ${range.end}`}</span><b>${fmtBRL(range.value)} cada</b><small>${escapeHtml(methodLabel)} • primeiro vencimento em ${schedule.firstDueDays} dias</small></div>`).join("") || '<div class="conditions-installment-row"><span>Sem saldo parcelado</span><b>—</b><small></small></div>'}
  </div>
  ${schedule.warnings.length ? `<div class="conditions-schedule-warnings">${schedule.warnings.map((w) => `<p>• ${escapeHtml(w)}</p>`).join("")}</div>` : ""}`;
  }
  function updateConditionalFields() {
    const minimumMode = document.querySelector("#conditionMinimumMode")?.value;
    const signalMode = document.querySelector("#conditionSignalMode")?.value;
    const minimumPercent = document.querySelector("#conditionMinimumPercentField");
    const minimumFixed = document.querySelector("#conditionMinimumFixedField");
    const signalFixed = document.querySelector("#conditionSignalFixedField");
    const signalPercent = document.querySelector("#conditionSignalPercentField");
    if (minimumPercent) minimumPercent.hidden = minimumMode === "fixed";
    if (minimumFixed) minimumFixed.hidden = minimumMode === "percent";
    if (signalFixed) signalFixed.hidden = signalMode !== "fixed";
    if (signalPercent) signalPercent.hidden = signalMode !== "percent";
  }
  function wireEntryConditions(ctx, plan, rule, monthlyIncome) {
    const form = document.querySelector("#entryConditionsForm");
    if (!form) return;
    form
      .querySelectorAll("input,select")
      .forEach((field) =>
        field.addEventListener("input", () => {
          updateConditionalFields();
          renderEntryConditionsPreview(ctx, plan, rule, monthlyIncome);
        }),
      );
    updateConditionalFields();
    renderEntryConditionsPreview(ctx, plan, rule, monthlyIncome);
  }
  function renderPaymentConditions() {
    const area = document.querySelector("#paymentConditionsTab");
    if (!area) return;
    const record = getEligiblePreRegistrations()[0] || null;
    const ctx = paymentPlanContext();
    const unit = ctx.unit;
    if (!record || !unit) {
      area.innerHTML =
        '<div class="empty"><b>Consulte um pré-cadastro e selecione uma opção.</b><p>Os valores conhecidos serão apresentados aqui, enquanto as regras comerciais permanecem em conferência.</p></div>';
      return;
    }
    const fgts = Math.max(0, Number(record.fgts || 0));
    const financing = Math.max(0, Number(record.approvedCredit || 0));
    const subsidy = Math.max(0, Number(record.subsidy || 0));
    const monthlyIncome = Math.max(
      0,
      Number(record.totalIncome || record.mainIncome || 0),
    );
    const documentCheck = record.documentCheck || {};
    const documentsReady =
      !documentCheck.error &&
      Number(documentCheck.total || 0) > 0 &&
      !documentCheck.reviewRequired;
    const category = varandaCategory(unit);
    const rule = selectPaymentRule(getPaymentPlanRules(), {
      enterpriseName: unit.enterpriseName,
      typology: `${category} ${unit.typology || ""}`,
      developmentType: unit.developmentType || "",
    });
    const plan = calculatePaymentPlan(
      { ...ctx, financingApproved: financing, subsidy, fgts },
      rule,
    );
    const es = entrySettingsForConditions(rule);
    area.innerHTML = `<section class="payment-conditions-shell">
    <div class="payment-conditions-head">
      <div><div class="eyebrow">configuração comercial</div><h2>Condições de Pagamento</h2><p>Validação do piso comercial, do pagamento inicial e do saldo da entrada antes de habilitar a reserva.</p></div>
      <span class="conditions-draft-badge">AMBIENTE DE TESTE</span>
    </div>
    <div class="conditions-alert"><b>Estes parâmetros não criam nem modificam reservas.</b><span>Os valores podem ser alterados livremente para validação. A configuração oficial continuará bloqueada até a aprovação comercial.</span></div>
    <div class="section-title conditions-section-title"><div><div class="eyebrow">dados disponíveis</div><h3>Base atual da operação</h3></div></div>
    <div class="plan-grid plan-grid-refined conditions-known-grid">
      <div><small>Pré-cadastro</small><b>#${escapeHtml(record.id || "—")} • ${escapeHtml(record.status || "—")}</b></div>
      <div><small>Empreendimento selecionado</small><b>${escapeHtml(unit.enterpriseName || "—")}</b></div>
      <div><small>Valor de venda</small><b>${fmtBRL(ctx.sale)}</b></div>
      <div><small>Financiamento considerado</small><b>${fmtBRL(plan.financingEffective)}</b></div>
      <div><small>Subsídio + FGTS</small><b>${fmtBRL(subsidy + fgts)}</b></div>
      <div class="plan-kpi plan-kpi-entry"><small>Entrada calculada antes da política</small><b>${fmtBRL(plan.entryRequired)}</b></div>
    </div>
    <div class="conditions-config-head"><div><div class="eyebrow">regras em validação</div><h3>Política de entrada e cobrança</h3><p>Defina o piso comercial, o pagamento inicial e a distribuição do saldo da entrada.</p></div><span>EM TESTE</span></div>
    <div id="entryConditionsForm" class="conditions-config-form">
      <div class="conditions-field"><label>Critério do piso de entrada</label><select id="conditionMinimumMode" class="select"><option value="higher" ${es.minimumMode === "higher" ? "selected" : ""}>Maior entre percentual e valor</option><option value="percent" ${es.minimumMode === "percent" ? "selected" : ""}>Somente percentual</option><option value="fixed" ${es.minimumMode === "fixed" ? "selected" : ""}>Somente valor</option></select></div>
      <div id="conditionMinimumPercentField" class="conditions-field"><label>Piso percentual</label><input id="conditionMinimumPercent" class="input" type="number" min="0" max="100" step="0.1" value="${Number(es.minimumPercent || 0)}"><small>% do valor de venda</small></div>
      <div id="conditionMinimumFixedField" class="conditions-field"><label>Piso em valor</label><input id="conditionMinimumFixed" class="input" type="number" min="0" step="100" value="${Number(es.minimumFixed || 0)}"><small>R$</small></div>
      <div class="conditions-field"><label>Regra do pagamento inicial</label><select id="conditionSignalMode" class="select"><option value="commercial" ${es.signalMode === "commercial" ? "selected" : ""}>Remuneração comercial</option><option value="fixed" ${es.signalMode === "fixed" ? "selected" : ""}>Valor definido</option><option value="percent" ${es.signalMode === "percent" ? "selected" : ""}>Percentual da entrada</option></select></div>
      <div id="conditionSignalFixedField" class="conditions-field"><label>Pagamento inicial definido</label><input id="conditionSignalFixed" class="input" type="number" min="0" step="100" value="${Number(es.signalFixed || 0)}"><small>R$</small></div>
      <div id="conditionSignalPercentField" class="conditions-field"><label>Percentual inicial</label><input id="conditionSignalPercent" class="input" type="number" min="0" max="100" step="0.1" value="${Number(es.signalPercent || 0)}"><small>% da entrada</small></div>
      <div class="conditions-field"><label>Forma do pagamento inicial</label><select id="conditionSignalPaymentMethod" class="select"><option value="pix" ${es.signalPaymentMethod === "pix" ? "selected" : ""}>Pix</option><option value="boleto" ${es.signalPaymentMethod === "boleto" ? "selected" : ""}>Boleto</option><option value="cartao" ${es.signalPaymentMethod === "cartao" ? "selected" : ""}>Cartão de crédito</option><option value="transferencia" ${es.signalPaymentMethod === "transferencia" ? "selected" : ""}>Transferência</option></select></div>
      <div class="conditions-field"><label>Forma de cobrança das parcelas</label><select id="conditionPaymentMethod" class="select"><option value="boleto" ${es.paymentMethod === "boleto" ? "selected" : ""}>Boleto</option><option value="pix" ${es.paymentMethod === "pix" ? "selected" : ""}>Pix</option><option value="transferencia" ${es.paymentMethod === "transferencia" ? "selected" : ""}>Transferência</option></select></div>
      <div class="conditions-field"><label>Número de parcelas</label><input id="conditionInstallments" class="input" type="number" min="1" value="${Number(es.installments || 1)}"><small>saldo após o pagamento inicial</small></div>
      <div class="conditions-field"><label>Limite de parcelas</label><input id="conditionMaximumInstallments" class="input" type="number" min="1" max="48" value="${Number(es.maximumInstallments || 1)}"><small>máximo permitido pela política</small></div>
      <div class="conditions-field"><label>Parcela mínima</label><input id="conditionMinimumInstallment" class="input" type="number" min="0" step="50" value="${Number(es.minimumInstallment || 0)}"><small>R$</small></div>
      <div class="conditions-field"><label>Primeiro vencimento</label><input id="conditionFirstDueDays" class="input" type="number" min="0" value="${Number(es.firstDueDays || 0)}"><small>dias após a reserva</small></div>
      <div class="conditions-field"><label>Referência de comprometimento</label><input id="conditionIncomeLimitPercent" class="input" type="number" min="0" max="100" step="1" value="${Number(es.incomeLimitPercent || 30)}"><small>% da renda familiar</small></div>
      <div class="conditions-field"><label>Alerta crítico de renda</label><input id="conditionIncomeAlertPercent" class="input" type="number" min="0" max="100" step="1" value="${Number(es.incomeAlertPercent || 40)}"><small>% da renda familiar</small></div>
      <div class="conditions-field"><label>Distribuição das parcelas</label><select id="conditionScheduleMode" class="select"><option value="fixed" ${es.scheduleMode !== "stepped" ? "selected" : ""}>Valores iguais</option><option value="stepped" ${es.scheduleMode === "stepped" ? "selected" : ""}>Faixas de valor</option></select></div>
      <div id="conditionSteppedFields" class="conditions-stepped-fields" ${es.scheduleMode === "stepped" ? "" : "hidden"}><div class="conditions-field"><label>Parcelas da primeira faixa</label><input id="conditionFirstStageCount" class="input" type="number" min="1" value="${Number(es.firstStageCount || 1)}"><small>quantidade</small></div><div class="conditions-field"><label>Valor da primeira faixa</label><input id="conditionFirstStageAmount" class="input" type="number" min="0" step="50" value="${Number(es.firstStageAmount || 0)}"><small>R$ por parcela</small></div></div>
    </div>
    <div id="entryConditionsPreview" class="conditions-preview"></div>
    <div class="conditions-reservation-action">
      <div><div class="eyebrow">próximo passo</div><h3>Criar reserva</h3><p>${documentsReady ? "As condições da entrada e os documentos estão disponíveis para a validação final da reserva." : "A criação permanecerá bloqueada até a aprovação integral dos documentos no CVCRM."}</p><div id="conditionsReservationStatus" class="conditions-reservation-status" hidden></div></div>
      <button id="createReservationFromConditionsBtn" class="btn upload-proposal action-animated" type="button" ${documentsReady ? "" : "disabled"} title="${documentsReady ? "Simular a criação sem enviar dados ao CVCRM" : "Aguardando aprovação integral dos documentos no CVCRM"}">Simular criação no CVCRM</button>
    </div>
  </section>`;
    wireEntryConditions(ctx, plan, rule, monthlyIncome);
    const conditionsButton = document.querySelector(
      "#createReservationFromConditionsBtn",
    );
    const sourceButton = document.querySelector("#uploadProposalBtn");
    const sourceStatus = document.querySelector("#preRegValidation");
    const conditionsStatus = document.querySelector(
      "#conditionsReservationStatus",
    );
    const syncReservationAction = () => {
      if (conditionsButton && sourceButton) {
        conditionsButton.disabled = sourceButton.disabled;
        conditionsButton.textContent = sourceButton.textContent;
        conditionsButton.classList.toggle(
          "is-loading",
          sourceButton.classList.contains("is-loading"),
        );
        conditionsButton.classList.toggle(
          "is-success",
          sourceButton.classList.contains("is-success"),
        );
        conditionsButton.classList.toggle(
          "is-error",
          sourceButton.classList.contains("is-error"),
        );
      }
      if (conditionsStatus && sourceStatus && !sourceStatus.hidden) {
        conditionsStatus.hidden = false;
        conditionsStatus.className = `conditions-reservation-status ${sourceStatus.classList.contains("error") ? "error" : "ok"}`;
        conditionsStatus.innerHTML = sourceStatus.innerHTML;
      }
    };
    if (sourceButton)
      new MutationObserver(syncReservationAction).observe(sourceButton, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    if (sourceStatus)
      new MutationObserver(syncReservationAction).observe(sourceStatus, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    conditionsButton?.addEventListener("click", () => {
      const reservationForm = document.querySelector("#preRegistrationForm");
      const configuredInstallments = document.querySelector(
        "#conditionInstallments",
      )?.value;
      if (reservationForm?.elements.entryInstallments && configuredInstallments)
        reservationForm.elements.entryInstallments.value =
          configuredInstallments;
      const trigger = document.querySelector("#uploadProposalBtn");
      if (!trigger)
        return toast(
          "Abra o Plano de Pagamento para concluir os dados da proposta.",
          true,
        );
      trigger.click();
      syncReservationAction();
    });
  }
  return {
    compactConditionParcelRanges,
    entrySettingsForConditions,
    paymentMethodLabel,
    renderPaymentConditions,
  };
}
