import React, { useMemo } from 'react';

/**
 * Obtiene el número activo de barcazas del convoy fluvial:
 * 1. window.activeBargeCount
 * 2. convoyData?.bargeCount o convoyData?.bargeIds?.length o convoyData?.barges?.length
 * 3. window.activeConvoyData
 * 4. Búsqueda en el DOM de expresiones como "10 Barcazas"
 * 5. Valor por defecto: 10
 */
export function resolveActiveBargeCount(convoyData = null) {
  if (typeof window !== 'undefined') {
    if (window.activeBargeCount && !isNaN(Number(window.activeBargeCount))) {
      return Number(window.activeBargeCount);
    }
    const cd = convoyData || window.activeConvoyData;
    if (cd) {
      if (cd.bargeCount && !isNaN(Number(cd.bargeCount))) {
        return Number(cd.bargeCount);
      }
      if (Array.isArray(cd.bargeIds) && cd.bargeIds.length > 0) {
        return cd.bargeIds.length;
      }
      if (Array.isArray(cd.barges) && cd.barges.length > 0) {
        return cd.barges.length;
      }
    }
    if (typeof document !== 'undefined') {
      const match = document.body?.innerText?.match(/(\d+)\s*Barcazas/i);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (parsed > 0) return parsed;
      }
    }
  }
  return 10;
}

/**
 * Algoritmo de distribución matricial del convoy fluvial:
 * Calcula la cantidad de filas horizontales (rows) y columnas en eslora (cols).
 * Para 10 barcazas: 2 filas horizontales de 5 barcazas cada una.
 */
export function calculateConvoyMatrix(count) {
  const total = Math.max(1, Number(count) || 10);
  let rows = 2;
  if (total >= 16) {
    rows = 4;
  } else if (total >= 15 && total % 3 === 0) {
    rows = 3;
  } else if (total >= 4) {
    rows = 2;
  } else {
    rows = 1;
  }
  const cols = Math.ceil(total / rows);
  return { rows, cols, total };
}

/**
 * Generador de código HTML/SVG puro para el plan de estiba fluvial.
 * Usado tanto por el componente React como por el fallback en index.html.
 */
export function renderFluvialStowagePlanSvg(options = {}) {
  const convoy = options.convoyData || (typeof window !== 'undefined' ? window.activeConvoyData : null) || {};
  const bargeCount = resolveActiveBargeCount(convoy);
  const { rows, cols } = calculateConvoyMatrix(bargeCount);

  // Datos del remolcador de empuje
  const tugboat = convoy.tugboat || {};
  const tugboatName = tugboat.name || convoy.tugboatName || 'Río Paraná Star';
  const tugboatHp = Number(tugboat.enginePowerHp || convoy.tugboatHp || 4000);
  const tugBollardPull = Number(tugboat.bollardPullTons || 45);

  // Carga total y desglose por barcaza
  const totalCargo = Number(
    options.totalCargo ||
    options.stowagePlan?.cargoClassification?.totalWeightTons ||
    (typeof window !== 'undefined' && window.State?.cargo) ||
    convoy.totalCapacityMt ||
    (bargeCount * 2500)
  );
  const bargeTons = bargeCount > 0 ? Math.round(totalCargo / bargeCount) : 2500;
  const bargePct = bargeCount > 0 ? (100 / bargeCount).toFixed(0) : '10';

  // Hidrología y calado dinámico
  const dynamicDraft = Number(convoy.maxDynamicDraftMeters || convoy.dynamicDraft || convoy.draft || 2.85);
  const minWaterLevel = Number(
    (typeof document !== 'undefined' ? parseFloat(document.getElementById('min_water_level')?.value) : null) ||
    convoy.minWaterLevel ||
    convoy.min_water_level ||
    3.20
  );
  const ukc = (minWaterLevel - dynamicDraft).toFixed(2);
  const isApto = minWaterLevel >= dynamicDraft;

  // Dimensiones físicas del convoy
  const bargeLengthM = 61.0;
  const bargeBeamM = 16.5;
  const tugLengthM = 38.0;
  const totalLengthM = Math.round(cols * bargeLengthM + tugLengthM);
  const totalBeamM = (rows * bargeBeamM).toFixed(1);

  // Geometría del lienzo SVG
  const svgW = 1180;
  const svgH = 430;

  // Área de barcazas
  const bargeStartX = 55;
  const bargeEndX = 860;
  const availableBargeW = bargeEndX - bargeStartX;
  const colGap = 6;
  const colW = Math.min(165, Math.floor((availableBargeW - (cols - 1) * colGap) / cols));

  const areaY = 85;
  const areaH = 245;
  const rowGap = 10;
  const rowH = Math.min(110, Math.floor((areaH - (rows - 1) * rowGap) / rows));
  const totalGridH = rows * rowH + (rows - 1) * rowGap;
  const gridOffsetY = areaY + Math.floor((areaH - totalGridH) / 2);

  // Posición del remolcador
  const tugStartX = bargeStartX + cols * (colW + colGap) + 4;
  const tugW = Math.min(270, svgW - tugStartX - 25);
  const tugY = gridOffsetY;
  const tugH = totalGridH;
  const tugMidY = tugY + tugH / 2;

  // Generación SVG de barcazas
  let bargesSvg = '';
  let slotIndex = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (slotIndex >= bargeCount) break;

      const bx = bargeStartX + c * (colW + colGap);
      const by = gridOffsetY + r * (rowH + rowGap);
      const isHeadBarge = (c === 0);
      const bargeNum = String(slotIndex + 1).padStart(2, '0');

      if (isHeadBarge) {
        // Barcaza de punta (Head Barge) con proa inclinada (Raked Bow) hacia la izquierda (Proa)
        const rakeSlope = 22;
        bargesSvg += `
          <g id="barge-${slotIndex + 1}" class="fluvial-barge-group">
            <!-- Casco perimetral con proa inclinada (Raked Bow) -->
            <path
              d="
                M ${bx + rakeSlope},${by}
                L ${bx + colW},${by}
                L ${bx + colW},${by + rowH}
                L ${bx + rakeSlope},${by + rowH}
                Q ${bx + 4},${by + rowH * 0.8} ${bx},${by + rowH * 0.5}
                Q ${bx + 4},${by + rowH * 0.2} ${bx + rakeSlope},${by}
                Z
              "
              fill="url(#fluvialBargeHullGrad)"
              stroke="#64748b"
              stroke-width="1.8"
            />
            <!-- Cámara de colisión / Rake compartimentado -->
            <path
              d="
                M ${bx + rakeSlope},${by + 2}
                L ${bx + rakeSlope},${by + rowH - 2}
              "
              stroke="#94a3b8"
              stroke-width="1.5"
              stroke-dasharray="3 2"
            />
            <!-- Micro-patrón antiderrapante en proa inclinada -->
            <path
              d="M ${bx + 6},${by + rowH * 0.3} L ${bx + rakeSlope - 3},${by + rowH * 0.3} M ${bx + 6},${by + rowH * 0.7} L ${bx + rakeSlope - 3},${by + rowH * 0.7}"
              stroke="#94a3b8"
              stroke-width="1"
            />
            <text x="${bx + 9}" y="${by + rowH * 0.53}" fill="#64748b" font-size="7" font-weight="900" font-family="monospace" letter-spacing="0.5" transform="rotate(-90 ${bx + 9} ${by + rowH * 0.53})" text-anchor="middle">RAKED BOW</text>

            <!-- Bitas de amarre esquineras -->
            <circle cx="${bx + colW - 5}" cy="${by + 5}" r="2.5" fill="#334155" />
            <circle cx="${bx + colW - 5}" cy="${by + rowH - 5}" r="2.5" fill="#334155" />

            <!-- Zona interior de tolva / bodega (Hopper) en azul naval oscuro -->
            <rect
              x="${bx + rakeSlope + 5}"
              y="${by + 7}"
              width="${colW - rakeSlope - 11}"
              height="${rowH - 14}"
              rx="4"
              fill="url(#fluvialHopperNavalGrad)"
              stroke="#2563eb"
              stroke-width="1.2"
            />
            <!-- Textura técnica de carga a granel en tolva -->
            <rect
              x="${bx + rakeSlope + 5}"
              y="${by + 7}"
              width="${colW - rakeSlope - 11}"
              height="${rowH - 14}"
              rx="4"
              fill="url(#fluvialHopperPattern)"
              opacity="0.25"
            />

            <!-- Inyección de Etiquetas Técnicas -->
            <!-- 1. Carga Activa -->
            <rect x="${bx + rakeSlope + 9}" y="${by + 11}" width="72" height="15" rx="3" fill="#064e3b" stroke="#059669" stroke-width="0.8" />
            <circle cx="${bx + rakeSlope + 16}" cy="${by + 18.5}" r="2.5" fill="#34d399" />
            <text x="${bx + rakeSlope + 23}" y="${by + 22}" fill="#a7f3d0" font-size="8.5" font-weight="bold" font-family="sans-serif">Carga Activa</text>

            <!-- 2. Porcentaje de Peso -->
            <text x="${bx + colW - 10}" y="${by + 22}" fill="#67e8f9" font-size="9" font-weight="bold" font-family="monospace" text-anchor="end">${bargePct}% peso</text>

            <!-- 3. Tonelaje Activo (MT) -->
            <text x="${bx + rakeSlope + 5 + (colW - rakeSlope - 11) / 2}" y="${by + (rowH > 80 ? 52 : 44)}" fill="#ffffff" font-size="${rowH > 80 ? '13' : '11'}" font-weight="900" font-family="monospace" text-anchor="middle" letter-spacing="0.5">${bargeTons.toLocaleString('en-US')} MT</text>

            <!-- 4. Identificador de Barcaza -->
            <text x="${bx + rakeSlope + 5 + (colW - rakeSlope - 11) / 2}" y="${by + (rowH > 80 ? 68 : 58)}" fill="#93c5fd" font-size="7.5" font-weight="bold" font-family="sans-serif" text-anchor="middle">B-${bargeNum} · TOLVA CABECERA</text>
          </g>
        `;
      } else {
        // Barcaza intermedia / de cuerpo (Box Barge) rectangular para acoplamiento estanco
        bargesSvg += `
          <g id="barge-${slotIndex + 1}" class="fluvial-barge-group">
            <!-- Casco perimetral metálico -->
            <rect
              x="${bx}"
              y="${by}"
              width="${colW}"
              height="${rowH}"
              rx="3"
              fill="url(#fluvialBargeHullGrad)"
              stroke="#64748b"
              stroke-width="1.8"
            />

            <!-- Bitas de amarre en las cuatro esquinas -->
            <circle cx="${bx + 5}" cy="${by + 5}" r="2.5" fill="#334155" />
            <circle cx="${bx + 5}" cy="${by + rowH - 5}" r="2.5" fill="#334155" />
            <circle cx="${bx + colW - 5}" cy="${by + 5}" r="2.5" fill="#334155" />
            <circle cx="${bx + colW - 5}" cy="${by + rowH - 5}" r="2.5" fill="#334155" />

            <!-- Zona interior de tolva / bodega (Hopper) en azul naval oscuro -->
            <rect
              x="${bx + 7}"
              y="${by + 7}"
              width="${colW - 14}"
              height="${rowH - 14}"
              rx="4"
              fill="url(#fluvialHopperNavalGrad)"
              stroke="#2563eb"
              stroke-width="1.2"
            />
            <!-- Textura de carga -->
            <rect
              x="${bx + 7}"
              y="${by + 7}"
              width="${colW - 14}"
              height="${rowH - 14}"
              rx="4"
              fill="url(#fluvialHopperPattern)"
              opacity="0.25"
            />

            <!-- Inyección de Etiquetas Técnicas -->
            <!-- 1. Carga Activa -->
            <rect x="${bx + 11}" y="${by + 11}" width="72" height="15" rx="3" fill="#064e3b" stroke="#059669" stroke-width="0.8" />
            <circle cx="${bx + 18}" cy="${by + 18.5}" r="2.5" fill="#34d399" />
            <text x="${bx + 25}" y="${by + 22}" fill="#a7f3d0" font-size="8.5" font-weight="bold" font-family="sans-serif">Carga Activa</text>

            <!-- 2. Porcentaje de Peso -->
            <text x="${bx + colW - 11}" y="${by + 22}" fill="#67e8f9" font-size="9" font-weight="bold" font-family="monospace" text-anchor="end">${bargePct}% peso</text>

            <!-- 3. Tonelaje Activo (MT) -->
            <text x="${bx + colW / 2}" y="${by + (rowH > 80 ? 52 : 44)}" fill="#ffffff" font-size="${rowH > 80 ? '13' : '11'}" font-weight="900" font-family="monospace" text-anchor="middle" letter-spacing="0.5">${bargeTons.toLocaleString('en-US')} MT</text>

            <!-- 4. Identificador de Barcaza -->
            <text x="${bx + colW / 2}" y="${by + (rowH > 80 ? 68 : 58)}" fill="#93c5fd" font-size="7.5" font-weight="bold" font-family="sans-serif" text-anchor="middle">B-${bargeNum} · TOLVA CUERPO</text>

            <!-- Trincas / Cables de acoplamiento rígido con la columna anterior -->
            <line x1="${bx - colGap}" y1="${by + 12}" x2="${bx}" y2="${by + 20}" stroke="#475569" stroke-width="1.8" />
            <line x1="${bx - colGap}" y1="${by + 20}" x2="${bx}" y2="${by + 12}" stroke="#475569" stroke-width="1.8" />
            <line x1="${bx - colGap}" y1="${by + rowH - 12}" x2="${bx}" y2="${by + rowH - 20}" stroke="#475569" stroke-width="1.8" />
            <line x1="${bx - colGap}" y1="${by + rowH - 20}" x2="${bx}" y2="${by + rowH - 12}" stroke="#475569" stroke-width="1.8" />
          </g>
        `;
      }

      slotIndex++;
    }
  }

  // Generación SVG del Remolcador de Empuje (Pushboat)
  const pushKneeH = Math.min(85, Math.floor(tugH * 0.40));
  const pushKnee1Y = tugMidY - pushKneeH - 10;
  const pushKnee2Y = tugMidY + 10;

  const pushboatSvg = `
    <g id="fluvial-pushboat" class="fluvial-pushboat-group">
      <!-- Cables de Acoplamiento Principal (Face-Wires) hacia las barcazas de popa -->
      <line x1="${tugStartX - colGap - 4}" y1="${pushKnee1Y + 15}" x2="${tugStartX + 10}" y2="${pushKnee1Y + 45}" stroke="#1e293b" stroke-width="2.5" />
      <line x1="${tugStartX - colGap - 4}" y1="${pushKnee1Y + 45}" x2="${tugStartX + 10}" y2="${pushKnee1Y + 15}" stroke="#1e293b" stroke-width="2.5" />
      <line x1="${tugStartX - colGap - 4}" y1="${pushKnee2Y + 15}" x2="${tugStartX + 10}" y2="${pushKnee2Y + 45}" stroke="#1e293b" stroke-width="2.5" />
      <line x1="${tugStartX - colGap - 4}" y1="${pushKnee2Y + 45}" x2="${tugStartX + 10}" y2="${pushKnee2Y + 15}" stroke="#1e293b" stroke-width="2.5" />

      <!-- Casco del Remolcador de Empuje (Pushboat) con cubierta plana proel y popa de espejo -->
      <path
        d="
          M ${tugStartX + 8},${tugY + 10}
          L ${tugStartX + tugW - 35},${tugY + 10}
          Q ${tugStartX + tugW},${tugY + 18} ${tugStartX + tugW},${tugY + 45}
          L ${tugStartX + tugW},${tugY + tugH - 45}
          Q ${tugStartX + tugW},${tugY + tugH - 18} ${tugStartX + tugW - 35},${tugY + tugH - 10}
          L ${tugStartX + 8},${tugY + tugH - 10}
          Z
        "
        fill="url(#fluvialPushboatHullGrad)"
        stroke="#475569"
        stroke-width="2"
      />

      <!-- Cinta de Defensa de Goma Perimetral / Fendering -->
      <path
        d="
          M ${tugStartX + 9},${tugY + 13}
          L ${tugStartX + tugW - 35},${tugY + 13}
          Q ${tugStartX + tugW - 3},${tugY + 20} ${tugStartX + tugW - 3},${tugY + 45}
          L ${tugStartX + tugW - 3},${tugY + tugH - 45}
          Q ${tugStartX + tugW - 3},${tugY + tugH - 20} ${tugStartX + tugW - 35},${tugY + tugH - 13}
          L ${tugStartX + 9},${tugY + tugH - 13}
        "
        fill="none"
        stroke="#1e293b"
        stroke-width="3"
      />

      <!-- Columnas / Rodillos Verticales de Empuje en Proa (Push Knees) -->
      <rect x="${tugStartX}" y="${pushKnee1Y}" width="12" height="${pushKneeH}" rx="2" fill="#0f172a" stroke="#334155" stroke-width="1.2" />
      <line x1="${tugStartX + 3}" y1="${pushKnee1Y + 10}" x2="${tugStartX + 3}" y2="${pushKnee1Y + pushKneeH - 10}" stroke="#94a3b8" stroke-width="1.5" />
      <line x1="${tugStartX + 7}" y1="${pushKnee1Y + 10}" x2="${tugStartX + 7}" y2="${pushKnee1Y + pushKneeH - 10}" stroke="#94a3b8" stroke-width="1.5" />

      <rect x="${tugStartX}" y="${pushKnee2Y}" width="12" height="${pushKneeH}" rx="2" fill="#0f172a" stroke="#334155" stroke-width="1.2" />
      <line x1="${tugStartX + 3}" y1="${pushKnee2Y + 10}" x2="${tugStartX + 3}" y2="${pushKnee2Y + pushKneeH - 10}" stroke="#94a3b8" stroke-width="1.5" />
      <line x1="${tugStartX + 7}" y1="${pushKnee2Y + 10}" x2="${tugStartX + 7}" y2="${pushKnee2Y + pushKneeH - 10}" stroke="#94a3b8" stroke-width="1.5" />

      <!-- Cubierta de Trabajo / Maniobra Proel (Chigres y bitas) -->
      <circle cx="${tugStartX + 26}" cy="${pushKnee1Y + pushKneeH / 2}" r="4" fill="#334155" />
      <circle cx="${tugStartX + 26}" cy="${pushKnee2Y + pushKneeH / 2}" r="4" fill="#334155" />
      <rect x="${tugStartX + 34}" y="${tugMidY - 30}" width="18" height="60" rx="3" fill="#cbd5e1" stroke="#64748b" stroke-width="1" />

      <!-- Superestructura Central del Remolcador (Casillaje y Acomodación) -->
      <rect
        x="${tugStartX + 58}"
        y="${tugMidY - Math.min(65, tugH * 0.36)}"
        width="${Math.min(130, tugW - 90)}"
        height="${Math.min(130, tugH * 0.72)}"
        rx="5"
        fill="#ffffff"
        stroke="#64748b"
        stroke-width="1.5"
      />
      <!-- Puertas estancas y ventanas de habilitación -->
      <rect x="${tugStartX + 64}" y="${tugMidY - 25}" width="8" height="15" rx="1.5" fill="#334155" />
      <rect x="${tugStartX + 64}" y="${tugMidY + 10}" width="8" height="15" rx="1.5" fill="#334155" />
      <circle cx="${tugStartX + 78}" cy="${tugMidY - 38}" r="3" fill="#bae6fd" stroke="#0284c7" stroke-width="0.8" />
      <circle cx="${tugStartX + 78}" cy="${tugMidY + 38}" r="3" fill="#bae6fd" stroke="#0284c7" stroke-width="0.8" />

      <!-- Puente de Mando Elevado (Pilothouse) con Ventanas Panorámicas de Visión Convoy -->
      <g id="pilothouse-tower">
        <rect
          x="${tugStartX + 72}"
          y="${tugMidY - 36}"
          width="74"
          height="72"
          rx="4"
          fill="#f8fafc"
          stroke="#475569"
          stroke-width="1.5"
        />
        <!-- Visera solar frontal / Brow -->
        <rect x="${tugStartX + 70}" y="${tugMidY - 34}" width="4" height="68" rx="1" fill="#1e293b" />

        <!-- Ventanales panorámicos frontales tintados en cyan (Pilothouse Windows) -->
        <rect
          x="${tugStartX + 74}"
          y="${tugMidY - 30}"
          width="18"
          height="60"
          rx="2"
          fill="url(#fluvialPilothouseGlassGrad)"
          stroke="#0284c7"
          stroke-width="1.2"
        />
        <!-- Montantes de las ventanas -->
        <line x1="${tugStartX + 74}" y1="${tugMidY - 10}" x2="${tugStartX + 92}" y2="${tugMidY - 10}" stroke="#0369a1" stroke-width="1" />
        <line x1="${tugStartX + 74}" y1="${tugMidY + 10}" x2="${tugStartX + 92}" y2="${tugMidY + 10}" stroke="#0369a1" stroke-width="1" />

        <!-- Ventanas laterales del puente -->
        <rect x="${tugStartX + 98}" y="${tugMidY - 28}" width="16" height="18" rx="2" fill="url(#fluvialPilothouseGlassGrad)" stroke="#0284c7" stroke-width="1" />
        <rect x="${tugStartX + 98}" y="${tugMidY + 10}" width="16" height="18" rx="2" fill="url(#fluvialPilothouseGlassGrad)" stroke="#0284c7" stroke-width="1" />

        <!-- Mástil de Radar y Electrónica Fluvial -->
        <line x1="${tugStartX + 115}" y1="${tugMidY}" x2="${tugStartX + 138}" y2="${tugMidY}" stroke="#334155" stroke-width="2.5" />
        <circle cx="${tugStartX + 138}" cy="${tugMidY}" r="3.5" fill="#0284c7" />
        <!-- Escáner de Radar Giratorio -->
        <rect x="${tugStartX + 128}" y="${tugMidY - 14}" width="5" height="28" rx="1" fill="#ffffff" stroke="#0284c7" stroke-width="1" />
        <!-- Luces de navegación y reflector proel -->
        <circle cx="${tugStartX + 74}" cy="${tugMidY - 32}" r="2" fill="#ef4444" /> <!-- Babor / Red -->
        <circle cx="${tugStartX + 74}" cy="${tugMidY + 32}" r="2" fill="#10b981" /> <!-- Estribor / Green -->
        <circle cx="${tugStartX + 74}" cy="${tugMidY}" r="2.5" fill="#facc15" /> <!-- Luz de remolque -->
      </g>

      <!-- Chimeneas de Escape Diésel (Exhaust Stacks) con franja roja corporativa y silenciadores -->
      <g id="exhaust-stacks">
        <!-- Chimenea Babor -->
        <rect x="${tugStartX + 154}" y="${tugMidY - 38}" width="16" height="22" rx="3" fill="#1e293b" stroke="#0f172a" stroke-width="1.2" />
        <rect x="${tugStartX + 154}" y="${tugMidY - 31}" width="16" height="7" fill="#dc2626" />
        <ellipse cx="${tugStartX + 170}" cy="${tugMidY - 27}" rx="2" ry="5" fill="#0f172a" />

        <!-- Chimenea Estribor -->
        <rect x="${tugStartX + 154}" y="${tugMidY + 16}" width="16" height="22" rx="3" fill="#1e293b" stroke="#0f172a" stroke-width="1.2" />
        <rect x="${tugStartX + 154}" y="${tugMidY + 23}" width="16" height="7" fill="#dc2626" />
        <ellipse cx="${tugStartX + 170}" cy="${tugMidY + 27}" rx="2" ry="5" fill="#0f172a" />
      </g>

      <!-- Cubierta de Popa (Aft Deck): Chigre de remolque y bita en H -->
      <rect x="${tugStartX + tugW - 48}" y="${tugMidY - 14}" width="18" height="28" rx="2" fill="#334155" stroke="#1e293b" stroke-width="1" />
      <line x1="${tugStartX + tugW - 39}" y1="${tugMidY - 20}" x2="${tugStartX + tugW - 39}" y2="${tugMidY + 20}" stroke="#94a3b8" stroke-width="2.5" />

      <!-- Hélices con Toberas Kort y Timones de Flanqueo (Bajo línea de agua) -->
      <g id="propulsion-aft">
        <ellipse cx="${tugStartX + tugW - 12}" cy="${tugMidY - 28}" rx="8" ry="14" fill="#0f172a" stroke="#d97706" stroke-width="1.5" />
        <line x1="${tugStartX + tugW - 12}" y1="${tugMidY - 38}" x2="${tugStartX + tugW - 12}" y2="${tugMidY - 18}" stroke="#f59e0b" stroke-width="2.5" />

        <ellipse cx="${tugStartX + tugW - 12}" cy="${tugMidY + 28}" rx="8" ry="14" fill="#0f172a" stroke="#d97706" stroke-width="1.5" />
        <line x1="${tugStartX + tugW - 12}" y1="${tugMidY + 18}" x2="${tugStartX + tugW - 12}" y2="${tugMidY + 38}" stroke="#f59e0b" stroke-width="2.5" />
      </g>

      <!-- Etiquetas Técnicas del Remolcador -->
      <g id="tugboat-labels">
        <rect
          x="${tugStartX + 60}"
          y="${tugY + tugH + 8}"
          width="${tugW - 75}"
          height="38"
          rx="5"
          fill="#f8fafc"
          stroke="#cbd5e1"
          stroke-width="1"
        />
        <text x="${tugStartX + 60 + (tugW - 75) / 2}" y="${tugY + tugH + 21}" fill="#0f172a" font-size="10" font-weight="900" font-family="sans-serif" text-anchor="middle" letter-spacing="0.3">REMOLCADOR DE EMPUJE</text>
        <text x="${tugStartX + 60 + (tugW - 75) / 2}" y="${tugY + tugH + 34}" fill="#0284c7" font-size="9.5" font-weight="bold" font-family="monospace" text-anchor="middle">Motor / ${tugboatHp.toLocaleString()} HP · ${tugBollardPull} TBP</text>
        <text x="${tugStartX + 60 + (tugW - 75) / 2}" y="${tugY + tugH + 44}" fill="#64748b" font-size="8" font-family="sans-serif" text-anchor="middle">${tugboatName}</text>
      </g>
    </g>
  `;

  // Cota Superior / Regla de Eslora Total y Calado
  const rulerY = 38;
  const rulerStartX = bargeStartX;
  const rulerEndX = tugStartX + tugW;

  const rulerSvg = `
    <!-- Regla de Eslora Total y Límites Técnicos -->
    <g id="top-ruler-dimensions">
      <line x1="${rulerStartX}" y1="${rulerY}" x2="${rulerEndX}" y2="${rulerY}" stroke="#64748b" stroke-width="1.6" />
      <!-- Topes extremos -->
      <line x1="${rulerStartX}" y1="${rulerY - 7}" x2="${rulerStartX}" y2="${rulerY + 7}" stroke="#334155" stroke-width="2" />
      <line x1="${rulerEndX}" y1="${rulerY - 7}" x2="${rulerEndX}" y2="${rulerY + 7}" stroke="#334155" stroke-width="2" />
      <!-- Flechas -->
      <polygon points="${rulerStartX},${rulerY} ${rulerStartX + 8},${rulerY - 3.5} ${rulerStartX + 8},${rulerY + 3.5}" fill="#334155" />
      <polygon points="${rulerEndX},${rulerY} ${rulerEndX - 8},${rulerY - 3.5} ${rulerEndX - 8},${rulerY + 3.5}" fill="#334155" />

      <!-- Marca de conexión Remolcador / Barcazas -->
      <line x1="${tugStartX}" y1="${rulerY - 4}" x2="${tugStartX}" y2="${rulerY + 4}" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="2 2" />

      <!-- Caja de Eslora Total Centrada -->
      <rect x="360" y="${rulerY - 14}" width="460" height="26" rx="4" fill="#ffffff" stroke="#94a3b8" stroke-width="1" />
      <text x="590" y="${rulerY + 3}" fill="#0f172a" font-size="10.5" font-weight="900" font-family="monospace" text-anchor="middle" letter-spacing="0.4">
        ESLORA TOTAL CONVOY: ~${totalLengthM} m (${cols} Filas × 61m + Remolcador ${tugLengthM}m) · MANGA: ${totalBeamM} m
      </text>

      <!-- Badge Límite de Calado -->
      <rect x="${rulerEndX - 210}" y="${rulerY - 13}" width="205" height="24" rx="4" fill="#ecfeff" stroke="#06b6d4" stroke-width="1" />
      <text x="${rulerEndX - 107}" y="${rulerY + 3}" fill="#0891b2" font-size="9" font-weight="bold" font-family="monospace" text-anchor="middle">
        LÍMITE CALADO: ${dynamicDraft.toFixed(2)} m (MÍN: ${minWaterLevel.toFixed(2)} m)
      </text>
    </g>
  `;

  // Línea de Flotación (WATERLINE / CALADO DINÁMICO)
  const waterlineY = 385;
  const waterlineSvg = `
    <!-- Línea de Flotación / Calado Dinámico -->
    <g id="waterline-section">
      <line x1="30" y1="${waterlineY}" x2="${svgW - 30}" y2="${waterlineY}" stroke="url(#fluvialWaterlineGrad)" stroke-width="2.5" stroke-dasharray="8 5" />
      
      <!-- Escalas hidrométricas de calado en extremos -->
      <line x1="40" y1="${waterlineY - 20}" x2="40" y2="${waterlineY + 15}" stroke="#06b6d4" stroke-width="1.5" />
      <text x="44" y="${waterlineY - 10}" fill="#0891b2" font-size="8" font-family="monospace" font-weight="bold">3.5m</text>
      <text x="44" y="${waterlineY + 3}" fill="#0891b2" font-size="8" font-family="monospace" font-weight="bold">${dynamicDraft.toFixed(1)}m</text>
      
      <line x1="${svgW - 40}" y1="${waterlineY - 20}" x2="${svgW - 40}" y2="${waterlineY + 15}" stroke="#06b6d4" stroke-width="1.5" />
      <text x="${svgW - 44}" y="${waterlineY - 10}" fill="#0891b2" font-size="8" font-family="monospace" font-weight="bold" text-anchor="end">3.5m</text>
      <text x="${svgW - 44}" y="${waterlineY + 3}" fill="#0891b2" font-size="8" font-family="monospace" font-weight="bold" text-anchor="end">${dynamicDraft.toFixed(1)}m</text>

      <!-- Texto descriptivo central de la línea de agua -->
      <rect x="290" y="${waterlineY + 6}" width="600" height="22" rx="4" fill="#f0fdfa" stroke="#2dd4bf" stroke-width="1" />
      <text x="590" y="${waterlineY + 21}" fill="#0d9488" font-size="9.5" font-weight="bold" font-family="monospace" text-anchor="middle">
        ≈ ≈ ≈ WATERLINE / CALADO DINÁMICO: ${dynamicDraft.toFixed(2)} m (LÍMITE ESTIAJE DATABRIDGE: ${minWaterLevel.toFixed(2)} m | UKC: +${ukc} m) ≈ ≈ ≈
      </text>
    </g>
  `;

  return `
    <div
      id="stowage-plan-fluvial"
      class="stowage-plan-fluvial-wrapper visual-stowage-plan-wrapper bg-white text-slate-800 border-2 border-slate-300 rounded-xl p-4 sm:p-6 shadow-md mb-4 print:bg-white print:text-slate-800 print:border-slate-300 print:shadow-none break-inside-avoid"
      style="-webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"
    >
      <!-- Barra Superior de Telemetría y Título (Estilo Universal Stowage Engine RiverCharter) -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 mb-4">
        <div class="flex items-center gap-2.5 flex-wrap">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.4)]"></span>
          <span class="text-xs font-black uppercase tracking-wider text-slate-900">
            UNIVERSAL STOWAGE ENGINE · RIVERCHARTER
          </span>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold">
            ARREGLO DINÁMICO DE CONVOY FLUVIAL 2D
          </span>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold uppercase">
            ${bargeCount} BARCAZAS (${rows} FILAS × ${cols} ESLORA) · EMPUJE HIDROVÍA
          </span>
        </div>
        <div class="text-[11px] font-mono text-slate-600 flex items-center gap-3">
          <span><strong class="text-slate-800 uppercase text-[10px]">Carga Total:</strong> ${totalCargo.toLocaleString('en-US')} MT</span>
          <span><strong class="text-slate-800 uppercase text-[10px]">Eslora:</strong> ~${totalLengthM} m</span>
          <span><strong class="text-slate-800 uppercase text-[10px]">Calado:</strong> ${dynamicDraft.toFixed(2)} m</span>
        </div>
      </div>

      <!-- Indicadores Direccionales Proa / Popa -->
      <div class="flex justify-between items-center text-[10px] font-mono font-bold tracking-widest text-gray-700 uppercase mb-2 px-2">
        <div class="flex items-center gap-1.5 text-blue-800">
          <span class="text-blue-700">◀</span>
          <span>[PROA / BOW - FORWARD]</span>
        </div>
        <div class="text-[9px] text-gray-500 font-sans tracking-normal hidden sm:block">
          DISPOSICIÓN TÉCNICA DEL TREN DE BARCAZAS &amp; ACOPLAMIENTO AL REMOLCADOR DE EMPUJE
        </div>
        <div class="flex items-center gap-1.5 text-blue-800">
          <span>[POPA / STERN - AFT]</span>
          <span class="text-blue-700">▶</span>
        </div>
      </div>

      <!-- Lienzo SVG Avanzado -->
      <div class="relative w-full overflow-hidden rounded-lg bg-slate-50 border border-slate-300 p-2 sm:p-3 my-2 shadow-inner">
        <svg
          viewBox="0 0 ${svgW} ${svgH}"
          class="w-full h-auto select-none"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Plano de estiba esquemático del convoy fluvial con remolcador y tolvas"
        >
          <defs>
            <!-- Gradientes del Casco Metálico -->
            <linearGradient id="fluvialBargeHullGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#f8fafc" />
              <stop offset="60%" stop-color="#e2e8f0" />
              <stop offset="100%" stop-color="#cbd5e1" />
            </linearGradient>

            <linearGradient id="fluvialPushboatHullGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#f1f5f9" />
              <stop offset="50%" stop-color="#e2e8f0" />
              <stop offset="100%" stop-color="#94a3b8" />
            </linearGradient>

            <!-- Gradiente de la Tolva Interior en Azul Naval Oscuro -->
            <linearGradient id="fluvialHopperNavalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#1e3a8a" />
              <stop offset="45%" stop-color="#1e40af" />
              <stop offset="100%" stop-color="#0f172a" />
            </linearGradient>

            <!-- Gradiente de la Línea de Flotación Cyan -->
            <linearGradient id="fluvialWaterlineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.4" />
              <stop offset="50%" stop-color="#0891b2" stop-opacity="1" />
              <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.4" />
            </linearGradient>

            <!-- Gradiente Ventanas del Puente de Mando -->
            <linearGradient id="fluvialPilothouseGlassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e0f2fe" />
              <stop offset="40%" stop-color="#7dd3fc" />
              <stop offset="100%" stop-color="#0284c7" />
            </linearGradient>

            <!-- Patrón de carga a granel en tolvas -->
            <pattern id="fluvialHopperPattern" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M-2,2 l4,-4 M0,12 l12,-12 M10,14 l4,-4" stroke="#ffffff" stroke-width="0.8" stroke-opacity="0.25" />
            </pattern>
          </defs>

          <!-- Regla Superior de Eslora Total -->
          ${rulerSvg}

          <!-- Matriz Dinámica de Barcazas -->
          <g id="barge-matrix-grid">
            ${bargesSvg}
          </g>

          <!-- Remolcador de Empuje (Popa) -->
          ${pushboatSvg}

          <!-- Línea de Flotación (Calado Dinámico) -->
          ${waterlineSvg}
        </svg>
      </div>

      <!-- Resumen Técnico Hidrológico y de Navegabilidad Fluvial -->
      <div class="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-700">
        <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <span class="text-[9px] uppercase font-bold text-slate-500 block">Arreglo Convoy</span>
          <span class="font-bold text-slate-900">${bargeCount} Barcazas (${rows}×${cols}) + 1 Remolcador</span>
        </div>
        <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <span class="text-[9px] uppercase font-bold text-slate-500 block">Eslora y Manga Total</span>
          <span class="font-bold text-slate-900">~${totalLengthM} m × ${totalBeamM} m</span>
        </div>
        <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <span class="text-[9px] uppercase font-bold text-slate-500 block">Calado Operativo / Estiaje</span>
          <span class="font-bold text-blue-900">${dynamicDraft.toFixed(2)} m / ${minWaterLevel.toFixed(2)} m</span>
        </div>
        <div class="p-2.5 rounded-lg border ${isApto ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}">
          <span class="text-[9px] uppercase font-bold ${isApto ? 'text-emerald-700' : 'text-rose-700'} block">Dictamen Navegabilidad</span>
          <span class="font-bold flex items-center gap-1">
            ${isApto ? '✓ APTO PARA NAVEGACIÓN (UKC +' + ukc + 'm)' : '⚠️ ALERTA ESTIAJE (UKC ' + ukc + 'm)'}
          </span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Componente React FluvialStowagePlan
 */
export default function FluvialStowagePlan(props) {
  const htmlContent = useMemo(() => {
    return renderFluvialStowagePlanSvg(props);
  }, [props]);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}

if (typeof window !== 'undefined') {
  window.FluvialStowagePlan = FluvialStowagePlan;
  window.renderFluvialStowagePlanSvg = renderFluvialStowagePlanSvg;
  window.calculateConvoyMatrix = calculateConvoyMatrix;
  window.resolveActiveBargeCount = resolveActiveBargeCount;
}
