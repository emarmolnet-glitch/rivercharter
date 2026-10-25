import type { Config, Context } from "@netlify/functions";
import { getPool, ensureApplicationSchema } from "../../db/index.js";
import { getDatabaseConnectionString } from "../../db/connection-string.js";

/**
 * Buffer en memoria para telemetría IoT reciente.
 * Permite al frontend consultar las actualizaciones satelitales vía polling/GET
 * y despachar eventos "rivercharter:barge-telemetry" al DOM.
 */
interface IotTelemetryRecord {
  id: string;
  iotTrackingId: string;
  bargeId?: number | string;
  bargeName?: string;
  latitude: number;
  longitude: number;
  currentLocation: string;
  provider: string;
  battery?: number;
  timestamp: string;
  receivedAt: string;
  event: 'rivercharter:barge-telemetry';
}

const recentTelemetryBuffer: IotTelemetryRecord[] = [];
const MAX_BUFFER_SIZE = 100;

function recordTelemetry(record: IotTelemetryRecord) {
  recentTelemetryBuffer.unshift(record);
  if (recentTelemetryBuffer.length > MAX_BUFFER_SIZE) {
    recentTelemetryBuffer.pop();
  }
}

/**
 * Extrae el identificador de rastreo IoT del payload satelital heterogéneo
 */
function extractIotTrackingId(body: Record<string, unknown>): string | null {
  const direct =
    body.iotTrackingId ||
    body.iot_tracking_id ||
    body.device_id ||
    body.deviceId ||
    body.imei ||
    body.tracker_id ||
    body.trackerId ||
    body.barge_id ||
    body.bargeId ||
    body.barge_number ||
    body.bargeNumber;

  if (direct && typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  if (typeof direct === "number") {
    return String(direct);
  }

  // Búsqueda en objetos anidados (Swarm data, Iridium payload, packet, telemetry)
  const nested = (body.data || body.payload || body.packet || body.telemetry || body.barge) as Record<string, unknown> | undefined;
  if (nested && typeof nested === "object") {
    const fromNested =
      nested.iotTrackingId ||
      nested.iot_tracking_id ||
      nested.device_id ||
      nested.deviceId ||
      nested.imei ||
      nested.tracker_id ||
      nested.barge_id ||
      nested.id;
    if (fromNested) return String(fromNested).trim();
  }

  // Búsqueda en cadena codificada de datos
  if (typeof body.data === "string") {
    const idMatch = body.data.match(/(?:ID|DEVICE|IOT|BARGE)[:=]([A-Za-z0-9_-]+)/i);
    if (idMatch) return idMatch[1];
  }

  return null;
}

/**
 * Extrae las coordenadas geográficas (latitud y longitud) del payload satelital
 */
function extractCoordinates(body: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const latCandidate =
    body.latitude ??
    body.lat ??
    body.iridium_latitude ??
    body.gps_latitude ??
    body.y;

  const lngCandidate =
    body.longitude ??
    body.lng ??
    body.lon ??
    body.iridium_longitude ??
    body.gps_longitude ??
    body.x;

  let lat = Number(latCandidate);
  let lng = Number(lngCandidate);

  // Búsqueda anidada
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const nested = (body.data || body.payload || body.packet || body.telemetry || body.location || body.coords) as Record<string, unknown> | undefined;
    if (nested && typeof nested === "object") {
      lat = Number(nested.latitude ?? nested.lat ?? nested.iridium_latitude ?? nested.y);
      lng = Number(nested.longitude ?? nested.lng ?? nested.lon ?? nested.iridium_longitude ?? nested.x);
    }
  }

  // Parseo de cadenas tipo "LAT:-27.4512,LON:-58.9834"
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && typeof body.data === "string") {
    const match = body.data.match(/LAT[:=]\s*([+-]?\d+(?:\.\d+)?).*?LO(?:N|NG)[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
    if (match) {
      lat = parseFloat(match[1]);
      lng = parseFloat(match[2]);
    }
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    // Validación de rangos geográficos estándar (-90 a 90, -180 a 180)
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  return null;
}

/**
 * Detecta el proveedor satelital según campos del mensaje
 */
function detectProvider(body: Record<string, unknown>): string {
  if (body.provider && typeof body.provider === "string") return body.provider;
  if ("imei" in body || "momsn" in body || "iridium_latitude" in body) return "Iridium SBD";
  if ("device_type" in body || "device_id" in body && "user_id" in body) return "Swarm Technologies";
  if ("satellite" in body) return String(body.satellite);
  return "SATELLITE_IOT";
}

export default async (request: Request, context: Context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Provider-Key",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // GET: Consultar telemetría satelital reciente para notificar e hidratar el frontend
  if (request.method === "GET") {
    const url = new URL(request.url);
    const targetId = url.searchParams.get("iotTrackingId") || url.searchParams.get("id");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

    let telemetryList = recentTelemetryBuffer;
    if (targetId) {
      telemetryList = telemetryList.filter((item) => item.iotTrackingId === targetId || String(item.bargeId) === targetId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: telemetryList.slice(0, limit).length,
        telemetry: telemetryList.slice(0, limit),
        lastUpdate: telemetryList[0] || null,
        status: "ACTIVE_LISTENING",
      }),
      { status: 200, headers }
    );
  }

  // Solo se permiten peticiones POST para recepción telemétrica
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST to submit satellite IoT telemetry." }),
      { status: 405, headers }
    );
  }

  try {
    let body: Record<string, unknown> = {};
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch (_) {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body payload" }),
          { status: 400, headers }
        );
      }
    }

    // 1. Extraer identificador IoT (iotTrackingId)
    const iotTrackingId = extractIotTrackingId(body);
    if (!iotTrackingId) {
      return new Response(
        JSON.stringify({
          error: "Missing IoT identifier in webhook payload. Expected 'iotTrackingId', 'device_id', or 'imei'.",
        }),
        { status: 400, headers }
      );
    }

    // 2. Extraer y validar coordenadas geográficas
    const coords = extractCoordinates(body);
    if (!coords) {
      return new Response(
        JSON.stringify({
          error: "Invalid or missing coordinates in webhook payload. Latitude [-90, 90] and Longitude [-180, 180] are required.",
          iotTrackingId,
        }),
        { status: 422, headers }
      );
    }

    const { latitude, longitude } = coords;
    const provider = detectProvider(body);
    const battery = typeof body.battery === "number" ? body.battery : undefined;
    const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();
    const formattedLocation = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

    let updatedBarge: Record<string, unknown> | null = null;
    let databaseUpdated = false;

    // 3. Actualizar coordenadas en la tabla 'barges' de Neon PostgreSQL / Netlify DB
    const connStr = getDatabaseConnectionString();
    if (connStr) {
      try {
        await ensureApplicationSchema().catch(() => {});
        const pool = getPool();

        // Actualización directa de coordenadas, calado y estado
        const updateSql = `
          UPDATE barges
          SET
            latitude = $1,
            longitude = $2,
            current_location = $3,
            last_telemetry_at = NOW(),
            updated_at = NOW()
          WHERE iot_tracking_id = $4 OR barge_number = $4 OR id::text = $4
          RETURNING id, name, barge_number, barge_type, capacity, dynamic_draft, iot_tracking_id, status, current_location, latitude, longitude, last_telemetry_at;
        `;

        const dbRes = await pool.query(updateSql, [latitude, longitude, formattedLocation, iotTrackingId]);
        if (dbRes.rows && dbRes.rows.length > 0) {
          updatedBarge = dbRes.rows[0];
          databaseUpdated = true;
        } else {
          // Si la barcaza no existe con ese iotTrackingId, intentamos crear o actualizar registro de contingencia
          const insertSql = `
            INSERT INTO barges (name, barge_number, barge_type, capacity, dynamic_draft, iot_tracking_id, status, current_location, latitude, longitude, last_telemetry_at)
            VALUES ($1, $2, 'HOPPER', 1500, 2.8, $3, 'IN_TRANSIT', $4, $5, $6, NOW())
            ON CONFLICT (iot_tracking_id)
            DO UPDATE SET
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              current_location = EXCLUDED.current_location,
              last_telemetry_at = NOW(),
              updated_at = NOW()
            RETURNING id, name, barge_number, barge_type, capacity, dynamic_draft, iot_tracking_id, status, current_location, latitude, longitude, last_telemetry_at;
          `;
          const insertRes = await pool.query(insertSql, [
            `Barcaza IoT ${iotTrackingId}`,
            iotTrackingId,
            iotTrackingId,
            formattedLocation,
            latitude,
            longitude,
          ]);
          if (insertRes.rows && insertRes.rows.length > 0) {
            updatedBarge = insertRes.rows[0];
            databaseUpdated = true;
          }
        }
      } catch (dbErr) {
        console.warn("[iot-webhook] Error actualizando base de datos Neon:", dbErr);
      }
    }

    // 4. Preparar payload de telemetría optimizado para notificar al frontend
    const telemetryRecord: IotTelemetryRecord = {
      id: iotTrackingId,
      iotTrackingId,
      bargeId: updatedBarge?.id ? Number(updatedBarge.id) : undefined,
      bargeName: (updatedBarge?.name as string) || `Barcaza ${iotTrackingId}`,
      latitude,
      longitude,
      currentLocation: formattedLocation,
      provider,
      battery,
      timestamp,
      receivedAt: new Date().toISOString(),
      event: "rivercharter:barge-telemetry",
    };

    // Guardar en buffer en memoria para polling del cliente
    recordTelemetry(telemetryRecord);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Telemetría satelital IoT recibida y procesada correctamente.",
        databaseUpdated,
        telemetry: telemetryRecord,
        barge: updatedBarge,
      }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error("[iot-webhook] Error inesperado en el webhook:", err);
    return new Response(
      JSON.stringify({
        error: "Internal server error while processing satellite webhook",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers }
    );
  }
};

export const config: Config = {
  path: "/api/iot-webhook",
};
