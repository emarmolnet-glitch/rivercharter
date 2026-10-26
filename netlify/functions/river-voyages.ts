import type { Config, Context } from "@netlify/functions";
import { netlifyDb } from "../../db/netlify.js";
import { riverVoyages, voyageBarges, tugboats, barges } from "../../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { validateConvoyDynamicDraft, type FluvialBargeDraftInfo } from "./_shared/draft-validation.js";

interface SaveVoyageBody {
  tugboat_id?: number | string;
  tugboatId?: number | string;
  barge_ids?: Array<number | string>;
  bargeIds?: Array<number | string>;
  barges?: Array<FluvialBargeDraftInfo>;
  barge_details?: Array<FluvialBargeDraftInfo>;
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
  max_dynamic_draft?: number | string;
  waiting_hours?: number;
  demurrage_cost?: number;
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

      // Recopilar información de barcazas para el Validador de Calado Dinámico (Draft Constraint)
      let convoyBarges: FluvialBargeDraftInfo[] = [];

      if (Array.isArray(body.barges) && body.barges.length > 0) {
        convoyBarges = [...body.barges];
      } else if (Array.isArray(body.barge_details) && body.barge_details.length > 0) {
        convoyBarges = [...body.barge_details];
      }

      // Si tenemos IDs de barcazas, consultar la base de datos para obtener calados y capacidades reales
      if (bargeIdsNum.length > 0) {
        try {
          const dbBarges = await netlifyDb
            .select()
            .from(barges)
            .where(inArray(barges.id, bargeIdsNum));

          for (const dbBarge of dbBarges) {
            if (!convoyBarges.some((cb) => Number(cb.id) === dbBarge.id)) {
              convoyBarges.push({
                id: dbBarge.id,
                name: dbBarge.name,
                capacity: Number(dbBarge.capacity) || 0,
                dynamicDraft: Number(dbBarge.dynamicDraft) || 0,
              });
            }
          }
        } catch (dbErr) {
          console.warn("[river-voyages] No se pudieron consultar barcazas de DB:", dbErr);
        }
      }

      // Soporte complementario para barcazas en metadata o calado dinámico explícito
      if (convoyBarges.length === 0 && Array.isArray(body.metadata?.barges)) {
        convoyBarges = body.metadata.barges as FluvialBargeDraftInfo[];
      }
      if (convoyBarges.length === 0 && (body.metadata?.maxDynamicDraft != null || body.max_dynamic_draft != null)) {
        const explicitDraft = Number(body.metadata?.maxDynamicDraft ?? body.max_dynamic_draft);
        convoyBarges.push({
          id: 0,
          name: "Barcaza Principal del Convoy",
          capacity: Number(body.metadata?.totalCapacityMt) || 1500,
          dynamicDraft: explicitDraft,
        });
      }

      // Validador de Calado Dinámico (Draft Constraint):
      // Antes de guardar un convoy, compara el dynamic_draft de la barcaza más pesada contra el min_water_level de la ruta.
      const draftValidation = validateConvoyDynamicDraft({
        barges: convoyBarges,
        minWaterLevel: Number(minWater),
        riverName: river,
      });

      if (draftValidation.isBlocked) {
        return Response.json(
          {
            success: false,
            error: draftValidation.error,
            message: draftValidation.message,
            code: "DRAFT_LIMIT_EXCEEDED",
            blocking: true,
            max_dynamic_draft: draftValidation.maxDynamicDraft,
            min_water_level: draftValidation.minWaterLevel,
            margin_meters: draftValidation.marginMeters,
            heaviest_barge: draftValidation.heaviestBarge,
          },
          { status: 400, headers }
        );
      }

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
          draft_validation: draftValidation,
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
