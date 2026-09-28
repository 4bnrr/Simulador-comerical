"use client";

import { useMemo, useState } from "react";
import {
  calculateEntrySchedule,
  calculatePaymentPlan,
} from "@/features/payment-plan/calculator";
import {
  defaultEntrySettings,
  defaultPaymentRule,
} from "@/features/payment-plan/defaults";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface SimulatorValues {
  sale: number;
  appraisal: number;
  financingApproved: number;
  subsidy: number;
  fgts: number;
  monthlyIncome: number;
  installments: number;
}

const initialValues: SimulatorValues = {
  sale: 179_990,
  appraisal: 206_000,
  financingApproved: 164_800,
  subsidy: 0,
  fgts: 0,
  monthlyIncome: 4_814.52,
  installments: 12,
};

export function PaymentSimulator() {
  const [values, setValues] = useState(initialValues);
  const [simulating, setSimulating] = useState(false);
  const [simulationMessage, setSimulationMessage] = useState("");

  const result = useMemo(() => {
    const plan = calculatePaymentPlan(values, defaultPaymentRule);
    const schedule = calculateEntrySchedule(plan, values.monthlyIncome, {
      ...defaultEntrySettings,
      installments: values.installments,
    });
    return { plan, schedule };
  }, [values]);

  function updateValue(field: keyof SimulatorValues, value: string) {
    setValues((current) => ({
      ...current,
      [field]: Number(value) || 0,
    }));
  }

  async function simulateReservation() {
    setSimulating(true);
    setSimulationMessage("");

    try {
      const response = await fetch("/api/reservas/simular", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preRegistrationId: "24053",
          unitId: "SIMULACAO",
          entryInstallments: result.schedule.installments,
          firstDueDate: "2026-10-24",
        }),
      });
      const payload = (await response.json()) as { message?: string };
      setSimulationMessage(payload.message ?? "Não foi possível simular.");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <section className="workspace shell">
      <div className="panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">dados da operação</span>
            <h2>Crédito e imóvel</h2>
          </div>
          <span className="safe-badge">SEM ENVIO AO CVCRM</span>
        </div>

        <div className="form-grid">
          <MoneyField
            label="Valor de venda"
            value={values.sale}
            onChange={(value) => updateValue("sale", value)}
          />
          <MoneyField
            label="Valor da avaliação"
            value={values.appraisal}
            onChange={(value) => updateValue("appraisal", value)}
          />
          <MoneyField
            label="Financiamento aprovado"
            value={values.financingApproved}
            onChange={(value) => updateValue("financingApproved", value)}
          />
          <MoneyField
            label="Subsídio"
            value={values.subsidy}
            onChange={(value) => updateValue("subsidy", value)}
          />
          <MoneyField
            label="FGTS"
            value={values.fgts}
            onChange={(value) => updateValue("fgts", value)}
          />
          <MoneyField
            label="Renda familiar"
            value={values.monthlyIncome}
            onChange={(value) => updateValue("monthlyIncome", value)}
          />
          <label className="field">
            <span>Parcelas da entrada</span>
            <input
              type="number"
              min="1"
              max="48"
              value={values.installments}
              onChange={(event) =>
                updateValue("installments", event.target.value)
              }
            />
          </label>
        </div>
      </div>

      <div className="panel result-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">resultado tipado</span>
            <h2>Condição de pagamento</h2>
          </div>
          <span
            className={
              result.schedule.isBalanced ? "status-ok" : "status-error"
            }
          >
            {result.schedule.isBalanced ? "CONCILIADO" : "REVISAR"}
          </span>
        </div>

        <div className="metrics">
          <Metric
            label="Financiamento considerado"
            value={result.plan.financingEffective}
          />
          <Metric label="Entrada calculada" value={result.plan.entryRequired} />
          <Metric
            label="Entrada após política"
            value={result.schedule.totalEntry}
            highlight
          />
          <Metric label="Pagamento inicial" value={result.schedule.signal} />
          <Metric label="Saldo parcelado" value={result.schedule.balance} />
          <Metric
            label="Maior parcela"
            value={result.schedule.largestInstallment}
          />
        </div>

        <div className="schedule-summary">
          <strong>{result.schedule.installments} parcelas por boleto</strong>
          <span>
            Comprometimento estimado:{" "}
            {result.schedule.incomeCommitmentPercent.toLocaleString("pt-BR")}%
            da renda
          </span>
        </div>

        <button
          className={`action-button ${simulating ? "loading" : ""}`}
          type="button"
          disabled={simulating}
          onClick={simulateReservation}
        >
          {simulating ? "Simulando…" : "Simular criação da reserva"}
        </button>

        {simulationMessage ? (
          <p className="simulation-message">{simulationMessage}</p>
        ) : null}
      </div>
    </section>
  );
}

interface MoneyFieldProps {
  label: string;
  value: number;
  onChange: (value: string) => void;
}

function MoneyField({ label, value, onChange }: MoneyFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

interface MetricProps {
  label: string;
  value: number;
  highlight?: boolean;
}

function Metric({ label, value, highlight = false }: MetricProps) {
  return (
    <div className={highlight ? "metric highlight" : "metric"}>
      <span>{label}</span>
      <strong>{currency.format(value)}</strong>
    </div>
  );
}
