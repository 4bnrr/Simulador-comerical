// @ts-nocheck
export function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function activeOnDate(rule, now = new Date()) {
  if (rule?.enabled === false) return false;
  const today = now.toISOString().slice(0, 10);
  if (rule?.validFrom && today < String(rule.validFrom).slice(0, 10))
    return false;
  if (rule?.validUntil && today > String(rule.validUntil).slice(0, 10))
    return false;
  return true;
}

function matchesAny(text, patterns = []) {
  if (!Array.isArray(patterns) || patterns.length === 0) return true;
  const t = normalizeText(text);
  return patterns.some((p) => t.includes(normalizeText(p)));
}

export function selectPaymentRule(config, context, now = new Date()) {
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  for (const rule of rules) {
    if (!activeOnDate(rule, now)) continue;
    if (!matchesAny(context?.enterpriseName, rule.enterprisePatterns)) continue;
    const typologyMatch = matchesAny(context?.typology, rule.typologyPatterns);
    const developmentMatch = matchesAny(
      context?.developmentType,
      rule.developmentTypePatterns,
    );
    const needsTypology =
      Array.isArray(rule.typologyPatterns) && rule.typologyPatterns.length > 0;
    const needsDevelopment =
      Array.isArray(rule.developmentTypePatterns) &&
      rule.developmentTypePatterns.length > 0;
    // If both selectors exist, either one may qualify the unit. This allows horizontal/casas
    // to be recognized even when the commercial label is a QUADRA.
    if (needsTypology || needsDevelopment) {
      if (
        !(
          (needsTypology && typologyMatch) ||
          (needsDevelopment && developmentMatch)
        )
      )
        continue;
    }
    return rule;
  }
  return (
    config?.defaultRule || {
      id: "padrao",
      name: "Regra padrão",
      remunerationType: "percentual",
      realEstatePercent: 3.5,
      fixedCommission: 0,
      coordinationPercent: 0,
      totalRiskLimitPercent: 13.5,
      maxBuilderPercent: 10,
      enabled: true,
    }
  );
}

export function calculatePaymentPlan(input, rule) {
  const sale = Math.max(0, Number(input?.sale) || 0);
  const appraisal = Math.max(0, Number(input?.appraisal) || 0);
  const financingApproved = Math.max(0, Number(input?.financingApproved) || 0);
  const subsidy = Math.max(0, Number(input?.subsidy) || 0);
  const fgts = Math.max(0, Number(input?.fgts) || 0);
  const fgtsFuture = Math.max(0, Number(input?.fgtsFuture) || 0);
  const promotionalDiscount = Math.max(
    0,
    Number(input?.promotionalDiscount) || 0,
  );
  const maxFinancingPercent = Math.max(
    0,
    Number(input?.maxFinancingPercent) || 80,
  );

  const appraisalFinancingLimit =
    appraisal > 0 ? appraisal * (maxFinancingPercent / 100) : 0;
  const financingEffective =
    appraisal > 0 ? Math.min(financingApproved, appraisalFinancingLimit) : 0;

  const approvedSources =
    financingEffective + subsidy + fgts + fgtsFuture + promotionalDiscount;
  const entryRequired = Math.max(0, sale - approvedSources);
  const totalRiskPercent = Math.max(
    0,
    Number(rule?.totalRiskLimitPercent) || 13.5,
  );
  const maxPlanCapacity = Math.max(0, (sale * totalRiskPercent) / 100);

  const remunerationType =
    rule?.remunerationType === "fixed" ? "fixed" : "percentual";
  const realEstateCommission =
    remunerationType === "fixed"
      ? Math.max(0, Number(rule?.fixedCommission) || 0)
      : Math.max(0, (sale * (Number(rule?.realEstatePercent) || 0)) / 100);
  const coordination = Math.max(
    0,
    (sale * (Number(rule?.coordinationPercent) || 0)) / 100,
  );
  const commercialRemuneration = realEstateCommission + coordination;

  let builderRisk;
  if (remunerationType === "fixed") {
    builderRisk = maxPlanCapacity - realEstateCommission - coordination;
  } else {
    const configuredMax = Math.max(
      0,
      (sale * (Number(rule?.maxBuilderPercent) || 0)) / 100,
    );
    builderRisk = Math.min(
      configuredMax,
      maxPlanCapacity - realEstateCommission - coordination,
    );
  }

  const remunerationExceedsLimit = builderRisk < -0.005;
  builderRisk = Math.max(0, builderRisk);
  const ownResourcesMinimum = Math.max(0, entryRequired - maxPlanCapacity);
  const status =
    entryRequired <= maxPlanCapacity + 0.005
      ? "ENTRADA COMPATÍVEL COM O PLANO"
      : "RECURSOS PRÓPRIOS ADICIONAIS";

  return {
    sale,
    appraisal,
    financingApproved,
    financingEffective,
    subsidy,
    fgts,
    fgtsFuture,
    promotionalDiscount,
    approvedSources,
    maxFinancingPercent,
    appraisalFinancingLimit,
    entryRequired,
    totalRiskPercent,
    maxPlanCapacity,
    remunerationType,
    realEstateCommission,
    coordination,
    commercialRemuneration,
    recommendedInitialPayment: Math.min(entryRequired, commercialRemuneration),
    builderRisk,
    ownResourcesMinimum,
    status,
    remunerationExceedsLimit,
    ruleId: rule?.id || "padrao",
    ruleName: rule?.name || "Regra padrão",
  };
}

function money(value) {
  return (
    Math.round((Math.max(0, Number(value) || 0) + Number.EPSILON) * 100) / 100
  );
}

function splitEvenly(total, count) {
  const quantity = Math.max(1, Math.trunc(Number(count) || 1));
  const cents = Math.round(money(total) * 100);
  const base = Math.floor(cents / quantity);
  const remainder = cents - base * quantity;
  return Array.from(
    { length: quantity },
    (_, index) => (base + (index >= quantity - remainder ? 1 : 0)) / 100,
  );
}

export function calculateEntrySchedule(input, settings = {}) {
  const sale = money(input?.sale);
  const financialEntry = money(input?.entryRequired);
  const commercialRemuneration = money(input?.commercialRemuneration);
  const monthlyIncome = money(input?.monthlyIncome);
  const minimumPercent = Math.max(0, Number(settings.minimumPercent) || 0);
  const minimumFixed = money(settings.minimumFixed);
  const percentageMinimum = money((sale * minimumPercent) / 100);
  const minimumMode = ["percent", "fixed", "higher"].includes(
    settings.minimumMode,
  )
    ? settings.minimumMode
    : "higher";
  const rawPolicyMinimum =
    minimumMode === "percent"
      ? percentageMinimum
      : minimumMode === "fixed"
        ? minimumFixed
        : Math.max(percentageMinimum, minimumFixed);
  const policyMinimum = money(
    Math.min(sale || rawPolicyMinimum, rawPolicyMinimum),
  );
  const totalEntry = money(Math.max(financialEntry, policyMinimum));

  const signalMode = ["commercial", "percent", "fixed"].includes(
    settings.signalMode,
  )
    ? settings.signalMode
    : "commercial";
  const signalPercent = Math.max(0, Number(settings.signalPercent) || 0);
  const configuredSignal =
    signalMode === "commercial"
      ? commercialRemuneration
      : signalMode === "percent"
        ? (totalEntry * signalPercent) / 100
        : Number(settings.signalFixed) || 0;
  const signal = money(Math.min(totalEntry, Math.max(0, configuredSignal)));
  const balance = money(totalEntry - signal);

  const absoluteMaximumInstallments = 48;
  const configuredMaximumInstallments = Math.max(
    1,
    Math.trunc(Number(settings.maximumInstallments) || 1),
  );
  const maximumInstallments = Math.min(
    configuredMaximumInstallments,
    absoluteMaximumInstallments,
  );
  const requestedInstallments = Math.max(
    1,
    Math.trunc(Number(settings.installments) || 1),
  );
  const minimumInstallment = money(settings.minimumInstallment);
  let installments = Math.min(requestedInstallments, maximumInstallments);
  if (balance > 0 && minimumInstallment > 0) {
    installments = Math.min(
      installments,
      Math.max(1, Math.floor(balance / minimumInstallment)),
    );
  }

  const scheduleMode =
    settings.scheduleMode === "stepped" ? "stepped" : "fixed";
  const firstStageCount =
    scheduleMode === "stepped"
      ? Math.min(
          installments,
          Math.max(0, Math.trunc(Number(settings.firstStageCount) || 0)),
        )
      : 0;
  const firstStageAmount = money(settings.firstStageAmount);
  const firstStageTotal = money(firstStageCount * firstStageAmount);
  const warnings = [];
  let parcelValues = [];

  if (balance > 0) {
    if (
      scheduleMode === "stepped" &&
      firstStageCount > 0 &&
      firstStageCount < installments
    ) {
      if (firstStageTotal >= balance) {
        warnings.push(
          "As primeiras parcelas consomem todo o saldo. Revise o valor da primeira faixa.",
        );
        parcelValues = splitEvenly(balance, installments);
      } else {
        parcelValues = [
          ...Array(firstStageCount).fill(firstStageAmount),
          ...splitEvenly(
            balance - firstStageTotal,
            installments - firstStageCount,
          ),
        ];
      }
    } else {
      parcelValues = splitEvenly(balance, installments);
    }
  }

  if (requestedInstallments > maximumInstallments) {
    warnings.push(
      `Quantidade reduzida ao limite de ${maximumInstallments} parcelas.`,
    );
  }
  if (configuredMaximumInstallments > absoluteMaximumInstallments) {
    warnings.push(
      `O limite absoluto do simulador é de ${absoluteMaximumInstallments} parcelas.`,
    );
  }
  if (rawPolicyMinimum > sale && sale > 0) {
    warnings.push("O piso comercial foi limitado ao valor de venda do imóvel.");
  }
  if (installments < Math.min(requestedInstallments, maximumInstallments)) {
    warnings.push(
      `Quantidade reduzida para respeitar a parcela mínima de ${minimumInstallment.toFixed(2)}.`,
    );
  }
  if (
    minimumInstallment > 0 &&
    parcelValues.some((value) => value + 0.005 < minimumInstallment)
  ) {
    warnings.push("Existe parcela abaixo do valor mínimo configurado.");
  }

  const largestInstallment = money(
    parcelValues.length ? Math.max(...parcelValues) : 0,
  );
  const incomeLimitPercent = Math.max(
    0,
    Number(settings.incomeLimitPercent) || 30,
  );
  const incomeAlertPercent = Math.max(
    incomeLimitPercent,
    Number(settings.incomeAlertPercent) || 40,
  );
  const incomeCommitmentPercent =
    monthlyIncome > 0
      ? Math.round((largestInstallment / monthlyIncome) * 10000) / 100
      : 0;
  const incomeStatus =
    monthlyIncome <= 0
      ? "not_informed"
      : incomeCommitmentPercent > incomeAlertPercent
        ? "critical"
        : incomeCommitmentPercent > incomeLimitPercent
          ? "attention"
          : "ok";
  if (incomeStatus === "critical") {
    warnings.push(
      `A maior parcela compromete ${incomeCommitmentPercent.toFixed(2)}% da renda informada.`,
    );
  } else if (incomeStatus === "attention") {
    warnings.push(
      `O comprometimento de renda ultrapassa a referência de ${incomeLimitPercent}%.`,
    );
  }

  const scheduledTotal = money(
    signal + parcelValues.reduce((sum, value) => sum + value, 0),
  );
  const closingDifference = money(Math.abs(totalEntry - scheduledTotal));

  return {
    sale,
    financialEntry,
    percentageMinimum,
    policyMinimum,
    totalEntry,
    additionalEntry: money(Math.max(0, policyMinimum - financialEntry)),
    financingAdjustment: money(Math.max(0, policyMinimum - financialEntry)),
    commercialRemuneration,
    commercialCoverage: money(Math.min(totalEntry, commercialRemuneration)),
    builderShare: money(Math.max(0, totalEntry - commercialRemuneration)),
    signal,
    signalMode,
    signalPaymentMethod: String(settings.signalPaymentMethod || "pix"),
    balance,
    installments: parcelValues.length,
    parcelValues,
    scheduleMode,
    paymentMethod: String(settings.paymentMethod || "boleto"),
    firstDueDays: Math.max(0, Math.trunc(Number(settings.firstDueDays) || 0)),
    minimumInstallment,
    largestInstallment,
    monthlyIncome,
    incomeLimitPercent,
    incomeAlertPercent,
    incomeCommitmentPercent,
    incomeStatus,
    scheduledTotal,
    closingDifference,
    isBalanced: closingDifference < 0.01,
    warnings,
  };
}
