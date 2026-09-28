"use client";

import { useEffect } from "react";

export function SimulatorApplication() {
  useEffect(() => {
    void import("@/legacy/app");
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#simulador" aria-label="Estação 1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/logo-estacao1.png?v=7.1"
              alt="Estação 1"
              className="brand-logo"
            />
            <span className="brand-copy">
              <strong>Estação 1</strong>
              <small>Simulador Comercial</small>
            </span>
          </a>
          <div className="sync-pill" id="headerStatus">
            <span />Carregando
          </div>
        </div>
      </header>
      <main id="app" />
      <footer>
        <div className="footer-inner">
          <strong>Estação 1</strong>
          <span>Simulador comercial • Integração com CVCRM</span>
        </div>
      </footer>
      <div id="toast" className="toast" />
    </>
  );
}
