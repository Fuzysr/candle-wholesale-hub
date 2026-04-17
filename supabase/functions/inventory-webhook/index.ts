import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

// Public webhook for external warehouse systems (1C / MoySklad / etc.)
// Auth: header `x-webhook-secret` MUST match INVENTORY_WEBHOOK_SECRET env var.
// Payload:
// {
//   "updates": [
//     { "sku": "SKU-001", "stock_boxes": 42, "external_id": "..." },
//     { "external_id": "1c-id-123", "stock_boxes": 10 }
//   ]
// }

type Update = {
  sku?: string;
  external_id?: string;
  stock_boxes: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("INVENTORY_WEBHOOK_SECRET");
    const provided = req.headers.get("x-webhook-secret");
    if (!secret || provided !== secret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null) as { updates?: Update[] } | null;
    if (!body?.updates?.length) {
      return new Response(JSON.stringify({ error: "no updates" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: { matched: number; updated: number; errors: string[] } = { matched: 0, updated: 0, errors: [] };

    for (const u of body.updates) {
      if (typeof u.stock_boxes !== "number" || u.stock_boxes < 0) {
        results.errors.push(`bad qty for ${u.sku ?? u.external_id}`);
        continue;
      }
      let q = supabase.from("product_variants").select("id, stock_boxes").limit(1);
      if (u.external_id) q = q.eq("external_id", u.external_id);
      else if (u.sku) q = q.eq("sku", u.sku);
      else { results.errors.push("no sku/external_id"); continue; }

      const { data: row, error } = await q.maybeSingle();
      if (error) { results.errors.push(error.message); continue; }
      if (!row) { results.errors.push(`not found: ${u.sku ?? u.external_id}`); continue; }
      results.matched++;

      const delta = u.stock_boxes - row.stock_boxes;
      const { error: e1 } = await supabase
        .from("product_variants")
        .update({ stock_boxes: u.stock_boxes, last_synced_at: new Date().toISOString() })
        .eq("id", row.id);
      if (e1) { results.errors.push(e1.message); continue; }

      await supabase.from("stock_movements").insert({
        variant_id: row.id,
        type: "sync",
        qty_boxes: delta,
        source: "webhook",
        comment: `external_id=${u.external_id ?? "-"} sku=${u.sku ?? "-"}`,
      });
      results.updated++;
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
