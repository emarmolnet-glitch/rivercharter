/**
 * RiverCharter - Servicio de Estimación Financiera y OPEX Desacoplado
 * 
 * Implementa el núcleo de rentabilidad fluvial separando dos vectores operativos:
 * 1. Costo del Motor: Días de navegación × dailyOpex del remolcador + Consumo de combustible estimado.
 * 2. Costo de Carga: Días estimados de acople × Costo de alquiler o amortización de cada Barge involucrada.
 * 
 * Incorpora además el sobrecosto operativo en ralentí por demoras (esclusas, aduanas, estiaje).
 */

export const DEFAULT_BUNKER_PRICE_USD_TON = 680;
export const DEFAULT_BARGE_DAILY_RATE_USD = 250;
export const DEFAULT_IDLE_FUEL_TONS_PER_HOUR = 0.05;
export const DEFAULT_NAVIGATION_DAYS = 7;
export const DEFAULT_CONVOY_SPEED_WATER_KNOTS = 8.0; // Velocidad del convoy en agua (STW - Speed Through Water)
export const DEFAULT_RIVER_CURRENT_KNOTS = 2.5; // Corriente media del río (Misisipi / Paraná)

// Parámetros Hidrostáticos Base en Barcazas (Arquitectura Naval Fluvial)
export const DEFAULT_LIGHTSHIP_DRAFT = 0.55; // Calado en Rosca (m)
export const DEFAULT_DESIGN_DRAFT = 3.66; // Calado de Diseño máximo (12 ft / 3.66 m)
export const DEFAULT_TPC = 4.5; // Toneladas por Centímetro de Inmersión (MT/cm) para barcazas estándar/Jumbo
export const DEFAULT_UKC = 0.30; // Margen de seguridad bajo la quilla (m) (Under Keel Clearance)

// Dimensiones Base (Pies) - Arquitectura Naval Fluvial y Esclusas Misisipi
export const STANDARD_BARGE_LOA_FEET = 195; // Barcaza Jumbo estándar: Eslora (LOA) = 195 ft
export const STANDARD_BARGE_BEAM_FEET = 35; // Barcaza Jumbo estándar: Manga (Beam) = 35 ft
export const STANDARD_TUGBOAT_LOA_FEET = 150; // Empujador promedio: Eslora = 150 ft
export const STANDARD_LOCK_LENGTH_FEET = 600; // Esclusa estándar del Misisipi (Main Chamber): 600 ft (Largo)
export const STANDARD_LOCK_WIDTH_FEET = 110; // Esclusa estándar del Misisipi (Main Chamber): 110 ft (Ancho)
export const DOUBLE_LOCKAGE_ADDITIONAL_HOURS_PER_LOCK = 3.5; // Inyección de +3.5 horas por esclusa si requiere esclusado doble
export const DEFAULT_MANEUVER_FUEL_TONS_PER_HOUR = 0.15; // Consumo específico de maniobra/puerto (MT/hora)

export interface ConvoyGeometryParams {
  bargeCount: number;
  lockCount?: number;
  customColumns?: number;
  customRows?: number;
  enginePowerHp?: number | null;
  sailingFuelTonsPerDay?: number;
  fuelPricePerTon?: number;
  bargeLoaFeet?: number;
  bargeBeamFeet?: number;
  tugboatLoaFeet?: number;
  lockLengthFeet?: number;
  lockWidthFeet?: number;
  maneuverFuelTonsPerHour?: number;
}

export interface ConvoyGeometryResult {
  bargeCount: number;
  columns: number;
  rows: number;
  bargeLengthFeet: number;
  bargeBeamFeet: number;
  tugboatLengthFeet: number;
  totalLengthFeet: number; // Eslora Total Convoy (ft) = (Filas de barcazas × 195) + 150 (Empujador)
  totalBeamFeet: number;   // Manga Total Convoy (ft) = Columnas de barcazas × 35
  lockLengthFeet: number;  // 600 ft
  lockWidthFeet: number;   // 110 ft
  exceedsLength: boolean;
  exceedsBeam: boolean;
  requiresDoubleLockage: boolean;
  lockCount: number;
  additionalHours: number; // +3.5h por cada esclusa de la ruta si requiresDoubleLockage
  maneuverFuelTonsPerHour: number;
  maneuverFuelTonsTotal: number;
  maneuverFuelCostTotal: number;
  infoMessage?: string;
  formula: string;
}

/**
 * Determina la disposición óptima del convoy (columnas y filas) en base al número total de barcazas.
 * En esclusas estándar (ancho 110 ft), el ancho máximo para entrar de frente son 3 barcazas Jumbo (3 × 35 = 105 ft).
 * Ejemplo: 15 barcazas = 3 columnas x 5 filas.
 */
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

  // Disposición estándar para cuencas con esclusas: máx 3 columnas de ancho (105 ft <= 110 ft)
  const columns = 3;
  const rows = Math.ceil(count / columns);
  return { columns, rows };
}

/**
 * Consumo de combustible del remolcador a régimen de puerto/maniobra durante esclusado.
 * Durante el esclusado y desacople de convoy, el motor trabaja típicamente a ~40% MCR (régimen de maniobra).
 */
export function calculateManeuverFuelPerHour(
  enginePowerHp?: number | null,
  sailingFuelTonsPerDay?: number
): number {
  const hp = Number(enginePowerHp) || 0;
  if (hp > 0) {
    // hp * 0.40 load factor * 200 g/BHP-h / 1,000,000
    const tonsPerHour = (hp * 0.40 * 200) / 1_000_000;
    return Number(Math.max(0.08, tonsPerHour).toFixed(3));
  }
  if (sailingFuelTonsPerDay && sailingFuelTonsPerDay > 0) {
    // Aproximadamente 50% del régimen de navegación de crucero
    return Number(((sailingFuelTonsPerDay / 24) * 0.50).toFixed(3));
  }
  return DEFAULT_MANEUVER_FUEL_TONS_PER_HOUR;
}

/**
 * Motor de Esclusado Doble (Double Lockage) y Geometría de Convoyes
 * 
 * 1. Determina columnas y filas óptimas (ej. 15 barcazas = 3 col x 5 fil).
 * 2. Eslora Total Convoy (ft) = (Filas × 195) + 150 (Empujador).
 * 3. Manga Total Convoy (ft) = Columnas × 35.
 * 4. Compara contra la cámara de 600 ft x 110 ft. Si excede, requiresDoubleLockage = true.
 * 5. Por cada esclusa en la ruta, inyecta +3.5h y suma el consumo de maniobra.
 */
export function calculateConvoyGeometry(params: ConvoyGeometryParams): ConvoyGeometryResult {
  const bargeCount = Math.max(0, Number(params.bargeCount) || 0);
  const lockCount = Math.max(0, Number(params.lockCount !== undefined ? params.lockCount : 1));
  const fuelPricePerTon = Math.max(0, Number(params.fuelPricePerTon || DEFAULT_BUNKER_PRICE_USD_TON));

  const bargeLoaFeet = Number(params.bargeLoaFeet) || STANDARD_BARGE_LOA_FEET;
  const bargeBeamFeet = Number(params.bargeBeamFeet) || STANDARD_BARGE_BEAM_FEET;
  const tugboatLoaFeet = Number(params.tugboatLoaFeet) || STANDARD_TUGBOAT_LOA_FEET;
  const lockLengthFeet = Number(params.lockLengthFeet) || STANDARD_LOCK_LENGTH_FEET;
  const lockWidthFeet = Number(params.lockWidthFeet) || STANDARD_LOCK_WIDTH_FEET;

  const { columns, rows } = calculateConvoyArrangement(bargeCount, params.customColumns, params.customRows);

  const totalLengthFeet = rows > 0 ? Number(((rows * bargeLoaFeet) + tugboatLoaFeet).toFixed(1)) : 0;
  const totalBeamFeet = columns > 0 ? Number((columns * bargeBeamFeet).toFixed(1)) : 0;

  const exceedsLength = totalLengthFeet > lockLengthFeet;
  const exceedsBeam = totalBeamFeet > lockWidthFeet;
  const requiresDoubleLockage = exceedsLength || exceedsBeam;

  const maneuverFuelTonsPerHour = params.maneuverFuelTonsPerHour !== undefined && params.maneuverFuelTonsPerHour !== null
    ? Math.max(0, Number(params.maneuverFuelTonsPerHour))
    : calculateManeuverFuelPerHour(params.enginePowerHp, params.sailingFuelTonsPerDay);

  let additionalHours = 0;
  let maneuverFuelTonsTotal = 0;
  let maneuverFuelCostTotal = 0;
  let infoMessage: string | undefined;

  if (requiresDoubleLockage && lockCount > 0) {
    additionalHours = Number((lockCount * DOUBLE_LOCKAGE_ADDITIONAL_HOURS_PER_LOCK).toFixed(2));
    maneuverFuelTonsTotal = Number((additionalHours * maneuverFuelTonsPerHour).toFixed(3));
    maneuverFuelCostTotal = Number((maneuverFuelTonsTotal * fuelPricePerTon).toFixed(2));
    infoMessage = `Maniobra de Esclusado Doble Requerida: El convoy (${totalLengthFeet} ft x ${totalBeamFeet} ft) excede la cámara estándar (600x110). Se han añadido automáticamente +3.5h y consumos de maniobra por cada esclusa de la ruta.`;
  }

  const formula = `Convoy (${columns} col × ${rows} fil = ${bargeCount} barcazas) -> Eslora: ${totalLengthFeet} ft (${rows}×${bargeLoaFeet} + ${tugboatLoaFeet}) | Manga: ${totalBeamFeet} ft (${columns}×${bargeBeamFeet}) vs Esclusa (${lockLengthFeet}×${lockWidthFeet} ft) -> ${requiresDoubleLockage ? `DOBLE ESCLUSADO (+${additionalHours}h en ${lockCount} esclusas)` : 'ESCLUSADO SIMPLE (Cabe en cámara)'}`;

  return {
    bargeCount,
    columns,
    rows,
    bargeLengthFeet: bargeLoaFeet,
    bargeBeamFeet: bargeBeamFeet,
    tugboatLengthFeet: tugboatLoaFeet,
    totalLengthFeet,
    totalBeamFeet,
    lockLengthFeet,
    lockWidthFeet,
    exceedsLength,
    exceedsBeam,
    requiresDoubleLockage,
    lockCount,
    additionalHours,
    maneuverFuelTonsPerHour,
    maneuverFuelTonsTotal,
    maneuverFuelCostTotal,
    infoMessage,
    formula,
  };
}

export interface HydrostaticDraftParams {
  minWaterLevel?: number;
  ukc?: number;
  designDraft?: number;
  lightshipDraft?: number;
  tpc?: number;
  bargeCount?: number;
  nominalTonnage?: number;
}

export interface TonnageSheddingResult {
  minWaterLevel: number;
  ukc: number;
  designDraft: number;
  lightshipDraft: number;
  tpc: number;
  maxAdmissibleDraft: number;
  isDraftRestricted: boolean;
  nominalCapacityPerBarge: number;
  adjustedCapacityPerBarge: number;
  nominalTonnage: number;
  adjustedTonnage: number;
  lostTonnage: number; // Merma de carga (Deadfreight)
  infoMessage?: string;
}

/**
 * Algoritmo de Calado Admisible y Merma de Carga (Tonnage Shedding)
 * 
 * 1. Calcula el calado máximo operativo real:
 *    maxAdmissibleDraft = Math.min(designDraft, minWaterLevel - UKC) (UKC = 0.30 m por defecto).
 * 2. Si maxAdmissibleDraft < designDraft:
 *    adjustedCapacityPerBarge = Math.max(0, (maxAdmissibleDraft - lightshipDraft) * 100 * TPC).
 * 3. Multiplica adjustedCapacityPerBarge por el número de barcazas para obtener adjustedTonnage.
 * 4. Merma de carga: lostTonnage = nominalTonnage - adjustedTonnage.
 */
export function calculateTonnageShedding(params: HydrostaticDraftParams): TonnageSheddingResult {
  const ukc = params.ukc !== undefined ? Math.max(0, Number(params.ukc)) : DEFAULT_UKC;
  const designDraft = params.designDraft !== undefined ? Math.max(0.1, Number(params.designDraft)) : DEFAULT_DESIGN_DRAFT;
  const lightshipDraft = params.lightshipDraft !== undefined ? Math.max(0, Number(params.lightshipDraft)) : DEFAULT_LIGHTSHIP_DRAFT;
  const tpc = params.tpc !== undefined ? Math.max(0.1, Number(params.tpc)) : DEFAULT_TPC;
  const bargeCount = Math.max(1, Number(params.bargeCount) || 1);

  const hasWaterConstraint = params.minWaterLevel !== undefined && params.minWaterLevel !== null && !isNaN(Number(params.minWaterLevel)) && Number(params.minWaterLevel) > 0;
  const minWaterLevel = hasWaterConstraint ? Number(params.minWaterLevel) : (designDraft + ukc);

  const maxAdmissibleDraft = Number(Math.min(designDraft, Math.max(0, minWaterLevel - ukc)).toFixed(2));
  const nominalTonnage = Math.max(0, Number(params.nominalTonnage) || (bargeCount * 1500));
  const nominalCapacityPerBarge = Number((nominalTonnage / bargeCount).toFixed(2));

  const isDraftRestricted = hasWaterConstraint && (maxAdmissibleDraft < designDraft);

  let adjustedCapacityPerBarge = nominalCapacityPerBarge;
  let adjustedTonnage = nominalTonnage;
  let lostTonnage = 0;

  if (isDraftRestricted) {
    const rawAdjusted = (maxAdmissibleDraft - lightshipDraft) * 100 * tpc;
    adjustedCapacityPerBarge = Number(Math.max(0, rawAdjusted).toFixed(2));
    adjustedTonnage = Number(Math.max(0, adjustedCapacityPerBarge * bargeCount).toFixed(2));
    lostTonnage = Number(Math.max(0, nominalTonnage - adjustedTonnage).toFixed(2));
  }

  const infoMessage = isDraftRestricted
    ? `Restricción por estiaje activa: Calado admisible limitado a ${maxAdmissibleDraft.toFixed(2)} m. Carga total reducida automáticamente a ${Math.round(adjustedTonnage).toLocaleString()} MT (Merma: ${Math.round(lostTonnage).toLocaleString()} MT)`
    : undefined;

  return {
    minWaterLevel,
    ukc,
    designDraft,
    lightshipDraft,
    tpc,
    maxAdmissibleDraft,
    isDraftRestricted,
    nominalCapacityPerBarge,
    adjustedCapacityPerBarge,
    nominalTonnage,
    adjustedTonnage,
    lostTonnage,
    infoMessage,
  };
}

export interface BidirectionalSailingCalculationParams {
  distLadenNm?: number; // Distancia navegando con carga (NM)
  distBallastNm?: number; // Distancia navegando en lastre / vacío (NM)
  convoySpeedWaterKnots?: number; // Velocidad del convoy en agua calma (v_convoy, ej. 8.0 nudos)
  riverCurrentKnots?: number; // Velocidad de la corriente del río (ej. 2.5 nudos)
  ladenDirection?: 'DOWNSTREAM' | 'UPSTREAM'; // Sentido con carga ('DOWNSTREAM' por defecto)
  ballastDirection?: 'DOWNSTREAM' | 'UPSTREAM'; // Sentido en lastre ('UPSTREAM' por defecto)
}

export interface BidirectionalSailingResult {
  vConvoy: number;
  riverCurrentKnots: number;
  speedDownstreamKnots: number; // Velocidad de bajada (Downstream): v_convoy + riverCurrentKnots
  speedUpstreamKnots: number; // Velocidad de subida (Upstream): v_convoy - riverCurrentKnots
  speedLadenKnots: number;
  speedBallastKnots: number;
  sailingDaysLaden: number;
  sailingDaysBallast: number;
  totalNavigationDays: number;
  ladenDirection: 'DOWNSTREAM' | 'UPSTREAM';
  ballastDirection: 'DOWNSTREAM' | 'UPSTREAM';
  formula: string;
}

/**
 * Calcula la velocidad sobre fondo (SOG) y los días de navegación bidireccionales
 * según el sentido de la corriente del río.
 */
export function calculateBidirectionalSailing(params: BidirectionalSailingCalculationParams): BidirectionalSailingResult {
  const vConvoy = Math.max(1.0, Number(params.convoySpeedWaterKnots) || DEFAULT_CONVOY_SPEED_WATER_KNOTS);
  const riverCurrentKnots = Math.max(0, Number(params.riverCurrentKnots !== undefined ? params.riverCurrentKnots : DEFAULT_RIVER_CURRENT_KNOTS));

  // Velocidades SOG diferenciadas
  const speedDownstreamKnots = Number((vConvoy + riverCurrentKnots).toFixed(2));
  const speedUpstreamKnots = Number(Math.max(1.0, vConvoy - riverCurrentKnots).toFixed(2));

  const ladenDirection = params.ladenDirection || 'DOWNSTREAM';
  const ballastDirection = params.ballastDirection || (ladenDirection === 'DOWNSTREAM' ? 'UPSTREAM' : 'DOWNSTREAM');

  const speedLadenKnots = ladenDirection === 'DOWNSTREAM' ? speedDownstreamKnots : speedUpstreamKnots;
  const speedBallastKnots = ballastDirection === 'DOWNSTREAM' ? speedDownstreamKnots : speedUpstreamKnots;

  const distLaden = Math.max(0, Number(params.distLadenNm) || 0);
  const distBallast = Math.max(0, Number(params.distBallastNm) || 0);

  const sailingDaysLaden = distLaden > 0 ? Number((distLaden / (speedLadenKnots * 24)).toFixed(2)) : 0;
  const sailingDaysBallast = distBallast > 0 ? Number((distBallast / (speedBallastKnots * 24)).toFixed(2)) : 0;
  const totalNavigationDays = Number((sailingDaysLaden + sailingDaysBallast).toFixed(2));

  const formula = `Bajada (Downstream ${speedDownstreamKnots} kn): ${sailingDaysLaden} d (${distLaden} NM) | Subida (Upstream ${speedUpstreamKnots} kn): ${sailingDaysBallast} d (${distBallast} NM) = ${totalNavigationDays} días navegación`;

  return {
    vConvoy,
    riverCurrentKnots,
    speedDownstreamKnots,
    speedUpstreamKnots,
    speedLadenKnots,
    speedBallastKnots,
    sailingDaysLaden,
    sailingDaysBallast,
    totalNavigationDays,
    ladenDirection,
    ballastDirection,
    formula,
  };
}

export interface MotorCostParams {
  navigationDays: number;
  dailyOpex: number;
  enginePowerHp?: number | null;
  fuelConsumptionTonsPerDay?: number;
  fuelPricePerTon?: number;
  fuelCostOverride?: number;
}

export interface MotorCostBreakdown {
  navigationDays: number;
  dailyOpex: number;
  opexTotalCost: number;
  fuelConsumptionTonsPerDay: number;
  estimatedFuelTons: number;
  fuelPricePerTon: number;
  estimatedFuelCost: number;
  totalMotorCost: number;
  formula: string;
}

export interface BargeCostItem {
  bargeId: number | string;
  name: string;
  bargeType: string;
  capacity: number;
  couplingDays: number;
  dailyRate: number;
  totalCost: number;
}

export interface CargoBargeInput {
  id: number | string;
  name?: string;
  bargeNumber?: string | null;
  bargeType?: string;
  capacity?: number;
  dynamicDraft?: number;
  couplingDays?: number;
  dailyRate?: number;
  dailyCharterRate?: number;
  dailyAmortizationCost?: number;
  operationType?: string;
  linearMeters?: number;
  truckCount?: number;
  lightshipDraft?: number;
  designDraft?: number;
  tpc?: number;
}

export interface CargoCostParams {
  barges: CargoBargeInput[];
  defaultCouplingDays?: number;
  defaultDailyRatePerBarge?: number;
}

export interface CargoCostBreakdown {
  bargeCount: number;
  totalCouplingDays: number;
  bargeCosts: BargeCostItem[];
  totalCargoCost: number;
  formula: string;
}

export interface DemurrageCostParams {
  waitingHours?: number;
  lockWaitHours?: number;
  lockWaitDays?: number;
  customsDelayHours?: number;
  customsDelayDays?: number;
  dailyOpex: number;
  idleFuelTonsPerHour?: number;
  idleFuelTonsPerDay?: number;
  fuelPricePerTon?: number;
  idleHourlyRateOverride?: number;
  // Módulo de Esclusado Doble (Double Lockage)
  lockCount?: number;
  requiresDoubleLockage?: boolean;
  doubleLockageHours?: number;
  maneuverFuelTonsPerHour?: number;
}

export interface DemurrageCostBreakdown {
  waitingHours: number;
  lockWaitHours?: number;
  customsDelayHours?: number;
  totalDelayDays: number;
  hourlyOpexRate: number;
  idleOpexCost: number;
  idleFuelTonsPerHour: number;
  totalIdleFuelTons: number;
  fuelPricePerTon: number;
  idleFuelCost: number;
  hourlyIdleTotalRate: number;
  totalDemurrageCost: number;
  formula: string;
  // Desglose de Esclusado Doble (Double Lockage)
  requiresDoubleLockage?: boolean;
  doubleLockageHours?: number;
  maneuverFuelTonsPerHour?: number;
  totalManeuverFuelTons?: number;
  maneuverFuelCost?: number;
  doubleLockageOpexCost?: number;
  doubleLockageTotalCost?: number;
}

export interface FluvialPdaExpenses {
  loadPortTariff?: number; // Tarifas puerto de carga ($)
  dischargePortTariff?: number; // Tarifas puerto de descarga ($)
  waterwayTolls?: number; // Peajes de hidrovía ($)
  lockDues?: number; // Derechos de esclusas ($)
  riverPilotage?: number; // Practicaje fluvial ($)
  crossBorderTariffs?: number; // Aranceles transfronterizos ($)
}

export interface FluvialPdaBreakdown {
  loadPortTariff: number;
  dischargePortTariff: number;
  waterwayTolls: number;
  lockDues: number;
  riverPilotage: number;
  crossBorderTariffs: number;
  totalPdaCost: number;
  formula: string;
}

export interface IntermodalTransferBreakdown {
  directTransshipmentTariff: number; // Tarifa transbordo directo (barcaza a camión/tren)
  estimatedLandSavings: number; // Ahorros Terrestres Estimados (peajes, desgaste de flota y seguros de carretera evitados)
  netIntermodalImpact: number; // transbordo - ahorros (deducción que resta al costo si el ahorro supera la tarifa)
  formula: string;
}

export interface RisAlertsParams {
  sandbarsActive?: boolean; // Bancos de arena activos
  strongCurrents?: boolean; // Corrientes fuertes
  speedImpactPercent?: number; // Ajuste porcentaje en velocidad / tiempo
  fuelImpactPercent?: number; // Ajuste porcentaje en consumo combustible
}

export interface FluvialSustainabilityMetrics {
  bargeCount: number;
  truckEquivalent: number;
  co2ReductionPercent: number;
  co2SavedTons: number;
  formattedMetric: string; // "Este convoy de [X] barcazas equivale a [Y] camiones, reduciendo las emisiones de CO2 en un [Z]%"
}

export interface FluvialExecutiveMetrics {
  grossFreightRevenue: number;
  freightRatePerTon: number;
  totalVoyageCost: number;
  netProfit: number;
  costPerTonMotor: number;
  costPerTonBarges: number;
  costPerTonPda: number;
  totalCostPerTon: number;
  nominalCostPerTon?: number;
  dailyTce: number;
  dailyNetProfit: number;
  totalCargoTons: number;
  nominalTonnage?: number;
  adjustedTonnage?: number;
  lostTonnage?: number;
  maxAdmissibleDraft?: number;
  totalDays: number;
  isProfitable: boolean;
  summary: string;
  sustainability?: FluvialSustainabilityMetrics;
  intermodal?: IntermodalTransferBreakdown;
  risGroundingRisk?: 'SAFE' | 'WARNING' | 'CRITICAL';
  bidirectionalSailing?: BidirectionalSailingResult;
  shedding?: TonnageSheddingResult;
  geometry?: ConvoyGeometryResult;
  convoyGeometry?: ConvoyGeometryResult;
  requiresDoubleLockage?: boolean;
}

export interface FluvialVoyageEstimateParams {
  tugboat: {
    id?: number | string;
    name?: string;
    motor?: string;
    dailyOpex?: number;
    dailyOpexUsd?: number;
    enginePowerHp?: number | null;
  };
  navigationDays?: number;
  distLadenNm?: number; // Distancia con carga (NM)
  distBallastNm?: number; // Distancia en lastre (NM)
  convoySpeedWaterKnots?: number; // Velocidad del convoy en agua calma (v_convoy, ej. 8.0 nudos)
  riverCurrentKnots?: number; // Velocidad corriente del río (ej. 2.5 nudos)
  ladenDirection?: 'DOWNSTREAM' | 'UPSTREAM'; // Dirección con carga ('DOWNSTREAM' por defecto)
  ballastDirection?: 'DOWNSTREAM' | 'UPSTREAM'; // Dirección en lastre ('UPSTREAM' por defecto)
  fuelConsumptionTonsPerDay?: number;
  sailingFuelTonsPerDay?: number;
  idleFuelTonsPerDay?: number;
  fuelPricePerTon?: number;
  bunkerPriceUsdPerTon?: number;
  barges: CargoBargeInput[];
  defaultCouplingDays?: number;
  defaultDailyRatePerBarge?: number;
  waitingHours?: number;
  lockWaitHours?: number;
  lockWaitDays?: number;
  customsDelayHours?: number;
  customsDelayDays?: number;
  idleFuelTonsPerHour?: number;
  totalCargoTons?: number;
  pda?: FluvialPdaExpenses;
  freightRatePerTon?: number;
  freightLumpsum?: number;
  operationType?: string; // 'BULK' o 'RORO'
  totalLinearMeters?: number;
  totalTruckCount?: number;
  directTransshipmentTariff?: number; // Tarifa transbordo directo
  estimatedLandSavings?: number; // Ahorros Terrestres Estimados (argumento comercial para el cliente, NUNCA deducible de OPEX)
  risAlerts?: RisAlertsParams;
  risSandbarsActive?: boolean;
  risStrongCurrentsActive?: boolean;
  minWaterLevel?: number;
  ukc?: number;
  designDraft?: number;
  lightshipDraft?: number;
  tpc?: number;
  // Parámetros de Esclusado Doble y Geometría de Convoy
  lockCount?: number;
  convoyColumns?: number;
  convoyRows?: number;
  bargeLoaFeet?: number;
  bargeBeamFeet?: number;
  tugboatLoaFeet?: number;
  lockLengthFeet?: number;
  lockWidthFeet?: number;
  maneuverFuelTonsPerHour?: number;
  customConvoyGeometry?: Partial<ConvoyGeometryParams>;
}

export interface FluvialEstimateResult {
  motorCost: MotorCostBreakdown;
  cargoCost: CargoCostBreakdown;
  demurrageCost: DemurrageCostBreakdown;
  pdaCost: FluvialPdaBreakdown;
  intermodalCost: IntermodalTransferBreakdown;
  sustainability: FluvialSustainabilityMetrics;
  baseVoyageCost: number;
  totalVoyageCost: number;
  totalCargoTons: number;
  nominalTonnage: number;
  adjustedTonnage: number;
  lostTonnage: number;
  maxAdmissibleDraft: number;
  costPerCargoTon: number;
  nominalCostPerTon?: number;
  costPerDay: number;
  totalEffectiveDays: number;
  executiveSummary: FluvialExecutiveMetrics;
  shedding?: TonnageSheddingResult;
  geometry?: ConvoyGeometryResult;
  convoyGeometry?: ConvoyGeometryResult;
  requiresDoubleLockage?: boolean;
  summary: string;
}

/**
 * Calcula métricas de sostenibilidad comparando el transporte fluvial vs terrestre.
 * Genera la métrica comercial requerida: "Este convoy de [X] barcazas equivale a [Y] camiones, reduciendo las emisiones de CO2 en un [Z]%".
 */
export function calculateSustainabilityMetrics(params: {
  bargeCount: number;
  totalCargoTons?: number;
  operationType?: string;
  truckCount?: number;
  linearMeters?: number;
  distanceKm?: number;
}): FluvialSustainabilityMetrics {
  const bargeCount = Math.max(1, Number(params.bargeCount) || 1);
  const isRoro = params.operationType === 'RORO' || params.operationType === 'Ro-Ro / Carretera Flotante';

  let truckEquivalent = 0;
  if (isRoro) {
    if (params.truckCount && params.truckCount > 0) {
      truckEquivalent = Math.round(Number(params.truckCount));
    } else if (params.linearMeters && params.linearMeters > 0) {
      // Un semirremolque estándar con tractora ocupa ~16.5 metros lineales
      truckEquivalent = Math.max(1, Math.round(Number(params.linearMeters) / 16.5));
    } else {
      truckEquivalent = bargeCount * 45; // Promedio estándar barcaza Ro-Ro
    }
  } else {
    const cargoTons = Number(params.totalCargoTons) || (bargeCount * 1500);
    // Un camión de carretera estándar carga 25 TM netas
    truckEquivalent = Math.max(1, Math.round(cargoTons / 25));
  }

  // Las operaciones fluviales sincro-modales reducen ~72% de emisiones CO2 frente al camión diésel de larga distancia
  const co2ReductionPercent = 72;
  const distance = Math.max(100, Number(params.distanceKm) || 600);
  const cargoWeight = isRoro ? truckEquivalent * 25 : (Number(params.totalCargoTons) || truckEquivalent * 25);
  // Carretera emite ~95g CO2/t-km vs fluvial ~27g CO2/t-km -> Ahorro ~68g CO2/t-km
  const co2SavedTons = Number(((cargoWeight * distance * 0.068) / 1000).toFixed(1));

  const formattedMetric = `Este convoy de ${bargeCount} barcazas equivale a ${truckEquivalent} camiones, reduciendo las emisiones de CO2 en un ${co2ReductionPercent}%`;

  return {
    bargeCount,
    truckEquivalent,
    co2ReductionPercent,
    co2SavedTons,
    formattedMetric,
  };
}
export function estimateFuelConsumptionDaily(enginePowerHp?: number | null): number {
  const hp = Number(enginePowerHp) || 0;
  if (hp <= 0) return 4.2; // Consumo promedio por defecto para empujador mediano

  // Consumo específico: ~185 g/BHP-h a régimen crucero de navegación (0.75 MCR)
  // Consumo MT/día = (HP * 0.75 * 185 * 24) / 1,000,000
  const tonsPerDay = (hp * 0.75 * 185 * 24) / 1_000_000;
  return Number(Math.max(1.5, Math.min(18.0, tonsPerDay)).toFixed(2));
}

/**
 * Determina el costo diario estándar de alquiler o amortización según el tipo y tamaño de la barcaza.
 */
export function calculateDefaultBargeRate(bargeType?: string, capacity?: number): number {
  const cap = Number(capacity) || 1500;
  const type = String(bargeType || 'HOPPER').toUpperCase();

  switch (type) {
    case 'TANKER':
      return Math.round(320 * (cap / 1500));
    case 'CONTAINER_BARGE':
      return Math.round(300 * (cap / 1500));
    case 'DECK':
      return Math.round(220 * (cap / 1200));
    case 'BOX':
      return Math.round(260 * (cap / 1500));
    case 'HOPPER':
    default:
      return Math.round(DEFAULT_BARGE_DAILY_RATE_USD * (cap / 1500));
  }
}

/**
 * VECTOR 1: Costo del Motor
 * Días de navegación × dailyOpex del remolcador + Consumo de combustible estimado.
 */
export function calculateMotorCost(params: MotorCostParams): MotorCostBreakdown {
  const navigationDays = Math.max(0, Number(params.navigationDays) || 0);
  const dailyOpex = Math.max(0, Number(params.dailyOpex) || 0);
  const fuelPricePerTon = Math.max(0, Number(params.fuelPricePerTon) || DEFAULT_BUNKER_PRICE_USD_TON);

  const fuelConsumptionTonsPerDay = params.fuelConsumptionTonsPerDay !== undefined
    ? Math.max(0, Number(params.fuelConsumptionTonsPerDay))
    : estimateFuelConsumptionDaily(params.enginePowerHp);

  const opexTotalCost = Number((navigationDays * dailyOpex).toFixed(2));

  let estimatedFuelTons = 0;
  let estimatedFuelCost = 0;

  if (params.fuelCostOverride !== undefined && params.fuelCostOverride !== null) {
    estimatedFuelCost = Math.max(0, Number(params.fuelCostOverride));
    estimatedFuelTons = fuelPricePerTon > 0 ? Number((estimatedFuelCost / fuelPricePerTon).toFixed(2)) : 0;
  } else {
    estimatedFuelTons = Number((navigationDays * fuelConsumptionTonsPerDay).toFixed(2));
    estimatedFuelCost = Number((estimatedFuelTons * fuelPricePerTon).toFixed(2));
  }

  const totalMotorCost = Number((opexTotalCost + estimatedFuelCost).toFixed(2));
  const formula = `${navigationDays} días × $${dailyOpex}/d OPEX ($${opexTotalCost.toLocaleString()}) + ${estimatedFuelTons} MT fuel @ $${fuelPricePerTon}/MT ($${estimatedFuelCost.toLocaleString()})`;

  return {
    navigationDays,
    dailyOpex,
    opexTotalCost,
    fuelConsumptionTonsPerDay,
    estimatedFuelTons,
    fuelPricePerTon,
    estimatedFuelCost,
    totalMotorCost,
    formula,
  };
}

/**
 * VECTOR 2: Costo de Carga
 * Días estimados de acople × Costo de alquiler o amortización de cada Barge involucrada.
 */
export function calculateCargoCost(params: CargoCostParams): CargoCostBreakdown {
  const {
    barges = [],
    defaultCouplingDays = DEFAULT_NAVIGATION_DAYS,
    defaultDailyRatePerBarge = DEFAULT_BARGE_DAILY_RATE_USD,
  } = params;

  let totalCargoCost = 0;
  let totalCouplingDays = 0;
  const bargeCosts: BargeCostItem[] = [];

  for (const b of barges) {
    const couplingDays = Math.max(
      0,
      Number(b.couplingDays !== undefined ? b.couplingDays : defaultCouplingDays) || 0
    );

    const explicitRate = b.dailyRate ?? b.dailyCharterRate ?? b.dailyAmortizationCost;
    const dailyRate = explicitRate !== undefined && explicitRate !== null && !isNaN(Number(explicitRate))
      ? Number(explicitRate)
      : (b.capacity || b.bargeType ? calculateDefaultBargeRate(b.bargeType, b.capacity) : defaultDailyRatePerBarge);

    const cost = Number((couplingDays * dailyRate).toFixed(2));

    bargeCosts.push({
      bargeId: b.id,
      name: b.name || `Barcaza #${b.id}`,
      bargeType: b.bargeType || 'HOPPER',
      capacity: Number(b.capacity) || 1500,
      couplingDays,
      dailyRate,
      totalCost: cost,
    });

    totalCargoCost += cost;
    totalCouplingDays += couplingDays;
  }

  totalCargoCost = Number(totalCargoCost.toFixed(2));
  const formula = `${barges.length} barcazas acopladas × días acople individual × costo alquiler/amortización = $${totalCargoCost.toLocaleString()} USD`;

  return {
    bargeCount: barges.length,
    totalCouplingDays,
    bargeCosts,
    totalCargoCost,
    formula,
  };
}

/**
 * Calcula el desglose de gastos portuarios y fluviales de hidrovía (PDAs Fluviales)
 * Reemplaza las PDA oceánicas estándar con conceptos específicos fluviales:
 * tarifas de puertos POL/POD, peajes de hidrovía, derechos de esclusas, practicaje y aranceles.
 */
export function calculateFluvialPda(params: FluvialPdaExpenses = {}): FluvialPdaBreakdown {
  const loadPortTariff = Math.max(0, Number(params.loadPortTariff) || 0);
  const dischargePortTariff = Math.max(0, Number(params.dischargePortTariff) || 0);
  const waterwayTolls = Math.max(0, Number(params.waterwayTolls) || 0);
  const lockDues = Math.max(0, Number(params.lockDues) || 0);
  const riverPilotage = Math.max(0, Number(params.riverPilotage) || 0);
  const crossBorderTariffs = Math.max(0, Number(params.crossBorderTariffs) || 0);

  const totalPdaCost = Number((
    loadPortTariff +
    dischargePortTariff +
    waterwayTolls +
    lockDues +
    riverPilotage +
    crossBorderTariffs
  ).toFixed(2));

  const formula = `Puertos ($${(loadPortTariff + dischargePortTariff).toLocaleString()}) + Peajes Hidrovía ($${waterwayTolls.toLocaleString()}) + Esclusas ($${lockDues.toLocaleString()}) + Practicaje ($${riverPilotage.toLocaleString()}) + Aranceles ($${crossBorderTariffs.toLocaleString()}) = $${totalPdaCost.toLocaleString()} USD`;

  return {
    loadPortTariff,
    dischargePortTariff,
    waterwayTolls,
    lockDues,
    riverPilotage,
    crossBorderTariffs,
    totalPdaCost,
    formula,
  };
}

/**
 * Sobrecosto Operativo del Remolcador en Ralentí y Maniobra por Demoras (Esclusas / Aduanas)
 * Recalcula automáticamente el coste OPEX por hora/día en espera más el consumo de combustible en standby o maniobra.
 * Integra el esclusado doble (Double Lockage) inyectando horas de maniobra y combustible activo del remolcador.
 */
export function calculateDemurrageCost(params: DemurrageCostParams): DemurrageCostBreakdown {
  const dailyOpex = Math.max(0, Number(params.dailyOpex) || 0);
  const hourlyOpexRate = Number((dailyOpex / 24).toFixed(2));
  const fuelPricePerTon = Math.max(0, Number(params.fuelPricePerTon ?? DEFAULT_BUNKER_PRICE_USD_TON));

  // Módulo de Esclusado Doble (Double Lockage)
  const requiresDoubleLockage = Boolean(params.requiresDoubleLockage);
  const lockCount = Math.max(0, Number(params.lockCount !== undefined ? params.lockCount : 1));

  let doubleLockageHours = 0;
  if (params.doubleLockageHours !== undefined && params.doubleLockageHours !== null) {
    doubleLockageHours = Math.max(0, Number(params.doubleLockageHours));
  } else if (requiresDoubleLockage) {
    doubleLockageHours = Number((lockCount * DOUBLE_LOCKAGE_ADDITIONAL_HOURS_PER_LOCK).toFixed(2));
  }

  const maneuverFuelTonsPerHour = params.maneuverFuelTonsPerHour !== undefined && params.maneuverFuelTonsPerHour !== null
    ? Math.max(0, Number(params.maneuverFuelTonsPerHour))
    : DEFAULT_MANEUVER_FUEL_TONS_PER_HOUR;

  const baseLockHours = (Number(params.lockWaitHours) || 0) + ((Number(params.lockWaitDays) || 0) * 24);
  const customsHours = (Number(params.customsDelayHours) || 0) + ((Number(params.customsDelayDays) || 0) * 24);
  const computedDelayHours = baseLockHours + customsHours;

  const baseWaitingHours = computedDelayHours > 0
    ? computedDelayHours
    : Math.max(0, Number(params.waitingHours) || 0);

  const waitingHours = Number((baseWaitingHours + doubleLockageHours).toFixed(2));
  const totalDelayDays = Number((waitingHours / 24).toFixed(2));
  const totalLockWaitHours = Number((baseLockHours + doubleLockageHours).toFixed(2));

  // Consumo y OPEX en ralentí (esperas estáticas en fondeo / aduanas / cola)
  const idleFuelTonsPerHour = params.idleFuelTonsPerDay !== undefined && params.idleFuelTonsPerDay !== null
    ? Math.max(0, Number(params.idleFuelTonsPerDay) / 24)
    : Math.max(0, Number(params.idleFuelTonsPerHour ?? DEFAULT_IDLE_FUEL_TONS_PER_HOUR));

  const totalIdleFuelTons = Number((baseWaitingHours * idleFuelTonsPerHour).toFixed(3));
  const idleFuelCost = Number((totalIdleFuelTons * fuelPricePerTon).toFixed(2));
  const idleOpexCost = Number((baseWaitingHours * hourlyOpexRate).toFixed(2));

  // Consumo y OPEX a régimen de maniobra (esclusado doble activo)
  const totalManeuverFuelTons = Number((doubleLockageHours * maneuverFuelTonsPerHour).toFixed(3));
  const maneuverFuelCost = Number((totalManeuverFuelTons * fuelPricePerTon).toFixed(2));
  const doubleLockageOpexCost = Number((doubleLockageHours * hourlyOpexRate).toFixed(2));
  const doubleLockageTotalCost = Number((doubleLockageOpexCost + maneuverFuelCost).toFixed(2));

  const hourlyIdleTotalRate = Number((hourlyOpexRate + (idleFuelTonsPerHour * fuelPricePerTon)).toFixed(2));
  const totalDemurrageCost = Number((idleOpexCost + idleFuelCost + doubleLockageOpexCost + maneuverFuelCost).toFixed(2));

  const formula = doubleLockageHours > 0
    ? `${waitingHours.toFixed(1)} h espera total (${baseWaitingHours.toFixed(1)}h ralentí + ${doubleLockageHours.toFixed(1)}h esclusado doble) × OPEX + fuel (ralentí $${idleFuelCost.toLocaleString()} + maniobra $${maneuverFuelCost.toLocaleString()}) = $${totalDemurrageCost.toLocaleString()} USD`
    : `${waitingHours.toFixed(1)} h espera (${totalDelayDays} d) × ($${hourlyOpexRate}/h OPEX + $${(idleFuelTonsPerHour * fuelPricePerTon).toFixed(2)}/h fuel ralentí) = $${totalDemurrageCost.toLocaleString()} USD`;

  return {
    waitingHours,
    lockWaitHours: totalLockWaitHours,
    customsDelayHours: customsHours,
    totalDelayDays,
    hourlyOpexRate,
    idleOpexCost,
    idleFuelTonsPerHour,
    totalIdleFuelTons,
    fuelPricePerTon,
    idleFuelCost,
    hourlyIdleTotalRate,
    totalDemurrageCost,
    formula,
    requiresDoubleLockage,
    doubleLockageHours,
    maneuverFuelTonsPerHour,
    totalManeuverFuelTons,
    maneuverFuelCost,
    doubleLockageOpexCost,
    doubleLockageTotalCost,
  };
}

/**
 * Estimador Global de Rentabilidad Fluvial
 * Consolida el vector motor, vector carga, sobrecostos por demoras y gastos fluviales/PDA.
 */
export function estimateFluvialVoyage(params: FluvialVoyageEstimateParams): FluvialEstimateResult {
  const {
    tugboat,
    navigationDays: explicitNavigationDays,
    distLadenNm,
    distBallastNm,
    convoySpeedWaterKnots,
    riverCurrentKnots,
    ladenDirection = 'DOWNSTREAM',
    ballastDirection = 'UPSTREAM',
    fuelConsumptionTonsPerDay,
    sailingFuelTonsPerDay,
    idleFuelTonsPerDay,
    fuelPricePerTon,
    bunkerPriceUsdPerTon,
    barges,
    defaultCouplingDays,
    defaultDailyRatePerBarge = DEFAULT_BARGE_DAILY_RATE_USD,
    waitingHours = 0,
    lockWaitHours,
    lockWaitDays,
    customsDelayHours,
    customsDelayDays,
    idleFuelTonsPerHour = DEFAULT_IDLE_FUEL_TONS_PER_HOUR,
    totalCargoTons: explicitCargoTons,
    pda,
    freightRatePerTon = 0,
    freightLumpsum = 0,
    operationType = 'BULK',
    totalLinearMeters,
    totalTruckCount,
    directTransshipmentTariff = 0,
    estimatedLandSavings = 0,
    risAlerts,
    risSandbarsActive,
    risStrongCurrentsActive,
    minWaterLevel,
    ukc,
    designDraft,
    lightshipDraft,
    tpc,
    lockCount,
    convoyColumns,
    convoyRows,
    bargeLoaFeet,
    bargeBeamFeet,
    tugboatLoaFeet,
    lockLengthFeet,
    lockWidthFeet,
    maneuverFuelTonsPerHour,
    customConvoyGeometry,
  } = params;

  // 0. Navegación Bidireccional (Vector de Corriente del Río)
  const resolvedDistLaden = Number(distLadenNm) || 0;
  const resolvedDistBallast = Number(distBallastNm) || 0;
  let bidirectionalSailing: BidirectionalSailingResult | undefined;

  let effectiveNavigationDays = Number(explicitNavigationDays) || 0;

  if (resolvedDistLaden > 0 || resolvedDistBallast > 0 || convoySpeedWaterKnots !== undefined || riverCurrentKnots !== undefined) {
    bidirectionalSailing = calculateBidirectionalSailing({
      distLadenNm: resolvedDistLaden,
      distBallastNm: resolvedDistBallast,
      convoySpeedWaterKnots,
      riverCurrentKnots,
      ladenDirection,
      ballastDirection,
    });

    if (bidirectionalSailing.totalNavigationDays > 0) {
      effectiveNavigationDays = bidirectionalSailing.totalNavigationDays;
    }
  }

  if (effectiveNavigationDays <= 0) {
    effectiveNavigationDays = DEFAULT_NAVIGATION_DAYS;
  }

  const tugDailyOpex = Number(tugboat.dailyOpex ?? (tugboat as any).dailyOpexUsd) || 0;
  const resolvedFuelPrice = Number(fuelPricePerTon ?? bunkerPriceUsdPerTon ?? DEFAULT_BUNKER_PRICE_USD_TON);

  // Ajustes de Alertas RIS (Servicios de Información Fluvial)
  const isSandbarsActive = Boolean(risAlerts?.sandbarsActive ?? risSandbarsActive);
  const isStrongCurrentsActive = Boolean(risAlerts?.strongCurrents ?? risStrongCurrentsActive);

  // Corrientes fuertes aumentan el consumo de combustible (+25%) y el esfuerzo de empuje
  const currentMultiplier = isStrongCurrentsActive ? 1.25 : 1.0;

  // Bancos de arena activos elevan el riesgo de varadura
  const effectiveMinWater = minWaterLevel !== undefined ? Number(minWaterLevel) : 2.8;
  const maxBargeDraft = barges.reduce((max, b) => Math.max(max, Number(b.dynamicDraft) || 0), 0);
  const risGroundingRisk: 'SAFE' | 'WARNING' | 'CRITICAL' = isSandbarsActive
    ? (maxBargeDraft >= (effectiveMinWater - 0.4) ? 'CRITICAL' : 'WARNING')
    : (maxBargeDraft > effectiveMinWater ? 'CRITICAL' : 'SAFE');

  // 1. Vector Motor (Consumo Navegando / Empujando la carga ajustado por corrientes RIS y días calculados)
  const baseSailingConsumption = sailingFuelTonsPerDay !== undefined
    ? sailingFuelTonsPerDay
    : (fuelConsumptionTonsPerDay !== undefined
        ? fuelConsumptionTonsPerDay
        : estimateFuelConsumptionDaily(tugboat.enginePowerHp));
  const effectiveSailingConsumption = Number((baseSailingConsumption * currentMultiplier).toFixed(2));

  const motorCost = calculateMotorCost({
    navigationDays: effectiveNavigationDays,
    dailyOpex: tugDailyOpex,
    enginePowerHp: tugboat.enginePowerHp,
    fuelConsumptionTonsPerDay: effectiveSailingConsumption,
    fuelPricePerTon: resolvedFuelPrice,
  });

  // 2. Vector Carga (CAPEX / Alquiler / Amortización diaria de Barcazas acopladas)
  const cargoCost = calculateCargoCost({
    barges,
    defaultCouplingDays: defaultCouplingDays ?? effectiveNavigationDays,
    defaultDailyRatePerBarge,
  });

  // Geometría del Convoy y Detección de Esclusado Doble (Double Lockage)
  const resolvedBargeCount = Math.max(1, barges.length || 1);
  const resolvedLockCount = lockCount !== undefined
    ? Math.max(0, Number(lockCount))
    : (pda?.lockDues ? 1 : 1);

  const convoyGeometry = calculateConvoyGeometry({
    bargeCount: resolvedBargeCount,
    lockCount: resolvedLockCount,
    customColumns: convoyColumns,
    customRows: convoyRows,
    enginePowerHp: tugboat.enginePowerHp,
    sailingFuelTonsPerDay: baseSailingConsumption,
    fuelPricePerTon: resolvedFuelPrice,
    bargeLoaFeet,
    bargeBeamFeet,
    tugboatLoaFeet,
    lockLengthFeet,
    lockWidthFeet,
    maneuverFuelTonsPerHour,
    ...customConvoyGeometry,
  });

  // 3. Demoras en esclusas / aduanas (Multiplica automáticamente OPEX, combustible ralentí y combustible de maniobra por esclusado doble)
  const demurrageCost = calculateDemurrageCost({
    waitingHours,
    lockWaitHours,
    lockWaitDays,
    customsDelayHours,
    customsDelayDays,
    dailyOpex: tugDailyOpex,
    idleFuelTonsPerHour,
    idleFuelTonsPerDay,
    fuelPricePerTon: resolvedFuelPrice,
    lockCount: resolvedLockCount,
    requiresDoubleLockage: convoyGeometry.requiresDoubleLockage,
    doubleLockageHours: convoyGeometry.additionalHours,
    maneuverFuelTonsPerHour: convoyGeometry.maneuverFuelTonsPerHour,
  });

  // 4. Gastos Portuarios y Fluviales (PDAs de Hidrovía)
  const pdaCost = calculateFluvialPda(pda || {});

  // 5. Transferencia Intermodal y Ahorros Sincro-modales Terrestres (Aislamiento Contable Puro)
  const safeTransshipment = Math.max(0, Number(directTransshipmentTariff) || 0);
  const safeLandSavings = Math.max(0, Number(estimatedLandSavings) || 0);
  const netIntermodalImpact = Number((safeTransshipment - safeLandSavings).toFixed(2));
  const intermodalCost: IntermodalTransferBreakdown = {
    directTransshipmentTariff: safeTransshipment,
    estimatedLandSavings: safeLandSavings,
    netIntermodalImpact,
    formula: `Transbordo ($${safeTransshipment.toLocaleString()}) vs. Ahorro Terrestre Cliente ($${safeLandSavings.toLocaleString()}) = Impacto Neto Cliente: ${netIntermodalImpact >= 0 ? '+' : ''}$${netIntermodalImpact.toLocaleString()} USD (Valor Comercial)`,
  };

  // Totales (OPEX Puro del Armador: NUNCA restar estimatedLandSavings de la operación)
  const baseVoyageCost = Number((motorCost.totalMotorCost + cargoCost.totalCargoCost).toFixed(2));
  const totalVoyageCost = Number(
    Math.max(0, baseVoyageCost + demurrageCost.totalDemurrageCost + pdaCost.totalPdaCost + safeTransshipment).toFixed(2)
  );

  const calculatedCargoTons = barges.reduce((acc, b) => acc + (Number(b.capacity) || 0), 0);
  const nominalTonnage = explicitCargoTons !== undefined && explicitCargoTons > 0
    ? explicitCargoTons
    : (calculatedCargoTons > 0 ? calculatedCargoTons : (barges.length * 1500));
  const bargeCount = Math.max(1, barges.length || 1);

  // Motor Hidrostático y Tonnage Shedding (Merma de Carga y Falso Flete)
  const isRoro = operationType === 'RORO' || operationType === 'Ro-Ro / Carretera Flotante';
  const shedding = !isRoro && minWaterLevel !== undefined
    ? calculateTonnageShedding({
        minWaterLevel,
        ukc,
        designDraft,
        lightshipDraft,
        tpc,
        bargeCount,
        nominalTonnage,
      })
    : calculateTonnageShedding({
        minWaterLevel: undefined, // Sin restricción por estiaje
        ukc,
        designDraft,
        lightshipDraft,
        tpc,
        bargeCount,
        nominalTonnage,
      });

  const adjustedTonnage = shedding.adjustedTonnage;
  const lostTonnage = shedding.lostTonnage;
  const maxAdmissibleDraft = shedding.maxAdmissibleDraft;

  // En situaciones de estiaje, utiliza adjustedTonnage para los cálculos financieros en lugar de la capacidad nominal máxima
  const totalCargoTons = shedding.isDraftRestricted ? adjustedTonnage : nominalTonnage;

  const totalEffectiveDays = Number((effectiveNavigationDays + (demurrageCost.waitingHours / 24)).toFixed(2));
  const costPerDay = totalEffectiveDays > 0 ? Number((totalVoyageCost / totalEffectiveDays).toFixed(2)) : 0;

  // Desglose del costo por tonelada: Motor vs Barcazas (Break-Even Puro)
  // Como el OPEX del remolcador y el alquiler de las barcazas no cambian, el sistema debe dividir los costos totales entre las toneladas reales transportadas (adjustedTonnage). Esto encarecerá automáticamente el Break-Even por tonelada ($/MT).
  const costPerTonMotor = totalCargoTons > 0
    ? Number(((motorCost.totalMotorCost + demurrageCost.totalDemurrageCost) / totalCargoTons).toFixed(2))
    : 0;
  const costPerTonBarges = totalCargoTons > 0
    ? Number((cargoCost.totalCargoCost / totalCargoTons).toFixed(2))
    : 0;
  const costPerTonPda = totalCargoTons > 0
    ? Number((pdaCost.totalPdaCost / totalCargoTons).toFixed(2))
    : 0;
  const costPerCargoTon = totalCargoTons > 0
    ? Number((totalVoyageCost / totalCargoTons).toFixed(2))
    : 0;

  const nominalCostPerTon = nominalTonnage > 0
    ? Number((totalVoyageCost / nominalTonnage).toFixed(2))
    : 0;

  // Consolidación Comercial / Vista Ejecutiva
  const grossFreightRevenue = Number(freightLumpsum) > 0
    ? Number(freightLumpsum)
    : Number((totalCargoTons * Number(freightRatePerTon)).toFixed(2));

  // Beneficio Neto Puro del Armador
  const netProfit = Number((grossFreightRevenue - totalVoyageCost).toFixed(2));
  const dailyNetProfit = totalEffectiveDays > 0 ? Number((netProfit / totalEffectiveDays).toFixed(2)) : 0;

  // Time Charter Equivalent (TCE) diario (Sin estimatedLandSavings en la cuenta del buque):
  const totalFuelCost = Number((motorCost.estimatedFuelCost + demurrageCost.idleFuelCost + (demurrageCost.maneuverFuelCost || 0)).toFixed(2));
  const voyageExpenses = Number((totalFuelCost + pdaCost.totalPdaCost + cargoCost.totalCargoCost + safeTransshipment).toFixed(2));
  const dailyTce = totalEffectiveDays > 0
    ? Number(((grossFreightRevenue - voyageExpenses) / totalEffectiveDays).toFixed(2))
    : 0;

  const isProfitable = netProfit >= 0;

  // Calculador de Sostenibilidad Fluvial vs Terrestre
  const sustainability = calculateSustainabilityMetrics({
    bargeCount: barges.length,
    totalCargoTons,
    operationType,
    truckCount: totalTruckCount,
    linearMeters: totalLinearMeters,
  });

  const executiveSummary: FluvialExecutiveMetrics = {
    grossFreightRevenue,
    freightRatePerTon: Number(freightRatePerTon),
    totalVoyageCost,
    netProfit,
    costPerTonMotor,
    costPerTonBarges,
    costPerTonPda,
    totalCostPerTon: costPerCargoTon,
    nominalCostPerTon,
    dailyTce,
    dailyNetProfit,
    totalCargoTons,
    nominalTonnage,
    adjustedTonnage,
    lostTonnage,
    maxAdmissibleDraft,
    totalDays: totalEffectiveDays,
    isProfitable,
    sustainability,
    intermodal: intermodalCost,
    risGroundingRisk,
    bidirectionalSailing,
    shedding,
    geometry: convoyGeometry,
    convoyGeometry,
    requiresDoubleLockage: convoyGeometry.requiresDoubleLockage,
    summary: shedding.isDraftRestricted
      ? `Beneficio Neto: $${netProfit.toLocaleString()} USD | Sostenibilidad: ${sustainability.formattedMetric} | Costo/TM: $${costPerCargoTon} (Merma Falso Flete: ${lostTonnage} MT) | TCE: $${dailyTce.toLocaleString()}/d`
      : `Beneficio Neto: $${netProfit.toLocaleString()} USD | Sostenibilidad: ${sustainability.formattedMetric} | Costo/TM: $${costPerCargoTon} | TCE: $${dailyTce.toLocaleString()}/d`,
  };

  const summary = `Costo Total Viaje (OPEX Puro): $${totalVoyageCost.toLocaleString()} USD | Motor: $${(motorCost.totalMotorCost + demurrageCost.totalDemurrageCost).toLocaleString()} | Carga: $${cargoCost.totalCargoCost.toLocaleString()} | Transbordo: $${safeTransshipment.toLocaleString()} | Beneficio Neto: $${netProfit.toLocaleString()} | Valor Comercial Cliente (Ahorro Terrestre): $${safeLandSavings.toLocaleString()} | ${sustainability.formattedMetric}`;

  return {
    motorCost,
    cargoCost,
    demurrageCost,
    pdaCost,
    intermodalCost,
    sustainability,
    baseVoyageCost,
    totalVoyageCost,
    totalCargoTons,
    nominalTonnage,
    adjustedTonnage,
    lostTonnage,
    maxAdmissibleDraft,
    shedding,
    geometry: convoyGeometry,
    convoyGeometry,
    requiresDoubleLockage: convoyGeometry.requiresDoubleLockage,
    costPerCargoTon,
    nominalCostPerTon,
    costPerDay,
    totalEffectiveDays,
    executiveSummary,
    summary,
  };
}
