import type { EntrySettings, PaymentRule } from "./types";

export const defaultPaymentRule: PaymentRule = {
  id: "padrao",
  name: "Regra padrão",
  remunerationType: "percentual",
  realEstatePercent: 3.5,
  fixedCommission: 0,
  coordinationPercent: 0.585,
  totalRiskLimitPercent: 13.5,
  maxBuilderPercent: 10,
  enterprisePatterns: [],
  typologyPatterns: [],
  developmentTypePatterns: [],
  enabled: true,
};

export const defaultEntrySettings: EntrySettings = {
  minimumMode: "higher",
  minimumPercent: 10,
  minimumFixed: 10_000,
  signalMode: "commercial",
  signalPercent: 0,
  signalFixed: 1_000,
  signalPaymentMethod: "pix",
  paymentMethod: "boleto",
  installments: 12,
  maximumInstallments: 18,
  minimumInstallment: 500,
  firstDueDays: 30,
  incomeLimitPercent: 30,
  incomeAlertPercent: 40,
  scheduleMode: "fixed",
  firstStageCount: 3,
  firstStageAmount: 500,
};
