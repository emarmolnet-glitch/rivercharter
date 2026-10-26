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
}

export interface FluvialEstimateResult {
  motorCost: MotorCostBreakdown;
  cargoCost: CargoCostBreakdown;
  demurrageCost: DemurrageCostBreakdown;
  pdaCost: FluvialPdaBreakdown;
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
  } = params;

  // 1. Vector Motor (Consumo Navegando / Empujando la carga)
  const effectiveSailingConsumption = sailingFuelTonsPerDay !== undefined
    ? sailingFuelTonsPerDay
    : fuelConsumptionTonsPerDay;

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

  // Totales
  const baseVoyageCost = Number((motorCost.totalMotorCost + cargoCost.totalCargoCost).toFixed(2));
  const totalVoyageCost = Number((baseVoyageCost + demurrageCost.totalDemurrageCost + pdaCost.totalPdaCost).toFixed(2));

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
  // TCE = (Gross Freight Revenue - Voyage Expenses [Fuel + Fluvial PDAs + Barge Rental]) / Total Days
  const totalFuelCost = Number((motorCost.estimatedFuelCost + demurrageCost.idleFuelCost).toFixed(2));
  const voyageExpenses = Number((totalFuelCost + pdaCost.totalPdaCost + cargoCost.totalCargoCost).toFixed(2));
  const dailyTce = totalEffectiveDays > 0
    ? Number(((grossFreightRevenue - voyageExpenses) / totalEffectiveDays).toFixed(2))
    : 0;

  const isProfitable = netProfit >= 0;

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
    summary: `Beneficio Neto: $${netProfit.toLocaleString()} USD | Costo/TM: $${costPerCargoTon} (Motor: $${costPerTonMotor}, Barcazas: $${costPerTonBarges}) | TCE: $${dailyTce.toLocaleString()}/d`,
  };

  const summary = `Costo Total Viaje: $${totalVoyageCost.toLocaleString()} USD | Motor: $${(motorCost.totalMotorCost + demurrageCost.totalDemurrageCost).toLocaleString()} | Carga: $${cargoCost.totalCargoCost.toLocaleString()} | PDAs: $${pdaCost.totalPdaCost.toLocaleString()} (${costPerCargoTon} USD/MT) | Beneficio: $${netProfit.toLocaleString()} | TCE: $${dailyTce.toLocaleString()}/d`;

  return {
    motorCost,
    cargoCost,
    demurrageCost,
    pdaCost,
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
