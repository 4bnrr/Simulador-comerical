import type {
  EntrySchedule,
  EntrySettings,
  PaymentPlan,
  PaymentPlanInput,
  PaymentRule,
  PaymentRuleConfig,
  PaymentRuleContext,
} from "./types";

export function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function activeOnDate(rule: PaymentRule, now = new Date()) {
  if (rule.enabled === false) return false;

  const today = now.toISOString().slice(0, 10);
  if (rule.validFrom && today < rule.validFrom.slice(0, 10)) return false;
  if (rule.validUntil && today > rule.validUntil.slice(0, 10)) return false;

  return true;
}

function matchesAny(text = "", patterns: string[] = []) {
  if (patterns.length === 0) return true;
  const normalized = normalizeText(text);
  return patterns.some((pattern) =>
    normalized.includes(normalizeText(pattern)),
  );
}

export function selectPaymentRule(
  config: PaymentRuleConfig,
  context: PaymentRuleContext,
  now = new Date(),
) {
  for (const rule of config.rules) {
    if (!activeOnDate(rule, now)) continue;
    if (!matchesAny(context.enterpriseName, rule.enterprisePatterns)) continue;

    const typologyPatterns = rule.typologyPatterns ?? [];
    const developmentPatterns = rule.developmentTypePatterns ?? [];
    const hasSpecificSelector =
      typologyPatterns.length > 0 || developmentPatterns.length > 0;
    const matchesSpecificSelector =
      (typologyPatterns.length > 0 &&
        matchesAny(context.typology, typologyPatterns)) ||
      (developmentPatterns.length > 0 &&
        matchesAny(context.developmentType, developmentPatterns));

    if (hasSpecificSelector && !matchesSpecificSelector) continue;
    return rule;
  }

  return config.defaultRule;
}

function money(value: unknown) {
  return (
    Math.round((Math.max(0, Number(value) || 0) + Number.EPSILON) * 100) / 100
  );
}

function splitEvenly(total: number, count: number) {
  const quantity = Math.max(1, Math.trunc(Number(count) || 1));
  const cents = Math.round(money(total) * 100);
  const base = Math.floor(cents / quantity);
  const remainder = cents - base * quantity;

  return Array.from(
    { length: quantity },
    (_, index) => (base + (index >= quantity - remainder ? 1 : 0)) / 100,
  );
}

export function calculatePaymentPlan(
  input: PaymentPlanInput,
  rule: PaymentRule,
): PaymentPlan {
  const sale = money(input.sale);
  const appraisal = money(input.appraisal);
  const financingApproved = money(input.financingApproved);
  const subsidy = money(input.subsidy);
  const fgts = money(input.fgts);
  const fgtsFuture = money(input.fgtsFuture);
  const promotionalDiscount = money(input.promotionalDiscount);
  const maxFinancingPercent = Math.max(0, input.maxFinancingPercent || 80);
  const appraisalFinancingLimit =
    appraisal > 0 ? appraisal * (maxFinancingPercent / 100) : 0;
  const financingEffective =
    appraisal > 0 ? Math.min(financingApproved, appraisalFinancingLimit) : 0;
  const approvedSources =
    financingEffective + subsidy + fgts + fgtsFuture + promotionalDiscount;
  const entryRequired = money(Math.max(0, sale - approvedSources));
  const totalRiskPercent = Math.max(0, rule.totalRiskLimitPercent || 13.5);
  const maxPlanCapacity = money((sale * totalRiskPercent) / 100);
  const realEstateCommission =
    rule.remunerationType === "fixed"
      ? money(rule.fixedCommission)
      : money((sale * rule.realEstatePercent) / 100);
  const coordination = money((sale * rule.coordinationPercent) / 100);
  const commercialRemuneration = money(realEstateCommission + coordination);
  const configuredBuilderMaximum = money((sale * rule.maxBuilderPercent) / 100);
  const availableBuilderRisk =
    maxPlanCapacity - realEstateCommission - coordination;
  const remunerationExceedsLimit = availableBuilderRisk < -0.005;
  const builderRisk = money(
    Math.max(
      0,
      rule.remunerationType === "fixed"
        ? availableBuilderRisk
        : Math.min(configuredBuilderMaximum, availableBuilderRisk),
    ),
  );
  const ownResourcesMinimum = money(
    Math.max(0, entryRequired - maxPlanCapacity),
  );

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
    remunerationType: rule.remunerationType,
    realEstateCommission,
    coordination,
    commercialRemuneration,
    recommendedInitialPayment: Math.min(entryRequired, commercialRemuneration),
    builderRisk,
    ownResourcesMinimum,
    status:
      entryRequired <= maxPlanCapacity + 0.005
        ? "ENTRADA COMPATÍVEL COM O PLANO"
        : "RECURSOS PRÓPRIOS ADICIONAIS",
    remunerationExceedsLimit,
    ruleId: rule.id,
    ruleName: rule.name,
  };
}

export function calculateEntrySchedule(
  plan: PaymentPlan,
  monthlyIncome: number,
  settings: EntrySettings,
): EntrySchedule {
  const percentageMinimum = money(
    (plan.sale * Math.max(0, settings.minimumPercent)) / 100,
  );
  const rawPolicyMinimum =
    settings.minimumMode === "percent"
      ? percentageMinimum
      : settings.minimumMode === "fixed"
        ? settings.minimumFixed
        : Math.max(percentageMinimum, settings.minimumFixed);
  const policyMinimum = money(Math.min(plan.sale, rawPolicyMinimum));
  const totalEntry = money(Math.max(plan.entryRequired, policyMinimum));
  const configuredSignal =
    settings.signalMode === "commercial"
      ? plan.commercialRemuneration
      : settings.signalMode === "percent"
        ? (totalEntry * settings.signalPercent) / 100
        : settings.signalFixed;
  const signal = money(Math.min(totalEntry, Math.max(0, configuredSignal)));
  const balance = money(totalEntry - signal);
  const maximumInstallments = Math.min(
    Math.max(1, Math.trunc(settings.maximumInstallments)),
    48,
  );
  const requestedInstallments = Math.max(1, Math.trunc(settings.installments));
  let installments = Math.min(requestedInstallments, maximumInstallments);

  if (balance > 0 && settings.minimumInstallment > 0) {
    installments = Math.min(
      installments,
      Math.max(1, Math.floor(balance / settings.minimumInstallment)),
    );
  }

  const firstStageCount =
    settings.scheduleMode === "stepped"
      ? Math.min(installments, Math.max(0, settings.firstStageCount))
      : 0;
  const firstStageTotal = money(firstStageCount * settings.firstStageAmount);
  const warnings: string[] = [];
  let parcelValues: number[] = [];

  if (balance > 0) {
    const canUseStages =
      settings.scheduleMode === "stepped" &&
      firstStageCount > 0 &&
      firstStageCount < installments &&
      firstStageTotal < balance;

    parcelValues = canUseStages
      ? [
          ...Array(firstStageCount).fill(money(settings.firstStageAmount)),
          ...splitEvenly(
            balance - firstStageTotal,
            installments - firstStageCount,
          ),
        ]
      : splitEvenly(balance, installments);
  }

  if (requestedInstallments > maximumInstallments) {
    warnings.push(
      `Quantidade reduzida ao limite de ${maximumInstallments} parcelas.`,
    );
  }

  const largestInstallment = money(
    parcelValues.length ? Math.max(...parcelValues) : 0,
  );
  const incomeCommitmentPercent =
    monthlyIncome > 0
      ? Math.round((largestInstallment / monthlyIncome) * 10000) / 100
      : 0;
  const incomeStatus =
    monthlyIncome <= 0
      ? "not_informed"
      : incomeCommitmentPercent > settings.incomeAlertPercent
        ? "critical"
        : incomeCommitmentPercent > settings.incomeLimitPercent
          ? "attention"
          : "ok";
  const scheduledTotal = money(
    signal + parcelValues.reduce((sum, value) => sum + value, 0),
  );
  const closingDifference = money(Math.abs(totalEntry - scheduledTotal));

  return {
    totalEntry,
    signal,
    balance,
    installments: parcelValues.length,
    parcelValues,
    additionalEntry: money(Math.max(0, policyMinimum - plan.entryRequired)),
    financingAdjustment: money(Math.max(0, policyMinimum - plan.entryRequired)),
    largestInstallment,
    incomeCommitmentPercent,
    incomeStatus,
    scheduledTotal,
    closingDifference,
    isBalanced: closingDifference < 0.01,
    warnings,
  };
}
