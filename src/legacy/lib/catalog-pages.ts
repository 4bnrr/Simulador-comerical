// @ts-nocheck
export function createCatalogPages(dependencies) {
  const { escapeHtml, fmtBRL, pageHead, state } = dependencies;
  function isHiddenEnterprise(name) {
    const n = String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return (
      n === "araca" ||
      n === "lantai" ||
      n === "testepagadoria"
    );
  }
  function availableUnits() {
    return state.catalog.units.filter(
      (u) =>
        u.status === "disponivel" &&
        !isHiddenEnterprise(u.enterpriseName) &&
        enterpriseMedia(u.enterpriseName).visible,
    );
  }
  function simulatorUnits() {
    return availableUnits().filter((u) => Number(u.price) > 0);
  }
  function reservationBlockLabel(unit) {
    return String(
      unit?.tower || unit?.typology || unit?.stage || "Sem bloco informado",
    ).trim();
  }
  function reservationPropertyNumber(unit) {
    const explicit =
      unit?.unitNumber || unit?.number || unit?.numero || unit?.nome;
    if (String(explicit || "").trim()) return String(explicit).trim();
    const code = String(unit?.code || unit?.internalId || "").trim();
    return (
      code
        .split(/[.\/-]/)
        .filter(Boolean)
        .pop() || String(unit?.id || "Não informado")
    );
  }
  function enterpriseDetailUrl(e) {
    return (
      state.enterpriseLinks[String(e.id)] || state.enterpriseLinks[e.name] || ""
    );
  }
  function visibleEnterprises() {
    return state.catalog.enterprises.filter(
      (e) =>
        !isHiddenEnterprise(e.name) &&
        enterpriseMedia(e.name).visible &&
        Number(e.availableUnits) > 0,
    );
  }

  function normalizeEnterpriseName(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }
  function enterpriseMedia(name) {
    const n = normalizeEnterpriseName(name);
    const cfg = state.enterpriseMediaConfig[n] || {};
    return {
      image: cfg.image || "/assets/empreendimentos/placeholder.svg",
      url: cfg.url || "",
      displayName: cfg.displayName || name,
      visible: cfg.visible !== false,
      highlights: Array.isArray(cfg.highlights) ? cfg.highlights : [],
    };
  }
  function enterpriseImageUrl(name) {
    return enterpriseMedia(name).image;
  }
  function enterpriseDisplayName(name) {
    return enterpriseMedia(name).displayName || name;
  }
  function enterpriseOfficialUrl(name) {
    const media = enterpriseMedia(name);
    if (media.url) return media.url;
    const e = state.catalog.enterprises.find(
      (x) => normalizeEnterpriseName(x.name) === normalizeEnterpriseName(name),
    );
    return e ? enterpriseDetailUrl(e) : "";
  }

  function enterprises() {
    const ents = visibleEnterprises();
    return (
      pageHead(
        "Portfólio comercial",
        "Empreendimentos",
        "Conheça os empreendimentos disponíveis e acesse os detalhes de cada projeto.",
      ) +
      `<section class="section enterprises-section enterprise-gallery-section"><div class="container">
    ${
      ents.length
        ? `<div class="cards enterprise-cards enterprise-gallery">
      ${ents
        .map((e, i) => {
          const media = enterpriseMedia(e.name);
          const link = enterpriseDetailUrl(e) || media.url;
          const image = media.image;
          return `<article class="card enterprise-card enterprise-photo-card">
          <div class="enterprise-photo-wrap">
            ${
              image
                ? `<img class="enterprise-photo" src="${escapeHtml(image)}" alt="${escapeHtml(e.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/assets/empreendimentos/placeholder.svg'">`
                : ""
            }
            <div class="enterprise-photo-overlay"></div>
            <div class="enterprise-photo-badges">
              <span class="enterprise-index">Empreendimento ${String(i + 1).padStart(2, "0")}</span>
              <span class="enterprise-status-dot">Disponível</span>
            </div>
          </div>
          <div class="enterprise-card-body">
            <h3>${escapeHtml(media.displayName || e.name)}</h3>${media.highlights.length ? `<div class="enterprise-highlights">${media.highlights.map((h) => `<span>${escapeHtml(h)}</span>`).join("")}</div>` : ""}${!media.url || media.image.includes("placeholder") ? `<div class="enterprise-auto-note">Cadastro visual pendente</div>` : ""}
            <div class="enterprise-price">
              <small>A partir de</small>
              <strong>${fmtBRL(e.lowestPrice)}</strong>
            </div>
            ${
              link
                ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="btn secondary enterprise-detail-btn">Ver detalhes <span>→</span></a>`
                : `<button class="btn secondary enterprise-detail-btn" disabled>Ver detalhes <span>→</span></button>`
            }
          </div>
        </article>`;
        })
        .join("")}
    </div>`
        : '<div class="empty">Nenhum empreendimento comercial encontrado na última sincronização.</div>'
    }
  </div></section>`
    );
  }
  function varandaCategory(u) {
    const enterprise = String(u.enterpriseName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    // VERTEX: cada pavimento é uma tipologia comercial independente.
    if (enterprise.includes("VERTEX GETULIO")) {
      const configured = String(u.typology || "").trim();
      if (
        configured
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase() === "terreo"
      )
        return "Térreo";
      const configuredFloor = configured.match(/^(\d+)º andar$/i);
      if (configuredFloor) {
        const floor = Number(configuredFloor[1]);
        return floor >= 1 && floor <= 12 ? `${floor}º andar` : "";
      }
      const floor = Number(u.floor);
      if (Number.isFinite(floor) && floor === 0) return "Térreo";
      if (Number.isFinite(floor) && floor >= 1 && floor <= 12)
        return `${floor}º andar`;
      return "";
    }

    // ASTER: a tipologia comercial vem da coluna ETAPA.
    // "COM QUINTAL" => Com quintal.
    // "SEM QUINTAL" => Com varanda, conforme regra comercial definida.
    if (enterprise.includes("ASTER RESIDENCE")) {
      const stage = String(u.stage || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();

      if (
        stage.includes("COM QUINTAL") ||
        (stage.includes("QUINTAL") && !stage.includes("SEM QUINTAL"))
      ) {
        return "Com quintal";
      }
      if (stage.includes("SEM QUINTAL") || stage.includes("VARANDA")) {
        return "Com varanda";
      }
    }

    // Demais empreendimentos: classificação comercial pela descrição do BLOCO/TIPOLOGIA.
    const raw = String(u.typology || u.tower || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    if (raw.includes("SEM VARANDA")) return "Sem varanda";
    if (raw.includes("COM VARANDA")) return "Com varanda";
    return "";
  }
  function commercialCategoryOrder(category) {
    const fixed = {
      "Sem varanda": 0,
      "Com varanda": 1,
      "Com quintal": 2,
      Térreo: 10,
    };
    if (Object.prototype.hasOwnProperty.call(fixed, category))
      return fixed[category];
    const floor = String(category || "").match(/^(\d+)º andar$/i);
    return floor ? 10 + Number(floor[1]) : 99;
  }
  function enterpriseVarandaMinimumRows() {
    // Uma linha por categoria comercial e sempre com o menor preço disponível.
    // A numeração de bloco é ignorada.
    // Sândalo/Jasmim/Acqua: Com varanda / Sem varanda.
    // Aster: Com quintal / Com varanda, usando a coluna ETAPA.
    const byEnterprise = new Map();

    for (const u of availableUnits().filter((u) => Number(u.price) > 0)) {
      const enterprise = String(u.enterpriseName || "").trim();
      if (!enterprise) continue;

      const vertexType = isVertexCommercialRow(u)
        ? String(u.commercialType || "Padrão").trim()
        : "";
      const key = `${enterprise.toLocaleLowerCase("pt-BR")}|${vertexType.toLocaleLowerCase("pt-BR")}`;
      let g = byEnterprise.get(key);
      if (!g) {
        g = {
          enterpriseName: enterprise,
          commercialType: vertexType,
          overall: null,
          categories: new Map(),
        };
        byEnterprise.set(key, g);
      }

      if (!g.overall || Number(u.price) < Number(g.overall.price))
        g.overall = u;

      const cat = varandaCategory(u);
      if (cat) {
        const current = g.categories.get(cat);
        if (!current || Number(u.price) < Number(current.price)) {
          g.categories.set(cat, u);
        }
      }
    }

    const rows = [];
    for (const g of byEnterprise.values()) {
      if (g.categories.size) {
        const cats = [...g.categories.keys()].sort((a, b) => {
          return (
            commercialCategoryOrder(a) - commercialCategoryOrder(b) ||
            a.localeCompare(b, "pt-BR")
          );
        });

        for (const cat of cats) {
          const u = g.categories.get(cat);
          rows.push({
            ...u,
            _displayLabel: `${g.enterpriseName} • ${cat}`,
            _kind: cat.toLowerCase().replace(/\s+/g, "-"),
            _categoryOrder: commercialCategoryOrder(cat),
            commercialType: g.commercialType || u.commercialType || "",
          });
        }
      } else if (g.overall) {
        rows.push({
          ...g.overall,
          _displayLabel: g.enterpriseName,
          _kind: "overall",
        });
      }
    }

    return rows.sort((a, b) => {
      const cmp = String(a.enterpriseName || "").localeCompare(
        String(b.enterpriseName || ""),
        "pt-BR",
      );
      if (cmp) return cmp;
      const order = {
        "sem-varanda": 0,
        "com-varanda": 1,
        "com-quintal": 2,
        overall: 3,
      };
      return (
        (a._categoryOrder ?? order[a._kind] ?? 99) -
          (b._categoryOrder ?? order[b._kind] ?? 99) ||
        Number(a.price) - Number(b.price)
      );
    });
  }
  function commercialRowLabel(r) {
    return String(r._displayLabel || r.enterpriseName || "");
  }
  function isVertexCommercialRow(r) {
    return normalizeEnterpriseName(r?.enterpriseName).includes("vertexgetulio");
  }
  function tables() {
    return (
      pageHead(
        "Consulta comercial",
        "Tabelas de preços",
        "Menor valor disponível por empreendimento e tipologia comercial, com o respectivo valor de avaliação da unidade utilizada como referência.",
      ) +
      `<section class="section prices-section"><div class="container"><div class="price-search-panel"><div class="price-search-copy"><div class="eyebrow">Consulta rápida</div><strong>Encontre um empreendimento</strong><small>Pesquise pelo nome do empreendimento ou pela tipologia exibida.</small></div><div class="filters price-filters"><input id="q" class="input price-search-input" placeholder="Buscar empreendimento"></div></div><div id="tableArea"></div></div></section>`
    );
  }
  function renderTable() {
    const q = (document.querySelector("#q")?.value || "").toLowerCase();
    const allRows = enterpriseVarandaMinimumRows();
    const vertexRows = allRows.filter(isVertexCommercialRow);
    const entries = allRows
      .filter((r) => !isVertexCommercialRow(r))
      .map((row) => ({ kind: "row", row, enterpriseName: row.enterpriseName }));
    if (vertexRows.length) {
      const vertexGroups = new Map();
      for (const row of vertexRows) {
        const type = String(row.commercialType || "Padrão").trim();
        if (!vertexGroups.has(type)) vertexGroups.set(type, []);
        vertexGroups.get(type).push(row);
      }
      for (const [type, rows] of vertexGroups) {
        const reference = rows
          .slice()
          .sort((a, b) => Number(a.price) - Number(b.price))[0];
        entries.push({
          kind: "vertex",
          row: reference,
          rows,
          commercialType: type,
          enterpriseName: `Vertex Getulio • ${type}`,
        });
      }
    }
    const visibleEntries = entries
      .filter(
        (entry) =>
          !q ||
          entry.enterpriseName.toLowerCase().includes(q) ||
          (entry.kind !== "vertex" && (entry.rows || [entry.row]).some((r) =>
            commercialRowLabel(r).toLowerCase().includes(q),
          )),
      )
      .sort((a, b) =>
        String(a.enterpriseName).localeCompare(
          String(b.enterpriseName),
          "pt-BR",
        ),
      );
    const area = document.querySelector("#tableArea");
    if (!area) return;
    const body = visibleEntries
      .map((entry, entryIndex) => {
        if (entry.kind === "row") {
          const r = entry.row;
          return `<tr><td><b>${escapeHtml(commercialRowLabel(r))}</b></td><td><b>${fmtBRL(r.price)}</b></td><td><b>${Number(r.appraisal) > 0 ? fmtBRL(r.appraisal) : "—"}</b></td><td><a class="btn secondary btn-small" href="#simulador">Simular →</a></td></tr>`;
        }
        const r = entry.row;
        return `<tr class="vertex-summary-row"><td><b>${escapeHtml(entry.enterpriseName)}</b></td><td><b>${fmtBRL(r.price)}</b></td><td><b>${Number(r.appraisal) > 0 ? fmtBRL(r.appraisal) : "—"}</b></td><td><a class="btn secondary btn-small" href="#simulador">Simular →</a></td></tr>`;
      })
      .join("");
    area.innerHTML = `<div class="price-table-head"><p class="meta"><b>${visibleEntries.length.toLocaleString("pt-BR")}</b> opções comerciais resumidas</p><span class="price-table-caption">Menores valores disponíveis</span></div>${visibleEntries.length ? `<div class="table-wrap table-wrap-refined"><table class="data-table price-table"><thead><tr><th>Empreendimento</th><th>Valor de venda</th><th>Valor da avaliação</th><th>Simular</th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="empty">Nenhuma opção disponível encontrada.</div>'}`;
  }
  return {
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
  };
}
