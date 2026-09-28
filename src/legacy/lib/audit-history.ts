// @ts-nocheck
export function createAuditHistory({ api, escapeHtml, fmtDate }) {
  return async function renderAuditHistory() {
    const area = document.querySelector("#auditHistoryTab");
    if (!area) return;
    area.innerHTML = '<div class="empty"><b>Carregando histórico…</b></div>';

    try {
      const result = await api("/api/audit-history");
      const rows = Array.isArray(result.rows) ? result.rows : [];
      area.innerHTML = `<section class="audit-shell">
        <div class="audit-head"><div><div class="eyebrow">rastreabilidade</div><h2>Histórico de atividades</h2><p>Ações registradas para o gestor autenticado nesta versão do simulador.</p></div><span class="audit-count">${rows.length.toLocaleString("pt-BR")} registros</span></div>
        ${
          rows.length
            ? `<div class="audit-list">${rows
                .map(
                  (item) =>
                    `<article><div class="audit-marker"></div><div><b>${escapeHtml(item.detail || item.action)}</b><span>${escapeHtml(item.actorName || "Usuário")} • ${fmtDate(item.at)}</span>${item.preRegistrationId ? `<small>Pré-cadastro #${escapeHtml(item.preRegistrationId)}</small>` : ""}${item.reservationId ? `<small>Reserva #${escapeHtml(item.reservationId)}</small>` : ""}</div>${item.result ? `<span class="audit-result ${escapeHtml(item.result)}">${item.result === "ready" ? "Liberado" : "Bloqueado"}</span>` : ""}</article>`,
                )
                .join("")}</div>`
            : '<div class="empty"><b>Nenhuma atividade registrada para este usuário.</b><p>As consultas e validações realizadas após o login aparecerão aqui.</p></div>'
        }
      </section>`;
    } catch (error) {
      area.innerHTML = `<div class="empty"><b>Não foi possível carregar o histórico.</b><p>${escapeHtml(error.message)}</p></div>`;
    }
  };
}
