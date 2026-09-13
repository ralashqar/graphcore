# Loop-aware animation prompts

Flexible graph nodes already expose a strict boolean `loop` field and the studio supports editing it. The planner now explicitly marks sustained idle, cyclic locomotion and intentionally repeated gestures/dances as looping, while keeping one-shot attacks, jumps and start/stop clips non-looping unless requested otherwise.

`flexibleMotionPrompt` adds `animation-loop-prompt-1.0.0` guidance to looping clip nodes only. It requests complete continuous cycles with consistent rhythm and smooth boundary motion, without introductory or finishing gestures. Root guidance distinguishes in-place cycles, traveling cycles (do not return to the starting world position) and anchored cycles. Connected states are labeled transition context rather than actions to perform inside the repeating clip. One-shot prompts remain unchanged.

This is text conditioning, not a native Kimodo loop switch or a quality guarantee. Existing gait processing, exported-motion checks and creator review remain required. It also works for looping clips without a locomotion profile. The shared compiler is used by recipe construction and preflight length checks; prompts over 1,500 characters fail rather than being truncated.

Readiness fingerprints now include the prompt policy, so older reports require another readiness check. Planner checkpoint keys are versioned. Existing accepted assets and frozen submitted recipes are preserved; no automatic regeneration, inference submission or budget changes occur. Worker version: `game-animation-studio-2.2.1`.

## Verification and deployment

All 42 focused tests and the regression suite (726 passed, 8 skipped) passed. TypeScript, Deno checks, the production build, the preflight browser fixture and a real dev-server animation-route load passed with no page errors. The dev server started on port 5175. Focused tests cover loop toggling through recipe compilation/readiness, root guidance, adjacent-state context, one-shot preservation and prompt overflow. Live model compliance and visual improvement require separately admitted generation; no GPU inference is submitted for this change.

The four Edge entries (`animation-studio`, `game-command`, `get-game-workspace`, `get-game-release`) and both isolated Fly apps are deployed. Game image: `deployment-01M2BHYTJPD60K9M1820QR6B3K`; asset health returned version `game-animation-studio-2.2.1` and `healthy:true` (the local SSH client emitted a handle error after returning the health payload). Edge OPTIONS returned 200 and unauthenticated POST returned 401. Main studio frontend verification remains local; no main frontend hosting destination is configured by this task. The shared world worker is unaffected.
