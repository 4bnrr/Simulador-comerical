// @ts-nocheck
export function createEventWiring(dependencies) {
  const {
    api,
    calcSimulation,
    escapeHtml,
    loadAll,
    renderTable,
    route,
    showSimulatorTab,
    toast,
    updateHeader,
  } = dependencies;
  const { state } = dependencies;
  function wire(name) {
    if (name === "access") {
      document
        .querySelector("#managerLoginForm")
        ?.addEventListener("submit", async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const button = form.querySelector('button[type="submit"]');
          const errorBox = form.querySelector("#managerLoginError");
          button.disabled = true;
          button.textContent = "Autenticando…";
          if (errorBox) errorBox.hidden = true;
          try {
            state.managerAuth = await api("/api/access/login", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                email: form.elements.email.value,
                password: form.elements.password.value,
              }),
            });
            form.elements.password.value = "";
            await loadAll();
            route();
          } catch (error) {
            if (errorBox) {
              errorBox.hidden = false;
              errorBox.innerHTML = `<b>Não foi possível entrar.</b><p>${escapeHtml(error.message)}</p>`;
            }
          } finally {
            button.disabled = false;
            button.textContent = "Entrar no simulador";
          }
        });
    }
    if (name === "tabelas") {
      document.querySelector("#q")?.addEventListener("input", renderTable);
      renderTable();
    }
    if (name === "simulador") {
      document
        .querySelector("#calcBtn")
        ?.addEventListener("click", calcSimulation);
      document
        .querySelector("#preRegistrationQueryId")
        ?.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            calcSimulation();
          }
        });
      document
        .querySelector("#tabSimulator")
        ?.addEventListener("click", () => showSimulatorTab("sim"));
      document
        .querySelector("#tabPaymentPlan")
        ?.addEventListener("click", () => showSimulatorTab("plan"));
      document
        .querySelector("#tabPaymentConditions")
        ?.addEventListener("click", () => showSimulatorTab("conditions"));
      document
        .querySelector("#tabAuditHistory")
        ?.addEventListener("click", () => showSimulatorTab("audit"));
      document
        .querySelector("#managerLogoutBtn")
        ?.addEventListener("click", async () => {
          try {
            await api("/api/access/logout", { method: "POST" });
          } catch {}
          state.managerAuth = { authenticated: false, user: null };
          state.eligiblePreRegistrations = [];
          state.lastSimulationResults = [];
          state.lastSimulation = null;
          state.selectedSimulationUnit = null;
          updateHeader();
          route();
        });
    }
    if (name === "administracao" && !state.adminAuthenticated) {
      document
        .querySelector("#adminLoginForm")
        ?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const username = document.querySelector("#adminUser")?.value || "";
          const password = document.querySelector("#adminPass")?.value || "";
          try {
            await api("/api/admin/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username, password }),
            });
            state.adminAuthenticated = true;
            state.adminEnterpriseData = await api("/api/admin/enterprises");
            state.backups = await api("/api/backups");
            route();
          } catch {
            const err = document.querySelector("#adminLoginError");
            if (err) err.hidden = false;
          }
        });
    }
    if (name === "administracao" && state.adminAuthenticated) {
      document
        .querySelector("#backupBtn")
        ?.addEventListener("click", async () => {
          try {
            await api("/api/admin/backup", { method: "POST" });
            toast("Backup criado.");
            state.backups = await api("/api/backups");
            route();
          } catch (err) {
            toast(err.message, true);
          }
        });
      document
        .querySelector("#adminSyncBtn")
        ?.addEventListener("click", async () => {
          try {
            await api("/api/sync", { method: "POST" });
            toast("Sincronização iniciada.");
          } catch (err) {
            toast(err.message, true);
          }
        });
      document
        .querySelector("#adminLogoutBtn")
        ?.addEventListener("click", async () => {
          try {
            await api("/api/admin/logout", { method: "POST" });
          } catch {}
          state.adminAuthenticated = false;
          route();
        });
      document.querySelectorAll(".admin-enterprise-card").forEach((form) => {
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const payload = {
            sourceName: fd.get("sourceName"),
            displayName: fd.get("displayName"),
            url: fd.get("url"),
            highlights: String(fd.get("highlights") || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            visible: form.querySelector('[name="visible"]')?.checked !== false,
          };
          try {
            await api("/api/admin/enterprise", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            state.enterpriseMediaConfig = await api("/api/enterprise-media");
            state.adminEnterpriseData = await api("/api/admin/enterprises");
            toast("Empreendimento atualizado.");
            route();
          } catch (err) {
            toast(err.message, true);
          }
        });
        form
          .querySelector('[name="image"]')
          ?.addEventListener("change", async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.append(
              "sourceName",
              form.querySelector('[name="sourceName"]').value,
            );
            fd.append("image", file);
            try {
              await api("/api/admin/enterprise-image", {
                method: "POST",
                body: fd,
              });
              state.enterpriseMediaConfig = await api("/api/enterprise-media");
              state.adminEnterpriseData = await api("/api/admin/enterprises");
              toast("Imagem atualizada.");
              route();
            } catch (err) {
              toast(err.message, true);
            }
          });
      });
    }
    if (name === "materiais") {
      document
        .querySelector("#uploadForm")
        ?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const btn = e.submitter;
          btn.disabled = true;
          try {
            await api("/api/materials", {
              method: "POST",
              body: new FormData(e.currentTarget),
            });
            state.materials = await api("/api/materials");
            toast("Material publicado.");
            route();
          } catch (err) {
            toast(err.message, true);
          } finally {
            btn.disabled = false;
          }
        });
      document.querySelectorAll("[data-delete-material]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          if (!confirm("Remover este material?")) return;
          try {
            await api("/api/materials/" + btn.dataset.deleteMaterial, {
              method: "DELETE",
            });
            state.materials = await api("/api/materials");
            route();
          } catch (err) {
            toast(err.message, true);
          }
        }),
      );
    }
    if (name === "atualizacoes") {
      document
        .querySelector("#syncBtn")
        ?.addEventListener("click", async (e) => {
          e.currentTarget.disabled = true;
          e.currentTarget.textContent = "Iniciando...";
          try {
            await api("/api/sync", { method: "POST" });
            toast(
              "Sincronização iniciada. Você pode acompanhar o progresso nesta tela.",
            );
            await loadAll();
            route();
          } catch (err) {
            toast(err.message, true);
            await loadAll();
            route();
          }
        });
    }
  }
  return wire;
}
