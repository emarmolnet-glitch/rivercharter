import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Refactorización de Layout Modo Técnico a Dos Columnas', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // 1. Contenedor Principal: CSS Grid de dos columnas con Tailwind
  assert.ok(
    indexHtml.includes('class="estimator-dashboard-grid grid grid-cols-1 xl:grid-cols-2 gap-6 items-start"'),
    'El contenedor principal de los bloques debe incluir las clases Tailwind: grid grid-cols-1 xl:grid-cols-2 gap-6 items-start'
  );

  // 2. Localizar y verificar jerarquía estricta de direct children en estimator-dashboard-grid
  const techStart = indexHtml.indexOf('<div id="technical-workspace"');
  const techEnd = indexHtml.indexOf('<!-- ========================================== -->\n        <!-- MÓDULO DECISIONES: SISTEMA DE SOPORTE (DSS)-->');

  const techSection = indexHtml.substring(techStart, techEnd);
  const lines = techSection.split('\n');

  let stack = [];
  let gridDepth = -1;
  const directChildrenOfGrid = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const re = /<div\b[^>]*>|<\/div>/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (m[0].startsWith('<div')) {
        stack.push({ depth: stack.length, lineNum: i + 1, tag: m[0], line: line.trim() });
        if (line.includes('estimator-dashboard-grid')) {
          gridDepth = stack.length - 1;
        } else if (gridDepth !== -1 && stack.length - 1 === gridDepth + 1) {
          directChildrenOfGrid.push(line.trim());
        }
      } else {
        stack.pop();
        if (gridDepth !== -1 && stack.length < gridDepth) {
          gridDepth = -1;
        }
      }
    }
  }

  // Verificamos que no hay etiquetas desbalanceadas
  assert.equal(stack.length, 0, 'No debe haber etiquetas div desbalanceadas en technical-workspace');

  // Verificamos que ambos contenedores son hijos directos del grid principal
  assert.equal(directChildrenOfGrid.length, 2, 'El grid debe tener exactamente 2 hijos directos (izquierda y derecha)');
  assert.ok(directChildrenOfGrid[0].includes('estimator-inputs-column'), 'El primer hijo directo debe ser estimator-inputs-column');
  assert.ok(directChildrenOfGrid[1].includes('estimator-results-rail'), 'El segundo hijo directo debe ser estimator-results-rail');

  // 3. Columna Izquierda: Bloques 1, 2, 3, 4 y 5
  const leftStart = indexHtml.indexOf('<div class="estimator-inputs-column space-y-6">');
  const rightStart = indexHtml.indexOf('<div class="estimator-results-rail space-y-6">');

  const leftColContent = indexHtml.substring(leftStart, rightStart);
  const rightColContent = indexHtml.substring(rightStart, techEnd);

  assert.ok(leftColContent.includes('1. Derrota y Puertos Geográficos'), 'Columna izquierda debe contener Bloque 1');
  assert.ok(leftColContent.includes('2. Especificaciones del Buque y Carga'), 'Columna izquierda debe contener Bloque 2');
  assert.ok(leftColContent.includes('3. Estructura de Costes (OPEX, Bunkers, PDAs)'), 'Columna izquierda debe contener Bloque 3');
  assert.ok(leftColContent.includes('4. Ajustes Inteligentes'), 'Columna izquierda debe contener Bloque 4');
  assert.ok(leftColContent.includes('5. Acciones de Auditoría y Reportes'), 'Columna izquierda debe contener Bloque 5');

  // Bloques 6-10 NO deben estar en la columna izquierda
  assert.ok(!leftColContent.includes('6. RESUMEN DE OPERACIÓN'), 'Bloque 6 NO debe estar en columna izquierda');
  assert.ok(!leftColContent.includes('7. ANÁLISIS DE FLETES'), 'Bloque 7 NO debe estar en columna izquierda');
  assert.ok(!leftColContent.includes('8. NEGOCIACIÓN COMERCIAL'), 'Bloque 8 NO debe estar en columna izquierda');
  assert.ok(!leftColContent.includes('9. MATRIZ DE RIESGO'), 'Bloque 9 NO debe estar en columna izquierda');
  assert.ok(!leftColContent.includes('10. SIMULADOR DE NEGOCIACIÓN'), 'Bloque 10 NO debe estar en columna izquierda');

  // 4. Columna Derecha: Bloques 6, 7, 8, 9 y 10
  assert.ok(rightColContent.includes('6. RESUMEN DE OPERACIÓN'), 'Columna derecha debe contener Bloque 6');
  assert.ok(rightColContent.includes('7. ANÁLISIS DE FLETES'), 'Columna derecha debe contener Bloque 7');
  assert.ok(rightColContent.includes('8. NEGOCIACIÓN COMERCIAL'), 'Columna derecha debe contener Bloque 8');
  assert.ok(rightColContent.includes('9. MATRIZ DE RIESGO'), 'Columna derecha debe contener Bloque 9');
  assert.ok(rightColContent.includes('10. SIMULADOR'), 'Columna derecha debe contener Bloque 10');

  // Bloques 1-5 NO deben estar en la columna derecha
  assert.ok(!rightColContent.includes('1. Derrota y Puertos Geográficos'), 'Bloque 1 NO debe estar en columna derecha');
  assert.ok(!rightColContent.includes('2. Especificaciones del Buque y Carga'), 'Bloque 2 NO debe estar en columna derecha');
  assert.ok(!rightColContent.includes('3. Estructura de Costes (OPEX, Bunkers, PDAs)'), 'Bloque 3 NO debe estar en columna derecha');
  assert.ok(!rightColContent.includes('4. Ajustes Inteligentes'), 'Bloque 4 NO debe estar en columna derecha');
  assert.ok(!rightColContent.includes('5. Acciones de Auditoría y Reportes'), 'Bloque 5 NO debe estar en columna derecha');

  // 5. Alineación vertical: items-start
  assert.ok(indexHtml.includes('items-start'), 'El grid debe utilizar items-start para alineación vertical natural');

  // 6. Responsividad: grid-cols-1 y xl:grid-cols-2
  assert.ok(indexHtml.includes('grid-cols-1 xl:grid-cols-2'), 'Debe ser 1 columna en móvil y 2 columnas a partir del breakpoint xl');
});
