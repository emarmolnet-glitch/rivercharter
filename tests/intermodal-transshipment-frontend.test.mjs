import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('1. Catálogo Local de Nodos (index.html): Contiene tarifas y demoras de Florida y Sudamérica', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verifica que existe CATALOGO_NODOS_INTERMODALES en los scripts del frontend
  assert.ok(
    indexHtml.includes('CATALOGO_NODOS_INTERMODALES'),
    'Debe definir el objeto estático CATALOGO_NODOS_INTERMODALES en index.html'
  );

  // Florida: Port Everglades ($1,800 / 1.2 días), Port Tampa Bay ($1,600 / 1.5 días), Miami ($1,900 / 1.3 días)
  assert.ok(
    indexHtml.includes('port_everglades') && indexHtml.includes('1800') && indexHtml.includes('1.2'),
    'Port Everglades debe costar $1,800 y tener 1.2 días de demora'
  );
  assert.ok(
    indexHtml.includes('port_tampa_bay') && indexHtml.includes('1600') && indexHtml.includes('1.5'),
    'Port Tampa Bay debe costar $1,600 y tener 1.5 días de demora'
  );
  assert.ok(
    indexHtml.includes('miami') && indexHtml.includes('1900') && indexHtml.includes('1.3'),
    'Miami debe costar $1,900 y tener 1.3 días de demora'
  );

  // Sudamérica: Gran Rosario ($3,200 / 2.5 días), Nueva Palmira ($2,900 / 2.0 días), Miritituba ($3,100 / 2.2 días)
  assert.ok(
    indexHtml.includes('gran_rosario') && indexHtml.includes('3200') && indexHtml.includes('2.5'),
    'Gran Rosario debe costar $3,200 y tener 2.5 días de demora'
  );
  assert.ok(
    indexHtml.includes('nueva_palmira') && indexHtml.includes('2900') && indexHtml.includes('2.0'),
    'Nueva Palmira debe costar $2,900 y tener 2.0 días de demora'
  );
  assert.ok(
    indexHtml.includes('miritituba') && indexHtml.includes('3100') && indexHtml.includes('2.2'),
    'Miritituba debe costar $3,100 y tener 2.2 días de demora'
  );
});

test('2. Interfaz de Usuario (UI Bimodal): Inyecta panel en la sección de Puertos/Ruta con dropdown y autocompletado', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verifica existencia del panel en la sección de Puertos / Ruta
  assert.ok(
    indexHtml.includes('id="fluvial-bimodal-transshipment-panel"'),
    'Debe contener id="fluvial-bimodal-transshipment-panel"'
  );
  assert.ok(
    indexHtml.includes('Trasbordo Intermodal (Buque Oceánico ⇄ Barcaza)'),
    'Debe contener el título "Trasbordo Intermodal (Buque Oceánico ⇄ Barcaza)"'
  );

  // Checkbox de activación
  assert.ok(
    indexHtml.includes('id="intermodal-transshipment-toggle"'),
    'Debe existir checkbox id="intermodal-transshipment-toggle"'
  );
  assert.ok(
    indexHtml.includes('Activar Trasbordo Intermodal'),
    'Debe contener etiqueta "Activar Trasbordo Intermodal"'
  );

  // Selector desplegable (Dropdown)
  assert.ok(
    indexHtml.includes('id="intermodal-port-select"'),
    'Debe existir select id="intermodal-port-select"'
  );
  assert.ok(
    indexHtml.includes('Port Everglades ($1,800 / 1.2 días)'),
    'El dropdown debe contener la opción de Port Everglades'
  );
  assert.ok(
    indexHtml.includes('Port Tampa Bay ($1,600 / 1.5 días)'),
    'El dropdown debe contener la opción de Port Tampa Bay'
  );
  assert.ok(
    indexHtml.includes('Miami ($1,900 / 1.3 días)'),
    'El dropdown debe contener la opción de Miami'
  );

  // Campos de autocompletado en pantalla
  assert.ok(
    indexHtml.includes('id="intermodal-terminal-cost"'),
    'Debe existir campo id="intermodal-terminal-cost" para costo de terminal'
  );
  assert.ok(
    indexHtml.includes('id="intermodal-handling-delay"'),
    'Debe existir campo id="intermodal-handling-delay" para días de demora'
  );
});

test('3. Integración Financiera (updateFluvialCalculations): Terminal Cost a Peajes/OPEX y Demora al tiempo total', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verifica que updateFluvialCalculations lee los campos bimodales
  assert.ok(
    indexHtml.includes('intermodal-transshipment-toggle'),
    'updateFluvialCalculations debe verificar si el trasbordo está activo'
  );
  assert.ok(
    indexHtml.includes('intermodal-terminal-cost'),
    'updateFluvialCalculations debe leer intermodal-terminal-cost'
  );
  assert.ok(
    indexHtml.includes('intermodal-handling-delay'),
    'updateFluvialCalculations debe leer intermodal-handling-delay'
  );

  // Suma el Costo de Terminal a Gastos Portuarios / Peajes (dentro del OPEX total)
  assert.ok(
    indexHtml.includes('totalIntermodalTolls = pdaLocks + pdaTolls + pdaPilotage + transshipmentTariff'),
    'totalIntermodalTolls debe sumar transshipmentTariff a los gastos portuarios y peajes'
  );
  assert.ok(
    indexHtml.includes('grossOperatingCost = totalMotorCost + bargesTotalCapex + totalIntermodalTolls'),
    'grossOperatingCost debe consolidar el OPEX total con peajes intermodales'
  );

  // Suma los Días de Demora al tiempo total de viaje
  assert.ok(
    indexHtml.includes('delayDays = lockWaitDays + customsDelayDays + nodeHandlingDays'),
    'delayDays debe incluir la demora de manipulación (nodeHandlingDays)'
  );
  assert.ok(
    indexHtml.includes('totalDays = Math.max(0.5, sailingDays + delayDays)'),
    'totalDays debe sumar delayDays a sailingDays'
  );

  // Beneficio Neto y TCE dinámicos
  assert.ok(
    indexHtml.includes('netProfit = grossRevenue - totalConvoyCost'),
    'netProfit debe descontar el costo total consolidado'
  );
  assert.ok(
    indexHtml.includes('dailyTce = totalDays > 0 ? (grossRevenue - totalBunkerCost - (pdaLocks + pdaTolls + pdaPilotage) - transshipmentTariff) / totalDays : 0'),
    'dailyTce debe deducir la tarifa de trasbordo y prorratear entre totalDays'
  );
});

test('4. Seguridad y Gobernanza: Restricción estricta de no modificar cerebro-ia.js ni archivos de DataBridge', async () => {
  // Asegura que no se modificó cerebro-ia.js
  const gitStatusOutput = await import('node:child_process').then(cp => 
    new Promise((resolve) => {
      cp.exec('git status --porcelain', (err, stdout) => resolve(stdout || ''));
    })
  );

  assert.ok(
    !gitStatusOutput.includes('cerebro-ia.js'),
    'cerebro-ia.js tiene estrictamente prohibido ser modificado'
  );
  assert.ok(
    !gitStatusOutput.includes('dataBridgeSyncService.js'),
    'Archivos de DataBridge no deben ser modificados'
  );
});
