import test from 'node:test';
import assert from 'node:assert/strict';
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

test('1. Matriz de Tarifas Portuarias Fluviales: Constantes por defecto según especificación', async () => {
    const {
        DEFAULT_DOCKAGE_DAILY_RATE_PER_BARGE,
        DEFAULT_PILOTAGE_FEE,
        DEFAULT_BULK_HANDLING_RATE_PER_TON,
        DEFAULT_BULK_PRODUCTIVITY_TONS_PER_HOUR,
        DEFAULT_RORO_HANDLING_RATE_PER_UNIT,
        DEFAULT_RORO_MINUTES_PER_TRUCK
    } = await loadTsModule('../src/services/fluvialEstimator.ts');

    assert.strictEqual(DEFAULT_DOCKAGE_DAILY_RATE_PER_BARGE, 150, 'Muellaje por defecto debe ser $150/día/barcaza');
    assert.strictEqual(DEFAULT_PILOTAGE_FEE, 800, 'Practicaje/amarre por defecto debe ser $800 por escala');
    assert.strictEqual(DEFAULT_BULK_HANDLING_RATE_PER_TON, 3.50, 'Estiba granel por defecto debe ser $3.50/MT');
    assert.strictEqual(DEFAULT_BULK_PRODUCTIVITY_TONS_PER_HOUR, 250, 'Rendimiento granel por defecto debe ser 250 MT/h');
    assert.strictEqual(DEFAULT_RORO_HANDLING_RATE_PER_UNIT, 45, 'Estiba Ro-Ro por defecto debe ser $45/camión');
    assert.strictEqual(DEFAULT_RORO_MINUTES_PER_TRUCK, 15, 'Rendimiento Ro-Ro por defecto debe ser 15 min/camión');
});

test('2. Algoritmo Terminal Handling: Modo Granel (Bulk Cargo)', async () => {
    const { calculateTerminalPda } = await loadTsModule('../src/services/fluvialEstimator.ts');
    const bargeCount = 4;
    const tonnage = 6000; // 6,000 MT

    const result = calculateTerminalPda({
        bargeCount,
        cargoType: 'bulk',
        tonnage,
        dockageDailyRatePerBarge: 150,
        pilotageFee: 800,
        handlingRatePerTon: 3.50,
        bulkProductivityTonsPerHour: 250,
        fuelPricePerTon: 780
    });

    // Tiempo operativo en puerto: 6000 / 250 = 24 horas = 1.0 día
    assert.strictEqual(result.portOperatingHours, 24, '24 horas de estiba a 250 MT/h');
    assert.strictEqual(result.portOperatingDays, 1, '1 día operativo de puerto');

    // Coste total de estiba: 6000 * 3.50 = 21,000 USD
    assert.strictEqual(result.handlingCost, 21000, 'Estiba = 6000 MT * $3.50 = $21,000');

    // Muellaje: 4 barcazas * $150/d * 1.0 d = 600 USD
    assert.strictEqual(result.dockageCost, 600, 'Muellaje = 4 barcazas * $150/d * 1 d = $600');

    // Practicaje: 800 USD fijo
    assert.strictEqual(result.pilotageFee, 800, 'Practicaje fijo = $800');

    // Total PDA terminal = 600 + 800 + 21000 = 22,400 USD
    assert.strictEqual(result.totalTerminalCost, 22400, 'Total PDA = $22,400');

    // Consumo búnker en puerto a régimen de espera/auxiliares: 24h * 0.05 MT/h = 1.2 MT * $780 = $936
    assert.strictEqual(result.portFuelTons, 1.2, 'Consumo búnker puerto = 1.2 MT');
    assert.strictEqual(result.portFuelCost, 936, 'Costo búnker puerto = $936');
    assert.match(result.productivityMetric, /250 MT\/hora/);
});

test('3. Algoritmo Terminal Handling: Modo Ro-Ro (Carretera Flotante)', async () => {
    const { calculateTerminalPda } = await loadTsModule('../src/services/fluvialEstimator.ts');
    const bargeCount = 2;
    const truckCount = 80;

    const result = calculateTerminalPda({
        bargeCount,
        cargoType: 'roro',
        truckCount,
        dockageDailyRatePerBarge: 150,
        pilotageFee: 800,
        handlingRatePerUnit: 45,
        roroMinutesPerTruck: 15,
        fuelPricePerTon: 800
    });

    // Tiempo operativo en puerto: (80 * 15 min) / 60 = 20 horas = 0.83 días
    assert.strictEqual(result.portOperatingHours, 20, '20 horas de embarque rodado expedito');
    assert.strictEqual(result.portOperatingDays, 0.83, '0.83 días operativos de puerto');

    // Coste total de estiba: 80 camiones * $45/camión = 3,600 USD
    assert.strictEqual(result.handlingCost, 3600, 'Estiba Ro-Ro = 80 * $45 = $3,600');

    // Muellaje: 2 barcazas * $150/d * 0.83 d = 249 USD
    assert.strictEqual(result.dockageCost, 249, 'Muellaje Ro-Ro = 2 * 150 * 0.83 = $249');

    // Practicaje: 800 USD
    assert.strictEqual(result.pilotageFee, 800, 'Practicaje Ro-Ro = $800');

    // Total PDA terminal = 249 + 800 + 3600 = 4,649 USD
    assert.strictEqual(result.totalTerminalCost, 4649, 'Total PDA Ro-Ro = $4,649');

    // Consumo búnker en puerto a régimen de espera: 20h * 0.05 MT/h = 1.0 MT * $800 = $800
    assert.strictEqual(result.portFuelTons, 1.0, 'Búnker auxiliar puerto = 1.0 MT');
    assert.strictEqual(result.portFuelCost, 800, 'Costo búnker puerto = $800');
    assert.match(result.productivityMetric, /unidades\/hora/);
});

test('4. Integración en estimateFluvialVoyage: totalVoyageCost, totalEffectiveDays y dailyTce', async () => {
    const { estimateFluvialVoyage } = await loadTsModule('../src/services/fluvialEstimator.ts');
    const convoy = {
        tugboat: {
            id: 'tug-1',
            name: 'Pampa I',
            powerBhp: 4500,
            dailyOpex: 3200,
            fuelConsumptionSailingTonsPerDay: 6.5,
            fuelConsumptionIdleTonsPerDay: 0.8,
            lengthFt: 120,
            beamFt: 35
        },
        barges: [
            { id: 'b-1', type: 'Mississippi-Jumbo', nominalCapacityTons: 1500, dailyRentalCost: 200, lengthFt: 195, beamFt: 35, draftEmptyMeters: 0.5, draftDesignMeters: 2.7 },
            { id: 'b-2', type: 'Mississippi-Jumbo', nominalCapacityTons: 1500, dailyRentalCost: 200, lengthFt: 195, beamFt: 35, draftEmptyMeters: 0.5, draftDesignMeters: 2.7 },
            { id: 'b-3', type: 'Mississippi-Jumbo', nominalCapacityTons: 1500, dailyRentalCost: 200, lengthFt: 195, beamFt: 35, draftEmptyMeters: 0.5, draftDesignMeters: 2.7 },
            { id: 'b-4', type: 'Mississippi-Jumbo', nominalCapacityTons: 1500, dailyRentalCost: 200, lengthFt: 195, beamFt: 35, draftEmptyMeters: 0.5, draftDesignMeters: 2.7 }
        ],
        layout: { columns: 2, rows: 2 }
    };

    const voyageParams = {
        distanceKm: 1200,
        riverSpeedKmh: 18,
        delayDays: 1,
        bunkerPricePerTon: 780,
        waterLevelMeters: 3.5,
        sellingFreightPerTon: 40,
        cargoType: 'bulk',
        dockageDailyRatePerBarge: 150,
        pilotageFee: 800,
        handlingRatePerTon: 3.50,
        bulkProductivityTonsPerHour: 250
    };

    const estimate = estimateFluvialVoyage(convoy, voyageParams);

    // Días efectivos de navegación más puerto y demoras
    assert.ok(estimate.terminalPda, 'Debe incluir desglose terminalPda');
    assert.strictEqual(estimate.terminalPda.portOperatingDays, 1, '6000 MT / 250 MT/h = 24h = 1 día');
    assert.strictEqual(estimate.terminalPda.handlingCost, 21000, '6000 MT * 3.50 = 21000');
    assert.strictEqual(estimate.terminalPda.dockageCost, 600, '4 barcazas * 150 * 1d = 600');
    assert.strictEqual(estimate.terminalPda.pilotageFee, 800, 'Practicaje = 800');

    // Costo total de viaje incluye costos terminal PDA y búnker de puerto
    assert.ok(estimate.totalVoyageCost > 0);
    assert.ok(estimate.totalEffectiveDays > estimate.sailingDays, 'Días totales efectivos deben sumar días en puerto');
    assert.strictEqual(estimate.terminalPda.portFuelCost, 936, 'Combustible puerto auxiliar = $936');
});

test('5. Interfaz UI: Componentes en ConvoyBuilder.tsx e index.html', async () => {
    const convoyBuilderSrc = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf-8');
    const indexHtmlSrc = await readFile(new URL('../index.html', import.meta.url), 'utf-8');

    // ConvoyBuilder.tsx inputs and breakdown panel
    assert.ok(convoyBuilderSrc.includes('dockageDailyRatePerBarge'), 'ConvoyBuilder debe manejar dockageDailyRatePerBarge');
    assert.ok(convoyBuilderSrc.includes('pilotageFee'), 'ConvoyBuilder debe manejar pilotageFee');
    assert.ok(convoyBuilderSrc.includes('handlingRatePerTon'), 'ConvoyBuilder debe manejar handlingRatePerTon');
    assert.ok(convoyBuilderSrc.includes('handlingRatePerUnit'), 'ConvoyBuilder debe manejar handlingRatePerUnit');
    assert.ok(convoyBuilderSrc.includes('convoy-pda-terminal-breakdown'), 'ConvoyBuilder debe tener panel de desglose terminal PDA');
    assert.ok(convoyBuilderSrc.includes('Desglose Portuario y Terminal (PDA)'), 'ConvoyBuilder debe tener título Desglose Portuario y Terminal (PDA)');
    assert.ok(convoyBuilderSrc.includes('Muellaje'), 'ConvoyBuilder debe mostrar Muellaje');
    assert.ok(convoyBuilderSrc.includes('Practicaje'), 'ConvoyBuilder debe mostrar Practicaje');
    assert.ok(convoyBuilderSrc.includes('Estiba'), 'ConvoyBuilder debe mostrar Estiba');

    // index.html inputs and breakdown panel
    assert.ok(indexHtmlSrc.includes('fluvial-dockage-rate'), 'index.html debe tener input fluvial-dockage-rate');
    assert.ok(indexHtmlSrc.includes('fluvial-pilotage-fee'), 'index.html debe tener input fluvial-pilotage-fee');
    assert.ok(indexHtmlSrc.includes('fluvial-handling-rate-bulk'), 'index.html debe tener input fluvial-handling-rate-bulk');
    assert.ok(indexHtmlSrc.includes('fluvial-handling-rate-roro'), 'index.html debe tener input fluvial-handling-rate-roro');
    assert.ok(indexHtmlSrc.includes('exec-fluvial-pda-terminal-panel'), 'index.html debe tener panel ejecutivo PDA terminal');
    assert.ok(indexHtmlSrc.includes('Desglose Portuario y Terminal (PDA)'), 'index.html debe mostrar Desglose Portuario y Terminal (PDA)');
    assert.ok(indexHtmlSrc.includes('exec-pda-dockage'), 'index.html debe tener badge exec-pda-dockage');
    assert.ok(indexHtmlSrc.includes('exec-pda-pilotage'), 'index.html debe tener badge exec-pda-pilotage');
    assert.ok(indexHtmlSrc.includes('exec-pda-handling'), 'index.html debe tener badge exec-pda-handling');
    assert.ok(indexHtmlSrc.includes('exec-pda-port-days'), 'index.html debe tener badge exec-pda-port-days');
});

test('6. Gobernanza GEMINI.md: No se activan llamadas AIS automáticas ni informes master autónomos', async () => {
    const convoyBuilderSrc = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf-8');
    const indexHtmlSrc = await readFile(new URL('../index.html', import.meta.url), 'utf-8');
    const estimatorSrc = await readFile(new URL('../src/services/fluvialEstimator.ts', import.meta.url), 'utf-8');

    // Asegurar que no hay llamadas fetch automáticas a endpoints restringidos
    assert.ok(!estimatorSrc.includes('fetch('), 'fluvialEstimator no debe realizar fetch autónomos');
    assert.ok(!convoyBuilderSrc.includes('window.generateMasterReport()'), 'No debe haber llamadas automáticas al Informe Master');
});
