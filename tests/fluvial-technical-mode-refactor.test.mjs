import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadTsModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);
}

// ============================================================================
// 1. ENSAMBLADOR DE CONVOY & RESTRICCIÓN DE CALADO DINÁMICO
// ============================================================================

test('ConvoyBuilder replaces static ocean specs (DWT, LOA) with Tugboat selector and dynamic Barges', async () => {
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');

  // Verifica que maneja remolcador y barcazas
  assert.ok(convoySource.includes('convoy-tugboat-select'), 'Debe incluir selector de remolcador');
  assert.ok(convoySource.includes('coupledBarges'), 'Debe gestionar arreglo dinámico de barcazas acopladas');
  assert.ok(convoySource.includes('minWaterLevel'), 'Debe incluir min_water_level');
  assert.ok(convoySource.includes('maxDynamicDraft'), 'Debe calcular el calado dinámico de la barcaza más pesada');

  // Verifica bloqueo por calado dinámico
  assert.ok(
    convoySource.includes('!isDraftSafe') || convoySource.includes('maxDynamicDraft > Number(minWaterLevel)'),
    'Debe bloquear el guardado si el calado dinámico supera min_water_level'
  );
  assert.ok(
    convoySource.includes('ALERTA CRÍTICA: Restricción de Calado Dinámico (Draft Constraint)') ||
    convoySource.includes('draft-constraint-critical-alert'),
    'Debe mostrar alerta crítica de restricción de calado dinámico'
  );
});

// ============================================================================
// 2. ESTRUCTURA DE COSTES: OPEX DEL REMOLCADOR Y CAPEX DE BARCAZAS
// ============================================================================

test('ConvoyBuilder decouples OPEX for tugboat and CAPEX daily rental/amortization per barge', async () => {
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');

  // OPEX Remolcador: tripulación, seguros, mantenimiento
  assert.ok(convoySource.includes('crewDaily') || convoySource.includes('Tripulación'), 'Debe tener campo para tripulación');
  assert.ok(convoySource.includes('insuranceDaily') || convoySource.includes('Seguros'), 'Debe tener campo para seguros');
  assert.ok(convoySource.includes('maintenanceDaily') || convoySource.includes('Mantenimiento'), 'Debe tener campo para mantenimiento');

  // CAPEX Barcazas: alquiler o amortización diaria por barcaza
  assert.ok(convoySource.includes('bargeDailyRates') || convoySource.includes('CAPEX / Alquiler'), 'Debe incluir módulo CAPEX por barcaza');
  assert.ok(convoySource.includes('handleBargeRateChange') || convoySource.includes('dailyRate'), 'Debe permitir editar tarifa diaria por barcaza');
});

// ============================================================================
// 3. MÓDULO DE COMBUSTIBLE FLUVIAL (BUNKERS)
// ============================================================================

test('ConvoyBuilder divides fuel consumption into Sailing (pushing) and Idle/Waiting', async () => {
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');

  assert.ok(
    convoySource.includes('sailingFuelTonsPerDay') || convoySource.includes('Consumo Navegando'),
    'Debe incluir input para Consumo Navegando empujando carga'
  );
  assert.ok(
    convoySource.includes('idleFuelTonsPerDay') || convoySource.includes('Consumo en Ralentí'),
    'Debe incluir input para Consumo en Ralentí/Espera'
  );
  assert.ok(
    convoySource.includes('fuelPricePerTon') || convoySource.includes('Precio Combustible'),
    'Debe incluir precio de combustible'
  );
});

// ============================================================================
// 4. GASTOS PORTUARIOS Y DE CANAL (PDAs FLUVIALES)
// ============================================================================

test('fluvialEstimator and ConvoyBuilder support Fluvial PDAs (tariffs, tolls, lock dues, pilotage, cross-border)', async () => {
  const { calculateFluvialPda } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const pda = calculateFluvialPda({
    loadPortTariff: 2000,
    dischargePortTariff: 2000,
    waterwayTolls: 3000,
    lockDues: 1500,
    riverPilotage: 1000,
    crossBorderTariffs: 1500,
  });

  assert.equal(pda.totalPdaCost, 11000, 'Suma de gastos portuarios y fluviales debe ser 11,000 USD');

  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');
  assert.ok(convoySource.includes('waterwayTolls') || convoySource.includes('Peajes de Hidrovía'), 'ConvoyBuilder debe incluir peajes de hidrovía');
  assert.ok(convoySource.includes('lockDues') || convoySource.includes('Derechos de Esclusas'), 'ConvoyBuilder debe incluir derechos de esclusas');
  assert.ok(convoySource.includes('riverPilotage') || convoySource.includes('Practicaje Fluvial'), 'ConvoyBuilder debe incluir practicaje fluvial');
  assert.ok(convoySource.includes('crossBorderTariffs') || convoySource.includes('Aranceles Transfronterizos'), 'ConvoyBuilder debe incluir aranceles transfronterizos');
});

// ============================================================================
// 5. GESTIÓN DE TIEMPOS Y DEMORAS
// ============================================================================

test('Delays in locks and customs automatically multiply tugboat OPEX and idle fuel', async () => {
  const { calculateDemurrageCost } = await loadTsModule('../src/services/fluvialEstimator.ts');

  // Remolcador con OPEX $2400/día ($100/hora), idle fuel 0.05 MT/h (1.2 MT/día), fuel price $600/MT ($30/hora)
  // 1 día esclusas (24h) + 1 día aduanas (24h) = 48 horas (2 días)
  const result = calculateDemurrageCost({
    lockWaitDays: 1,
    customsDelayDays: 1,
    dailyOpex: 2400,
    idleFuelTonsPerHour: 0.05,
    fuelPricePerTon: 600,
  });

  // OPEX demoras = 2 días × 2400 = 4800
  assert.equal(result.idleOpexCost, 4800, 'OPEX por demoras debe multiplicarse por los días extra');
  // Idle Fuel = 48h × 0.05 MT/h = 2.4 MT × 600 = 1440
  assert.equal(result.idleFuelCost, 1440, 'Fuel en ralentí debe multiplicarse por los días extra');
  // Total Demoras = 4800 + 1440 = 6240
  assert.equal(result.totalDemurrageCost, 6240, 'Costo total de demoras sumado');

  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');
  assert.ok(
    convoySource.includes('lockWaitDays') || convoySource.includes('Esclusas'),
    'ConvoyBuilder debe incluir tiempos de espera en esclusas'
  );
  assert.ok(
    convoySource.includes('customsDelayDays') || convoySource.includes('Aduanas'),
    'ConvoyBuilder debe incluir demoras aduaneras'
  );
});

// ============================================================================
// 6. VISTA EJECUTIVA (RESUMEN DE SOLO LECTURA)
// ============================================================================

test('estimateFluvialVoyage provides executive summary with netProfit, cost per ton motor vs barges, and daily TCE', async () => {
  const { estimateFluvialVoyage } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const estimate = estimateFluvialVoyage({
    tugboat: { dailyOpex: 3000, enginePowerHp: 4000 },
    navigationDays: 5,
    sailingFuelTonsPerDay: 4,
    idleFuelTonsPerDay: 1,
    fuelPricePerTon: 500,
    barges: [
      { id: 1, name: 'B-1', capacity: 1500, couplingDays: 6, dailyRate: 200 },
      { id: 2, name: 'B-2', capacity: 1500, couplingDays: 6, dailyRate: 200 },
    ],
    lockWaitDays: 0.5,
    customsDelayDays: 0.5,
    pda: {
      loadPortTariff: 1000,
      dischargePortTariff: 1000,
      waterwayTolls: 1000,
    },
    freightRatePerTon: 25,
    totalCargoTons: 3000,
  });

  const exec = estimate.executiveSummary;
  assert.ok(exec, 'Debe incluir executiveSummary');
  assert.equal(exec.totalCargoTons, 3000, 'Capacidad total de carga debe ser 3000 MT');
  assert.equal(exec.grossFreightRevenue, 75000, 'Ingresos brutos: 3000 MT × 25 $/MT = $75,000');
  assert.ok(exec.netProfit > 0, 'Debe calcular beneficio neto positivo');
  assert.ok(exec.costPerTonMotor > 0, 'Debe desglosar costo por tonelada del motor');
  assert.ok(exec.costPerTonBarges > 0, 'Debe desglosar costo por tonelada de barcazas');
  assert.ok(exec.totalCostPerTon > 0, 'Debe calcular costo total por tonelada');
  assert.ok(exec.dailyTce > 0, 'Debe calcular TCE diario de la operación');

  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');
  assert.ok(convoySource.includes('convoy-executive-view') || convoySource.includes('Vista Ejecutiva'), 'ConvoyBuilder debe incluir la Vista Ejecutiva');
  assert.ok(convoySource.includes('costPerTonMotor') || convoySource.includes('Vector Motor'), 'ConvoyBuilder debe desglosar motor vs barcazas en Vista Ejecutiva');
  assert.ok(convoySource.includes('dailyTce') || convoySource.includes('TCE Diario'), 'ConvoyBuilder debe mostrar el TCE diario');
});
