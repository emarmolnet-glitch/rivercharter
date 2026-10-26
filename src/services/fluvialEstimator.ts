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
  operationType?: string;
  linearMeters?: number;
  truckCount?: number;
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
  dailyTce: number;
  dailyNetProfit: number;
  totalCargoTons: number;
  totalDays: number;
  isProfitable: boolean;
  summary: string;
  sustainability?: FluvialSustainabilityMetrics;
  intermodal?: IntermodalTransferBreakdown;
  risGroundingRisk?: 'SAFE' | 'WARNING' | 'CRITICAL';
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
  sailingFuelTonsPerDay?: number;
  idleFuelTonsPerDay?: number;
  fuelPricePerTon?: number;
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
  estimatedLandSavings?: number; // Ahorros Terrestres Estimados (deducción)
  risAlerts?: RisAlertsParams;
  risSandbarsActive?: boolean;
  risStrongCurrentsActive?: boolean;
  minWaterLevel?: number;
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
  costPerCargoTon: number;
  costPerDay: number;
  totalEffectiveDays: number;
  executiveSummary: FluvialExecutiveMetrics;
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
 * Sobrecosto Operativo del Remolcador en Ralentí por Demoras (Esclusas / Aduanas)
 * Recalcula automáticamente el coste OPEX por hora/día en espera más el consumo de combustible en standby.
 * Multiplica automáticamente el OPEX y el consumo en ralentí del remolcador.
 */
export function calculateDemurrageCost(params: DemurrageCostParams): DemurrageCostBreakdown {
  const lockHours = (Number(params.lockWaitHours) || 0) + ((Number(params.lockWaitDays) || 0) * 24);
  const customsHours = (Number(params.customsDelayHours) || 0) + ((Number(params.customsDelayDays) || 0) * 24);
  const computedDelayHours = lockHours + customsHours;

  const waitingHours = computedDelayHours > 0
    ? computedDelayHours
    : Math.max(0, Number(params.waitingHours) || 0);

  const totalDelayDays = Number((waitingHours / 24).toFixed(2));
  const dailyOpex = Math.max(0, Number(params.dailyOpex) || 0);

  const idleFuelTonsPerHour = params.idleFuelTonsPerDay !== undefined && params.idleFuelTonsPerDay !== null
    ? Math.max(0, Number(params.idleFuelTonsPerDay) / 24)
    : Math.max(0, Number(params.idleFuelTonsPerHour ?? DEFAULT_IDLE_FUEL_TONS_PER_HOUR));

  const fuelPricePerTon = Math.max(0, Number(params.fuelPricePerTon ?? DEFAULT_BUNKER_PRICE_USD_TON));

  const hourlyOpexRate = Number((dailyOpex / 24).toFixed(2));
  const idleOpexCost = Number((waitingHours * hourlyOpexRate).toFixed(2));

  const totalIdleFuelTons = Number((waitingHours * idleFuelTonsPerHour).toFixed(3));
  const idleFuelCost = Number((totalIdleFuelTons * fuelPricePerTon).toFixed(2));

  const hourlyIdleTotalRate = Number((hourlyOpexRate + (idleFuelTonsPerHour * fuelPricePerTon)).toFixed(2));
  const totalDemurrageCost = Number((idleOpexCost + idleFuelCost).toFixed(2));

  const formula = `${waitingHours.toFixed(1)} h espera (${totalDelayDays} d) × ($${hourlyOpexRate}/h OPEX + $${(idleFuelTonsPerHour * fuelPricePerTon).toFixed(2)}/h fuel ralentí) = $${totalDemurrageCost.toLocaleString()} USD`;

  return {
    waitingHours,
    lockWaitHours: lockHours,
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
  };
}

/**
 * Estimador Global de Rentabilidad Fluvial
 * Consolida el vector motor, vector carga, sobrecostos por demoras y gastos fluviales/PDA.
 */
export function estimateFluvialVoyage(params: FluvialVoyageEstimateParams): FluvialEstimateResult {
  const {
    tugboat,
    navigationDays,
    fuelConsumptionTonsPerDay,
    sailingFuelTonsPerDay,
    idleFuelTonsPerDay,
    fuelPricePerTon = DEFAULT_BUNKER_PRICE_USD_TON,
    barges,
    defaultCouplingDays = navigationDays,
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
    minWaterLevel = 2.8,
  } = params;

  // Ajustes de Alertas RIS (Servicios de Información Fluvial)
  const isSandbarsActive = Boolean(risAlerts?.sandbarsActive ?? risSandbarsActive);
  const isStrongCurrentsActive = Boolean(risAlerts?.strongCurrents ?? risStrongCurrentsActive);

  // Corrientes fuertes aumentan el consumo de combustible (+25%) y el esfuerzo de empuje
  const currentMultiplier = isStrongCurrentsActive ? 1.25 : 1.0;

  // Bancos de arena activos elevan el riesgo de varadura
  const maxBargeDraft = barges.reduce((max, b) => Math.max(max, Number(b.dynamicDraft) || 0), 0);
  const risGroundingRisk: 'SAFE' | 'WARNING' | 'CRITICAL' = isSandbarsActive
    ? (maxBargeDraft >= (minWaterLevel - 0.4) ? 'CRITICAL' : 'WARNING')
    : (maxBargeDraft > minWaterLevel ? 'CRITICAL' : 'SAFE');

  // 1. Vector Motor (Consumo Navegando / Empujando la carga ajustado por corrientes RIS)
  const baseSailingConsumption = sailingFuelTonsPerDay !== undefined
    ? sailingFuelTonsPerDay
    : (fuelConsumptionTonsPerDay !== undefined
        ? fuelConsumptionTonsPerDay
        : estimateFuelConsumptionDaily(tugboat.enginePowerHp));
  const effectiveSailingConsumption = Number((baseSailingConsumption * currentMultiplier).toFixed(2));

  const motorCost = calculateMotorCost({
    navigationDays,
    dailyOpex: tugboat.dailyOpex,
    enginePowerHp: tugboat.enginePowerHp,
    fuelConsumptionTonsPerDay: effectiveSailingConsumption,
    fuelPricePerTon,
  });

  // 2. Vector Carga (CAPEX / Alquiler / Amortización diaria de Barcazas acopladas)
  const cargoCost = calculateCargoCost({
    barges,
    defaultCouplingDays,
    defaultDailyRatePerBarge,
  });

  // 3. Demoras en esclusas / aduanas (Multiplica automáticamente OPEX y combustible ralentí del remolcador)
  const demurrageCost = calculateDemurrageCost({
    waitingHours,
    lockWaitHours,
    lockWaitDays,
    customsDelayHours,
    customsDelayDays,
    dailyOpex: tugboat.dailyOpex,
    idleFuelTonsPerHour,
    idleFuelTonsPerDay,
    fuelPricePerTon,
  });

  // 4. Gastos Portuarios y Fluviales (PDAs de Hidrovía)
  const pdaCost = calculateFluvialPda(pda || {});

  // 5. Transferencia Intermodal y Ahorros Sincro-modales Terrestres
  const safeTransshipment = Math.max(0, Number(directTransshipmentTariff) || 0);
  const safeLandSavings = Math.max(0, Number(estimatedLandSavings) || 0);
  const netIntermodalImpact = Number((safeTransshipment - safeLandSavings).toFixed(2));
  const intermodalCost: IntermodalTransferBreakdown = {
    directTransshipmentTariff: safeTransshipment,
    estimatedLandSavings: safeLandSavings,
    netIntermodalImpact,
    formula: `Transbordo ($${safeTransshipment.toLocaleString()}) - Ahorros Terrestres Evitados ($${safeLandSavings.toLocaleString()}) = ${netIntermodalImpact >= 0 ? '+' : ''}$${netIntermodalImpact.toLocaleString()} USD`,
  };

  // Totales (Los ahorros terrestres se restan al costo operativo del viaje)
  const baseVoyageCost = Number((motorCost.totalMotorCost + cargoCost.totalCargoCost).toFixed(2));
  const totalVoyageCost = Number(
    Math.max(0, baseVoyageCost + demurrageCost.totalDemurrageCost + pdaCost.totalPdaCost + safeTransshipment - safeLandSavings).toFixed(2)
  );

  const calculatedCargoTons = barges.reduce((acc, b) => acc + (Number(b.capacity) || 0), 0);
  const totalCargoTons = explicitCargoTons !== undefined && explicitCargoTons > 0
    ? explicitCargoTons
    : calculatedCargoTons;

  const totalEffectiveDays = Number((navigationDays + (demurrageCost.waitingHours / 24)).toFixed(2));
  const costPerDay = totalEffectiveDays > 0 ? Number((totalVoyageCost / totalEffectiveDays).toFixed(2)) : 0;

  // Desglose del costo por tonelada: Motor vs Barcazas
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

  // Consolidación Comercial / Vista Ejecutiva
  const grossFreightRevenue = Number(freightLumpsum) > 0
    ? Number(freightLumpsum)
    : Number((totalCargoTons * Number(freightRatePerTon)).toFixed(2));

  const netProfit = Number((grossFreightRevenue - totalVoyageCost).toFixed(2));
  const dailyNetProfit = totalEffectiveDays > 0 ? Number((netProfit / totalEffectiveDays).toFixed(2)) : 0;

  // Time Charter Equivalent (TCE) diario:
  const totalFuelCost = Number((motorCost.estimatedFuelCost + demurrageCost.idleFuelCost).toFixed(2));
  const voyageExpenses = Number((totalFuelCost + pdaCost.totalPdaCost + cargoCost.totalCargoCost + safeTransshipment - safeLandSavings).toFixed(2));
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
    dailyTce,
    dailyNetProfit,
    totalCargoTons,
    totalDays: totalEffectiveDays,
    isProfitable,
    sustainability,
    intermodal: intermodalCost,
    risGroundingRisk,
    summary: `Beneficio Neto: $${netProfit.toLocaleString()} USD | Sostenibilidad: ${sustainability.formattedMetric} | Costo/TM: $${costPerCargoTon} | TCE: $${dailyTce.toLocaleString()}/d`,
  };

  const summary = `Costo Total Viaje: $${totalVoyageCost.toLocaleString()} USD (Ahorros Terrestres: -$${safeLandSavings.toLocaleString()}) | Motor: $${(motorCost.totalMotorCost + demurrageCost.totalDemurrageCost).toLocaleString()} | Carga: $${cargoCost.totalCargoCost.toLocaleString()} | Transbordo: $${safeTransshipment.toLocaleString()} | Beneficio: $${netProfit.toLocaleString()} | ${sustainability.formattedMetric}`;

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
    costPerCargoTon,
    costPerDay,
    totalEffectiveDays,
    executiveSummary,
    summary,
  };
}
