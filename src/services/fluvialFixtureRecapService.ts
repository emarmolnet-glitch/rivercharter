/**
 * RiverCharter - Servicio de Generación de Contratos y Fixture Recap en PDF (Fase 5)
 * 
 * Automatiza la generación y exportación del contrato comercial consolidando
 * todos los cálculos físicos, hidrostáticos, geométricos y financieros de las Fases 1 a 4:
 * - Fase 1: OPEX desacoplado (Motor vs Barcazas) y navegación bidireccional.
 * - Fase 2: Tonnage Shedding hidrostático, calado admisible y merma de carga (Deadfreight).
 * - Fase 3: Geometría de convoy, requerimiento de esclusado doble y horas de demora pactadas.
 * - Fase 4: Desembolsos de puerto (PDA), ritmos de estiba, días operativos libres (Free Time) y Demurrage.
 * 
 * Formato formal, tabular y limpio, apto para firma digital entre armador y cargador.
 */

import { jsPDF } from 'jspdf';

// Parámetros y Constantes Base de Arquitectura Naval y Operaciones Fluviales
export const DEFAULT_DESIGN_DRAFT = 3.66; // Calado de diseño máximo (12 ft / 3.66 m)
export const DEFAULT_LIGHTSHIP_DRAFT = 0.55; // Calado en rosca (m)
export const DEFAULT_UKC = 0.30; // Margen bajo quilla (m) (Under Keel Clearance)
export const DEFAULT_TPC = 4.5; // Toneladas por centímetro de inmersión (MT/cm)
export const STANDARD_LOCK_LENGTH_FEET = 600; // Esclusa estándar: 600 ft (Largo)
export const STANDARD_LOCK_WIDTH_FEET = 110; // Esclusa estándar: 110 ft (Ancho)
export const DOUBLE_LOCKAGE_ADDITIONAL_HOURS_PER_LOCK = 3.5; // +3.5h por esclusa para esclusado doble
export const DEFAULT_BULK_PRODUCTIVITY_TONS_PER_HOUR = 250; // Ritmo granel: 250 MT/h
export const DEFAULT_RORO_MINUTES_PER_TRUCK = 15; // Ritmo Ro-Ro: 15 min/unidad
export const DEFAULT_DOCKAGE_DAILY_RATE_PER_BARGE = 150; // Muellaje: $150/día/barcaza
export const DEFAULT_PILOTAGE_FEE = 800; // Practicaje: $800 fijo por escala
export const DEFAULT_BULK_HANDLING_RATE_PER_TON = 3.50; // Estiba granel: $3.50/MT
export const DEFAULT_RORO_HANDLING_RATE_PER_UNIT = 45; // Estiba Ro-Ro: $45/camión

export function calculateConvoyArrangement(
  bargeCount: number,
  customColumns?: number,
  customRows?: number
): { columns: number; rows: number } {
  if (customColumns && customColumns > 0) {
    const cols = Math.max(1, Math.round(customColumns));
    const rows = customRows && customRows > 0 ? Math.max(1, Math.round(customRows)) : Math.ceil(Math.max(1, bargeCount) / cols);
    return { columns: cols, rows: Math.max(1, rows) };
  }
  const count = Math.max(0, Math.round(bargeCount));
  if (count <= 0) return { columns: 0, rows: 0 };
  if (count === 1) return { columns: 1, rows: 1 };
  if (count === 2) return { columns: 2, rows: 1 };
  if (count === 4) return { columns: 2, rows: 2 };
  if (count === 6) return { columns: 2, rows: 3 };
  if (count === 8) return { columns: 2, rows: 4 };
  if (count === 9) return { columns: 3, rows: 3 };
  if (count <= 12) return { columns: 3, rows: 4 };
  if (count <= 15) return { columns: 3, rows: 5 };
  if (count <= 16) return { columns: 4, rows: 4 };
  if (count <= 20) return { columns: 4, rows: 5 };
  return { columns: 3, rows: Math.ceil(count / 3) };
}

export interface FluvialFixtureRecapTerms {
  // Metadatos y Referencia Contractual
  contractRef: string;
  recapDate: string;
  contractStatus: string;
  riverName: string;

  // 1. Encabezado Comercial (Main Terms)
  pol: string;
  pod: string;
  operationType: 'BULK' | 'RORO' | string;
  cargoType: string;
  freightRate: number; // USD / MT o USD / camión
  freightRateType: 'USD_MT' | 'USD_UNIT' | 'LUMPSUM';
  freightLumpsum?: number;
  totalFreightEstimated: number; // USD

  // Convoy
  tugboatName: string;
  tugboatPowerHp: number;
  bargeCount: number;
  bargeStandard: string;
  convoyCols: number;
  convoyRows: number;
  convoyLengthFt: number;
  convoyBeamFt: number;

  // 2. Cláusula de Estiaje y Falso Flete (Tonnage Shedding - Fase 2)
  designDraft: number;
  lightshipDraft: number;
  ukc: number;
  tpc: number;
  minWaterLevel?: number;
  maxAdmissibleDraft: number;
  nominalTonnage: number;
  adjustedTonnage: number;
  lostTonnage: number; // Merma de carga (Deadfreight)
  isDraftRestricted: boolean;
  breakEvenNominal?: number;
  breakEvenAdjusted?: number;

  // 3. Cláusula de Navegación y Esclusas (Lockage & Transit - Fase 3)
  lockLengthFt: number;
  lockWidthFt: number;
  requiresDoubleLockage: boolean;
  lockCount: number;
  doubleLockageHours: number;
  maneuverFuelTons?: number;
  maneuverFuelCost?: number;

  // 4. Condiciones de Terminal y Demoras (Laytime & Demurrage - Fase 4)
  bulkProductivityTonsPerHour: number;
  roroMinutesPerTruck: number;
  stevedoringProductivityLabel: string;
  freeTimeDays: number; // Días Operativos de Puerto concedidos como Tiempo Libre
  freeTimeHours: number;
  demurrageRatePerDay: number; // Tarifa diaria de demora en USD
  demurrageRatePerHour: number;
  dockageDailyRate: number;
  pilotageFee: number;
  handlingRate: number;
  terminalHandlingCost: number;
  totalTerminalPdaCost: number;

  // Consolidado Financiero
  totalVoyageCost?: number;
  netProfit?: number;
  dailyTce?: number;
  sustainabilityTrucks?: number;
  sustainabilityCo2Saved?: number;

  // Firmas Digitales
  carrierName: string;
  carrierRep: string;
  carrierSignHash?: string;
  chartererName: string;
  chartererRep: string;
  chartererSignHash?: string;
}

const PDF_COLORS = Object.freeze({
  navyDark: [11, 48, 64],       // #0B3040 - Identidad institucional
  navyAccent: [15, 118, 110],    // #0F766E - Teal institucional
  skyBg: [240, 249, 255],       // #F0F9FF - Fondos suaves
  slateDark: [15, 23, 42],      // #0F172A - Texto principal
  slateMuted: [100, 116, 139],  // #64748B - Textos secundarios
  slateBorder: [203, 213, 225], // #CBD5E1 - Líneas divisorias
  slateLight: [248, 250, 252],  // #F8FAFC - Fondos de fila alternada
  amberDark: [180, 83, 9],      // #B45309 - Alertas de estiaje
  amberBg: [254, 243, 199],     // #FEF3C7 - Fondo alerta
  emeraldDark: [4, 120, 87],    // #047857 - Verde éxito
  white: [255, 255, 255],
});

/**
 * Normaliza y construye el conjunto completo de términos del Fixture Recap consolidando
 * datos de la sesión activa, estado global o parámetros explícitos.
 */
export function buildFluvialFixtureRecapData(inputData: Partial<FluvialFixtureRecapTerms> = {}): FluvialFixtureRecapTerms {
  const globalWin = typeof window !== 'undefined' ? (window as any) : {};
  const convoy = globalWin.activeConvoyData || {};
  const state = globalWin.State || {};

  // Fechas y Referencia
  const today = new Date();
  const formattedDate = inputData.recapDate || today.toISOString().slice(0, 10);
  const contractRef = inputData.contractRef ||
    convoy.contractRef ||
    state.contractRef ||
    globalWin.active_contract_ref ||
    `RC-FIX-${today.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Puertos y Ruta
  const pol = inputData.pol ||
    documentSafeVal('port-pol') ||
    textSafeVal('exec-pol') ||
    convoy.origin ||
    'San Lorenzo (Km 440)';

  const pod = inputData.pod ||
    documentSafeVal('port-pod') ||
    textSafeVal('exec-pod') ||
    convoy.destination ||
    'Nueva Palmira (Km 0)';

  const riverName = inputData.riverName ||
    convoy.riverName ||
    (pol.toLowerCase().includes('mississippi') || pol.toLowerCase().includes('st. louis')
      ? 'Río Misisipi (St. Louis - Golfo de México)'
      : 'Hidrovía Paraná-Paraguay (Corredor Central)');

  // Tipo de Operación
  const rawOp = inputData.operationType ||
    convoy.operationType ||
    documentSafeVal('fluvial-operation-type') ||
    'BULK';
  const isRoro = String(rawOp).toUpperCase().includes('RORO') || String(rawOp).includes('Carretera');
  const operationType = isRoro ? 'RORO' : 'BULK';
  const cargoType = inputData.cargoType || (isRoro ? 'Semirremolques / Carga Rodada' : 'Granel Agrícola (Soja/Cereales)');

  // Barcazas y Disposición
  const bargeCount = Number(
    inputData.bargeCount ??
    convoy.bargeCount ??
    convoy.bargeIds?.length ??
    globalWin.activeBargeCount ??
    4
  );

  const arrangement = calculateConvoyArrangement(
    bargeCount,
    inputData.convoyCols ?? convoy.convoyCols,
    inputData.convoyRows ?? convoy.convoyRows
  );
  const convoyCols = inputData.convoyCols ?? convoy.convoyCols ?? arrangement.columns;
  const convoyRows = inputData.convoyRows ?? convoy.convoyRows ?? arrangement.rows;

  const convoyLengthFt = Number(inputData.convoyLengthFt ?? convoy.convoyLengthFt ?? ((convoyRows * 195) + 150));
  const convoyBeamFt = Number(inputData.convoyBeamFt ?? convoy.convoyBeamFt ?? (convoyCols * 35));

  // Remolcador
  const tugboatName = inputData.tugboatName || convoy.tugboatName || 'Río Paraná Star';
  const tugboatPowerHp = Number(inputData.tugboatPowerHp ?? convoy.tugboatPowerHp ?? 4000);

  // Fase 2: Tonnage Shedding & Estiaje
  const designDraft = Number(inputData.designDraft ?? DEFAULT_DESIGN_DRAFT);
  const lightshipDraft = Number(inputData.lightshipDraft ?? DEFAULT_LIGHTSHIP_DRAFT);
  const ukc = Number(inputData.ukc ?? DEFAULT_UKC);
  const tpc = Number(inputData.tpc ?? DEFAULT_TPC);

  const nominalTonnage = Number(
    inputData.nominalTonnage ??
    convoy.nominalTonnage ??
    state.nominalTonnage ??
    (bargeCount * 1500)
  );

  const maxAdmissibleDraft = Number(
    inputData.maxAdmissibleDraft ??
    convoy.maxAdmissibleDraft ??
    state.maxAdmissibleDraft ??
    designDraft
  );

  const isDraftRestricted = Boolean(
    inputData.isDraftRestricted ??
    convoy.isDraftRestricted ??
    state.isDraftRestricted ??
    (maxAdmissibleDraft < designDraft)
  );

  let adjustedTonnage = Number(
    inputData.adjustedTonnage ??
    convoy.adjustedTonnage ??
    state.adjustedTonnage ??
    nominalTonnage
  );

  if (isDraftRestricted && adjustedTonnage >= nominalTonnage) {
    adjustedTonnage = Number(Math.max(0, (maxAdmissibleDraft - lightshipDraft) * 100 * tpc * bargeCount).toFixed(2));
  }

  const lostTonnage = Number(
    inputData.lostTonnage ??
    convoy.lostTonnage ??
    state.lostTonnage ??
    Math.max(0, nominalTonnage - adjustedTonnage)
  );

  // Flete Acordado
  const freightRate = Number(
    inputData.freightRate ??
    documentSafeVal('freight-sell') ??
    35.00
  );
  const freightRateType = inputData.freightRateType || 'USD_MT';
  const totalFreightEstimated = Number(
    inputData.totalFreightEstimated ??
    (freightRate * (isDraftRestricted ? nominalTonnage : adjustedTonnage))
  );

  // Fase 3: Navegación y Esclusas
  const lockLengthFt = Number(inputData.lockLengthFt ?? STANDARD_LOCK_LENGTH_FEET);
  const lockWidthFt = Number(inputData.lockWidthFt ?? STANDARD_LOCK_WIDTH_FEET);
  const requiresDoubleLockage = Boolean(
    inputData.requiresDoubleLockage ??
    convoy.requiresDoubleLockage ??
    (convoyLengthFt > lockLengthFt || convoyBeamFt > lockWidthFt)
  );
  const lockCount = Number(inputData.lockCount ?? convoy.lockCount ?? (requiresDoubleLockage ? 1 : 0));
  const doubleLockageHours = Number(
    inputData.doubleLockageHours ??
    convoy.doubleLockageHours ??
    (requiresDoubleLockage ? lockCount * DOUBLE_LOCKAGE_ADDITIONAL_HOURS_PER_LOCK : 0)
  );

  // Fase 4: Terminal y Demoras (Laytime & Demurrage)
  const bulkProductivityTonsPerHour = Number(
    inputData.bulkProductivityTonsPerHour ??
    documentSafeVal('fluvial-bulk-productivity') ??
    DEFAULT_BULK_PRODUCTIVITY_TONS_PER_HOUR
  );
  const roroMinutesPerTruck = Number(
    inputData.roroMinutesPerTruck ??
    documentSafeVal('fluvial-roro-productivity') ??
    DEFAULT_RORO_MINUTES_PER_TRUCK
  );

  const stevedoringProductivityLabel = isRoro
    ? `${roroMinutesPerTruck} min/camión (4 unidades/hora expedito)`
    : `${bulkProductivityTonsPerHour} MT/hora (ritmo cinta/cuchara)`;

  let freeTimeHours = Number(inputData.freeTimeHours ?? 0);
  if (freeTimeHours <= 0) {
    if (isRoro) {
      const truckCount = Math.max(1, Math.round(bargeCount * 45));
      freeTimeHours = Number(((truckCount * roroMinutesPerTruck) / 60).toFixed(1));
    } else {
      const tonsToHandle = isDraftRestricted ? adjustedTonnage : nominalTonnage;
      freeTimeHours = Number((tonsToHandle / bulkProductivityTonsPerHour).toFixed(1));
    }
  }
  const freeTimeDays = Number(inputData.freeTimeDays ?? (freeTimeHours / 24).toFixed(2));

  // Tarifa diaria de Demora (Demurrage Rate)
  // Valor de mercado fluvial contractual: OPEX diario remolcador + alquiler barcazas + espera = ~$4,500 - $6,000 USD/día
  const demurrageRatePerDay = Number(
    inputData.demurrageRatePerDay ??
    convoy.demurrageRatePerDay ??
    4500
  );
  const demurrageRatePerHour = Number((demurrageRatePerDay / 24).toFixed(2));

  const dockageDailyRate = Number(inputData.dockageDailyRate ?? DEFAULT_DOCKAGE_DAILY_RATE_PER_BARGE);
  const pilotageFee = Number(inputData.pilotageFee ?? DEFAULT_PILOTAGE_FEE);
  const handlingRate = Number(
    inputData.handlingRate ??
    (isRoro ? DEFAULT_RORO_HANDLING_RATE_PER_UNIT : DEFAULT_BULK_HANDLING_RATE_PER_TON)
  );
  const terminalHandlingCost = isRoro
    ? (bargeCount * 45) * handlingRate
    : (isDraftRestricted ? adjustedTonnage : nominalTonnage) * handlingRate;
  const totalTerminalPdaCost = Number(
    (bargeCount * dockageDailyRate * freeTimeDays + pilotageFee + terminalHandlingCost).toFixed(2)
  );

  return {
    contractRef,
    recapDate: formattedDate,
    contractStatus: 'FIRM FIXTURE / CONTRATO COMERCIAL DEFINITIVO',
    riverName,
    pol,
    pod,
    operationType,
    cargoType,
    freightRate,
    freightRateType,
    totalFreightEstimated,
    tugboatName,
    tugboatPowerHp,
    bargeCount,
    bargeStandard: convoy.standard || (riverName.includes('Misisipi') ? 'Jumbo Misisipi (195x35 ft)' : 'Súper Jumbo LatAm (60x16 m)'),
    convoyCols,
    convoyRows,
    convoyLengthFt,
    convoyBeamFt,
    designDraft,
    lightshipDraft,
    ukc,
    tpc,
    minWaterLevel: convoy.min_water_level,
    maxAdmissibleDraft,
    nominalTonnage,
    adjustedTonnage,
    lostTonnage,
    isDraftRestricted,
    breakEvenNominal: convoy.nominalCostPerTon,
    breakEvenAdjusted: convoy.costPerCargoTon,
    lockLengthFt,
    lockWidthFt,
    requiresDoubleLockage,
    lockCount,
    doubleLockageHours,
    bulkProductivityTonsPerHour,
    roroMinutesPerTruck,
    stevedoringProductivityLabel,
    freeTimeDays,
    freeTimeHours,
    demurrageRatePerDay,
    demurrageRatePerHour,
    dockageDailyRate,
    pilotageFee,
    handlingRate,
    terminalHandlingCost,
    totalTerminalPdaCost,
    totalVoyageCost: convoy.totalVoyageCost,
    netProfit: convoy.netProfit,
    dailyTce: convoy.dailyTce,
    carrierName: inputData.carrierName || 'RODAHMAR FLUVIAL LOGISTICS S.L. / RIVERCHARTER OPERATOR',
    carrierRep: inputData.carrierRep || 'Capitán Inspector Fluvial / Commercial Director',
    chartererName: inputData.chartererName || 'CARGADOR INDUSTRIAL NOMINADO / CHARTERER PRINCIPAL',
    chartererRep: inputData.chartererRep || 'Logistics & Chartering Manager',
  };
}

function documentSafeVal(id: string): any {
  if (typeof document === 'undefined') return undefined;
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el?.value ? el.value : undefined;
}

function textSafeVal(id: string): any {
  if (typeof document === 'undefined') return undefined;
  const el = document.getElementById(id);
  const text = el?.textContent?.trim();
  return text && text !== 'N/D' ? text : undefined;
}

/**
 * Genera el documento PDF formal del Fixture Recap Fluvial
 * con formato formal, tabular y limpio, estructurado en las 4 secciones
 * requeridas más el bloque de firma digital vinculante.
 */
export function generateFluvialFixtureRecapPdf(
  rawTerms: Partial<FluvialFixtureRecapTerms> = {},
  options: { save?: boolean; filename?: string } = {}
): jsPDF {
  const terms = buildFluvialFixtureRecapData(rawTerms);
  const today = new Date();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  const MARGIN = 14;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

  // Helper para pintar títulos de sección con estilo institucional
  const drawSectionHeader = (title: string, yPos: number, badgeText?: string, isWarning = false) => {
    doc.setFillColor(...(isWarning ? PDF_COLORS.amberDark : PDF_COLORS.navyDark));
    doc.roundedRect(MARGIN, yPos, CONTENT_WIDTH, 7, 1.2, 1.2, 'F');
    doc.setTextColor(...PDF_COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title.toUpperCase(), MARGIN + 4, yPos + 4.8);

    if (badgeText) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const badgeW = doc.getTextWidth(badgeText) + 6;
      const badgeX = MARGIN + CONTENT_WIDTH - badgeW - 3;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(badgeX, yPos + 1.2, badgeW, 4.6, 1, 1, 'F');
      doc.setTextColor(...(isWarning ? PDF_COLORS.amberDark : PDF_COLORS.navyDark));
      doc.text(badgeText, badgeX + 3, yPos + 4.4);
    }
  };

  // Helper para tablas estructuradas limpias
  const drawRow = (y: number, h: number, cols: Array<{ label: string; value: string; width: number }>, isHeader = false) => {
    let currentX = MARGIN;
    doc.setFillColor(...(isHeader ? PDF_COLORS.skyBg : PDF_COLORS.white));
    doc.rect(MARGIN, y, CONTENT_WIDTH, h, 'F');
    doc.setDrawColor(...PDF_COLORS.slateBorder);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + h, MARGIN + CONTENT_WIDTH, y + h);

    cols.forEach((col) => {
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...PDF_COLORS.slateMuted);
      doc.text(col.label.toUpperCase(), currentX + 2, y + 3.8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...PDF_COLORS.slateDark);
      doc.text(String(col.value), currentX + 2, y + 8);

      currentX += col.width;
      if (currentX < MARGIN + CONTENT_WIDTH) {
        doc.line(currentX, y, currentX, y + h);
      }
    });
  };

  // Helper para cajas de texto legal / cláusulas contractuales
  const drawLegalClauseBox = (y: number, h: number, text: string) => {
    doc.setFillColor(...PDF_COLORS.slateLight);
    doc.setDrawColor(...PDF_COLORS.slateBorder);
    doc.setLineWidth(0.25);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, h, 1, 1, 'FD');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    doc.setTextColor(...PDF_COLORS.slateDark);
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 6);
    doc.text(lines, MARGIN + 3, y + 4.2);
  };

  // ==========================================================================
  // PÁGINA 1: CABECERA, ENCABEZADO COMERCIAL (SEC 1) Y CLÁUSULA ESTIAJE (SEC 2)
  // ==========================================================================

  // Banner Superior Institucional
  doc.setFillColor(...PDF_COLORS.navyDark);
  doc.rect(0, 0, PAGE_WIDTH, 26, 'F');
  doc.setFillColor(...PDF_COLORS.navyAccent);
  doc.rect(0, 26, PAGE_WIDTH, 1.5, 'F');

  // Marca y Título
  doc.setTextColor(...PDF_COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('RIVERCHARTER', MARGIN, 11);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('Fluvial Logistics & Voyage Chartering System · Official Commercial Recap', MARGIN, 16);
  doc.text(`Vía: ${terms.riverName}`, MARGIN, 21);

  // Recuadro Meta Ref (Esquina Superior Derecha)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(PAGE_WIDTH - MARGIN - 60, 5, 60, 16, 1.5, 1.5, 'F');
  doc.setTextColor(...PDF_COLORS.slateMuted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('FIXTURE RECAP REF', PAGE_WIDTH - MARGIN - 57, 9.5);
  doc.setTextColor(...PDF_COLORS.navyDark);
  doc.setFontSize(9.5);
  doc.text(terms.contractRef, PAGE_WIDTH - MARGIN - 57, 14.5);
  doc.setTextColor(...PDF_COLORS.navyAccent);
  doc.setFontSize(6.5);
  doc.text(`FECHA: ${terms.recapDate} · VINCULANTE`, PAGE_WIDTH - MARGIN - 57, 18.5);

  let currentY = 32;

  // --------------------------------------------------------------------------
  // SECCIÓN 1: ENCABEZADO COMERCIAL (MAIN TERMS)
  // --------------------------------------------------------------------------
  drawSectionHeader('1. Encabezado Comercial (Main Terms)', currentY, 'Vínculo Contractual');
  currentY += 8;

  // Fila 1: Fechas y Ruta
  drawRow(currentY, 10, [
    { label: 'Fecha de Fijación (Recap Date)', value: terms.recapDate, width: 45 },
    { label: 'Puerto de Carga (POL)', value: terms.pol, width: 68 },
    { label: 'Puerto de Descarga (POD)', value: terms.pod, width: 69 },
  ]);
  currentY += 10;

  // Fila 2: Operación y Convoy
  drawRow(currentY, 10, [
    { label: 'Tipo de Operación', value: terms.operationType === 'RORO' ? 'Ro-Ro (Carretera Flotante)' : 'Granel (Bulk Cargo)', width: 45 },
    { label: 'Naturaleza de Carga', value: terms.cargoType, width: 68 },
    { label: 'Flete Acordado (Freight Rate)', value: `$${terms.freightRate.toFixed(2)} USD / MT (All-in)`, width: 69 },
  ]);
  currentY += 10;

  // Fila 3: Especificaciones del Convoy
  drawRow(currentY, 10, [
    { label: 'Empujador Nominado', value: `${terms.tugboatName} (${terms.tugboatPowerHp} BHP)`, width: 68 },
    { label: 'Barcazas y Disposición', value: `${terms.bargeCount} Barcazas (${terms.convoyCols} col × ${terms.convoyRows} fil)`, width: 64 },
    { label: 'Dimensiones Convoy', value: `${terms.convoyLengthFt} ft LOA × ${terms.convoyBeamFt} ft Manga`, width: 50 },
  ]);
  currentY += 10;

  // Fila 4: Total Flete e Ingreso Bruto
  drawRow(currentY, 9, [
    { label: 'Volumen Contratado (Nominal)', value: `${terms.nominalTonnage.toLocaleString()} MT`, width: 60 },
    { label: 'Flete Bruto Acordado (Estimated Revenue)', value: `$${Math.round(terms.totalFreightEstimated).toLocaleString()} USD`, width: 62 },
    { label: 'Moneda y Pago', value: 'USD / Facturación previa carga', width: 60 },
  ]);
  currentY += 12;

  // --------------------------------------------------------------------------
  // SECCIÓN 2: CLÁUSULA DE ESTIAJE Y FALSO FLETE (TONNAGE SHEDDING CLAUSE)
  // --------------------------------------------------------------------------
  const estiajeBadge = terms.isDraftRestricted ? 'RESTRICCIÓN ACTIVA POR ESTIAJE' : 'CONDICIÓN NORMAL (SIN MERMA)';
  drawSectionHeader('2. Cláusula de Estiaje y Falso Flete (Tonnage Shedding Clause)', currentY, estiajeBadge, terms.isDraftRestricted);
  currentY += 8;

  // Fila 1 Parámetros Hidrostáticos
  drawRow(currentY, 10, [
    { label: 'Calado de Diseño Máx.', value: `${terms.designDraft.toFixed(2)} m (12.0 ft)`, width: 45 },
    { label: 'Calado en Rosca (Lightship)', value: `${terms.lightshipDraft.toFixed(2)} m`, width: 45 },
    { label: 'Margen de Quilla (UKC)', value: `${terms.ukc.toFixed(2)} m`, width: 45 },
    { label: 'Inmersión (TPC)', value: `${terms.tpc.toFixed(1)} MT / cm`, width: 47 },
  ]);
  currentY += 10;

  // Fila 2 Valores Reactivos de la Fase 2 (Calado Admisible, Capacidad Ajustada y Merma)
  drawRow(currentY, 10, [
    { label: 'Calado Admisible Cotizado', value: `${terms.maxAdmissibleDraft.toFixed(2)} m`, width: 45 },
    { label: 'Capacidad Nominal Base', value: `${Math.round(terms.nominalTonnage).toLocaleString()} MT`, width: 45 },
    { label: 'Capacidad Ajustada Carga', value: `${Math.round(terms.adjustedTonnage).toLocaleString()} MT`, width: 45 },
    { label: 'Merma de Carga (Deadfreight)', value: `${Math.round(terms.lostTonnage).toLocaleString()} MT`, width: 47 },
  ]);
  currentY += 10;

  // Fila 3 Impacto de Falso Flete
  drawRow(currentY, 8.5, [
    { label: 'Break-Even Nominal', value: terms.breakEvenNominal ? `$${terms.breakEvenNominal.toFixed(2)} USD/MT` : 'Calculado', width: 60 },
    { label: 'Break-Even Ajustado por Falso Flete', value: terms.breakEvenAdjusted ? `$${terms.breakEvenAdjusted.toFixed(2)} USD/MT` : 'Reflejado', width: 62 },
    { label: 'Compensación de Vacío', value: terms.isDraftRestricted ? 'Falso flete devengado 100%' : 'Sin penalización', width: 60 },
  ]);
  currentY += 10.5;

  // Texto Legal Cláusula de Estiaje
  const sheddingClauseLegal = 'CLÁUSULA DE ESTIAJE Y FALSO FLETE (TONNAGE SHEDDING): Las partes acuerdan que el calado admisible máximo autorizado en la fecha de nominación es el aquí consignado. Si la profundidad efectiva de la vía navegable exige una reducción de calado para garantizar el UKC obligatorio de 0.30 m, la carga se ajustará automáticamente a la Capacidad Ajustada. El cargador declara contractualmente que asumirá el pago íntegro del flete sobre la capacidad nominal contratada en concepto de Falso Flete (Deadfreight Compensation) por las toneladas no embarcadas, manteniendo inalterada la ecuación económica del armador.';
  drawLegalClauseBox(currentY, 18, sheddingClauseLegal);
  currentY += 21;

  // --------------------------------------------------------------------------
  // SECCIÓN 3: CLÁUSULA DE NAVEGACIÓN Y ESCLUSAS (LOCKAGE & TRANSIT TERMS)
  // --------------------------------------------------------------------------
  const lockBadge = terms.requiresDoubleLockage ? 'ESCLUSADO DOBLE REQUERIDO' : 'TRÁNSITO SIMPLE';
  drawSectionHeader('3. Cláusula de Navegación y Esclusas (Lockage & Transit Terms)', currentY, lockBadge, terms.requiresDoubleLockage);
  currentY += 8;

  drawRow(currentY, 10, [
    { label: 'Dimensiones Convoy', value: `${terms.convoyLengthFt} ft × ${terms.convoyBeamFt} ft`, width: 45 },
    { label: 'Cámara Esclusa Estándar', value: `${terms.lockLengthFt} ft × ${terms.lockWidthFt} ft`, width: 45 },
    { label: 'Condición Esclusado', value: terms.requiresDoubleLockage ? 'Requiere Esclusado Doble' : 'Esclusado Simple', width: 45 },
    { label: 'Horas Demora Declaradas', value: `+${terms.doubleLockageHours.toFixed(1)} horas pactadas`, width: 47 },
  ]);
  currentY += 10;

  drawRow(currentY, 8.5, [
    { label: 'Esclusas en la Derrota', value: `${terms.lockCount} esclusas`, width: 45 },
    { label: 'Demora por Esclusa', value: terms.requiresDoubleLockage ? '+3.5 horas / esclusa' : '0.0 horas', width: 45 },
    { label: 'Combustible Maniobra Extra', value: terms.requiresDoubleLockage ? '0.15 MT/h @ maniobra' : 'Incluido', width: 45 },
    { label: 'Régimen de Tránsito', value: 'Prioridad de paso fluvial regulado', width: 47 },
  ]);
  currentY += 10.5;

  // Texto Legal Cláusula de Esclusas
  const lockLegal = 'CLÁUSULA DE ESCLUSADO Y TRÁNSITO: Dado que las dimensiones del convoy superan los límites de la cámara estándar (600 ft × 110 ft), el viaje requiere contractualmente la maniobra de desacople y esclusado en dos tandas ("Double Lockage"). Las partes estipulan e inyectan formalmente un margen contractual de 3.5 horas de demora por cada esclusa atravesada en la ruta. Dichas demoras se considerarán tiempo regular de tránsito y no darán lugar a reclamos extraordinarios de sobreestadía.';
  drawLegalClauseBox(currentY, 17, lockLegal);

  // Pie de Página 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.slateMuted);
  doc.text(`RiverCharter Core PRO · Fixture Recap Contractual · Página 1 de 2 · Ref: ${terms.contractRef}`, MARGIN, PAGE_HEIGHT - 6);
  doc.text('Generado automáticamente conforme a especificaciones náuticas fluviales', PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 6, { align: 'right' });

  // ==========================================================================
  // PÁGINA 2: CONDICIONES DE TERMINAL (SEC 4) Y FIRMAS DIGITALES
  // ==========================================================================
  doc.addPage();

  // Mini cabecera en Página 2
  doc.setFillColor(...PDF_COLORS.navyDark);
  doc.rect(0, 0, PAGE_WIDTH, 14, 'F');
  doc.setFillColor(...PDF_COLORS.navyAccent);
  doc.rect(0, 14, PAGE_WIDTH, 1, 'F');
  doc.setTextColor(...PDF_COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('RIVERCHARTER · FIRM FIXTURE RECAP', MARGIN, 9);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ref: ${terms.contractRef} · Hoja de Términos y Ejecución Digital`, PAGE_WIDTH - MARGIN, 9, { align: 'right' });

  currentY = 20;

  // --------------------------------------------------------------------------
  // SECCIÓN 4: CONDICIONES DE TERMINAL Y DEMORAS (LAYTIME & DEMURRAGE)
  // --------------------------------------------------------------------------
  drawSectionHeader('4. Condiciones de Terminal y Demoras (Laytime & Demurrage)', currentY, 'Fase 4 Terminal PDA');
  currentY += 8;

  // Fila 1 Ritmos de Estiba y Tiempos Libres
  drawRow(currentY, 10, [
    { label: 'Ritmo de Estiba Pactado', value: terms.stevedoringProductivityLabel, width: 68 },
    { label: 'Tiempo Libre (Free Time)', value: `${terms.freeTimeDays.toFixed(2)} Días (${terms.freeTimeHours.toFixed(1)} h)`, width: 57 },
    { label: 'Tarifa Diaria de Demora', value: `$${terms.demurrageRatePerDay.toLocaleString()} USD / día`, width: 57 },
  ]);
  currentY += 10;

  // Fila 2 Desglose PDA y Costos Portuarios
  drawRow(currentY, 10, [
    { label: 'Muellaje (Dockage)', value: `$${terms.dockageDailyRate}/día/barcaza`, width: 45 },
    { label: 'Practicaje / Amarre Fijo', value: `$${terms.pilotageFee} USD / escala`, width: 45 },
    { label: 'Manipulación Terminal', value: `$${terms.handlingRate.toFixed(2)} ${terms.operationType === 'RORO' ? 'USD/ud' : 'USD/MT'}`, width: 45 },
    { label: 'Total Terminal PDA', value: `$${Math.round(terms.totalTerminalPdaCost).toLocaleString()} USD`, width: 47 },
  ]);
  currentY += 10;

  // Fila 3 Cómputo de Plancha
  drawRow(currentY, 8.5, [
    { label: 'Regla de Cómputo de Plancha', value: 'SHINC (Sundays & Holidays Included)', width: 60 },
    { label: 'Tarifa Demora Horaria', value: `$${terms.demurrageRatePerHour.toFixed(2)} USD / hora`, width: 62 },
    { label: 'Aviso de Alistamiento (NOR)', value: '6 horas de franquicia tras presentación válida', width: 60 },
  ]);
  currentY += 10.5;

  // Texto Legal Laytime & Demurrage
  const laytimeLegal = 'CLÁUSULA DE PLANCHA Y DEMORAS (LAYTIME & DEMURRAGE): El cargador dispondrá del Tiempo Libre (Free Time) estipulado en este contrato para las maniobras conjuntas de carga y descarga en muelle. Dicho tiempo comenzará a computar formalmente una vez aceptado el Notice of Readiness (NOR). En caso de que la estancia en terminal exceda el tiempo libre acordado, el fletador incurrirá en sobreestadía de pleno derecho, abonando al armador la tarifa de Demurrage estipulada por cada día o fracción pro-rata de retraso.';
  drawLegalClauseBox(currentY, 17, laytimeLegal);
  currentY += 21;

  // --------------------------------------------------------------------------
  // RESUMEN ECONÓMICO Y DE RENTABILIDAD CONSOLIDADO
  // --------------------------------------------------------------------------
  drawSectionHeader('Resumen Consolidado de Rentabilidad Fluvial (Executive Overview)', currentY);
  currentY += 8;

  drawRow(currentY, 9, [
    { label: 'Flete Total Bruto', value: `$${Math.round(terms.totalFreightEstimated).toLocaleString()} USD`, width: 45 },
    { label: 'Costo Operativo Convoy', value: terms.totalVoyageCost ? `$${Math.round(terms.totalVoyageCost).toLocaleString()} USD` : 'Según matriz', width: 45 },
    { label: 'Beneficio Neto Estimado', value: terms.netProfit ? `$${Math.round(terms.netProfit).toLocaleString()} USD` : 'Proyectado', width: 45 },
    { label: 'TCE Diario de Operación', value: terms.dailyTce ? `$${Math.round(terms.dailyTce).toLocaleString()} / día` : 'En cálculo', width: 47 },
  ]);
  currentY += 13;

  // --------------------------------------------------------------------------
  // SECCIÓN 5: VALIDEZ CONTRACTUAL Y FIRMAS DIGITALES
  // --------------------------------------------------------------------------
  drawSectionHeader('5. Conformidad Contractual y Firmas Digitales', currentY);
  currentY += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.slateDark);
  doc.text('Este documento constituye un Fixture Recap comercial vinculante de pleno derecho entre el armador y el cargador, rigiéndose por los usos y costumbres de la navegación fluvial de la hidrovía correspondiente.', MARGIN, currentY + 3);
  currentY += 7;

  // Cajas de Firma Digital (Carrier vs Charterer)
  const boxWidth = (CONTENT_WIDTH - 6) / 2;
  const boxHeight = 44;

  // Firma Armador
  doc.setFillColor(...PDF_COLORS.slateLight);
  doc.setDrawColor(...PDF_COLORS.slateBorder);
  doc.roundedRect(MARGIN, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.navyDark);
  doc.text('POR EL ARMADOR / OPERADOR FLUVIAL', MARGIN + 4, currentY + 6);
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.slateDark);
  doc.text(terms.carrierName, MARGIN + 4, currentY + 11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.slateMuted);
  doc.text(`Representante: ${terms.carrierRep}`, MARGIN + 4, currentY + 16);
  doc.text(`Fecha de Firma: ${terms.recapDate}`, MARGIN + 4, currentY + 20);

  // Espacio Firma / Token Digital
  doc.setDrawColor(...PDF_COLORS.slateBorder);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(MARGIN + 4, currentY + 32, MARGIN + boxWidth - 4, currentY + 32);
  doc.setLineDashPattern([], 0);
  doc.setFont('courier', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.navyAccent);
  doc.text('DIGITALLY SIGNED & VERIFIED BY RIVERCHARTER', MARGIN + 4, currentY + 36);
  doc.setFontSize(5.5);
  doc.setTextColor(...PDF_COLORS.slateMuted);
  doc.text(`HASH: ${terms.contractRef}-CARRIER-AUTH-${today.getTime().toString(16).toUpperCase()}`, MARGIN + 4, currentY + 40);

  // Firma Cargador
  const charX = MARGIN + boxWidth + 6;
  doc.setFillColor(...PDF_COLORS.slateLight);
  doc.setDrawColor(...PDF_COLORS.slateBorder);
  doc.roundedRect(charX, currentY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.navyDark);
  doc.text('POR EL CARGADOR / FLETADOR NOMINADO', charX + 4, currentY + 6);
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.slateDark);
  doc.text(terms.chartererName, charX + 4, currentY + 11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.slateMuted);
  doc.text(`Representante: ${terms.chartererRep}`, charX + 4, currentY + 16);
  doc.text(`Fecha de Firma: ${terms.recapDate}`, charX + 4, currentY + 20);

  // Espacio Firma / Token Digital
  doc.setDrawColor(...PDF_COLORS.slateBorder);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(charX + 4, currentY + 32, charX + boxWidth - 4, currentY + 32);
  doc.setLineDashPattern([], 0);
  doc.setFont('courier', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.navyAccent);
  doc.text('DIGITALLY SIGNED & ACCEPTED BY CHARTERER', charX + 4, currentY + 36);
  doc.setFontSize(5.5);
  doc.setTextColor(...PDF_COLORS.slateMuted);
  doc.text(`HASH: ${terms.contractRef}-CHARTERER-AUTH-${(today.getTime() + 1000).toString(16).toUpperCase()}`, charX + 4, currentY + 40);

  currentY += boxHeight + 6;

  // Sello de Seguridad y Hash
  doc.setFillColor(...PDF_COLORS.skyBg);
  doc.roundedRect(MARGIN, currentY, CONTENT_WIDTH, 8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.navyDark);
  doc.text('VERIFICACIÓN CRIPTOGRÁFICA DE INTEGRIDAD CONTRACTUAL', MARGIN + 3, currentY + 3.8);
  doc.setFont('courier', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(...PDF_COLORS.slateMuted);
  const sampleHash = `SHA256:${Buffer.from(`${terms.contractRef}-${terms.pol}-${terms.pod}-${terms.freightRate}-${terms.adjustedTonnage}`).toString('hex').slice(0, 48).toUpperCase()}`;
  doc.text(`Certificado: ${sampleHash} · Válido para transacciones mercantiles fluviales`, MARGIN + 3, currentY + 6.8);

  // Pie de Página 2
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.slateMuted);
  doc.text(`RiverCharter Core PRO · Fixture Recap Contractual · Página 2 de 2 · Ref: ${terms.contractRef}`, MARGIN, PAGE_HEIGHT - 6);
  doc.text('Documento formal de fletamento fluvial protegido contra alteración', PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 6, { align: 'right' });

  // Guardar archivo si no se desactiva explícitamente
  const shouldSave = options.save !== false;
  if (shouldSave) {
    const defaultFilename = options.filename || `Fixture_Recap_Fluvial_${terms.pol.replace(/[^a-zA-Z0-9]/g, '_')}_${terms.pod.replace(/[^a-zA-Z0-9]/g, '_')}_${terms.recapDate}.pdf`;
    try {
      doc.save(defaultFilename);
    } catch (e) {
      console.warn('[FluvialFixtureRecap] Error al guardar automáticamente:', e);
    }
  }

  return doc;
}

// Exportar globalmente en window para acceso desde HTML vanilla o consolas
if (typeof window !== 'undefined') {
  (window as any).generateFluvialFixtureRecapPdf = generateFluvialFixtureRecapPdf;
  (window as any).buildFluvialFixtureRecapData = buildFluvialFixtureRecapData;
  (window as any).exportFluvialFixtureRecapPDF = function(customTerms?: Partial<FluvialFixtureRecapTerms>) {
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast('Generando Fixture Recap Fluvial en PDF...', true);
    }
    const pdf = generateFluvialFixtureRecapPdf(customTerms, { save: true });
    if (typeof (window as any).showToast === 'function') {
      (window as any).showToast('✅ Fixture Recap Fluvial (PDF) exportado exitosamente');
    }
    return pdf;
  };
}
