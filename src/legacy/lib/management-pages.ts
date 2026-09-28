// @ts-nocheck
export function createManagementPages(dependencies) {
  const { availableUnits, escapeHtml, fmtDate, pageHead, simulatorUnits } =
    dependencies;

  function adminLogin() {
    return (
      pageHead(
        "Área restrita",
        "Administração",
        "Acesso exclusivo para usuários autorizados.",
      ) +
      `<section class="section"><div class="container admin-login-wrap">
      <form id="adminLoginForm" class="admin-login-card">
        <div class="eyebrow">área protegida</div><h2>Entrar na Administração</h2>
        <p>Informe o usuário e a senha administrativos.</p>
        <div class="field"><label>Usuário</label><input id="adminUser" class="input" autocomplete="username" required></div>
        <div class="field"><label>Senha</label><input id="adminPass" class="input" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit">Entrar</button>
        <div id="adminLoginError" class="admin-login-error" hidden>Usuário ou senha inválidos.</div>
      </form></div></section>`
    );
  }

  function administration() {
    const state = dependencies.getState();
    if (!state.adminAuthenticated) return adminLogin();
    const { adminEnterpriseData, backups, catalog, priceHistory } = state;
    return (
      pageHead(
        "Gestão local",
        "Administração",
        "Gerencie imagens, links, nomes comerciais, destaques e visibilidade sem editar código.",
      ) +
      `<section class="section admin-page"><div class="container">
      <div class="admin-toolbar">
        <div class="status-box compact"><span class="status-dot ${catalog.status === "ok" || catalog.status === "warning" ? "ok" : "error"}"></span><div><div class="eyebrow">CVCRM</div><b>${catalog.syncing ? "Sincronizando" : catalog.status === "ok" ? "Conectado" : "Atenção"}</b><small>Último sucesso: ${fmtDate(catalog.lastSuccess)}</small></div></div>
        <div class="admin-toolbar-actions"><button id="adminSyncBtn" class="btn secondary">Sincronizar agora</button><button id="backupBtn" class="btn primary">Criar backup</button><button id="adminLogoutBtn" class="btn secondary">Sair</button></div>
      </div>
      <div class="metrics admin-metrics">
        <div class="metric"><label>Pendências de cadastro</label><strong>${adminEnterpriseData.pending?.length || 0}</strong><p>Empreendimentos sem imagem/link/configuração.</p></div>
        <div class="metric"><label>Backups</label><strong>${backups.length}</strong><p>Cópias automáticas e manuais preservadas.</p></div>
        <div class="metric"><label>Histórico de preços</label><strong>${priceHistory.rows?.length || 0}</strong><p>Pontos registrados nas sincronizações.</p></div>
      </div>
      <div class="section-title admin-title"><div><div class="eyebrow">empreendimentos</div><h2>Cadastro visual e comercial</h2></div></div>
      <div class="admin-enterprise-list">${
        (adminEnterpriseData.entries || [])
          .map(
            (
              enterprise,
              index,
            ) => `<form class="admin-enterprise-card" data-admin-index="${index}">
        <div class="admin-thumb"><img src="${escapeHtml(enterprise.image || "/assets/empreendimentos/placeholder.svg")}" onerror="this.src='/assets/empreendimentos/placeholder.svg'"></div>
        <div class="admin-fields">
          <div class="admin-card-head"><div><small>Origem CVCRM</small><b>${escapeHtml(enterprise.sourceName)}</b></div>${enterprise.configured ? "" : '<span class="admin-pending">Pendente</span>'}</div>
          <input type="hidden" name="sourceName" value="${escapeHtml(enterprise.sourceName)}">
          <div class="admin-grid">
            <div class="field"><label>Nome comercial</label><input class="input" name="displayName" value="${escapeHtml(enterprise.displayName || enterprise.sourceName)}"></div>
            <div class="field"><label>Link de detalhes</label><input class="input" name="url" value="${escapeHtml(enterprise.url || "")}" placeholder="https://..."></div>
            <div class="field"><label>Destaques</label><input class="input" name="highlights" value="${escapeHtml((enterprise.highlights || []).join(", "))}" placeholder="Lançamento, Últimas unidades"></div>
            <div class="field admin-visible-field"><label>Visibilidade</label><label class="toggle"><input type="checkbox" name="visible" ${enterprise.visible !== false ? "checked" : ""}><span>Exibir no portal</span></label></div>
          </div>
          <div class="admin-card-actions"><label class="btn secondary btn-small upload-image-btn">Trocar imagem<input type="file" name="image" accept="image/jpeg,image/png,image/webp" hidden></label><button class="btn primary btn-small" type="submit">Salvar alterações</button></div>
        </div></form>`,
          )
          .join("") ||
        '<div class="empty">Nenhum empreendimento disponível.</div>'
      }</div></div></section>`
    );
  }

  function materialsPage() {
    const { catalog, materials } = dependencies.getState();
    return (
      pageHead(
        "Central de arquivos",
        "Materiais",
        "Publique e consulte books, plantas, memoriais, apresentações e outros arquivos comerciais. Sem login.",
      ) +
      `<section class="section"><div class="container"><form id="uploadForm" class="upload"><div class="upload-grid"><div class="field"><label>Arquivo</label><input name="file" type="file" class="input" required></div><div class="field"><label>Título</label><input name="title" class="input" placeholder="Título do material"></div><div class="field"><label>Empreendimento</label><select name="enterpriseName" class="select"><option value="">Geral</option>${catalog.enterprises.map((enterprise) => `<option>${escapeHtml(enterprise.name)}</option>`).join("")}</select></div><button class="btn primary" type="submit">Publicar</button></div></form><div class="material-list">${materials.map((material) => `<article class="material"><div class="eyebrow">${escapeHtml(material.enterpriseName || "GERAL")}</div><h3>${escapeHtml(material.title)}</h3><p class="meta">${escapeHtml(material.fileName)} • ${(material.size / 1024 / 1024).toFixed(1)} MB</p><div class="buttons"><a class="btn secondary" target="_blank" href="${material.url}">Abrir arquivo</a><button class="btn danger" data-delete-material="${material.id}">Remover</button></div></article>`).join("") || '<div class="empty">Nenhum material publicado.</div>'}</div></div></section>`
    );
  }

  function updates() {
    const { catalog, integrity, syncHistory } = dependencies.getState();
    const progress = catalog.syncProgress || {};
    const percentage =
      progress.totalPages && progress.currentPage
        ? Math.min(
            100,
            Math.round((progress.currentPage / progress.totalPages) * 100),
          )
        : 0;
    const warnings = integrity.warnings || [];
    const endpoints = integrity.endpoints || {};
    return (
      pageHead(
        "Integração",
        "Atualizações",
        "Sincronização protegida das fontes CVCRM. O catálogo anterior só é substituído quando unidades, situações e preços terminam corretamente.",
      ) +
      `<section class="section"><div class="container">
      <div class="status-box"><span class="status-dot ${catalog.status === "ok" ? "ok" : catalog.status === "error" ? "error" : ""}"></span>
        <div style="flex:1"><div class="eyebrow">Integração CVCRM</div>
        <h2>${catalog.syncing ? "Sincronizando" : catalog.status === "ok" ? "Sincronizado" : catalog.status === "warning" ? "Sincronizado com aviso" : catalog.status === "error" ? "Falha na sincronização" : "Aguardando sincronização"}</h2>
        <p>Último sucesso: <b>${fmtDate(catalog.lastSuccess)}</b></p>
        ${catalog.syncing ? `<div style="margin-top:12px"><div style="height:8px;background:#e4e4e4;border-radius:10px;overflow:hidden"><div style="height:100%;width:${percentage}%;background:currentColor"></div></div><p>${escapeHtml(progress.label || "Sincronizando")}${progress.currentPage && progress.totalPages ? ` • página ${progress.currentPage} de ${progress.totalPages}` : ""}</p></div>` : ""}
        ${catalog.rateLimit?.active ? `<div class="empty" style="margin-top:12px;text-align:left"><b>Proteção contra limite ativa</b><p>O CVCRM pediu redução de chamadas. Esta sincronização aguardará automaticamente cerca de ${catalog.rateLimit.remainingSeconds || 0}s antes da próxima tentativa.</p></div>` : ""}
        ${warnings.length ? `<div class="empty" style="margin-top:12px;text-align:left"><b>Atenção na API</b>${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : ""}</div>
        <button id="syncBtn" class="btn primary" ${catalog.syncing ? "disabled" : ""}>${catalog.syncing ? "Sincronizando..." : "Sincronizar agora"}</button>
      </div>
      <div class="metrics" style="margin-top:20px"><div class="metric"><label>Empreendimentos atuais</label><strong>${catalog.enterprises.length.toLocaleString("pt-BR")}</strong><p>Com situação comercial atual.</p></div><div class="metric"><label>Unidades disponíveis</label><strong>${(catalog.stats?.availableUnits ?? availableUnits().length).toLocaleString("pt-BR")}</strong><p>Situação atual = disponível.</p></div><div class="metric"><label>Disponíveis com preço</label><strong>${(catalog.stats?.availableWithPrice ?? simulatorUnits().length).toLocaleString("pt-BR")}</strong><p>Podem ser usadas no simulador.</p></div></div>
      <div class="metrics" style="margin-top:20px"><div class="metric"><label>/unidades</label><strong>${endpoints.unidades?.records ?? "—"}</strong><p>${endpoints.unidades?.ok === false ? "Falhou" : "Registros lidos"}</p></div><div class="metric"><label>/unidades/situacao</label><strong>${endpoints.situacao?.records ?? "—"}</strong><p>${endpoints.situacao?.ok === false ? "Falhou" : "Situações lidas"}</p></div><div class="metric"><label>/unidades/precos</label><strong>${endpoints.precos?.records ?? "—"}</strong><p>${endpoints.precos?.ok === false ? "Falhou" : "Preços lidos"}</p></div></div>
      <div class="section-title" style="margin-top:38px"><div><div class="eyebrow">rastreabilidade</div><h2>Histórico</h2></div><a class="btn secondary" href="/api/export/catalog.json">Exportar catálogo JSON</a></div>
      <div class="history">${
        syncHistory
          .slice(0, 30)
          .map(
            (item) =>
              `<div class="history-item"><b>${escapeHtml(item.action)}</b><span>${escapeHtml(item.detail)} • ${fmtDate(item.at)}</span></div>`,
          )
          .join("") ||
        '<div class="empty">Ainda não há eventos registrados.</div>'
      }</div>
    </div></section>`
    );
  }

  return { adminLogin, administration, materialsPage, updates };
}
