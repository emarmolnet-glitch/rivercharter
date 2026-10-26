export const NGA_CARGO_DEPTH_METERS = Object.freeze({
  A: 21.6,
  B: 20.1,
  C: 18.6,
  D: 17.1,
  E: 15.5,
  F: 14.0,
  G: 12.5,
  H: 11.0,
  I: 9.4,
  J: 9.4,
  K: 7.9,
  L: 6.4,
  M: 4.9,
  N: 3.4,
  O: 0.0,
  P: 0.0,
  "": 0.0,
  " ": 0.0,
  UNKNOWN: 0.0,
} as const);

export type DraftValidationStatus = "CLEARED" | "OVERSIZED" | "DRAFT_REQUIRED" | "RISK_ACCEPTED";
export type DraftValidationBasis = "ACTUAL" | "MAXIMUM";

export interface DraftValidationResult {
  portName: string;
  portDepthCode: string;
  safeDepthMeters: number;
  vesselDraft: number;
  actualDraft: number | null;
  maxDraft: number | null;
  draftBasis: DraftValidationBasis;
  status: DraftValidationStatus;
  message: string;
  depthSource: "DATALASTIC" | "MANUAL" | "UNKNOWN";
  requiresManualDraft: boolean;
  riskAccepted: boolean;
}

type CargoDepthCode = keyof typeof NGA_CARGO_DEPTH_METERS;

function normalizeCargoDepthCode(value: unknown): CargoDepthCode {
  if (value === null || value === undefined) return "UNKNOWN";

  const uppercaseValue = String(value).toUpperCase();
  if (uppercaseValue in NGA_CARGO_DEPTH_METERS) {
    return uppercaseValue as CargoDepthCode;
  }

  const trimmedValue = uppercaseValue.trim();
  return trimmedValue in NGA_CARGO_DEPTH_METERS
    ? trimmedValue as CargoDepthCode
    : "UNKNOWN";
}

function firstPositiveDraft(...values: unknown[]) {
  for (const value of values) {
    const draft = Number(value);
    if (Number.isFinite(draft) && draft > 0) return draft;
  }
  return null;
}

export function validatePortDraft(input: {
  portName: string;
  portDepthCode?: unknown;
  safeDepthMeters?: unknown;
  depthSource?: "DATALASTIC" | "MANUAL";
  acceptUnknownDraft?: boolean;
  vesselDraft?: number;
  actualDraft?: number | null;
  calculatedDraft?: number | null;
  maxDraft?: number | null;
}): DraftValidationResult {
  const portDepthCode = normalizeCargoDepthCode(input.portDepthCode);
  const explicitSafeDepth = firstPositiveDraft(input.safeDepthMeters);
  const legacySafeDepth = NGA_CARGO_DEPTH_METERS[portDepthCode];
  const safeDepthMeters = explicitSafeDepth ?? (input.portDepthCode === undefined ? 0 : legacySafeDepth);
  const actualDraft = firstPositiveDraft(input.actualDraft, input.calculatedDraft);
  const maxDraft = firstPositiveDraft(input.maxDraft, input.vesselDraft);
  const draftBasis: DraftValidationBasis = actualDraft !== null ? "ACTUAL" : "MAXIMUM";
  const vesselDraft = actualDraft ?? maxDraft ?? 0;
  const hasSafeDepth = safeDepthMeters > 0;
  const riskAccepted = !hasSafeDepth && input.acceptUnknownDraft === true;
  const status: DraftValidationStatus = !hasSafeDepth
    ? (riskAccepted ? "RISK_ACCEPTED" : "DRAFT_REQUIRED")
    : vesselDraft > safeDepthMeters ? "OVERSIZED" : "CLEARED";
  const draftDescription = draftBasis === "ACTUAL"
    ? "calado operativo calculado"
    : "calado máximo del buque";

  const message = status === "CLEARED"
    ? `Calado OK: El ${draftDescription} (${vesselDraft.toFixed(2)} m) está dentro del calado operativo máximo de ${input.portName} (${safeDepthMeters.toFixed(2)} m).`
    : status === "OVERSIZED"
      ? `${input.portName}: el ${draftDescription} (${vesselDraft.toFixed(2)} m) supera el calado operativo máximo (${safeDepthMeters.toFixed(2)} m).`
      : status === "RISK_ACCEPTED"
        ? `${input.portName}: Datalastic no informó un calado operativo válido. El usuario aceptó continuar bajo riesgo operativo.`
        : `${input.portName}: Datalastic encontró el puerto y sus coordenadas, pero no informó un calado operativo válido. Introduce el calado manualmente o acepta el riesgo para continuar.`;

  return {
    portName: input.portName,
    portDepthCode,
    safeDepthMeters,
    vesselDraft,
    actualDraft,
    maxDraft,
    draftBasis,
    status,
    message,
    depthSource: explicitSafeDepth !== null ? (input.depthSource || "DATALASTIC") : "UNKNOWN",
    requiresManualDraft: status === "DRAFT_REQUIRED",
    riskAccepted,
  };
}

// ============================================================================
// RIVERCHARTER - DRAFT CONSTRAINT VALIDATOR FOR FLUVIAL CONVOYS
// ============================================================================

export interface FluvialBargeDraftInfo {
  id?: number | string;
  name?: string;
  capacity?: number;
  dynamicDraft?: number;
  dynamic_draft?: number;
  weightTons?: number;
}

export interface FluvialDraftValidationResult {
  isValid: boolean;
  isBlocked: boolean;
  error?: string;
  message: string;
  heaviestBarge?: {
    id?: number | string;
    name: string;
    capacity: number;
    dynamicDraft: number;
  };
  maxDynamicDraft: number;
  minWaterLevel: number;
  marginMeters: number;
}

/**
 * Validador de Calado Dinámico (Draft Constraint) para convoyes fluviales.
 * Compara el calado dinámico de la barcaza más pesada (o con mayor calado)
 * del convoy contra el min_water_level (estiaje de la ruta).
 * Si el calado supera el nivel de agua disponible, genera un resultado bloqueante.
 */
export function validateConvoyDynamicDraft(input: {
  barges: FluvialBargeDraftInfo[];
  minWaterLevel: number;
  riverName?: string;
}): FluvialDraftValidationResult {
  const { barges, minWaterLevel, riverName } = input;
  const safeMinWater = Number(minWaterLevel) || 0;

  if (!barges || barges.length === 0) {
    return {
      isValid: true,
      isBlocked: false,
      message: "Sin barcazas acopladas para validar calado dinámico.",
      maxDynamicDraft: 0,
      minWaterLevel: safeMinWater,
      marginMeters: safeMinWater,
    };
  }

  // Identificar la barcaza más pesada (por capacidad/peso) y la barcaza con calado dinámico máximo
  let maxDraft = 0;
  let heaviestBargeItem: FluvialBargeDraftInfo = barges[0];
  let maxCapacity = -1;

  for (const b of barges) {
    const draft = Number(b.dynamicDraft ?? b.dynamic_draft ?? 0);
    const capacity = Number(b.capacity ?? b.weightTons ?? 0);

    if (draft > maxDraft) {
      maxDraft = draft;
    }
    if (capacity > maxCapacity) {
      maxCapacity = capacity;
      heaviestBargeItem = b;
    }
  }

  const heaviestDraft = Number(heaviestBargeItem.dynamicDraft ?? heaviestBargeItem.dynamic_draft ?? 0);
  // El calado crítico a evaluar es el mayor calado del convoy (o el de la barcaza más pesada)
  const criticalDraft = Math.max(maxDraft, heaviestDraft);
  const marginMeters = Number((safeMinWater - criticalDraft).toFixed(2));
  const isBlocked = criticalDraft > safeMinWater;
  const bargeName = heaviestBargeItem.name || `Barcaza #${heaviestBargeItem.id || 'N/D'}`;
  const corridorText = riverName ? ` en la ruta "${riverName}"` : "";

  if (isBlocked) {
    const errorMsg = `Restricción Crítica de Calado Dinámico (Draft Constraint): El calado dinámico (${criticalDraft.toFixed(2)} m) de la barcaza más pesada (${bargeName}) supera el nivel mínimo de estiaje disponible (${safeMinWater.toFixed(2)} m)${corridorText}. Operación fluvial bloqueada por riesgo inminente de varadura.`;
    return {
      isValid: false,
      isBlocked: true,
      error: errorMsg,
      message: errorMsg,
      heaviestBarge: {
        id: heaviestBargeItem.id,
        name: bargeName,
        capacity: maxCapacity > 0 ? maxCapacity : Number(heaviestBargeItem.capacity || 0),
        dynamicDraft: criticalDraft,
      },
      maxDynamicDraft: criticalDraft,
      minWaterLevel: safeMinWater,
      marginMeters,
    };
  }

  const successMsg = `Calado Aprobado: El calado dinámico (${criticalDraft.toFixed(2)} m) de la barcaza ${bargeName} es seguro para el nivel de estiaje (${safeMinWater.toFixed(2)} m)${corridorText}. Margen de seguridad bajo quilla: ${marginMeters.toFixed(2)} m.`;
  return {
    isValid: true,
    isBlocked: false,
    message: successMsg,
    heaviestBarge: {
      id: heaviestBargeItem.id,
      name: bargeName,
      capacity: maxCapacity > 0 ? maxCapacity : Number(heaviestBargeItem.capacity || 0),
      dynamicDraft: criticalDraft,
    },
    maxDynamicDraft: criticalDraft,
    minWaterLevel: safeMinWater,
    marginMeters,
  };
}
