import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve('.');

test('1. Ensamblador Fluvial: ConvoyBuilder.tsx references activeBargeStandard without undefined standardKey', () => {
    const convoyBuilderPath = path.join(REPO_ROOT, 'src/components/ConvoyBuilder.tsx');
    const source = fs.readFileSync(convoyBuilderPath, 'utf8');

    // Make sure standardKey is not referenced in useEffect outside of handleApplyBargeStandard
    const lines = source.split('\n');
    lines.forEach((line, idx) => {
        if (line.includes('standardKey') && !source.slice(0, source.indexOf('handleApplyBargeStandard')).includes(line)) {
            // Check that standardKey is only inside handleApplyBargeStandard definition
            // Lines 300 to 350
            if (idx + 1 > 350) {
                assert.fail(`Unexpected standardKey reference on line ${idx + 1}: ${line}`);
            }
        }
    });

    // Make sure activeBargeStandard is used in useEffect
    assert.ok(source.includes("activeBargeStandard === 'mississippi_jumbo'"), 'Uses activeBargeStandard for checking mississippi_jumbo');
    assert.ok(source.includes("(window as any).convoyDesc = convoyDesc;"), 'Syncs convoyDesc to window');
    assert.ok(source.includes("(window as any).activeBargeStandard = activeBargeStandard;"), 'Syncs activeBargeStandard to window');
});

test('2. Vista Ejecutiva: Elimina residuo Handysize y muestra configuración dinámica de convoy', () => {
    const indexPath = path.join(REPO_ROOT, 'index.html');
    const indexSource = fs.readFileSync(indexPath, 'utf8');

    const enginePath = path.join(REPO_ROOT, 'voyage-cost-engine.js');
    const engineSource = fs.readFileSync(enginePath, 'utf8');

    // In updateFluvialCalculations in index.html
    assert.ok(indexSource.includes("const elExecVesselType = document.getElementById('exec-vessel-type');"), 'updateFluvialCalculations targets exec-vessel-type');
    assert.ok(indexSource.includes("dynamicDesc = isRoro"), 'updateFluvialCalculations computes dynamic convoy description');

    // In runEngine in index.html
    assert.ok(indexSource.includes("isFluvialContext()"), 'runEngine checks fluvial context for vesselType');
    assert.ok(!indexSource.includes("vesselType: ownerClassAnalysis?.shipClass?.label || State.vesselType || State.vessel?.type || 'Buque estándar',\n                    seaDays: T_sea"), 'runEngine does not unconditionally default to ownerClassAnalysis/Handysize');

    // In voyage-cost-engine.js
    assert.ok(engineSource.includes("isFluvialContextActive"), 'voyage-cost-engine checks fluvial context before setting exec-vessel-type');
    assert.ok(engineSource.includes("effectiveVesselType = 'Convoy Súper Jumbo - 10 Barcazas'"), 'voyage-cost-engine prevents Handysize fallback in fluvial context');
});

test('3. Theme Light Estricto: Colores limpios y eliminación de fondos oscuros navales', () => {
    const indexPath = path.join(REPO_ROOT, 'index.html');
    const indexSource = fs.readFileSync(indexPath, 'utf8');

    // Verify :root --bg is clean light slate (not naval teal #004e64)
    assert.ok(indexSource.includes('--bg: #f8fafc;'), ':root --bg is set to #f8fafc');
    assert.ok(!indexSource.includes('--bg: #004e64;'), ':root --bg does not use #004e64');

    // Verify body element has light theme classes
    assert.ok(indexSource.includes('<body class="theme-light bg-slate-50 text-slate-800'), 'body has bg-slate-50 text-slate-800');
    assert.ok(!indexSource.includes('<body class="theme-light bg-slate-900'), 'body does not have bg-slate-900');

    // Verify view-estimator has light theme classes
    assert.ok(indexSource.includes('id="view-estimator" class="view-section absolute inset-0 overflow-y-auto p-6 scroll-smooth bg-slate-50 text-slate-800"'), 'view-estimator has bg-slate-50 text-slate-800');

    // Verify btn-wpi does not use bg-teal-900
    assert.ok(!indexSource.includes('id="btn-wpi" class="text-xs bg-teal-900'), 'btn-wpi does not have bg-teal-900');
    assert.ok(indexSource.includes('id="btn-wpi" class="text-xs bg-slate-100 text-slate-700'), 'btn-wpi uses light theme palette');

    // Verify hydrology validation uses clean light styling
    assert.ok(indexSource.includes('id="executive-fluvial-hydrology-validation" class="my-4 p-4 rounded-xl border bg-slate-50 border-slate-200 text-slate-800'), 'hydrology validation card has bg-slate-50');
});
