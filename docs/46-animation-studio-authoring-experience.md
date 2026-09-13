# Animation studio authoring experience

## Authoring

The flexible studio retains shared workflow node chrome and React Flow. ELK lays out state connections; creator positions persist locally per project/workspace, without invalidating motion contracts. Machines collapse, breadcrumbs reveal hierarchy, and graph fitting/follow controls retain navigation. Runtime transitions and source dependencies are separate views. Selecting a transition edits endpoints, events, completion, phase window, blending, priority and typed parameter conditions. Existing graph validation remains the save boundary.

The resizable graph/preview split keeps playback alongside authoring. A bottom composer shows prompt scope, editable example prompts and planning price/availability when supplied by the server. Applied-revision highlights and summaries explain changes; scope/conflict notifications lead to history. History, generation, saved-motion playground and optional game integration use drawers with Escape and focus restoration. Mobile uses a stacked layout.

## Playback and review

Preview shows the active hierarchy, event keys, parameter controls and reasons transitions are unavailable. An isolated transition test runs only the chosen connection while preserving its conditions and timing; optional repeat returns to its source after the destination plays. Event-triggered repeats still require the event. Reset or previewing a selected node returns to full graph playback.

Candidate comparison can pause clips at entry/exit frames through an optional presentation-only `poseFrame` prop on the shared preview. Edited motion contracts display Needs regeneration before saving. Existing approval, pinning and snapshot boundaries remain in place. Saved-motion playground builds a temporary graph from up to four compatible Fabric clips returned for the current draft; it cannot save/rebind those clips or create new motion contracts. Projects without compatible clips get an explicit empty state, not synthetic motion presented as generated output.

## Read-only availability

`animation-studio` returns optional `availability` with `planningEnabled`, `planCredits` and `generation.{enabled,reason,reservationPerClipCents}`. These are advisory configuration checks. The displayed reservation is selected count multiplied by the verified per-clip hold, not billed usage; final provider configuration, owner permissions, graph revision and funding checks remain in the command path. No inference or reservations occur on reads.

The existing RLS source query receives expiring signed URLs for at most twelve draft candidates. Only RLS-readable candidate storage paths are signed. Credentials and provider endpoints are never returned. The old fields and legacy studio remain compatible. No migration, shared worker or Fly deployment is required; deploy the animation-studio Edge entry after verification.

## Verification

- Focused studio and availability/diagnostic tests: 18 passed.
- Existing main regression suite: 726 passed, 8 skipped.
- Browser fixture: create/follow-up prompts, scoped node IDs, keyboard events, completion, undo/redo, transition edits, nested machine collapse, dependency view, drawers and mobile overflow; no page exceptions.
- Real saved-motion playground acceptance runs with `node scripts/animation-flexible-browser.mjs --saved-motion` when the prior generic bake artifact is available. It checks visible frame changes from the existing GLB with all external provider traffic blocked.
- Final `npx tsc --noEmit`, Deno Edge check and `npm run build`: passed. Build retains existing large-chunk and unresolved landing-image warnings.
- Legacy studio browser acceptance: passed. Saved-motion browser acceptance also checks candidate entry/exit scrub frames (0 and 1).
- Dev server started at `http://127.0.0.1:5212/` without startup errors; isolated browser runs reported no page exceptions.
- `animation-studio` deployed with the API bundler. Hosted preflight returned 200 and unauthenticated read returned 401. Authenticated hosted read/LLM acceptance was not performed in this pass; browser data responses are fixtures. No Fly deployment or database migration was needed.

Hosted LLM prompt quality and newly generated arbitrary motion remain outside the fixture evidence. Native image and funded real-motion acceptance are still required before inference admissions can be enabled; this change neither increases the setup budget nor submits GPU work.
