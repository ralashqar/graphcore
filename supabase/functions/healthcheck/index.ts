import "@supabase/functions-js/edge-runtime.d.ts"

console.log("healthcheck function booted")

Deno.serve(() => {
  return Response.json({
    ok: true,
    function: "healthcheck",
    timestamp: new Date().toISOString(),
  })
})
