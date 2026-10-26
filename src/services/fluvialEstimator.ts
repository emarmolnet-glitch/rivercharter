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
  waitingHours: number;
  dailyOpex: number;
  idleFuelTonsPerHour?: number;
  fuelPricePerTon?: number;
  idleHourlyRateOverride?: number;
}

export interface DemurrageCostBreakdown {
  waitingHours: number;
  hourlyOpexRate: number;
  idleOpexCost: number;
  idleFuelTonsPerHour: number;
  totalIdleFuelTons: number;
  fuelPricePerTon: number;
  idleFuelCost: number;
  hourlyIdleTotalRate: number;
  totalDemurrageCost: number;
  formula: string;
}

export interface FluvialVoyageEstimateParams {
  tugboat: {
    id?: number | string;
    name?: string;
    motor?: string;
    dailyOpex: number;
    enginePowerHp?: number | null;
  };
  navigationDays: number;
  fuelConsumptionTonsPerDay?: number;
  fuelPricePerTon?: number;
  barges: CargoBargeInput[];
  defaultCouplingDays?: number;
  defaultDailyRatePerBarge?: number;
  waitingHours?: number;
  idleFuelTonsPerHour?: number;
  totalCargoTons?: number;
}

export interface FluvialEstimateResult {
  motorCost: MotorCostBreakdown;
  cargoCost: CargoCostBreakdown;
  demurrageCost: DemurrageCostBreakdown;
  baseVoyageCost: number;
  totalVoyageCost: number;
  totalCargoTons: number;
  costPerCargoTon: number;
  costPerDay: number;
  totalEffectiveDays: number;
  summary: string;
}

/**
 * Estima el consumo diario de combustible (MT/día) a partir de la potencia del motor (HP).
 * Un remolcador fluvial estándar de línea navega a un régimen crucero del ~75-80% MCR.
 */
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
 * Sobrecosto Operativo del Remolcador en Ralentí por Demoras (Esclusas / Aduanas)
 * Recalcula automáticamente el coste OPEX por hora en espera más el consumo de combustible en standby.
 */
export function calculateDemurrageCost(params: DemurrageCostParams): DemurrageCostBreakdown {
  const waitingHours = Math.max(0, Number(params.waitingHours) || 0);
  const dailyOpex = Math.max(0, Number(params.dailyOpex) || 0);
  const idleFuelTonsPerHour = Math.max(0, Number(params.idleFuelTonsPerHour ?? DEFAULT_IDLE_FUEL_TONS_PER_HOUR));
  const fuelPricePerTon = Math.max(0, Number(params.fuelPricePerTon ?? DEFAULT_BUNKER_PRICE_USD_TON));

  const hourlyOpexRate = Number((dailyOpex / 24).toFixed(2));
  const idleOpexCost = Number((waitingHours * hourlyOpexRate).toFixed(2));

  const totalIdleFuelTons = Number((waitingHours * idleFuelTonsPerHour).toFixed(3));
  const idleFuelCost = Number((totalIdleFuelTons * fuelPricePerTon).toFixed(2));

  const hourlyIdleTotalRate = Number((hourlyOpexRate + (idleFuelTonsPerHour * fuelPricePerTon)).toFixed(2));
  const totalDemurrageCost = Number((idleOpexCost + idleFuelCost).toFixed(2));

  const formula = `${waitingHours.toFixed(1)} h espera × ($${hourlyOpexRate}/h OPEX + $${(idleFuelTonsPerHour * fuelPricePerTon).toFixed(2)}/h fuel ralentí) = $${totalDemurrageCost.toLocaleString()} USD`;

  return {
    waitingHours,
    hourlyOpexRate,
    idleOpexCost,
    idleFuelTonsPerHour,
    totalIdleFuelTons,
    fuelPricePerTon,
    idleFuelCost,
    hourlyIdleTotalRate,
    totalDemurrageCost,
    formula,
  };
}

/**
 * Estimador Global de Rentabilidad Fluvial
 * Consolida el vector motor, vector carga y sobrecostos por demoras.
 */
export function estimateFluvialVoyage(params: FluvialVoyageEstimateParams): FluvialEstimateResult {
  const {
    tugboat,
    navigationDays,
    fuelConsumptionTonsPerDay,
    fuelPricePerTon = DEFAULT_BUNKER_PRICE_USD_TON,
    barges,
    defaultCouplingDays = navigationDays,
    defaultDailyRatePerBarge = DEFAULT_BARGE_DAILY_RATE_USD,
    waitingHours = 0,
    idleFuelTonsPerHour = DEFAULT_IDLE_FUEL_TONS_PER_HOUR,
    totalCargoTons: explicitCargoTons,
  } = params;

  // 1. Vector Motor
  const motorCost = calculateMotorCost({
    navigationDays,
    dailyOpex: tugboat.dailyOpex,
    enginePowerHp: tugboat.enginePowerHp,
    fuelConsumptionTonsPerDay,
    fuelPricePerTon,
  });

  // 2. Vector Carga
  const cargoCost = calculateCargoCost({
    barges,
    defaultCouplingDays,
    defaultDailyRatePerBarge,
  });

  // 3. Demoras en esclusas / aduanas
  const demurrageCost = calculateDemurrageCost({
    waitingHours,
    dailyOpex: tugboat.dailyOpex,
    idleFuelTonsPerHour,
    fuelPricePerTon,
  });

  // Totales
  const baseVoyageCost = Number((motorCost.totalMotorCost + cargoCost.totalCargoCost).toFixed(2));
  const totalVoyageCost = Number((baseVoyageCost + demurrageCost.totalDemurrageCost).toFixed(2));

  const calculatedCargoTons = barges.reduce((acc, b) => acc + (Number(b.capacity) || 0), 0);
  const totalCargoTons = explicitCargoTons !== undefined && explicitCargoTons > 0
    ? explicitCargoTons
    : calculatedCargoTons;

  const costPerCargoTon = totalCargoTons > 0 ? Number((totalVoyageCost / totalCargoTons).toFixed(2)) : 0;
  const totalEffectiveDays = Number((navigationDays + (waitingHours / 24)).toFixed(2));
  const costPerDay = totalEffectiveDays > 0 ? Number((totalVoyageCost / totalEffectiveDays).toFixed(2)) : 0;

  const summary = `Costo Total Viaje: $${totalVoyageCost.toLocaleString()} USD | Motor: $${motorCost.totalMotorCost.toLocaleString()} | Carga: $${cargoCost.totalCargoCost.toLocaleString()} | Demoras: $${demurrageCost.totalDemurrageCost.toLocaleString()} (${costPerCargoTon} USD/MT)`;

  return {
    motorCost,
    cargoCost,
    demurrageCost,
    baseVoyageCost,
    totalVoyageCost,
    totalCargoTons,
    costPerCargoTon,
    costPerDay,
    totalEffectiveDays,
    summary,
  };
}
