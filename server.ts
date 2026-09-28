// @ts-nocheck -- Tipagem dos adaptadores CVCRM será endurecida módulo a módulo.
import "dotenv/config";
import express from "express";
import multer from "multer";
import next from "next";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  normalizeKey as normKey,
  pickValue as pick,
  toNumber as numberValue,
  toInteger as intValue,
  toText as textValue,
  recordArray,
  paginationInfo,
} from "./server/lib/values.js";
import {
  reservationDate,
  reservationSeriesId,
} from "./server/lib/reservation.js";
import {
  compactPreRegistration,
  compactPreRegistrationDocuments,
  compareReservationDocuments,
  findReservationId,
  preRegistrationRows,
} from "./server/lib/pre-registration.js";
import { readJson, writeJson } from "./server/lib/json-store.js";
import { createSessionManager } from "./server/lib/sessions.js";
import { createAuditLog } from "./server/lib/audit-log.js";
import { createDataMaintenance } from "./server/lib/data-maintenance.js";
import { createCatalogNormalizer } from "./server/lib/catalog-normalizer.js";
import { createCvcrmClient } from "./server/lib/cvcrm-client.js";
import { createCvcrmSync } from "./server/lib/cvcrm-sync.js";
import { registerAccessRoutes } from "./server/routes/access.routes.js";
import { registerAdministrationRoutes } from "./server/routes/administration.routes.js";
import { registerCatalogRoutes } from "./server/routes/catalog.routes.js";
import { registerClientRoutes } from "./server/routes/client.routes.js";
import { registerMaterialsRoutes } from "./server/routes/materials.routes.js";
import { registerPreRegistrationRoutes } from "./server/routes/pre-registration.routes.js";
import { registerReservationRoutes } from "./server/routes/reservation.routes.js";
import {
  cvcrmBaseUrl as baseUrl,
  findToken,
  isCvcrmConfigured as configured,
  jwtSubject,
} from "./server/lib/cvcrm-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = process.cwd();
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev, dir: projectDir });
const handleNextRequest = nextApp.getRequestHandler();
await nextApp.prepare();
const app = express();

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const adminSessions = new Map();
const managerSessions = new Map();
const managerLoginAttempts = new Map();
const eligiblePreRegistrationCache = new Map();
const ELIGIBLE_PRE_REGISTRATION_CACHE_MS = 10 * 60 * 1000;

const {
  getAdminSession,
  getManagerSession,
  parseCookies,
  requireAdmin,
  requireManager,
} = createSessionManager({ adminSessions, managerSessions });

const PORT = Number(process.env.PORT || 3002);
const DATA_DIR = path.join(projectDir, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const CACHE_FILE = path.join(DATA_DIR, "cache.json");
const MATERIALS_FILE = path.join(DATA_DIR, "materials.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const RAW_FILE = path.join(DATA_DIR, "raw-cvcrm-last.json");
const INTEGRITY_FILE = path.join(DATA_DIR, "cvcrm-integrity.json");
const ENTERPRISE_LINKS_FILE = path.join(DATA_DIR, "enterprise-links.json");
const PAYMENT_PLAN_RULES_FILE = path.join(DATA_DIR, "payment-plan-rules.json");
const RATE_LIMIT_FILE = path.join(DATA_DIR, "cvcrm-rate-limit.json");
const DETAILED_TABLE_RAW_FILE = path.join(
  DATA_DIR,
  "raw-tabelas-detalhadas-last.json",
);
const ENTERPRISE_MEDIA_FILE = path.join(DATA_DIR, "enterprise-media.json");
const PRICE_HISTORY_FILE = path.join(DATA_DIR, "price-history.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const ENTERPRISE_IMAGE_DIR = path.join(
  projectDir,
  "public",
  "assets",
  "empreendimentos",
);
const MAX_HISTORY = 150;

const { addAudit, addHistory, auditActor } = createAuditLog({
  getAdminSession,
  getManagerSession,
  historyFile: HISTORY_FILE,
  maxHistory: MAX_HISTORY,
  readJson,
  textValue,
  writeJson,
});

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(ENTERPRISE_IMAGE_DIR, { recursive: true });

const emptyCache = {
  lastSync: null,
  lastSuccess: null,
  status: "not_configured",
  error: null,
  enterprises: [],
  units: [],
  stats: {},
};

const { backupFiles, enterpriseMediaSummary, recordPriceHistory, safeSlug } =
  createDataMaintenance({
    backupDir: BACKUP_DIR,
    cacheFile: CACHE_FILE,
    emptyCache,
    enterpriseLinksFile: ENTERPRISE_LINKS_FILE,
    enterpriseMediaFile: ENTERPRISE_MEDIA_FILE,
    normKey,
    paymentPlanRulesFile: PAYMENT_PLAN_RULES_FILE,
    priceHistoryFile: PRICE_HISTORY_FILE,
    readJson,
    textValue,
    writeJson,
  });
if (!fs.existsSync(CACHE_FILE)) writeJson(CACHE_FILE, emptyCache);
if (!fs.existsSync(MATERIALS_FILE)) writeJson(MATERIALS_FILE, []);
if (!fs.existsSync(HISTORY_FILE)) writeJson(HISTORY_FILE, []);
if (!fs.existsSync(ENTERPRISE_LINKS_FILE)) writeJson(ENTERPRISE_LINKS_FILE, {});
if (!fs.existsSync(PAYMENT_PLAN_RULES_FILE))
  writeJson(PAYMENT_PLAN_RULES_FILE, {
    version: 1,
    defaultRule: {},
    rules: [],
  });
if (!fs.existsSync(RATE_LIMIT_FILE))
  writeJson(RATE_LIMIT_FILE, {
    blockedUntil: null,
    last429At: null,
    count429: 0,
  });
if (!fs.existsSync(PRICE_HISTORY_FILE)) writeJson(PRICE_HISTORY_FILE, []);
if (!fs.existsSync(ENTERPRISE_MEDIA_FILE)) writeJson(ENTERPRISE_MEDIA_FILE, {});

const {
  cvGetConventional,
  fetchAll,
  findBrokerByEmail,
  getSyncProgress,
  readRateLimitState,
  respectPersistentCooldown,
  setProgress,
  waitBetweenPhases,
  waitCvcrmSlot,
} = createCvcrmClient({
  baseUrl,
  configured,
  paginationInfo,
  pick,
  rateLimitFile: RATE_LIMIT_FILE,
  readJson,
  recordArray,
  textValue,
  writeJson,
});
const {
  buildIntegrity,
  fetchDetailedAppraisals,
  fetchEnterpriseAvailability,
  mergeData,
} =
  createCatalogNormalizer({
    cvGetConventional,
    detailedTableRawFile: DETAILED_TABLE_RAW_FILE,
    intValue,
    normKey,
    numberValue,
    pick,
    recordArray,
    setProgress,
    textValue,
    writeJson,
  });
const { getSyncing, startSync, syncCvcrm } = createCvcrmSync({
  addHistory,
  backupFiles,
  buildIntegrity,
  cacheFile: CACHE_FILE,
  configured,
  emptyCache,
  fetchAll,
  fetchDetailedAppraisals,
  fetchEnterpriseAvailability,
  integrityFile: INTEGRITY_FILE,
  mergeData,
  rawFile: RAW_FILE,
  readJson,
  readRateLimitState,
  recordPriceHistory,
  respectPersistentCooldown,
  setProgress,
  waitBetweenPhases,
  writeJson,
});
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

const enterpriseImageStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, ENTERPRISE_IMAGE_DIR),
  filename: (req, file, cb) => {
    const sourceName = textValue(req.body?.sourceName, "empreendimento");
    const extRaw = path.extname(file.originalname || "").toLowerCase();
    const ext = [".jpg", ".jpeg", ".png", ".webp"].includes(extRaw)
      ? extRaw
      : ".jpg";
    cb(null, `${safeSlug(sourceName)}-${Date.now()}${ext}`);
  },
});
const uploadEnterpriseImage = multer({
  storage: enterpriseImageStorage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype || ""))
      return cb(new Error("Envie uma imagem JPG, PNG ou WEBP."));
    cb(null, true);
  },
});

app.use(express.json({ limit: "2mb" }));
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    etag: true,
    lastModified: true,
    maxAge: "1d",
  }),
);
app.use(
  express.static(path.join(projectDir, "public"), {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
    },
  }),
);

registerAccessRoutes(app, {
  addAudit,
  addHistory,
  baseUrl,
  findToken,
  getManagerSession,
  jwtSubject,
  managerLoginAttempts,
  managerSessions,
  parseCookies,
  textValue,
});
const { auditReservationDocuments } = registerPreRegistrationRoutes(app, {
  addAudit,
  baseUrl,
  compactPreRegistration,
  compactPreRegistrationDocuments,
  compareReservationDocuments,
  configured,
  cvGetConventional,
  eligiblePreRegistrationCache,
  eligiblePreRegistrationCacheMs: ELIGIBLE_PRE_REGISTRATION_CACHE_MS,
  normKey,
  pick,
  preRegistrationRows,
  requireManager,
  textValue,
});
registerReservationRoutes(app, {
  addAudit,
  auditReservationDocuments,
  baseUrl,
  cacheFile: CACHE_FILE,
  compactPreRegistration,
  compactPreRegistrationDocuments,
  configured,
  cvGetConventional,
  emptyCache,
  findReservationId,
  normKey,
  numberValue,
  preRegistrationRows,
  readJson,
  requireManager,
  reservationDate,
  reservationSeriesId,
  textValue,
  waitCvcrmSlot,
});
registerClientRoutes(app, {
  compactPreRegistration,
  configured,
  cvGetConventional,
  eligiblePreRegistrationCache,
  eligiblePreRegistrationCacheMs: ELIGIBLE_PRE_REGISTRATION_CACHE_MS,
  getManagerSession,
  historyFile: HISTORY_FILE,
  normKey,
  pick,
  preRegistrationRows,
  readJson,
  requireManager,
  textValue,
});
registerCatalogRoutes(app, {
  cacheFile: CACHE_FILE,
  configured,
  emptyCache,
  enterpriseLinksFile: ENTERPRISE_LINKS_FILE,
  enterpriseMediaFile: ENTERPRISE_MEDIA_FILE,
  getSyncProgress,
  getSyncing,
  integrityFile: INTEGRITY_FILE,
  paymentPlanRulesFile: PAYMENT_PLAN_RULES_FILE,
  readJson,
  readRateLimitState,
  requireManager,
});
registerAdministrationRoutes(app, {
  ADMIN_PASSWORD,
  ADMIN_USER,
  BACKUP_DIR,
  ENTERPRISE_MEDIA_FILE,
  HISTORY_FILE,
  PRICE_HISTORY_FILE,
  addHistory,
  adminSessions,
  backupFiles,
  enterpriseMediaSummary,
  getAdminSession,
  normKey,
  parseCookies,
  readJson,
  requireAdmin,
  requireManager,
  startSync,
  textValue,
  uploadEnterpriseImage,
  writeJson,
});
registerMaterialsRoutes(app, {
  addHistory,
  cacheFile: CACHE_FILE,
  materialsFile: MATERIALS_FILE,
  readJson,
  textValue,
  upload,
  uploadDir: UPLOAD_DIR,
  writeJson,
});
app.all("*", (request, response) =>
  handleNextRequest(request, response),
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[ESTACAO 1] Next.js iniciado em http://localhost:${PORT}`);
  console.log(
    "[ESTACAO 1] Acesso restrito a usuários do painel Gestor do CVCRM.",
  );
  console.log(
    `[CVCRM] ${configured() ? "Configurado" : "Pendente de configuração"}`,
  );
  if (configured())
    console.log("[CVCRM] Sincronizacao automatica configurada pelo servidor.");
});

const autoSyncEnabled =
  String(process.env.CVCRM_AUTO_SYNC || "true").toLowerCase() === "true";
const minutes = Math.max(30, Number(process.env.CVCRM_SYNC_MINUTES || 60));
const startupDelayMs = Math.max(
  15000,
  Number(process.env.CVCRM_STARTUP_SYNC_DELAY_MS || 30000),
);

if (autoSyncEnabled) {
  console.log(
    `[CVCRM] Sincronização automática habilitada a cada ${minutes} minutos.`,
  );
  console.log(
    `[CVCRM] Primeira sincronização automática em ${Math.round(startupDelayMs / 1000)} segundos.`,
  );
  setTimeout(() => {
    if (configured()) startSync("automatic-startup");
  }, startupDelayMs);
  setInterval(
    () => {
      if (configured()) startSync("automatic");
    },
    minutes * 60 * 1000,
  );
} else {
  console.log("[CVCRM] Sincronização automática desativada.");
}
