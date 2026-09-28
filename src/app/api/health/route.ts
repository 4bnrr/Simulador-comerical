import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    application: "estacao-1-simulador-next",
    cvcrmWriteEnabled: false,
  });
}
