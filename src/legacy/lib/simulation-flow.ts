// @ts-nocheck
export function createSimulationFlow(dependencies) {
  const {
    api,
    commercialRowLabel,
    escapeHtml,
    fmtBRL,
    preRegistrationDate,
    preRegistrationMaritalStatus,
    preRegistrationMoney,
    printSimulation,
    reservationBlockLabel,
    showSimulatorTab,
    simulatorChoices,
    toast,
  } = dependencies;
  const { state } = dependencies;
  function buildSimulationResults() {
    const record = state.eligiblePreRegistrations[0] || null;
    const financing = Math.max(0, Number(record?.approvedCredit || 0));
    const subsidy = Math.max(0, Number(record?.subsidy || 0));
    const clientId = String(record?.client?.id || "").trim();
    const clientName = String(record?.client?.name || "").trim();
    const pct = 80;
    if (!record) {
      toast("Consulte primeiro o ID do pré-cadastro.", true);
      return [];
    }
    return simulatorChoices().map((u, index) => {
      const sale = Math.max(0, Number(u.price || 0));
      const appraisal = Math.max(0, Number(u.appraisal || 0));
      const appraisalLimit = appraisal > 0 ? appraisal * (pct / 100) : 0;
      const financingEffective =
        appraisal > 0 ? Math.min(financing, appraisalLimit) : financing;
      const entry = Math.max(0, sale - financingEffective - subsidy);
      const capped = appraisal > 0 && financing > appraisalLimit;
      return {
        index,
        unit: u,
        clientId,
        clientName,
        preRegistrationId: record.id,
        sale,
        appraisal,
        financingApproved: financing,
        financingEffective,
        subsidy,
        appraisalLimit,
        maxFinancingPercent: pct,
        entry,
        capped,
      };
    });
  }
  function renderSimulationResults(results) {
    const area = document.querySelector("#simResult");
    if (!area) return;
    if (!results.length) {
      area.innerHTML =
        '<div class="empty"><b>Nenhuma opção comercial disponível para simulação.</b><p>Verifique se o catálogo foi sincronizado e se existem unidades com status Disponível e preço válido.</p></div>';
      return;
    }
    area.innerHTML = `
    <div class="sim-results-head">
      <div>
        <div class="eyebrow">possibilidades encontradas</div>
        <h2>${results.length.toLocaleString("pt-BR")} opções comerciais</h2>
      </div>
      <div class="sim-results-actions">
        <p>Financiamento aprovado: <b>${fmtBRL(results[0].financingApproved)}</b> • Subsídio: <b>${fmtBRL(results[0].subsidy)}</b></p>
        <button id="printAllSimulation" class="btn primary btn-small sim-print-main-btn" type="button">Gerar PDF / Imprimir</button>
      </div>
    </div>
    <div class="sim-result-list">
      ${results
        .map(
          (r, i) => `<article class="sim-result-card">
        <div class="sim-result-top">
          <div><span class="sim-result-index">${String(i + 1).padStart(2, "0")}</span><h3>${escapeHtml(commercialRowLabel(r.unit))}</h3></div>
          <div class="sim-result-entry sim-result-entry-highlight"><small>Entrada</small><strong>${fmtBRL(r.entry)}</strong></div>
        </div>
        <div class="sim-result-grid">
          <div><small>Valor de venda</small><b>${fmtBRL(r.sale)}</b></div>
          <div><small>Valor da avaliação</small><b>${r.appraisal ? fmtBRL(r.appraisal) : "Não informado"}</b></div>
          <div><small>Financiamento efetivo</small><b>${fmtBRL(r.financingEffective)}</b></div>
          <div><small>Subsídio</small><b>${fmtBRL(r.subsidy)}</b></div>
        </div>
        ${
          r.capped
            ? `<div class="sim-warning">O financiamento efetivo foi limitado a 80% do valor de avaliação.</div>`
            : r.appraisal
              ? `<div class="sim-ok">Financiamento dentro do limite de 80% da avaliação.</div>`
              : `<div class="sim-warning">Valor de avaliação não identificado; não foi possível validar o limite de 80%.</div>`
        }
        <div class="sim-card-actions">
          <button class="btn primary btn-small" type="button" data-plan-sim="${i}">Plano de Pagamento</button>
        </div>
      </article>`,
        )
        .join("")}
    </div>`;
    area
      .querySelector("#printAllSimulation")
      ?.addEventListener("click", printSimulation);
    area.querySelectorAll("[data-plan-sim]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const r = state.lastSimulationResults[Number(btn.dataset.planSim)];
        if (r) {
          state.selectedSimulationUnit = r.unit;
          state.lastSimulation = r;
          state.preRegistrationDraft = {
            ...state.preRegistrationDraft,
            reservationEnterprise: r.unit.enterpriseName,
            reservationBlock: reservationBlockLabel(r.unit),
            reservationUnitId: String(r.unit.id),
          };
          showSimulatorTab("plan");
        }
      }),
    );
  }

  async function calcSimulation() {
    const button = document.querySelector("#calcBtn");
    try {
      const preRegistrationId = String(
        document.querySelector("#preRegistrationQueryId")?.value || "",
      ).replace(/\D/g, "");
      if (!preRegistrationId)
        return toast("Informe o ID da consulta do pré-cadastro.", true);
      if (button) {
        button.disabled = true;
        button.textContent = "Consultando o CVCRM…";
      }
      const result = await api(
        `/api/pre-registration/${encodeURIComponent(preRegistrationId)}`,
      );
      if (!result.found || !result.record)
        throw new Error("Pré-cadastro não localizado no CVCRM.");
      const record = result.record;
      state.eligiblePreRegistrations = [record];
      state.selectedEligiblePreRegistrationId = String(
        record.id || preRegistrationId,
      );
      const client = record.client || {};
      state.preRegistrationDraft = {
        ...state.preRegistrationDraft,
        preRegistrationId: String(record.id || preRegistrationId),
        preRegistrationStatus: record.status || "",
        clientName: client.name || "",
        document: client.document || "",
        birthDate: preRegistrationDate(client.birthDate),
        maritalStatus: preRegistrationMaritalStatus(client.maritalStatus),
        phone: client.phone || "",
        email: client.email || "",
        mainIncome: preRegistrationMoney(record.mainIncome),
        totalIncome: preRegistrationMoney(record.totalIncome),
        fgts: preRegistrationMoney(record.fgts),
        installment: preRegistrationMoney(record.installment),
        financingTerm: String(record.financingTerm || ""),
        approvalExpiry: preRegistrationDate(record.approvalExpiry),
        notes: record.notes || "",
        brokerName: record.broker?.name || "",
        reservationEnterprise:
          record.enterprise?.name ||
          state.preRegistrationDraft.reservationEnterprise ||
          "",
      };
      state.lastSimulationResults = buildSimulationResults().sort(
        (a, b) =>
          Number(b.unit?.enterpriseId || 0) -
            Number(a.unit?.enterpriseId || 0) ||
          commercialRowLabel(a.unit).localeCompare(
            commercialRowLabel(b.unit),
            "pt-BR",
          ) ||
          a.sale - b.sale ||
          a.entry - b.entry ||
          Number(a.unit?.id || 0) - Number(b.unit?.id || 0),
      );
      state.lastSimulation = state.lastSimulationResults[0] || null;
      state.selectedSimulationUnit = state.lastSimulation?.unit || null;
      renderSimulationResults(state.lastSimulationResults);
      if (state.lastSimulationResults.length) {
        toast(
          `Pré-cadastro #${record.id} ${record.status} carregado. Valores importados do CVCRM.`,
        );
        setTimeout(
          () =>
            document
              .querySelector("#simResult")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          50,
        );
      }
    } catch (err) {
      console.error("[SIMULADOR]", err);
      const area = document.querySelector("#simResult");
      if (area)
        area.innerHTML = `<div class="empty"><b>Não foi possível gerar as possibilidades.</b><p>${escapeHtml(err?.message || "Erro inesperado no simulador.")}</p></div>`;
      toast("Falha ao gerar as possibilidades.", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Consultar e continuar";
      }
    }
  }
  return { buildSimulationResults, calcSimulation, renderSimulationResults };
}
