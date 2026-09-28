export type RemunerationType = "fixed" | "percentual";
export type MinimumMode = "percent" | "fixed" | "higher";
export type SignalMode = "commercial" | "percent" | "fixed";
export type ScheduleMode = "fixed" | "stepped";
export type IncomeStatus = "not_informed" | "ok" | "attention" | "critical";

export interface PaymentRule {
  id: string;
  name: string;
  remunerationType: RemunerationType;
  realEstatePercent: number;
  fixedCommission: number;
  coordinationPercent: number;
  totalRiskLimitPercent: number;
  maxBuilderPercent: number;
  enterprisePatterns?: string[];
  typologyPatterns?: string[];
  developmentTypePatterns?: string[];
  validFrom?: string | null;
  validUntil?: string | null;
  enabled?: boolean;
}

export interface PaymentRuleConfig {
  defaultRule: PaymentRule;
  rules: PaymentRule[];
}

export interface PaymentRuleContext {
  enterpriseName?: string;
  typology?: string;
  developmentType?: string;
}

export interface PaymentPlanInput {
  sale: number;
  appraisal: number;
  financingApproved: number;
  subsidy?: number;
  fgts?: number;
  fgtsFuture?: number;
  promotionalDiscount?: number;
  maxFinancingPercent?: number;
}

export interface PaymentPlan {
  sale: number;
  appraisal: number;
  financingApproved: number;
  financingEffective: number;
  subsidy: number;
  fgts: number;
  fgtsFuture: number;
  promotionalDiscount: number;
  approvedSources: number;
  maxFinancingPercent: number;
  appraisalFinancingLimit: number;
  entryRequired: number;
  totalRiskPercent: number;
  maxPlanCapacity: number;
  remunerationType: RemunerationType;
  realEstateCommission: number;
  coordination: number;
  commercialRemuneration: number;
  recommendedInitialPayment: number;
  builderRisk: number;
  ownResourcesMinimum: number;
  status: "ENTRADA COMPATÍVEL COM O PLANO" | "RECURSOS PRÓPRIOS ADICIONAIS";
  remunerationExceedsLimit: boolean;
  ruleId: string;
  ruleName: string;
}

export interface EntrySettings {
  minimumMode: MinimumMode;
  minimumPercent: number;
  minimumFixed: number;
  signalMode: SignalMode;
  signalPercent: number;
  signalFixed: number;
  signalPaymentMethod: string;
  paymentMethod: string;
  installments: number;
  maximumInstallments: number;
  minimumInstallment: number;
  firstDueDays: number;
  incomeLimitPercent: number;
  incomeAlertPercent: number;
  scheduleMode: ScheduleMode;
  firstStageCount: number;
  firstStageAmount: number;
}

export interface EntrySchedule {
  totalEntry: number;
  signal: number;
  balance: number;
  installments: number;
  parcelValues: number[];
  additionalEntry: number;
  financingAdjustment: number;
  largestInstallment: number;
  incomeCommitmentPercent: number;
  incomeStatus: IncomeStatus;
  scheduledTotal: number;
  closingDifference: number;
  isBalanced: boolean;
  warnings: string[];
}
