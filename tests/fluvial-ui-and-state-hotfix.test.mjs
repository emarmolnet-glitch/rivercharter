import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Theme Light estricto: Executive View and Technical Workspace force light palette (bg-white, border-slate-200, text-slate-800)', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verify single clean footer
  const footerMatches = indexHtml.match(/<footer class="app-footer\b/g);
  assert.equal(footerMatches?.length, 1, 'Debe haber exactamente un footer app-footer');

  // Verify Executive Dashboard is styled strictly with Theme Light palette
  const execSectionMatch = indexHtml.match(/<div id="executive-dashboard"[\s\S]*?<div id="technical-workspace"/);
  assert.ok(execSectionMatch, 'Debe encontrar la sección executive-dashboard');
  const execSection = execSectionMatch[0];

  assert.ok(execSection.includes('bg-white'), 'La vista ejecutiva debe tener tarjetas bg-white');
  assert.ok(execSection.includes('border-slate-200'), 'La vista ejecutiva debe tener bordes border-slate-200');
  assert.ok(execSection.includes('text-slate-800') || execSection.includes('text-slate-700'), 'La vista ejecutiva debe usar texto oscuro');

  // No dark cards in executive dashboard
  assert.ok(!execSection.includes('class="bg-slate-900 border border-slate-700'), 'No debe tener tarjetas oscuras bg-slate-900 border-slate-700');
  assert.ok(!execSection.includes('bg-gradient-to-r from-slate-900 to-slate-950'), 'No debe tener fondos degradados oscuros');

  // Verify ConvoyBuilder.tsx uses light palette
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');
  assert.ok(convoySource.includes('bg-white'), 'ConvoyBuilder debe utilizar bg-white');
  assert.ok(convoySource.includes('border-slate-200'), 'ConvoyBuilder debe utilizar border-slate-200');
  assert.ok(!convoySource.includes('bg-slate-900'), 'ConvoyBuilder no debe contener clases bg-slate-900');
  assert.ok(!convoySource.includes('bg-slate-950'), 'ConvoyBuilder no debe contener clases bg-slate-950');

  // Verify Mode Toggle button classes
  assert.ok(indexHtml.includes('btn-mode-exec'), 'Debe incluir botón btn-mode-exec');
  assert.ok(indexHtml.includes('btn-mode-tech'), 'Debe incluir botón btn-mode-tech');
  assert.ok(indexHtml.includes("setCalculatorMode('exec')"), 'Debe permitir alternar a Vista Ejecutiva');
  assert.ok(indexHtml.includes("setCalculatorMode('tech')"), 'Debe permitir alternar a Modo Técnico');
});

test('Distribución Modular Fluvial (Bloques 1 al 8) y gestión de visibilidad oceánica', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Bloque 1 (Rutas): input min_water_level junto a origen y destino
  assert.ok(indexHtml.includes('id="min_water_level"'), 'Bloque 1 debe incluir input min_water_level');
  assert.ok(indexHtml.includes('id="port-pol"'), 'Bloque 1 debe incluir puerto POL');
  assert.ok(indexHtml.includes('id="port-pod"'), 'Bloque 1 debe incluir puerto POD');

  // Bloque 2 (Especificaciones): ConvoyBuilder presente y elementos oceánicos ocultos
  assert.ok(indexHtml.includes('id="convoy-builder-root"'), 'Bloque 2 debe incluir el punto de montaje de ConvoyBuilder');
  assert.ok(indexHtml.includes('id="oceanic-vessel-specs"'), 'Bloque 2 debe agrupar y ocultar especificaciones oceánicas');
  const b2Oceanic = indexHtml.match(/<div id="oceanic-vessel-specs"[^>]*>/)?.[0] || '';
  assert.ok(b2Oceanic.includes('data-oceanic="true"') && b2Oceanic.includes('hidden'), 'Inputs oceánicos de Bloque 2 deben estar ocultos');

  // Bloque 3 (Costes): OPEX Remolcador, CAPEX Barcazas, Bunkers Fluviales y PDAs
  assert.ok(indexHtml.includes('id="fluvial-opex-tugboat"'), 'Bloque 3 debe incluir input de OPEX del remolcador');
  assert.ok(indexHtml.includes('id="fluvial-capex-barges"'), 'Bloque 3 debe incluir input de CAPEX diario de barcazas');
  assert.ok(indexHtml.includes('id="fluvial-fuel-sailing-rate"'), 'Bloque 3 debe incluir bunker navegando');
  assert.ok(indexHtml.includes('id="fluvial-fuel-idle-rate"'), 'Bloque 3 debe incluir bunker ralentí/espera');
  assert.ok(indexHtml.includes('id="fluvial-fuel-price"'), 'Bloque 3 debe incluir precio de combustible fluvial');
  assert.ok(indexHtml.includes('id="fluvial-pda-locks"'), 'Bloque 3 debe incluir PDA de esclusas');
  assert.ok(indexHtml.includes('id="fluvial-pda-tolls"'), 'Bloque 3 debe incluir peajes de hidrovía');
  assert.ok(indexHtml.includes('id="fluvial-pda-pilotage"'), 'Bloque 3 debe incluir practicaje fluvial');

  // Bloques 4 y 5 (Tiempos y Operaciones): Esperas en esclusas y aduanas
  assert.ok(indexHtml.includes('id="fluvial-lock-wait-days"'), 'Bloques 4/5 deben incluir esperas en esclusas');
  assert.ok(indexHtml.includes('id="fluvial-customs-delay-days"'), 'Bloques 4/5 deben incluir demoras en aduanas');

  // Bloque 7 (Inteligencia de Mercado): Ocultación estricta de paneles oceánicos de graneles secos
  const marketIntelMatch = indexHtml.match(/<section id="market-intel-dashboard"[^>]*>/)?.[0] || '';
  assert.ok(marketIntelMatch.includes('data-oceanic="true"') && marketIntelMatch.includes('hidden'), 'Market Intel Dry Bulk debe estar estrictamente oculto');
  const balticSpotMatch = indexHtml.match(/<div id="baltic-spot-reference-card"[^>]*>/)?.[0] || '';
  assert.ok(balticSpotMatch.includes('data-oceanic="true"') && balticSpotMatch.includes('hidden'), 'Espejo Data Bridge debe estar estrictamente oculto');

  // Bloque 8 (Negociación Comercial): Visible y adaptado a rentabilidad fluvial
  assert.ok(indexHtml.includes('id="freight-sell"'), 'Bloque 8 debe incluir flete de venta');
  assert.ok(indexHtml.includes('id="res-net-profit-charterer"'), 'Bloque 8 debe calcular y mostrar el beneficio neto');
  assert.ok(indexHtml.includes('id="res-tce-label"'), 'Bloque 8 debe mostrar el TCE diario del viaje');
  assert.ok(indexHtml.includes('updateFluvialCalculations'), 'Debe existir función updateFluvialCalculations para el cálculo fluvial');
});

test('convoy-builder-entry and mode toggling sync properly in Theme Light', async () => {
  const entrySource = await readFile(new URL('../src/convoy-builder-entry.tsx', import.meta.url), 'utf8');

  // Verifica sincronización de modo
  assert.ok(entrySource.includes("calculator-mode-changed"), 'Debe escuchar el evento calculator-mode-changed');
  assert.ok(entrySource.includes("onModeChange={handleModeChange}"), 'Debe pasar handleModeChange a ConvoyBuilder');
  assert.ok(entrySource.includes("setCalculatorMode"), 'Debe sincronizar con setCalculatorMode');

  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');
  assert.ok(convoySource.includes("id=\"convoy-btn-mode-tech\""), 'Debe incluir botón Modo Técnico');
  assert.ok(convoySource.includes("id=\"convoy-btn-mode-exec\""), 'Debe incluir botón Vista Ejecutiva');
});
