import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
const modalPath = path.resolve(process.cwd(), 'src/components/VoyageExecutiveReportModal.jsx');
const visualStowagePath = path.resolve(process.cwd(), 'src/components/VisualStowagePlan.jsx');
const entryPath = path.resolve(process.cwd(), 'src/voyage-executive-report-entry.jsx');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const modalSource = fs.readFileSync(modalPath, 'utf8');
const visualStowageSource = fs.readFileSync(visualStowagePath, 'utf8');
const entrySource = fs.readFileSync(entryPath, 'utf8');

test('1. Fluvial Context Detection is implemented across modal, stowage plan, entry and index.html', () => {
    assert.ok(modalSource.includes('isFluvialContext'), 'VoyageExecutiveReportModal defines or imports isFluvialContext');
    assert.ok(visualStowageSource.includes('isFluvialContext'), 'VisualStowagePlan defines or imports isFluvialContext');
    assert.ok(entrySource.includes('isFluvialContext'), 'Entry file exports and binds isFluvialContext');
    assert.ok(indexHtml.includes('function isFluvialContext'), 'index.html defines isFluvialContext');
    assert.ok(modalSource.includes('activeConvoyData'), 'Checks activeConvoyData');
    assert.ok(indexHtml.includes('activeConvoyData'), 'index.html checks activeConvoyData');
});

test('2. DOM labels replace vessel particulars with convoy particulars in Fluvial Mode', () => {
    // Labels in VoyageExecutiveReportModal
    assert.ok(modalSource.includes('Remolcador / Convoy:'), 'Modal includes "Remolcador / Convoy:"');
    assert.ok(modalSource.includes('Contrato: Fluvial COA'), 'Modal includes "Contrato: Fluvial COA"');
    assert.ok(modalSource.includes('km') && modalSource.includes('NM'), 'Modal switches between km and NM');

    // Labels in index.html
    assert.ok(indexHtml.includes('Remolcador / Convoy:'), 'index.html includes "Remolcador / Convoy:"');
    assert.ok(indexHtml.includes('Contrato: Fluvial COA'), 'index.html includes "Contrato: Fluvial COA"');
    assert.ok(indexHtml.includes('generarReporteEjecutivo'), 'index.html exports generarReporteEjecutivo function');
});

test('3. Stowage Plan (Croquis Naval) is strictly hidden in Fluvial Mode', () => {
    // In VoyageExecutiveReportModal
    assert.ok(modalSource.includes('id="executive-visual-stowage-section"'), 'Stowage container id exists');
    assert.ok(modalSource.includes("isFluvial ? { display: 'none' } : undefined"), 'Stowage container has display none when fluvial');
    assert.ok(modalSource.includes("isFluvial ? 'hidden' : ''"), 'Stowage container has hidden class when fluvial');

    // In index.html
    assert.ok(indexHtml.includes('voyage-visual-stowage-container'), 'index.html has voyage-visual-stowage-container');
    assert.ok(indexHtml.includes('isFluvial ? \'style="display: none;"\' : \'\''), 'Stowage container in index.html is conditionally hidden in fluvial mode');
});

test('4. Hydrological Validation (Estiaje y Calado) replaces CSS OMI technical validation', () => {
    // In VisualStowagePlan
    assert.ok(visualStowageSource.includes('visual-stowage-technical-validation-container'), 'OMI table container has specific ID');
    assert.ok(visualStowageSource.includes("isFluvial ? 'hidden' : ''"), 'OMI table is hidden in fluvial mode');
    assert.ok(visualStowageSource.includes("isFluvial ? { display: 'none' } : undefined"), 'OMI table has display none in fluvial mode');
    assert.ok(/Validaci[oó]n de Estiaje y Calado/i.test(visualStowageSource), 'VisualStowagePlan includes hydrological validation');

    // In VoyageExecutiveReportModal
    assert.ok(modalSource.includes('executive-fluvial-hydrology-validation'), 'Modal has fluvial hydrology validation container');
    assert.ok(modalSource.includes('Calado Dinámico del Convoy'), 'Modal displays Calado Dinámico del Convoy');
    assert.ok(modalSource.includes('Límite Hidrométrico (Estiaje)'), 'Modal displays Límite Hidrométrico (Estiaje)');
    assert.ok(modalSource.includes('isDraftApto') || modalSource.includes('isApto'), 'Modal checks if draft is apto');
    assert.ok(modalSource.includes('APTO PARA NAVEGAR'), 'Modal displays APTO PARA NAVEGAR in green when safe');

    // In index.html
    assert.ok(indexHtml.includes('renderFluvialHydrologyValidationHtml'), 'index.html has renderFluvialHydrologyValidationHtml helper');
    assert.ok(indexHtml.includes('Validación de Estiaje y Calado'), 'index.html includes Validación de Estiaje y Calado');
});

test('5. Dynamic Branding replaces SEACHARTER PRO with RIVERCHARTER', () => {
    assert.ok(visualStowageSource.includes("isFluvial ? 'RIVERCHARTER' : 'SEACHARTER PRO'"), 'VisualStowagePlan dynamically updates header badge to RIVERCHARTER');
    assert.ok(modalSource.includes("isFluvial ? 'RIVERCHARTER' : 'SEACHARTER PRO'"), 'Modal dynamically updates branding title to RIVERCHARTER');
    assert.ok(entrySource.includes("adaptExecutiveReportModalToFluvial"), 'Entry file includes DOM post-adaptation for RIVERCHARTER');
    assert.ok(indexHtml.includes("adaptExecutiveReportModalToFluvial"), 'index.html includes adaptExecutiveReportModalToFluvial');
});
