import { NextResponse } from "next/server";
import { z } from "zod";

const simulationSchema = z.object({
  preRegistrationId: z.string().trim().min(1),
  unitId: z.string().trim().min(1),
  entryInstallments: z.number().int().min(1).max(48),
  firstDueDate: z.iso.date(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = simulationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        simulated: false,
        message: "Dados insuficientes para simular a reserva.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    simulated: true,
    sentToCvcrm: false,
    message: "Simulação validada localmente. Nenhum dado foi enviado ao CVCRM.",
    traceId: `SIM-PRE-${parsed.data.preRegistrationId}-UN-${parsed.data.unitId}`,
    input: parsed.data,
  });
}
