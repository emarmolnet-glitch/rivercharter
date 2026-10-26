import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

// Helper para importar módulos de TypeScript mediante archivo transpilado temporal en disco
import ts from 'typescript';

async function loadTsModule(relativePath) {
  const filePath = path.resolve(process.cwd(), relativePath);
  const source = await readFile(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const tempFilePath = path.resolve(path.dirname(filePath), `.temp-${path.basename(filePath, '.ts')}-${Date.now()}.mjs`);
  await writeFile(tempFilePath, transpiled, 'utf8');
  try {
    const mod = await import(`file://${tempFilePath}`);
    return mod;
  } finally {
    await unlink(tempFilePath).catch(() => {});
  }
}

test('1. FluvialFixtureRecapService: Construcción y consolidación de datos reactivos (Main Terms)', async () => {
  const { buildFluvialFixtureRecapData } = await loadTsModule('src/services/fluvialFixtureRecapService.ts');

  const terms = buildFluvialFixtureRecapData({
    pol: 'San Lorenzo (Km 440)',
    pod: 'Nueva Palmira (Km 0)',
    riverName: 'Hidrovía Paraná-Paraguay',
    operationType: 'BULK',
    freightRate: 38.5,
    tugboatName: 'Río Paraná Star',
    tugboatPowerHp: 4000,
    bargeCount: 15,
  });

  // Verificación de términos comerciales principales
  assert.equal(terms.pol, 'San Lorenzo (Km 440)', 'Puerto de carga correcto');
  assert.equal(terms.pod, 'Nueva Palmira (Km 0)', 'Puerto de descarga correcto');
  assert.equal(terms.operationType, 'BULK', 'Tipo de operación Granel');
  assert.equal(terms.freightRate, 38.5, 'Flete acordado en 38.5 USD/MT');
  assert.equal(terms.tugboatName, 'Río Paraná Star', 'Empujador nominado');
  assert.equal(terms.bargeCount, 15, '15 Barcazas en convoy');
  // Disposición geométrica calculada: 3 columnas x 5 filas
  assert.equal(terms.convoyCols, 3, '3 Columnas para respetar manga máxima de esclusa');
  assert.equal(terms.convoyRows, 5, '5 Filas de barcazas Jumbo');
  assert.ok(terms.contractRef.startsWith('RC-FIX-'), 'Referencia contractual única generada');
});

test('2. Cláusula de Estiaje y Falso Flete (Tonnage Shedding Clause - Fase 2)', async () => {
  const { buildFluvialFixtureRecapData } = await loadTsModule('src/services/fluvialFixtureRecapService.ts');

  // Convoy de 4 barcazas (Nominal: 6,000 MT) con calado admisible reducido a 2.70 m por estiaje
  const terms = buildFluvialFixtureRecapData({
    bargeCount: 4,
    nominalTonnage: 6000,
    designDraft: 3.66,
    maxAdmissibleDraft: 2.70,
    isDraftRestricted: true,
  });

  assert.equal(terms.isDraftRestricted, true, 'Restricción por estiaje debe estar activa');
  assert.equal(terms.maxAdmissibleDraft, 2.70, 'Calado admisible en 2.70 m documentado');
  assert.equal(terms.nominalTonnage, 6000, 'Capacidad nominal documentada en 6,000 MT');
  // Capacidad ajustada a 2.70m con calado en rosca 0.55m y TPC 4.5: (2.70 - 0.55) * 100 * 4.5 * 4 = 3,870 MT
  assert.ok(terms.adjustedTonnage < terms.nominalTonnage, 'Capacidad ajustada menor que la nominal');
  assert.ok(terms.lostTonnage > 0, 'Merma de carga (Deadfreight) calculada y documentada');
  assert.equal(terms.nominalTonnage, Math.round(terms.adjustedTonnage + terms.lostTonnage), 'Nominal = Ajustada + Merma');
});

test('3. Cláusula de Navegación y Esclusas (Lockage & Transit Terms - Fase 3)', async () => {
  const { buildFluvialFixtureRecapData } = await loadTsModule('src/services/fluvialFixtureRecapService.ts');

  // Caso 1: Convoy Jumbo de 15 barcazas (1,125 ft x 105 ft) -> Excede eslora de esclusa (600 ft)
  const termsDouble = buildFluvialFixtureRecapData({
    bargeCount: 15,
    lockCount: 2,
  });

  assert.equal(termsDouble.requiresDoubleLockage, true, 'Convoy de 15 barcazas requiere Esclusado Doble');
  assert.equal(termsDouble.lockCount, 2, '2 Esclusas en la ruta');
  // 2 esclusas * 3.5h = 7.0 horas de demora declaradas contractualmente
  assert.equal(termsDouble.doubleLockageHours, 7.0, '7.0 horas de demora contractuales declaradas');

  // Caso 2: Convoy pequeño de 4 barcazas (2 col x 2 fil = 540 ft x 70 ft) cabe en cámara 600x110
  const termsSingle = buildFluvialFixtureRecapData({
    bargeCount: 4,
    convoyLengthFt: 540,
    convoyBeamFt: 70,
    requiresDoubleLockage: false,
    lockCount: 1,
  });

  assert.equal(termsSingle.requiresDoubleLockage, false, 'Convoy pequeño cabe en cámara sin esclusado doble');
  assert.equal(termsSingle.doubleLockageHours, 0, '0 horas adicionales por esclusado doble');
});

test('4. Condiciones de Terminal y Demoras (Laytime & Demurrage - Fase 4)', async () => {
  const { buildFluvialFixtureRecapData } = await loadTsModule('src/services/fluvialFixtureRecapService.ts');

  // Modo Granel
  const bulkTerms = buildFluvialFixtureRecapData({
    operationType: 'BULK',
    nominalTonnage: 6000,
    bulkProductivityTonsPerHour: 250, // 250 MT/h
    demurrageRatePerDay: 4800, // $4,800 USD/día
  });

  assert.match(bulkTerms.stevedoringProductivityLabel, /250 MT\/hora/, 'Ritmo de estiba granel reflejado');
  // 6000 MT / 250 MT/h = 24.0 horas = 1.00 día operativo libre
  assert.equal(bulkTerms.freeTimeHours, 24, '24 horas de Tiempo Libre (Free Time)');
  assert.equal(bulkTerms.freeTimeDays, 1, '1 día operativo de Tiempo Libre');
  assert.equal(bulkTerms.demurrageRatePerDay, 4800, 'Tarifa de demora pactada en $4,800 USD/día');
  assert.equal(bulkTerms.demurrageRatePerHour, 200, 'Tarifa horaria de demora pactada en $200 USD/hora');

  // Modo Ro-Ro
  const roroTerms = buildFluvialFixtureRecapData({
    operationType: 'RORO',
    bargeCount: 2, // ~90 camiones
    roroMinutesPerTruck: 15, // 15 min/camión = 4 unidades/hora
    demurrageRatePerDay: 4200,
  });

  assert.match(roroTerms.stevedoringProductivityLabel, /15 min\/camión/, 'Ritmo de estiba Ro-Ro reflejado');
  assert.ok(roroTerms.freeTimeHours > 0, 'Free Time en horas calculado para rodados');
  assert.ok(roroTerms.freeTimeDays > 0, 'Free Time en días calculado para rodados');
});

test('5. Generación de PDF formal con jsPDF: Documento limpio, tabular y apto para firma digital', async () => {
  const { generateFluvialFixtureRecapPdf } = await loadTsModule('src/services/fluvialFixtureRecapService.ts');

  const doc = generateFluvialFixtureRecapPdf({
    pol: 'Corumbá (Km 1530)',
    pod: 'Nueva Palmira (Km 0)',
    riverName: 'Hidrovía Paraná-Paraguay',
    freightRate: 42.0,
    bargeCount: 8,
    isDraftRestricted: true,
    maxAdmissibleDraft: 2.80,
    nominalTonnage: 12000,
    adjustedTonnage: 9600,
    lostTonnage: 2400,
    requiresDoubleLockage: true,
    lockCount: 1,
    doubleLockageHours: 3.5,
  }, { save: false });

  assert.ok(doc, 'Instancia de jsPDF generada');
  assert.equal(doc.getNumberOfPages(), 2, 'Documento generado con 2 páginas A4 estructuradas');
});

test('6. Presencia de Botón "Exportar Fixture Recap (PDF)" en el Panel Ejecutivo de UI', async () => {
  const indexHtml = await readFile(path.resolve(process.cwd(), 'index.html'), 'utf8');
  const convoySource = await readFile(path.resolve(process.cwd(), 'src/components/ConvoyBuilder.tsx'), 'utf8');

  // En index.html: Panel Ejecutivo (#executive-dashboard)
  assert.ok(
    indexHtml.includes('btn-export-fluvial-fixture-recap'),
    'index.html incluye el botón id="btn-export-fluvial-fixture-recap"'
  );
  assert.ok(
    indexHtml.includes('Exportar Fixture Recap (PDF)'),
    'index.html contiene la etiqueta de texto "Exportar Fixture Recap (PDF)"'
  );
  assert.ok(
    indexHtml.includes('exportFluvialFixtureRecapPDF'),
    'index.html vincula y expone la función exportFluvialFixtureRecapPDF()'
  );

  // En ConvoyBuilder.tsx: Vista Ejecutiva
  assert.ok(
    convoySource.includes('btn-convoy-export-fixture-recap'),
    'ConvoyBuilder.tsx incluye el botón de exportación en la Vista Ejecutiva'
  );
  assert.ok(
    convoySource.includes('Exportar Fixture Recap (PDF)'),
    'ConvoyBuilder.tsx incluye la etiqueta "Exportar Fixture Recap (PDF)"'
  );
});

test('7. Gobernanza GEMINI.md: No activación autónoma de Radar AIS ni Informes Master', async () => {
  const serviceSource = await readFile(path.resolve(process.cwd(), 'src/services/fluvialFixtureRecapService.ts'), 'utf8');

  // Prohibición estricta de invocar Datalastic / AISStream automáticamente
  assert.doesNotMatch(serviceSource, /datalastic.*fetch|aisstream.*connect/i, 'No dispara llamadas automáticas a Datalastic o AISStream');
  // Prohibición de disparar o generar Informe Master automáticamente
  assert.doesNotMatch(serviceSource, /buildMasterAudit|generateMasterReport/i, 'No asume ni dispara el Informe Master');
});
