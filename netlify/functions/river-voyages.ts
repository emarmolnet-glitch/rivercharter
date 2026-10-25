import type { Config, Context } from "@netlify/functions";
import { netlifyDb } from "../../db/netlify.js";
import { riverVoyages, voyageBarges, tugboats, barges } from "../../db/schema.js";
import { eq } from "drizzle-orm";

interface SaveVoyageBody {
  tugboat_id?: number | string;
  tugboatId?: number | string;
  barge_ids?: Array<number | string>;
  bargeIds?: Array<number | string>;
  voyage_number?: string;
  voyageNumber?: string;
  river_name?: string;
  riverName?: string;
  origin_terminal?: string;
  originTerminal?: string;
  destination_terminal?: string;
  destinationTerminal?: string;
  min_water_level?: number | string;
  minWaterLevel?: number | string;
  current_water_level?: number | string;
  departure_date?: string;
  estimated_arrival_date?: string;
  metadata?: Record<string, unknown>;
}

export default async (request: Request, context: Context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // GET: Listar viajes fluviales y remolcadores
  if (request.method === "GET") {
    try {
      const voyagesList = await netlifyDb.select().from(riverVoyages).limit(50);
      const tugboatsList = await netlifyDb.select().from(tugboats).limit(50);
      const bargesList = await netlifyDb.select().from(barges).limit(50);
      return Response.json(
        {
          success: true,
          voyages: voyagesList,
          tugboats: tugboatsList,
          barges: bargesList,
        },
        { headers }
      );
    } catch (error) {
      console.error("[river-voyages] Error listando viajes fluviales:", error);
      return Response.json({ success: false, error: "Error consultando base de datos" }, { status: 500, headers });
    }
  }

  // POST: Guardar viaje fluvial con tugboat_id y array de barge_ids
  if (request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as SaveVoyageBody;
      const rawTugboatId = body.tugboat_id ?? body.tugboatId;
      const rawBargeIds = body.barge_ids ?? body.bargeIds ?? [];

      const tugboatIdNum = Number(rawTugboatId);
      if (!Number.isFinite(tugboatIdNum) || tugboatIdNum <= 0) {
        return Response.json(
          { success: false, error: "El campo tugboat_id es obligatorio y debe ser un ID numérico válido." },
          { status: 400, headers }
        );
      }

      const bargeIdsNum = Array.isArray(rawBargeIds)
        ? rawBargeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : [];

      const voyageNum = String(body.voyage_number || body.voyageNumber || `RV-${Date.now()}`).trim();
      const river = String(body.river_name || body.riverName || "Hidrovía Paraná-Paraguay").trim();
      const origin = String(body.origin_terminal || body.originTerminal || "Terminal San Lorenzo").trim();
      const destination = String(body.destination_terminal || body.destinationTerminal || "Terminal Nueva Palmira").trim();
      const minWater = String(body.min_water_level ?? body.minWaterLevel ?? 2.6);

      // Upsert o inserción de riverVoyages
      const insertedVoyages = await netlifyDb
        .insert(riverVoyages)
        .values({
          voyageNumber: voyageNum,
          tugboatId: tugboatIdNum,
          riverName: river,
          originTerminal: origin,
          destinationTerminal: destination,
          minWaterLevel: minWater,
          currentWaterLevel: body.current_water_level ? String(body.current_water_level) : null,
          departureDate: body.departure_date ? new Date(body.departure_date) : new Date(),
          estimatedArrivalDate: body.estimated_arrival_date ? new Date(body.estimated_arrival_date) : null,
          status: "PLANNED",
          metadata: body.metadata || { bargeIds: bargeIdsNum },
        })
        .returning()
        .catch(async () => {
          // Si ya existe por número de viaje, buscar existente
          return await netlifyDb
            .select()
            .from(riverVoyages)
            .where(eq(riverVoyages.voyageNumber, voyageNum))
            .limit(1);
        });

      const voyageRecord = insertedVoyages[0];

      // Acoplar barcazas en voyageBarges
      if (voyageRecord && bargeIdsNum.length > 0) {
        for (const bId of bargeIdsNum) {
          try {
            await netlifyDb.insert(voyageBarges).values({
              voyageId: voyageRecord.id,
              bargeId: bId,
              couplingPoint: origin,
              status: "COUPLED",
            });
          } catch (_) {
            // Ignorar duplicados de acople
          }
        }
      }

      return Response.json(
        {
          success: true,
          message: "Viaje fluvial y convoy guardados exitosamente.",
          voyage: voyageRecord || { voyageNumber: voyageNum, tugboatId: tugboatIdNum },
          tugboat_id: tugboatIdNum,
          barge_ids: bargeIdsNum,
        },
        { status: 201, headers }
      );
    } catch (error: any) {
      console.error("[river-voyages] Error al procesar viaje fluvial:", error);
      return Response.json(
        { success: false, error: error?.message || "Error al guardar el viaje fluvial" },
        { status: 500, headers }
      );
    }
  }

  return Response.json({ error: "Método no permitido" }, { status: 405, headers });
};

export const config: Config = {
  path: ["/api/v1/river-voyages", "/api/river-voyages"],
};
