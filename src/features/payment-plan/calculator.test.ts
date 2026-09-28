import assert from "node:assert/strict";
import test from "node:test";
import { calculateEntrySchedule, calculatePaymentPlan } from "./calculator";
import { defaultEntrySettings, defaultPaymentRule } from "./defaults";

test("limita o financiamento a 80% da avaliação", () => {
  const plan = calculatePaymentPlan(
    {
      sale: 182_990,
      appraisal: 197_400,
      financingApproved: 204_000,
    },
    defaultPaymentRule,
  );

  assert.equal(plan.financingEffective, 157_920);
  assert.equal(plan.entryRequired, 25_070);
});

test("divide o saldo da entrada sem diferença de centavos", () => {
  const plan = calculatePaymentPlan(
    {
      sale: 179_990,
      appraisal: 206_000,
      financingApproved: 164_800,
    },
    defaultPaymentRule,
  );
  const schedule = calculateEntrySchedule(plan, 4_814.52, defaultEntrySettings);

  assert.equal(schedule.isBalanced, true);
  assert.equal(schedule.installments, 12);
  assert.equal(schedule.scheduledTotal, schedule.totalEntry);
});
