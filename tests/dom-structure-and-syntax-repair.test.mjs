import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');

test('1. Initial script block has no orphan braces or syntax errors', () => {
    // Check the script tag around line 146
    const scriptStart = html.indexOf("<script>\n        // Declaraciones seguras de ámbito global");
    assert.ok(scriptStart !== -1, 'Initial script block exists');
    const scriptEnd = html.indexOf('</script>', scriptStart);
    const scriptContent = html.substring(scriptStart + '<script>'.length, scriptEnd);

    // Assert it compiles cleanly with new Function without syntax error
    assert.doesNotThrow(() => {
        new Function(scriptContent);
    }, 'Initial script block should compile without syntax errors');

    // Assert globalThis is nested cleanly after window.convoyDesc
    assert.ok(
        scriptContent.includes("window.convoyDesc ="),
        'window.convoyDesc should be assigned'
    );
    assert.ok(
        scriptContent.includes("if (typeof globalThis !== 'undefined')"),
        'globalThis check is present'
    );
});

test('2. generateExecutiveReport has no identifier redeclaration syntax error', () => {
    const fnStart = html.indexOf('function generateExecutiveReport()');
    assert.ok(fnStart !== -1, 'generateExecutiveReport function exists');
    const fnEnd = html.indexOf('window.generarReporteEjecutivo = generateExecutiveReport;', fnStart);
    const fnContent = html.substring(fnStart, fnEnd);

    assert.doesNotThrow(() => {
        new Function(fnContent);
    }, 'generateExecutiveReport should compile without duplicate identifier declaration');
});

test('3. #map-container structure is clean, isolated, and properly closed', () => {
    const mapContainerIdx = html.indexOf('id="map-container"');
    assert.ok(mapContainerIdx !== -1, 'id="map-container" exists');

    const mapSkeletonIdx = html.indexOf('id="map-skeleton"');
    assert.ok(mapSkeletonIdx > mapContainerIdx, 'map-skeleton is inside map-container');

    // Ensure Convoy card is NOT inside view-map
    const viewMapStart = html.indexOf('id="view-map"');
    const viewEstimatorStart = html.indexOf('id="view-estimator"');
    const viewMapSection = html.substring(viewMapStart, viewEstimatorStart);

    assert.ok(!viewMapSection.includes('⏱️ Convoy y Duración Operativa'), 'view-map must not contain Convoy card');
    assert.ok(!viewMapSection.includes('exec-vessel-type'), 'view-map must not contain executive vessel type element');
});

test('4. Executive card ⏱️ Convoy y Duración Operativa is in #executive-dashboard', () => {
    const execDashboardStart = html.indexOf('id="executive-dashboard"');
    assert.ok(execDashboardStart !== -1, 'executive-dashboard exists');

    const convoyCardIdx = html.indexOf('⏱️ Convoy y Duración Operativa');
    assert.ok(convoyCardIdx > execDashboardStart, 'Convoy card is located after executive-dashboard start');

    const viewEstimatorEnd = html.indexOf('<!-- MÓDULO 2: EDITOR GENCON 94 COMPLETO');
    assert.ok(convoyCardIdx < viewEstimatorEnd, 'Convoy card is inside view-estimator');
    assert.ok(html.includes('id="exec-vessel-type">Convoy Súper Jumbo - 10 Barcazas</strong>'), 'Convoy card displays dynamic fluvial convoy');
});
