import {
  cityAdmin,
  required,
  reconcileOrder,
  result,
} from "../_shared/city.ts";
Deno.serve(async (request) => {
  if (
    request.method !== "POST" ||
    request.headers.get("authorization") !==
      `Bearer ${required("CITY_RECONCILE_SECRET")}`
  )
    return new Response("Unauthorized", { status: 401 });
  const db = cityAdmin(),
    rows =
      result(
        await db
          .from("city_orders")
          .select("id")
          .not("stripe_session_id", "is", null)
          .order("updated_at")
          .limit(5),
      ) || [];
  const outcomes: Array<{ id: string; status?: string; error?: string }> = [];
  await Promise.all(
    rows.map(async (row) => {
      try {
        outcomes.push(await reconcileOrder(db, row.id));
      } catch (error) {
        outcomes.push({ id: row.id, error: String(error) });
      }
    }),
  );
  // Rate limit rows are short-lived operational data, not user financial history.
  await db
    .from("city_rate_limits")
    .delete()
    .lt("window_start", new Date(Date.now() - 86400000).toISOString());
  return Response.json({ outcomes });
});
