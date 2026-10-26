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
// 1. VALIDADOR DE CALADO DINÁMICO (DRAFT CONSTRAINT)
// ============================================================================

test('validateConvoyDynamicDraft blocks voyage when dynamic_draft of heaviest barge exceeds min_water_level', async () => {
  const { validateConvoyDynamicDraft } = await loadTsModule('../netlify/functions/_shared/draft-validation.ts');

  const barges = [
    { id: 101, name: 'Barcaza Tolva T-101', capacity: 1500, dynamicDraft: 2.7 },
    { id: 102, name: 'Barcaza Tanque Pesada Q-201', capacity: 2200, dynamicDraft: 3.2 },
    { id: 103, name: 'Barcaza Cubierta D-301', capacity: 1200, dynamicDraft: 2.4 },
  ];

  // Caso 1: Estiaje crítico a 2.6m -> Calado de barcaza más pesada (3.2m) excede el nivel de agua
  const blockedResult = validateConvoyDynamicDraft({
    barges,
    minWaterLevel: 2.6,
    riverName: 'Hidrovía Paraná-Paraguay',
  });

  assert.equal(blockedResult.isValid, false, 'El viaje debe ser inválido');
  assert.equal(blockedResult.isBlocked, true, 'El viaje debe estar bloqueado');
  assert.ok(blockedResult.error?.includes('Restricción Crítica de Calado'), 'Debe incluir mensaje de restricción');
  assert.ok(blockedResult.marginMeters < 0, 'El margen debe ser negativo por exceso de calado');
  assert.equal(blockedResult.maxDynamicDraft, 3.2, 'Debe detectar el calado máximo crítico');

  // Caso 2: Estiaje favorable a 3.5m -> Navegación segura con margen bajo quilla
  const safeResult = validateConvoyDynamicDraft({
    barges,
    minWaterLevel: 3.5,
    riverName: 'Hidrovía Paraná-Paraguay',
  });

  assert.equal(safeResult.isValid, true, 'El viaje debe ser aprobado');
  assert.equal(safeResult.isBlocked, false, 'El viaje no debe estar bloqueado');
  assert.equal(safeResult.marginMeters, 0.3, 'Margen de seguridad positivo');
});

test('Netlify function river-voyages enforces draft constraint before saving voyage', async () => {
  const functionSource = await readFile(new URL('../netlify/functions/river-voyages.ts', import.meta.url), 'utf8');

  assert.ok(
    functionSource.includes('validateConvoyDynamicDraft'),
    'river-voyages.ts debe invocar validateConvoyDynamicDraft'
  );
  assert.ok(
    functionSource.includes('draftValidation.isBlocked'),
    'river-voyages.ts debe comprobar si el calado está bloqueado'
  );
  assert.ok(
    functionSource.includes('DRAFT_LIMIT_EXCEEDED'),
    'river-voyages.ts debe retornar el código de error DRAFT_LIMIT_EXCEEDED cuando se supere el calado'
  );
});

test('ConvoyBuilder.tsx renders critical draft constraint alert and blocks save action in UI', async () => {
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');

  // Alerta crítica en UI
  assert.ok(
    convoySource.includes('ALERTA CRÍTICA: Restricción de Calado Dinámico (Draft Constraint)') ||
    convoySource.includes('draft-constraint-critical-alert'),
    'ConvoyBuilder.tsx debe renderizar la alerta crítica de restricción de calado en la UI'
  );

  // Validación bloqueante en el manejador de guardado
  assert.ok(
    convoySource.includes('!isDraftSafe') && convoySource.includes('maxDynamicDraft > Number(minWaterLevel)'),
    'ConvoyBuilder.tsx debe bloquear el guardado si el calado supera el nivel de estiaje'
  );
});

// ============================================================================
// 2. CÁLCULO DE OPEX DESACOPLADO (MOTOR VS CARGA)
// ============================================================================

test('fluvialEstimator calculates decoupled Vector 1: Costo del Motor (Days × dailyOpex + Fuel)', async () => {
  const { calculateMotorCost } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const motor = calculateMotorCost({
    navigationDays: 10,
    dailyOpex: 3000,
    fuelConsumptionTonsPerDay: 5,
    fuelPricePerTon: 600,
  });

  // 10 días × $3000/d = $30,000 OPEX
  assert.equal(motor.opexTotalCost, 30000, 'OPEX total del remolcador correcto');
  // 10 días × 5 MT/d = 50 MT × $600 = $30,000 Fuel
  assert.equal(motor.estimatedFuelCost, 30000, 'Costo de combustible estimado correcto');
  // Total Motor = 30000 + 30000 = $60,000
  assert.equal(motor.totalMotorCost, 60000, 'Costo total del motor segregado correctamente');
});

test('fluvialEstimator calculates decoupled Vector 2: Costo de Carga (Coupling Days × Rental/Amortization)', async () => {
  const { calculateCargoCost } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const cargo = calculateCargoCost({
    barges: [
      { id: 1, name: 'B-101', couplingDays: 10, dailyRate: 250 },
      { id: 2, name: 'B-102', couplingDays: 10, dailyRate: 250 },
      { id: 3, name: 'B-103', couplingDays: 8, dailyRate: 300 },
    ],
  });

  // B-101: 10 × 250 = 2500
  // B-102: 10 × 250 = 2500
  // B-103: 8 × 300 = 2400
  // Total = 7400
  assert.equal(cargo.bargeCount, 3, 'Cantidad de barcazas acopladas');
  assert.equal(cargo.totalCargoCost, 7400, 'Costo total de barcazas/carga segregado correctamente');
});

test('estimateFluvialVoyage unifies decoupled motor and cargo vectors into complete voyage OPEX', async () => {
  const { estimateFluvialVoyage } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const estimate = estimateFluvialVoyage({
    tugboat: { dailyOpex: 3200, enginePowerHp: 3500 },
    navigationDays: 8,
    fuelConsumptionTonsPerDay: 4,
    fuelPricePerTon: 700,
    barges: [
      { id: 1, name: 'B-1', capacity: 1500, couplingDays: 8, dailyRate: 250 },
      { id: 2, name: 'B-2', capacity: 1500, couplingDays: 8, dailyRate: 250 },
    ],
    waitingHours: 0,
  });

  // Motor: 8 × 3200 (25600) + 8 × 4 × 700 (22400) = 48000
  assert.equal(estimate.motorCost.totalMotorCost, 48000);
  // Carga: 2 × 8 × 250 = 4000
  assert.equal(estimate.cargoCost.totalCargoCost, 4000);
  // Base total: 48000 + 4000 = 52000
  assert.equal(estimate.baseVoyageCost, 52000);
  assert.equal(estimate.totalVoyageCost, 52000);
});

// ============================================================================
// 3. MÓDULO DE DEMORAS EN ESCLUSAS (DEMURRAGE)
// ============================================================================

test('calculateDemurrageCost computes idle tugboat surcharge and adds to voyage total', async () => {
  const { calculateDemurrageCost } = await loadTsModule('../src/services/fluvialEstimator.ts');

  // Remolcador con OPEX $2400/día -> $100/hora en espera
  // 12 horas en esclusa, combustible ralentí: 0.05 MT/h @ $680/MT -> $34/h
  // Costo por hora ralentí = $134/h -> 12 h × 134 = $1608
  const demurrage = calculateDemurrageCost({
    waitingHours: 12,
    dailyOpex: 2400,
    idleFuelTonsPerHour: 0.05,
    fuelPricePerTon: 680,
  });

  assert.equal(demurrage.waitingHours, 12);
  assert.equal(demurrage.hourlyOpexRate, 100);
  assert.equal(demurrage.idleOpexCost, 1200);
  assert.equal(demurrage.idleFuelCost, 408);
  assert.equal(demurrage.totalDemurrageCost, 1608);
});

test('LockDemurrageModule frontend component registers waiting times and updates voyage total', async () => {
  const demurrageSource = await readFile(new URL('../src/components/LockDemurrageModule.tsx', import.meta.url), 'utf8');

  // Permite al operador registrar "Tiempos de Espera"
  assert.ok(
    demurrageSource.includes('Tiempos de Espera') || demurrageSource.includes('waitingHours'),
    'LockDemurrageModule debe registrar tiempos de espera'
  );
  assert.ok(
    demurrageSource.includes('Esclusa') && demurrageSource.includes('Aduana'),
    'LockDemurrageModule debe categorizar por tráfico en esclusas o aduanas'
  );

  // Recálculo automático del sobrecosto operativo del remolcador en ralentí
  assert.ok(
    demurrageSource.includes('calculateDemurrageCost') || demurrageSource.includes('demurrageBreakdown'),
    'LockDemurrageModule debe recalcular automáticamente el sobrecosto'
  );
  assert.ok(
    demurrageSource.includes('hourlyIdleTotalRate') || demurrageSource.includes('hourlyOpexRate'),
    'LockDemurrageModule debe calcular la tarifa en ralentí'
  );

  // Sumar al gasto total del viaje
  assert.ok(
    demurrageSource.includes('recalculatedTotalVoyageCost'),
    'LockDemurrageModule debe sumar el sobrecosto al gasto total del viaje'
  );

  // Integración en ConvoyBuilder.tsx
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');
  assert.ok(
    convoySource.includes('<LockDemurrageModule') || convoySource.includes('LockDemurrageModule'),
    'ConvoyBuilder.tsx debe integrar el componente LockDemurrageModule en la vista de detalle del viaje'
  );
});
