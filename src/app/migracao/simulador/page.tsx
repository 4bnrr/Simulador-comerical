import Image from "next/image";
import { PaymentSimulator } from "@/components/payment-plan/PaymentSimulator";

export default function MigratingSimulatorPage() {
  return (
    <>
      <header className="topbar">
        <div className="shell brand">
          <Image
            src="/assets/logo-estacao1.png"
            alt="Estação 1"
            width={42}
            height={42}
          />
          <span>
            <strong>Estação 1</strong>
            <small>Simulador Comercial • Migração Next.js</small>
          </span>
        </div>
      </header>
      <main>
        <section className="page-heading">
          <div className="shell">
            <span className="eyebrow">ambiente técnico de migração</span>
            <h1>Simulador Comercial</h1>
            <p>
              Área isolada para substituir gradualmente os módulos JavaScript
              sem alterar a tela utilizada pelos usuários.
            </p>
          </div>
        </section>
        <PaymentSimulator />
      </main>
    </>
  );
}
