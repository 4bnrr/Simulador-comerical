// @ts-nocheck
import { normalizeKey, pickValue, toNumber, toText } from "./values.js";

export function preRegistrationRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.dados)) return payload.dados;
  if (Array.isArray(payload.precadastros)) return payload.precadastros;
  if (payload.dados && typeof payload.dados === "object") {
    return [payload.dados];
  }
  if (pickValue(payload, ["idprecadastro", "id_pre_cadastro"])) {
    return [payload];
  }

  for (const value of Object.values(payload)) {
    if (
      Array.isArray(value) &&
      value.some(
        (row) =>
          row &&
          typeof row === "object" &&
          pickValue(row, ["idprecadastro", "id_pre_cadastro"]),
      )
    ) {
      return value;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      pickValue(value, ["idprecadastro", "id_pre_cadastro"])
    ) {
      return [value];
    }
  }

  return [];
}

function nestedValue(row, key) {
  const value = pickValue(row, [key]);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function compactPreRegistration(row) {
  const client = nestedValue(row, "cliente");
  const broker = nestedValue(row, "corretor");
  const enterprise = nestedValue(row, "empreendimento");
  const unit = nestedValue(row, "unidade");
  const status = nestedValue(row, "situacao");
  const messages = pickValue(row, [
    "mensagens",
    "mensagem",
    "observacoes",
    "observação",
  ]);

  return {
    id: String(
      pickValue(row, ["idprecadastro", "id_pre_cadastro", "id"]) || "",
    ),
    internalCode: toText(pickValue(row, ["codigointerno", "codigo_interno"])),
    status: toText(
      pickValue(status, ["nome", "descricao"]),
      pickValue(row, ["situacao", "status"]),
    ),
    client: {
      id: String(
        pickValue(
          client,
          ["id", "idcliente", "idpessoa"],
          pickValue(row, ["idpessoa", "idcliente"]),
        ) || "",
      ),
      name: toText(
        pickValue(client, ["nome"]),
        pickValue(row, ["cliente", "nomecliente"]),
      ),
      document: toText(
        pickValue(
          client,
          ["documento", "cpf", "cnpj"],
          pickValue(row, ["documento", "cpf", "cnpj"]),
        ),
      ),
      birthDate: toText(
        pickValue(client, ["data_nasc", "data_nascimento", "datanascimento"]),
      ),
      maritalStatus: toText(
        pickValue(client, ["idestadocivil", "estado_civil", "estadocivil"]),
      ),
      phone: toText(pickValue(client, ["telefone", "celular"])),
      email: toText(pickValue(client, ["email"])),
    },
    broker: {
      id: String(
        pickValue(
          broker,
          ["id", "idcorretor"],
          pickValue(row, ["idcorretor"]),
        ) || "",
      ),
      name: toText(pickValue(broker, ["nome"])),
    },
    enterprise: {
      id: String(
        pickValue(
          enterprise,
          ["id", "idempreendimento"],
          pickValue(row, ["idempreendimento"]),
        ) || "",
      ),
      name: toText(
        pickValue(enterprise, ["nome"]),
        pickValue(row, ["empreendimento"]),
      ),
    },
    unit: {
      id: String(
        pickValue(unit, ["id", "idunidade"], pickValue(row, ["idunidade"])) ||
          "",
      ),
      name: toText(
        pickValue(unit, ["nome", "codigo"]),
        pickValue(row, ["unidade"]),
      ),
    },
    appraisal:
      toNumber(pickValue(row, ["valor_avaliacao", "valoravaliacao"])) || 0,
    approvedCredit:
      toNumber(pickValue(row, ["valor_aprovado", "valoraprovado"])) || 0,
    subsidy: toNumber(pickValue(row, ["valor_subsidio", "valorsubsidio"])) || 0,
    fgts: toNumber(pickValue(row, ["valor_fgts", "valorfgts"])) || 0,
    approvedTotal: toNumber(pickValue(row, ["valor_total", "valortotal"])) || 0,
    installment:
      toNumber(pickValue(row, ["valor_prestacao", "valorprestacao"])) || 0,
    approvalExpiry: toText(
      pickValue(row, ["vencimento_aprovacao", "vencimentoaprovacao"]),
    ),
    priceTable: toText(
      pickValue(row, ["tabela", "tabela_preco", "tabelapreco"]),
    ),
    mainIncome:
      toNumber(
        pickValue(row, ["renda_cliente_principal", "rendaclienteprincipal"]),
      ) || 0,
    totalIncome: toNumber(pickValue(row, ["renda_total", "rendatotal"])) || 0,
    outstandingBalance:
      toNumber(pickValue(row, ["saldo_devedor", "saldodevedor"])) || 0,
    financingTerm: toText(
      pickValue(row, ["prazo_financiamento", "prazofinanciamento", "prazo"]),
    ),
    notes: typeof messages === "string" ? messages : "",
    associatesCount: Array.isArray(pickValue(row, ["associados"]))
      ? pickValue(row, ["associados"]).length
      : 0,
  };
}

export function compactPreRegistrationDocuments(payload) {
  const source =
    payload?.dados?.documentos ||
    payload?.data?.documentos ||
    payload?.documentos ||
    {};
  const documents = [];

  const visit = (value, group = "Titular") => {
    if (Array.isArray(value)) {
      for (const row of value) {
        if (!row || typeof row !== "object") continue;

        documents.push({
          id: String(
            pickValue(row, ["idprecadastrosdocumentos", "iddocumento", "id"]) ||
              "",
          ),
          name: toText(
            pickValue(row, ["nome", "arquivo", "descricao", "documento"]),
            "Documento",
          ),
          type: toText(
            pickValue(row, ["tipo", "tipoarquivo", "nome_tipo"]),
            "Não informado",
          ),
          status: toText(
            pickValue(row, ["situacao", "status"]),
            "Não informado",
          ),
          group,
          available: Boolean(toText(pickValue(row, ["link", "url"]))),
        });
      }
      return;
    }

    if (!value || typeof value !== "object") return;

    for (const [key, nested] of Object.entries(value)) {
      const label = String(key || "Titular")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
      visit(nested, label);
    }
  };

  visit(source);

  const approved = documents.filter((item) =>
    ["aprovado", "aprovada", "validado", "validada"].includes(
      normalizeKey(item.status),
    ),
  ).length;
  const rejected = documents.filter((item) =>
    normalizeKey(item.status).includes("reprov"),
  ).length;
  const pending = Math.max(0, documents.length - approved - rejected);

  return {
    total: documents.length,
    approved,
    pending,
    rejected,
    reviewRequired: documents.length === 0 || pending > 0 || rejected > 0,
    documents,
  };
}

export function findReservationId(payload) {
  if (!payload || typeof payload !== "object") return "";

  const direct = pickValue(payload, ["idreserva", "id_reserva", "reserva_id"]);
  if (direct !== null && direct !== undefined && String(direct).trim()) {
    return String(direct).replace(/\D/g, "");
  }

  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const nested = findReservationId(value);
      if (nested) return nested;
    }
  }

  return "";
}

export function compareReservationDocuments(
  preRegistrationCheck,
  reservationCheck,
) {
  const reservationDocuments = reservationCheck.documents || [];
  const missing = (preRegistrationCheck.documents || []).filter((item) => {
    const type = normalizeKey(item?.type);
    const name = normalizeKey(item?.name);

    return !reservationDocuments.some(
      (candidate) =>
        (type && normalizeKey(candidate?.type) === type) ||
        (name && normalizeKey(candidate?.name) === name),
    );
  });
  const reservationHasIssues =
    reservationCheck.total === 0 ||
    reservationCheck.reviewRequired ||
    reservationCheck.total < preRegistrationCheck.total;

  return {
    ready: missing.length === 0 && !reservationHasIssues,
    preRegistrationTotal: preRegistrationCheck.total,
    reservationTotal: reservationCheck.total,
    missingInReservation: missing.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      group: item.group,
      status: item.status,
    })),
    pendingInReservation: reservationCheck.pending,
    rejectedInReservation: reservationCheck.rejected,
  };
}
