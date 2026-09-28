// @ts-nocheck
import {
  selectPaymentRule,
  calculatePaymentPlan,
  calculateEntrySchedule,
} from "./payment-plan-core";
import {
  escapeHtml,
  formatBRL,
  formatDate,
  toCssKey,
} from "./lib/formatters";
import {
  pctBR,
  preRegistrationDate,
  preRegistrationMaritalStatus,
  preRegistrationMoney,
} from "./lib/business-formatters";
import { createCatalogPages } from "./lib/catalog-pages";
import { createEventWiring } from "./lib/event-wiring";
import { apiRequest } from "./lib/http";
import { createAuditHistory } from "./lib/audit-history";
import { createManagementPages } from "./lib/management-pages";
import { parseMoney, wireMoneyField } from "./lib/money-input";
import { createPaymentConditions } from "./lib/payment-conditions";
import { createPaymentPlanView } from "./lib/payment-plan-view";
import { createPreRegistrationLab } from "./lib/pre-registration-lab";
import { createProposalPrinting } from "./lib/proposal-printing";
import { createSimulationFlow } from "./lib/simulation-flow";
import { createStaticPages } from "./lib/static-pages";

const fmtBRL = formatBRL;
const fmtDate = formatDate;
const cssKey = toCssKey;
const api = apiRequest;

const app = document.querySelector("#app");
const toastEl = document.querySelector("#toast");
let catalog = {
  enterprises: [],
  units: [],
  status: "not_configured",
  stats: {},
};
let materials = [];
let syncHistory = [];
let enterpriseLinks = {};
let paymentPlanRules = { version: 1, defaultRule: {}, rules: [] };
let lastSimulation = null;
let selectedSimulationUnit = null;
let lastSimulationResults = [];
let integrity = {};
let enterpriseMediaConfig = {};
let priceHistory = { rows: [], summary: [] };
let adminEnterpriseData = { entries: [], pending: [] };
let backups = [];
let preRegistrationDraft = {};
let managerAuth = { authenticated: false, user: null };
let eligiblePreRegistrations = [];
let selectedEligiblePreRegistrationId = "";

const toast = (msg, error = false) => {
  toastEl.textContent = msg;
  toastEl.className = "toast show" + (error ? " error" : "");
  setTimeout(() => (toastEl.className = "toast"), 3500);
};
async function loadAll() {
  try {
    managerAuth = await api("/api/access/auth");
  } catch {
    managerAuth = { authenticated: false, user: null };
  }
  if (!managerAuth.authenticated) {
    updateHeader();
    return;
  }
  [catalog, enterpriseLinks, paymentPlanRules, enterpriseMediaConfig] =
    await Promise.all([
      api("/api/catalog"),
      api("/api/enterprise-links"),
      api("/api/payment-plan-rules"),
      api("/api/enterprise-media"),
    ]);
  try {
    catalog = { ...catalog, ...(await api("/api/status")) };
  } catch {}
  updateHeader();
}
function updateHeader() {
  const el = document.querySelector("#headerStatus");
  if (!el) return;
  if (!managerAuth.authenticated) {
    el.className = "sync-pill";
    el.title = "Autenticação necessária";
    el.innerHTML = "<span></span>Acesso protegido";
    return;
  }
  const ok = catalog.status === "ok" || catalog.status === "warning";
  const sync = catalog.syncing;
  const age = catalog.lastSuccess
    ? timeAgo(catalog.lastSuccess)
    : "sem sincronização";
  el.className =
    "sync-pill " + (ok ? "ok" : catalog.status === "error" ? "error" : "");
  el.title = `Última atualização: ${fmtDate(catalog.lastSuccess)}`;
  el.innerHTML = `<span></span>${sync ? "Sincronizando" : ok ? `CVCRM • ${age}` : catalog.status === "error" ? "Falha CVCRM" : "CVCRM pendente"}`;
}
function timeAgo(value) {
  if (!value) return "—";
  const diff = Math.max(0, Date.now() - new Date(value).getTime()),
    m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}
function statusBadge(status) {
  return `<span class="badge ${escapeHtml(status)}">${escapeHtml(status || "indisponível")}</span>`;
}
function pageHead(eyebrow, title, description) {
  return `<section class="page-head"><div class="container"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div></section>`;
}
const catalogPageState = {
  get catalog() {
    return catalog;
  },
  get enterpriseMediaConfig() {
    return enterpriseMediaConfig;
  },
  get enterpriseLinks() {
    return enterpriseLinks;
  },
};

const {
  availableUnits,
  commercialRowLabel,
  enterpriseDisplayName,
  enterpriseOfficialUrl,
  enterpriseVarandaMinimumRows,
  enterprises,
  renderTable,
  reservationBlockLabel,
  reservationPropertyNumber,
  simulatorUnits,
  tables,
  varandaCategory,
  visibleEnterprises,
} = createCatalogPages({
  escapeHtml,
  fmtBRL,
  pageHead,
  state: catalogPageState,
});
function simulatorChoices() {
  const rows = enterpriseVarandaMinimumRows();
  const normalizedEnterprise = (row) =>
    String(row.enterpriseName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const choices = rows.filter(
    (row) => !normalizedEnterprise(row).includes("vertexgetulio"),
  );
  const vertexByType = new Map();
  for (const row of rows) {
    if (!normalizedEnterprise(row).includes("vertexgetulio")) continue;
    const type = String(row.commercialType || "Padrão").trim() || "Padrão";
    const current = vertexByType.get(type);
    if (!current || Number(row.price) < Number(current.price))
      vertexByType.set(type, row);
  }
  for (const [type, row] of vertexByType) {
    choices.push({
      ...row,
      _displayLabel: `Vertex Getulio • ${type}`,
      _kind: "vertex-commercial-type",
    });
  }
  return choices;
}
const { accessLogin, home, simulator } = createStaticPages({
  availableUnits,
  enterpriseDisplayName,
  escapeHtml,
  fmtBRL,
  getManagerAuth: () => managerAuth,
  pageHead,
  visibleEnterprises,
});
const applicationState = {
  get managerAuth() {
    return managerAuth;
  },
  set managerAuth(value) {
    managerAuth = value;
  },
  get paymentPlanRules() {
    return paymentPlanRules;
  },
  set paymentPlanRules(value) {
    paymentPlanRules = value;
  },
  get eligiblePreRegistrations() {
    return eligiblePreRegistrations;
  },
  set eligiblePreRegistrations(value) {
    eligiblePreRegistrations = value;
  },
  get selectedEligiblePreRegistrationId() {
    return selectedEligiblePreRegistrationId;
  },
  set selectedEligiblePreRegistrationId(value) {
    selectedEligiblePreRegistrationId = value;
  },
  get preRegistrationDraft() {
    return preRegistrationDraft;
  },
  set preRegistrationDraft(value) {
    preRegistrationDraft = value;
  },
  get lastSimulationResults() {
    return lastSimulationResults;
  },
  set lastSimulationResults(value) {
    lastSimulationResults = value;
  },
  get lastSimulation() {
    return lastSimulation;
  },
  set lastSimulation(value) {
    lastSimulation = value;
  },
  get selectedSimulationUnit() {
    return selectedSimulationUnit;
  },
  set selectedSimulationUnit(value) {
    selectedSimulationUnit = value;
  },
  get adminAuthenticated() {
    return adminAuthenticated;
  },
  set adminAuthenticated(value) {
    adminAuthenticated = value;
  },
  get adminEnterpriseData() {
    return adminEnterpriseData;
  },
  set adminEnterpriseData(value) {
    adminEnterpriseData = value;
  },
  get backups() {
    return backups;
  },
  set backups(value) {
    backups = value;
  },
  get enterpriseMediaConfig() {
    return enterpriseMediaConfig;
  },
  set enterpriseMediaConfig(value) {
    enterpriseMediaConfig = value;
  },
  get materials() {
    return materials;
  },
  set materials(value) {
    materials = value;
  },
};

const { buildSimulationResults, calcSimulation, renderSimulationResults } =
  createSimulationFlow({
    api,
    commercialRowLabel,
    escapeHtml,
    fmtBRL,
    preRegistrationDate,
    preRegistrationMaritalStatus,
    preRegistrationMoney,
    printSimulation: (...args) => printSimulation(...args),
    reservationBlockLabel,
    showSimulatorTab,
    simulatorChoices,
    state: applicationState,
    toast,
  });
const { paymentPlanContext, renderPaymentPlan } = createPaymentPlanView({
  calculatePaymentPlan,
  escapeHtml,
  fmtBRL,
  getEligiblePreRegistrations: () => eligiblePreRegistrations,
  getLastSimulation: () => lastSimulation,
  getPaymentPlanRules: () => paymentPlanRules,
  getPreRegistrationDraft: () => preRegistrationDraft,
  getSelectedSimulationUnit: () => selectedSimulationUnit,
  parseMoney,
  pctBR,
  preRegistrationDate,
  selectPaymentRule,
  varandaCategory,
});
const {
  compactConditionParcelRanges,
  entrySettingsForConditions,
  paymentMethodLabel,
  renderPaymentConditions,
} = createPaymentConditions({
  calculateEntrySchedule,
  calculatePaymentPlan,
  escapeHtml,
  fmtBRL,
  getEligiblePreRegistrations: () => eligiblePreRegistrations,
  getPaymentPlanRules: () => paymentPlanRules,
  paymentPlanContext,
  selectPaymentRule,
  toast,
  varandaCategory,
});
const renderAuditHistory = createAuditHistory({ api, escapeHtml, fmtDate });

const renderPreRegistrationLab = createPreRegistrationLab({
  api,
  calculateEntrySchedule,
  calculatePaymentPlan,
  cssKey,
  enterpriseDisplayName,
  entrySettingsForConditions,
  escapeHtml,
  fmtBRL,
  parseMoney,
  paymentPlanContext,
  preRegistrationDate,
  preRegistrationMaritalStatus,
  preRegistrationMoney,
  renderPaymentPlan,
  reservationBlockLabel,
  reservationPropertyNumber,
  selectPaymentRule,
  showSimulatorTab,
  simulatorUnits,
  state: applicationState,
  toast,
  varandaCategory,
  wireMoneyField,
});
const { printPaymentPlan, printReservationProposal, printSimulation } =
  createProposalPrinting({
    calculateEntrySchedule,
    calculatePaymentPlan,
    commercialRowLabel,
    compactConditionParcelRanges,
    enterpriseOfficialUrl,
    entrySettingsForConditions,
    escapeHtml,
    fmtBRL,
    getLastSimulationResults: () => lastSimulationResults,
    getPaymentPlanRules: () => paymentPlanRules,
    getPreRegistrationDraft: () => preRegistrationDraft,
    parseMoney,
    paymentMethodLabel,
    paymentPlanContext,
    pctBR,
    reservationBlockLabel,
    reservationPropertyNumber,
    selectPaymentRule,
    varandaCategory,
  });

window.printPaymentPlan = printPaymentPlan;
window.printReservationProposal = printReservationProposal;
window.printSimulation = printSimulation;

function showSimulatorTab(tab) {
  const panels = {
    sim: document.querySelector("#simulatorTab"),
    plan: document.querySelector("#paymentPlanTab"),
    conditions: document.querySelector("#paymentConditionsTab"),
    audit: document.querySelector("#auditHistoryTab"),
  };
  const buttons = {
    sim: document.querySelector("#tabSimulator"),
    plan: document.querySelector("#tabPaymentPlan"),
    conditions: document.querySelector("#tabPaymentConditions"),
    audit: document.querySelector("#tabAuditHistory"),
  };

  if (!panels.sim || !panels.plan || !panels.conditions || !panels.audit)
    return;

  if (tab === "plan") {
    renderPaymentPlan();
    renderPreRegistrationLab();
  }
  if (tab === "conditions") {
    renderPaymentPlan();
    renderPreRegistrationLab();
    renderPaymentConditions();
  }
  if (tab === "audit") renderAuditHistory();

  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== tab;
  });
  Object.entries(buttons).forEach(([key, button]) => {
    button?.classList.toggle("active", key === tab);
  });
}

let adminAuthenticated = false;

async function checkAdminAuth() {
  try {
    const r = await api("/api/admin/auth");
    adminAuthenticated = Boolean(r?.authenticated);
  } catch {
    adminAuthenticated = false;
  }
  return adminAuthenticated;
}

const { adminLogin, administration, materialsPage, updates } =
  createManagementPages({
    availableUnits,
    escapeHtml,
    fmtDate,
    getState: () => ({
      adminAuthenticated,
      adminEnterpriseData,
      backups,
      catalog,
      integrity,
      materials,
      priceHistory,
      syncHistory,
    }),
    pageHead,
    simulatorUnits,
  });
async function route() {
  if (location.hash !== "#simulador")
    window.history.replaceState(null, "", "#simulador");
  if (!managerAuth.authenticated) {
    app.innerHTML = accessLogin();
    wire("access");
  } else {
    app.innerHTML = simulator();
    wire("simulador");
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}
const wire = createEventWiring({
  api,
  calcSimulation,
  escapeHtml,
  loadAll,
  renderTable,
  route: (...args) => route(...args),
  showSimulatorTab,
  state: applicationState,
  toast,
  updateHeader,
});
setInterval(async () => {
  try {
    catalog = { ...catalog, ...(await api("/api/status")) };
    updateHeader();
  } catch {}
}, 30000);
loadAll()
  .then(route)
  .catch((err) => {
    app.innerHTML = `<div class="container section"><div class="empty"><h2>Não foi possível carregar o simulador.</h2><p>${escapeHtml(err.message)}</p></div></div>`;
  });
