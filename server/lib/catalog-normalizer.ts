// @ts-nocheck
import crypto from "node:crypto";

export function createCatalogNormalizer(dependencies) {
  const {
    cvGetConventional,
    detailedTableRawFile,
    intValue,
    normKey,
    numberValue,
    pick,
    recordArray,
    setProgress,
    textValue,
    writeJson,
  } = dependencies;
  function directAppraisalValue(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    // A coluna usada no CVCRM da Estação 1 é "VALOR DO IMÓVEL (1x)".
    for (const [key, value] of Object.entries(obj)) {
      const nk = normKey(key);
      if (
        nk === "valordoimovel1x" ||
        nk === "valordoimovel" ||
        (nk.startsWith("valordoimovel") && nk.includes("1x"))
      ) {
        const n = numberValue(value);
        if (n !== null && n > 0) return n;
      }
    }
    return null;
  }

  function appraisalFromConditionObject(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const label = textValue(
      pick(obj, [
        "descricao",
        "descrição",
        "nome",
        "titulo",
        "título",
        "rotulo",
        "rótulo",
        "coluna",
        "campo",
        "parcela",
        "condicao",
        "condição",
      ]),
    );
    const nl = normKey(label);
    if (!nl.includes("valordoimovel")) return null;
    const value = numberValue(
      pick(obj, [
        "valor",
        "value",
        "valor_parcela",
        "valorparcela",
        "montante",
        "total",
      ]),
    );
    return value !== null && value > 0 ? value : null;
  }

  function findAppraisalDeep(node, depth = 0) {
    if (node === null || node === undefined || depth > 6) return null;
    if (typeof node !== "object") return null;
    if (!Array.isArray(node)) {
      const direct = directAppraisalValue(node);
      if (direct !== null) return direct;
      const condition = appraisalFromConditionObject(node);
      if (condition !== null) return condition;
    }
    const values = Array.isArray(node) ? node : Object.values(node);
    for (const child of values) {
      if (child && typeof child === "object") {
        const found = findAppraisalDeep(child, depth + 1);
        if (found !== null) return found;
      }
    }
    return null;
  }

  function detailedUnitKeys(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const out = [];
    const add = (prefix, value) => {
      const t = textValue(value);
      if (t) out.push(`${prefix}:${normKey(t)}`);
    };
    add("id", pick(row, ["idunidade", "id_unidade", "unidade_id"]));
    add("int", pick(row, ["idunidade_int", "id_unidade_int"]));
    add(
      "ref",
      pick(row, ["referencia", "codigo", "codigo_unidade", "codigounidade"]),
    );
    const unit = pick(row, [
      "unidade",
      "nome_unidade",
      "nomeunidade",
      "nome",
      "numero_unidade",
      "numerounidade",
    ]);
    add("unit", unit);
    const block = pick(row, [
      "bloco",
      "nome_bloco",
      "nomebloco",
      "bloco_nome",
      "torre",
    ]);
    if (unit && block) add("blockunit", `${block}|${unit}`);
    return [...new Set(out)];
  }

  function collectDetailedUnitAppraisals(payload) {
    const index = new Map();
    let objectsVisited = 0;
    let matchedObjects = 0;

    const walk = (node, depth = 0) => {
      if (node === null || node === undefined || depth > 12) return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child, depth + 1);
        return;
      }
      if (typeof node !== "object") return;
      objectsVisited++;

      const keys = detailedUnitKeys(node);
      if (keys.length) {
        const appraisal = findAppraisalDeep(node);
        if (appraisal !== null && appraisal > 0) {
          matchedObjects++;
          for (const key of keys)
            if (!index.has(key)) index.set(key, appraisal);
        }
      }
      for (const child of Object.values(node))
        if (child && typeof child === "object") walk(child, depth + 1);
    };
    walk(payload);
    return { index, objectsVisited, matchedObjects };
  }

  function lookupDetailedAppraisal(index, row) {
    if (!index) return null;
    for (const key of detailedUnitKeys(row)) {
      if (index.has(key)) return index.get(key);
    }
    return null;
  }

  function collectDashboardRows(payload) {
    const index = new Map();
    const walk = (node, depth = 0) => {
      if (!node || typeof node !== "object" || depth > 12) return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child, depth + 1);
        return;
      }

      const tableName = textValue(
        pick(node, ["tabela", "nome_tabela", "nometabela"]),
      );
      const rows = Array.isArray(node.dados) ? node.dados : null;
      if (
        rows &&
        normKey(tableName).includes("dashboard")
      ) {
        for (const row of rows) {
          const detail = {
            price: extractPrice(row),
            status: deriveStatus(row),
            tableName,
          };
          for (const key of detailedUnitKeys(row)) index.set(key, detail);
        }
      }

      for (const child of Object.values(node))
        if (child && typeof child === "object") walk(child, depth + 1);
    };
    walk(payload);
    return index;
  }

  function lookupDashboard(index, row) {
    if (!index) return null;
    for (const key of detailedUnitKeys(row)) {
      if (index.has(key)) return index.get(key);
    }
    return null;
  }

  async function fetchEnterpriseAvailability() {
    const endpoint = "/api/v1/cadastros/empreendimentos";
    setProgress({
      phase: "fetching-enterprises",
      endpoint,
      label: "Validando disponibilidade dos empreendimentos",
    });
    const payload = await cvGetConventional(endpoint);
    const rules = new Map();
    const rows = Array.isArray(payload) ? payload : recordArray(payload);
    for (const row of rows) {
      const id = textValue(pick(row, ["idempreendimento", "id"]));
      if (!id) continue;
      const availableUnits = intValue(
        pick(row, ["unidades_disponiveis", "unidadesDisponiveis"]),
        0,
      );
      const commercialSituations = Array.isArray(row.situacao_comercial)
        ? row.situacao_comercial
        : [];
      const situationNames = commercialSituations
        .map((item) => textValue(pick(item, ["nome", "descricao"])))
        .filter(Boolean);
      rules.set(String(id), {
        availableUnits,
        // A quantidade é a fonte decisiva. Há empreendimentos, como o Allegro,
        // com unidades disponíveis apesar do rótulo comercial ainda indicar venda encerrada.
        eligible: availableUnits > 0,
        situationNames,
      });
    }
    if (!rules.size)
      throw new Error(
        "A API de empreendimentos respondeu sem registros. O catálogo anterior foi preservado.",
      );
    return rules;
  }

  async function fetchDetailedAppraisals(unitsRows) {
    const excluded = new Set(["araca", "lantai", "testepagadoria"]);
    const enterprises = new Map();
    for (const row of unitsRows) {
      const id = enterpriseKey(row);
      const name = enterpriseName(row);
      if (!id || excluded.has(normKey(name))) continue;
      if (!enterprises.has(String(id)))
        enterprises.set(String(id), { id: String(id), name });
    }

    const perEnterprise = new Map();
    const dashboard = new Map();
    const diagnostics = [];
    let position = 0;
    for (const enterprise of [...enterprises.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    )) {
      position++;
      const endpoint = `/api/v1/cadastros/empreendimentos/${encodeURIComponent(enterprise.id)}/tabelasdepreco/detalhada`;
      setProgress({
        phase: "fetching-appraisals",
        endpoint,
        label: `4/4 • Valor do imóvel • ${enterprise.name}`,
        currentPage: position,
        totalPages: enterprises.size,
        loaded: position - 1,
        totalRecords: enterprises.size,
      });
      try {
        const payload = await cvGetConventional(endpoint, {
          tabelasemjson: "true",
        });
        const parsed = collectDetailedUnitAppraisals(payload);
        perEnterprise.set(String(enterprise.id), parsed.index);
        for (const [key, value] of collectDashboardRows(payload))
          dashboard.set(key, value);
        diagnostics.push({
          enterpriseId: enterprise.id,
          enterpriseName: enterprise.name,
          ok: true,
          appraisalMatches: parsed.index.size,
          matchedObjects: parsed.matchedObjects,
          objectsVisited: parsed.objectsVisited,
          sample: payload,
        });
      } catch (error) {
        diagnostics.push({
          enterpriseId: enterprise.id,
          enterpriseName: enterprise.name,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        console.warn(
          `[CVCRM] Não foi possível obter VALOR DO IMÓVEL de ${enterprise.name}: ${error.message}`,
        );
      }
    }

    // Guardamos a resposta detalhada para diagnóstico, mas limitamos cada payload a
    // uma serialização completa apenas nesta fonte auxiliar; o arquivo não é servido publicamente.
    try {
      writeJson(detailedTableRawFile, {
        at: new Date().toISOString(),
        enterprises: diagnostics,
      });
    } catch {}
    return { perEnterprise, dashboard, diagnostics };
  }

  function unitKey(row) {
    return textValue(
      pick(row, [
        "idunidade",
        "id_unidade",
        "idunidade_int",
        "referencia",
        "id",
        "codigo",
        "codigo_unidade",
        "unidade",
      ]),
    );
  }
  function unitKeys(row) {
    const keys = [
      pick(row, ["idunidade"]),
      pick(row, ["idunidade_int"]),
      pick(row, ["referencia"]),
      pick(row, ["codigo", "codigo_unidade"]),
    ]
      .map(textValue)
      .filter(Boolean);
    return [...new Set(keys)];
  }
  function enterpriseKey(row) {
    return textValue(
      pick(row, [
        "idempreendimento",
        "id_empreendimento",
        "idempreendimento_int",
        "empreendimento_id",
        "codigoempreendimento",
        "idempreendimento_cv",
      ]),
    );
  }
  function enterpriseName(row) {
    return textValue(
      pick(row, [
        "nome_empreendimento",
        "empreendimento",
        "nomeempreendimento",
        "empreendimento_nome",
        "nomeempreendimento_cv",
        "nome_projeto",
      ]),
      "Empreendimento não informado",
    );
  }
  function yesValue(v) {
    const x = normKey(v);
    return ["s", "sim", "1", "true", "yes", "ativo", "aprovado"].includes(x);
  }
  function rowTimestamp(row) {
    const raw = pick(row, [
      "referencia_data",
      "data_referencia",
      "datareferencia",
      "updated_at",
      "atualizado_em",
      "data_atualizacao",
    ]);
    if (!raw) return 0;
    const t = Date.parse(String(raw).replace(" ", "T"));
    return Number.isFinite(t) ? t : 0;
  }
  function rowReference(row) {
    return (
      intValue(pick(row, ["referencia", "idreferencia", "id_referencia"])) || 0
    );
  }
  function latestByUnit(rows) {
    const canonical = new Map();
    for (const row of rows) {
      const keys = unitKeys(row);
      if (!keys.length) continue;
      const canonicalKey = keys[0];
      const prev = canonical.get(canonicalKey);
      if (
        !prev ||
        rowTimestamp(row) > rowTimestamp(prev) ||
        (rowTimestamp(row) === rowTimestamp(prev) &&
          rowReference(row) >= rowReference(prev))
      ) {
        canonical.set(canonicalKey, row);
      }
    }
    const alias = new Map();
    for (const row of canonical.values())
      for (const key of unitKeys(row)) alias.set(key, row);
    return alias;
  }
  function lookupUnit(index, row) {
    for (const key of unitKeys(row)) if (index.has(key)) return index.get(key);
    return {};
  }
  function normalizeStatus(v) {
    const x = normKey(v);
    if (!x) return null;
    if (x.includes("dispon")) return "disponivel";
    if (x.includes("reserv")) return "reservada";
    if (x.includes("vend")) return "vendida";
    if (x.includes("permuta")) return "permuta";
    if (x.includes("bloq")) return "bloqueada";
    if (x.includes("distrat")) return "disponivel";
    // Valores desconhecidos (inclusive nomes de clientes que algumas respostas
    // trazem em situacao_nome) não podem ser usados como situação comercial.
    return null;
  }
  function deriveStatus(source) {
    // /unidades/situacao é um histórico de mudanças. O estado NOVO está em
    // para_situacao; de_situacao é o estado anterior e não deve ser exibido.
    const explicit = normalizeStatus(
      pick(source, [
        "para_situacao",
        "situacao_nome",
        "nome_situacao",
        "situacao",
        "status",
        "situacao_unidade",
        "situacao_reservada_nomesituacao",
        "descricao_situacao",
      ]),
    );
    if (explicit) return explicit;

    const reason = normalizeStatus(
      pick(source, ["situacao_bloqueada_motivo", "situacao_motivo", "motivo"]),
    );
    if (reason) return reason;

    if (yesValue(pick(source, ["situacao_vendida"]))) return "vendida";
    if (yesValue(pick(source, ["situacao_reservada"]))) return "reservada";
    if (yesValue(pick(source, ["situacao_bloqueada"]))) return "bloqueada";
    if (
      intValue(pick(source, ["situacao_para_venda"])) === 1 ||
      intValue(pick(source, ["situacao_mapa_disponibilidade"])) === 1
    )
      return "disponivel";
    return "indisponivel";
  }
  function extractPrice(row) {
    return numberValue(
      pick(row, [
        "valor",
        "valor_unidade",
        "valorunidade",
        "preco",
        "preco_unidade",
        "valor_tabela",
        "valortabela",
        "valor_venda",
        "valorvenda",
        "valor_total",
        "valortotal",
        "valor_total_unidade",
        "valorfinal",
      ]),
    );
  }
  function priceScore(row) {
    let score = 0;
    if (yesValue(pick(row, ["aprovado", "tabela_aprovada", "aprovada"])))
      score += 1000;
    if (yesValue(pick(row, ["ativo", "ativa", "tabela_ativa", "vigente"])))
      score += 500;
    score += Math.min(100, Math.floor(rowTimestamp(row) / 86400000) / 100000);
    return score;
  }
  function bestPriceByUnit(rows) {
    const groups = new Map();
    for (const row of rows) {
      const keys = unitKeys(row);
      if (!keys.length) continue;
      const k = keys[0];
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(row);
    }
    const alias = new Map();
    for (const list of groups.values()) {
      const positives = list.filter((r) => {
        const p = extractPrice(r);
        return p !== null && p > 0;
      });
      const pool = positives.length ? positives : list;
      pool.sort((a, b) => {
        const sd = priceScore(b) - priceScore(a);
        if (sd) return sd;
        const td = rowTimestamp(b) - rowTimestamp(a);
        if (td) return td;
        return rowReference(b) - rowReference(a);
      });
      const topScore = pool.length ? priceScore(pool[0]) : 0;
      const equiv = positives.filter((r) => priceScore(r) === topScore);
      const chosen =
        (equiv.length ? equiv : pool).reduce((best, r) => {
          if (!best) return r;
          const bp = extractPrice(best),
            rp = extractPrice(r);
          if (rp && (!bp || rp < bp)) return r;
          return best;
        }, null) || {};
      for (const row of list)
        for (const key of unitKeys(row)) alias.set(key, chosen);
    }
    return alias;
  }
  function isVertexUnit(row) {
    return (
      enterpriseKey(row) === "121" ||
      normKey(enterpriseName(row)).includes("vertexgetulio")
    );
  }
  function vertexFloorLabel(row) {
    let floor = intValue(pick(row, ["andar", "pavimento"]));
    if (floor === null) {
      const unitNumber = intValue(
        pick(row, ["nome", "unidade", "numero_unidade", "numerounidade"]),
      );
      if (unitNumber !== null && unitNumber >= 1)
        floor = unitNumber <= 99 ? 0 : Math.floor(unitNumber / 100);
    }
    if (floor === null)
      return textValue(pick(row, ["tipologia"]), "Andar não informado");
    return floor === 0 ? "Térreo" : `${floor}º andar`;
  }
  function vertexCommercialType(row) {
    const raw = normKey(
      pick(row, [
        "tipologia",
        "nome_tipologia",
        "tipologia_nome",
        "tipo_unidade",
        "tipo_unidade_nome",
        "tipounidade",
      ]),
    );
    return raw.includes("varanda") ? "Com varanda" : "Padrão";
  }
  function normalizeUnit(
    baseRow,
    situationRow = {},
    priceRow = {},
    detailedAppraisal = null,
    dashboardRow = null,
  ) {
    const combined = { ...baseRow, ...situationRow, ...priceRow };
    // Situação, preço e Dashboard somente complementam a unidade. A identidade
    // (empreendimento, unidade, bloco e código) sempre vem de /cvdw/unidades.
    // Isso impede que referências numéricas do histórico sejam confundidas com
    // idunidade e sobrescrevam a unidade com dados de outro empreendimento.
    const identitySource = baseRow;
    // A API /unidades/situacao é histórica. Para empreendimentos/unidades recém-criados,
    // pode existir uma linha de situação sem um estado atual reconhecível. Nesse caso,
    // não devemos transformar a unidade em "indisponivel" e descartá-la do catálogo:
    // usamos a situação atual informada pela própria linha de /unidades como fallback.
    const hasSituationRow = Object.keys(situationRow).length > 0;
    const situationStatus = hasSituationRow ? deriveStatus(situationRow) : null;
    const baseStatus = deriveStatus(baseRow);
    // O retrato atual da própria unidade tem precedência sobre o histórico.
    // /unidades/situacao contém eventos e pode trazer referências antigas.
    const baseHasCurrentStatus = baseStatus !== "indisponivel";
    const resolvedStatus = baseHasCurrentStatus
      ? baseStatus
      : hasSituationRow && situationStatus !== "indisponivel"
        ? situationStatus
        : "indisponivel";
    const statusSource = baseHasCurrentStatus ? baseRow : situationRow;
    const eId = enterpriseKey(identitySource) || enterpriseName(identitySource);
    const id =
      unitKey(identitySource) ||
      crypto
        .createHash("sha1")
        .update(JSON.stringify(baseRow))
        .digest("hex")
        .slice(0, 14);
    const price =
      dashboardRow?.price ??
      extractPrice(priceRow) ??
      extractPrice(baseRow);

    return {
      id,
      internalId: textValue(pick(identitySource, ["idunidade_int"])),
      enterpriseId: eId,
      enterpriseInternalId: textValue(
        pick(identitySource, ["idempreendimento_int"]),
      ),
      enterpriseName: enterpriseName(identitySource),
      code: textValue(
        pick(identitySource, [
          "idunidade_int",
          "codigo",
          "codigo_unidade",
          "unidade",
          "nome",
        ]),
        id,
      ),
      developmentType: textValue(pick(identitySource, ["tipo_empreendimento"])),
      typology: isVertexUnit(baseRow)
        ? vertexFloorLabel(baseRow)
        : textValue(
            pick(identitySource, [
              "bloco",
              "nome_bloco",
              "nomebloco",
              "bloco_nome",
              "torre",
              "tipologia",
              "nome_tipologia",
              "tipologia_nome",
              "tipo_unidade",
              "tipo_unidade_nome",
              "tipounidade",
              "produto",
              "planta",
              "modelo",
              "descricao_tipologia",
            ]),
          ),
      commercialType: isVertexUnit(baseRow)
        ? vertexCommercialType(baseRow)
        : "",
      stage: textValue(pick(identitySource, ["etapa"])),
      bedrooms: intValue(
        pick(identitySource, [
          "qtde_quartos",
          "quartos",
          "dormitorios",
          "dormitórios",
          "quantidade_quartos",
          "qtdequartos",
        ]),
      ),
      suites: intValue(
        pick(identitySource, [
          "qtde_suites",
          "suites",
          "suítes",
          "quantidade_suites",
        ]),
      ),
      tower: textValue(
        pick(identitySource, [
          "bloco",
          "torre",
          "nome_bloco",
          "nomebloco",
          "bloco_nome",
        ]),
      ),
      floor: intValue(pick(identitySource, ["andar", "pavimento"])),
      area: numberValue(
        pick(identitySource, [
          "area_privativa",
          "areaprivativa",
          "area_privativa_total",
          "area_total",
          "areatotal",
          "area",
        ]),
      ),
      parkingSpaces: intValue(
        pick(identitySource, [
          "vagas_garagem",
          "qtde_vagas_garagem",
          "vagas",
          "vagasgaragem",
          "quantidade_vagas",
        ]),
      ),
      price,
      appraisal:
        detailedAppraisal ??
        numberValue(
          pick(combined, [
            "VALOR DO IMÓVEL (1x)",
            "VALOR DO IMOVEL (1x)",
            "valor_do_imovel_1x",
            "valor_imovel_1x",
            "valordoimovel1x",
            "valor_imovel",
            "valor do imovel",
            "valor do imóvel",
            "valor_avaliacao",
            "valoravaliacao",
            "avaliacao",
            "valor_de_avaliacao",
          ]),
        ),
      status: dashboardRow?.status || resolvedStatus,
      statusReason: textValue(
        pick(statusSource, [
          "situacao_bloqueada_motivo",
          "situacao_reservada_nomesituacao",
          "motivo",
        ]),
      ),
      tableName: textValue(
        dashboardRow?.tableName ||
          pick(priceRow, [
            "tabela",
            "tabela_preco",
            "tabelapreco",
            "nome_tabela",
            "nometabela",
            "tabela_preco_nome",
          ]),
      ),
      hasSituation: hasSituationRow,
      hasPrice: price !== null && price > 0,
      updatedAt: textValue(
        pick(statusSource, [
          "referencia_data",
          "data_referencia",
          "datareferencia",
          "updated_at",
          "atualizado_em",
        ]),
        new Date().toISOString(),
      ),
    };
  }
  function mergeData(
    unitsRows,
    situationRows = [],
    priceRows = [],
    appraisalByEnterprise = new Map(),
    dashboard = new Map(),
    enterpriseAvailability = new Map(),
  ) {
    const situationIndex = latestByUnit(situationRows);
    const priceIndex = bestPriceByUnit(priceRows);
    const isTestUnit = (row) =>
      [
        "nome",
        "unidade",
        "codigo",
        "codigo_unidade",
        "referencia",
        "idunidade_int",
      ].some((key) => normKey(pick(row, [key])).includes("teste"));
    const allUnits = unitsRows.filter((row) => !isTestUnit(row)).map((row) => {
      const enterpriseAppraisals =
        appraisalByEnterprise.get(String(enterpriseKey(row))) || null;
      return normalizeUnit(
        row,
        lookupUnit(situationIndex, row),
        lookupUnit(priceIndex, row),
        lookupDetailedAppraisal(enterpriseAppraisals, row),
        lookupDashboard(dashboard, row),
      );
    });

    const enterpriseMap = new Map();
    for (const u of allUnits) {
      const key = u.enterpriseId || u.enterpriseName;
      if (!enterpriseMap.has(key)) {
        enterpriseMap.set(key, {
          id: key,
          internalId: u.enterpriseInternalId,
          name: u.enterpriseName,
          type: u.developmentType,
          totalUnits: 0,
          availableUnits: 0,
          reservedUnits: 0,
          blockedUnits: 0,
          soldUnits: 0,
          permutaUnits: 0,
          pricedUnits: 0,
          lowestPrice: null,
        });
      }
      const e = enterpriseMap.get(key);
      e.totalUnits++;
      if (u.status === "disponivel") e.availableUnits++;
      if (u.status === "reservada") e.reservedUnits++;
      if (u.status === "bloqueada") e.blockedUnits++;
      if (u.status === "vendida") e.soldUnits++;
      if (u.status === "permuta") e.permutaUnits++;
      if (u.hasPrice) e.pricedUnits++;
      if (u.status === "disponivel" && u.price !== null && u.price > 0) {
        e.lowestPrice =
          e.lowestPrice === null ? u.price : Math.min(e.lowestPrice, u.price);
      }
    }

    // V10: catálogo estritamente comercial. Só publica unidades DISPONÍVEIS.
    // ARAÇA e Lantai estão explicitamente fora da vitrine comercial.
    const excludedEnterpriseNames = new Set([
      "araca",
      "lantai",
      "testepagadoria",
    ]);
    const isExcludedEnterprise = (name) =>
      excludedEnterpriseNames.has(normKey(name));
    const availableCommercialUnits = allUnits.filter(
      (u) =>
        u.status === "disponivel" && !isExcludedEnterprise(u.enterpriseName),
    );
    const availableEnterpriseIds = new Set(
      availableCommercialUnits.map((u) => String(u.enterpriseId)),
    );

    const allEnterprises = [...enterpriseMap.values()];
    let enterprises = allEnterprises.filter(
      (e) =>
        availableEnterpriseIds.has(String(e.id)) &&
        (!enterpriseAvailability.size ||
          enterpriseAvailability.get(String(e.id))?.eligible === true) &&
        !isExcludedEnterprise(e.name),
    );

    enterprises.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const visibleIds = new Set(enterprises.map((e) => String(e.id)));
    const units = availableCommercialUnits.filter((u) =>
      visibleIds.has(String(u.enterpriseId)),
    );

    return { units, enterprises, allUnits, allEnterprises };
  }
  function buildIntegrity(
    unitsRows,
    situationRows,
    priceRows,
    merged,
    errors = [],
  ) {
    const available = merged.units.filter((u) => u.status === "disponivel");
    const availableWithPrice = available.filter(
      (u) => u.price !== null && u.price > 0,
    );
    const availableWithoutPrice = available.filter(
      (u) => !(u.price !== null && u.price > 0),
    );
    const statusCounts = {};
    for (const u of merged.units)
      statusCounts[u.status] = (statusCounts[u.status] || 0) + 1;

    return {
      at: new Date().toISOString(),
      endpoints: {
        unidades: {
          records: unitsRows.length,
          ok: !errors.some((e) => e.endpoint === "unidades"),
        },
        situacao: {
          records: situationRows.length,
          ok: !errors.some((e) => e.endpoint === "situacao"),
        },
        precos: {
          records: priceRows.length,
          ok: !errors.some((e) => e.endpoint === "precos"),
        },
      },
      allEnterpriseCount: merged.allEnterprises.length,
      commercialEnterpriseCount: merged.enterprises.length,
      commercialUnitCount: merged.units.length,
      availableCount: available.length,
      availableWithPriceCount: availableWithPrice.length,
      availableWithoutPriceCount: availableWithoutPrice.length,
      statusCounts,
      warnings: [
        ...(availableWithoutPrice.length
          ? [
              `${availableWithoutPrice.length} unidade(s) disponível(is) sem preço retornado pela API de preços.`,
            ]
          : []),
        ...errors.map((e) => `${e.endpoint}: ${e.message}`),
      ],
    };
  }

  let syncing = false;
  return {
    buildIntegrity,
    fetchDetailedAppraisals,
    fetchEnterpriseAvailability,
    mergeData,
  };
}
