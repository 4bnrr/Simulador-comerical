// @ts-nocheck
export function createStaticPages(dependencies) {
  const {
    availableUnits,
    enterpriseDisplayName,
    escapeHtml,
    fmtBRL,
    getManagerAuth,
    pageHead,
    visibleEnterprises,
  } = dependencies;

  function home() {
    const available = availableUnits();
    const visible = visibleEnterprises();
    const priced = available.filter((unit) => Number(unit.price) > 0);
    const lowestUnit = priced
      .slice()
      .sort((a, b) => Number(a.price) - Number(b.price))[0];
    return `
<section class="hero hero-refined"><div class="container hero-grid hero-grid-refined"><div><div class="eyebrow">inteligência para a jornada comercial</div><h1>O ponto de partida para decisões imobiliárias mais claras.</h1><p>Consulte empreendimentos, unidades disponíveis, valores e condições em uma interface comercial simples e padronizada. Os dados são atualizados automaticamente pelo CVCRM.</p><div class="buttons"><a class="btn primary" href="#empreendimentos">Explorar empreendimentos →</a><a class="btn secondary" href="#simulador">▦ Simular entrada</a></div></div><aside class="hero-card hero-card-refined"><div class="eyebrow">painel comercial</div><h2>Informação comercial clara e centralizada.</h2><div class="hero-list"><div><b>Tabelas e unidades</b><small>Somente disponibilidade comercial atual.</small></div><div><b>Simulação comercial</b><small>Entrada estimada por unidade disponível.</small></div><div><b>Atualização automática</b><small>Dados sincronizados periodicamente com o CVCRM.</small></div></div></aside></div></section>
<section class="section home-dashboard"><div class="container"><div class="metrics metrics-refined metrics-dashboard">
  <div class="metric"><label>Empreendimentos</label><strong>${visible.length}</strong><p>Com unidades disponíveis agora.</p></div>
  <div class="metric"><label>Unidades disponíveis</label><strong>${available.length}</strong><p>Situação atual = Disponível.</p></div>
  <div class="metric"><label>Menor valor</label><strong>${fmtBRL(lowestUnit?.price)}</strong><p>${lowestUnit ? escapeHtml(enterpriseDisplayName(lowestUnit.enterpriseName)) : "Sem preço disponível"}</p></div>
</div></div></section>`;
  }

  function accessLogin() {
    return `<section class="access-login-page"><div class="access-login-card">
      <div class="access-login-brand"><img src="/assets/logo-estacao1.png?v=7.1" alt="Estação 1"><div><div class="eyebrow">acesso exclusivo para gestores</div><h1>Simulador Comercial</h1><p>Entre com as mesmas credenciais utilizadas no painel Gestor do CVCRM.</p></div></div>
      <form id="managerLoginForm" class="access-login-form">
        <div class="field"><label>E-mail do Gestor no CVCRM</label><input class="input" name="email" type="email" autocomplete="username" required></div>
        <div class="field"><label>Senha do Gestor no CVCRM</label><input class="input" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit">Entrar no simulador</button>
        <div id="managerLoginError" class="pre-reg-validation error" hidden></div>
      </form>
      <div class="access-security-note"><b>Segurança</b><span>A senha é usada somente para autenticação no CVCRM e não é gravada no portal. As ações realizadas após o login serão registradas no histórico.</span></div>
    </div></section>`;
  }

  function simulator() {
    const managerAuth = getManagerAuth();
    return (
      pageHead(
        "Simulação comercial",
        "Consulta do pré-cadastro",
        "Informe o ID da consulta aprovada ou condicionada. Os empreendimentos disponíveis serão apresentados do menor para o maior valor.",
      ) +
      `<section class="section"><div class="container">
      <div class="sim-user-bar"><div><span>Gestor autenticado</span><b>${escapeHtml(managerAuth.user?.name || "Gestor")}</b><small>ID ${escapeHtml(managerAuth.user?.id || "—")}</small></div><button id="managerLogoutBtn" class="btn secondary btn-small" type="button">Sair</button></div>
      <div class="sim-tabs">
        <button id="tabSimulator" class="sim-tab active" type="button">Simulador</button>
        <button id="tabPaymentPlan" class="sim-tab" type="button">Plano de Pagamento</button>
        <button id="tabPaymentConditions" class="sim-tab" type="button">Condições de Pagamento</button>
        <button id="tabAuditHistory" class="sim-tab" type="button">Histórico</button>
      </div>
      <div id="simulatorTab"><div class="sim-horizontal-panel">
        <div class="sim-horizontal-fields"><div class="field"><label>ID da consulta do pré-cadastro</label><input id="preRegistrationQueryId" class="input" inputmode="numeric" placeholder="Ex.: 12345" autocomplete="off"></div></div>
        <div class="sim-horizontal-actions"><button id="calcBtn" class="btn primary" type="button">Consultar e continuar</button></div>
      </div>
      <div id="simResult" class="sim-results sim-results-below"><div class="empty"><b>Consulte um pré-cadastro Aprovado ou Condicionado.</b><p>Os dados do titular e os valores aprovados serão importados automaticamente do CVCRM.</p></div></div></div>
      <div id="paymentPlanTab" hidden></div><div id="paymentConditionsTab" hidden></div><div id="auditHistoryTab" hidden></div>
    </div></section>`
    );
  }

  return { accessLogin, home, simulator };
}
