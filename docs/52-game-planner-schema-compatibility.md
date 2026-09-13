# Game planner schema compatibility

The hosted planner rejected `nodes.upsert.items.locomotion.anyOf[0].direction`: Zod exported a tuple using `prefixItems`, while the provider requires array `items`. Other point tuples have the same incompatibility.

`gamePlannerJsonSchema` recursively translates homogeneous tuples into arrays with the same element schema and exact min/max lengths. Heterogeneous or variadic tuples are rejected locally rather than widened. Both game LLM entry points use the adapter. Original Zod schemas still parse returned output, enforcing finite values, lengths, normalized directions and domain refinements.

Worker version is `game-animation-studio-2.2.2`. Only Fly game execution changes; Edge entries and the shared world worker do not call this adapter. Existing failed prompts can be resubmitted without changing their graph. No GPU work or credit-policy change is involved.

All 45 focused tests and 726 regression tests passed (8 skipped). TypeScript, Deno worker checks, the production build and the dev-server animation route passed; no browser page errors were recorded.

Fly game worker `game-animation-studio-2.2.2` is deployed and deployment smoke checks passed. A live request from the deployed worker using the complete graph-edit response schema returned HTTP 200 with no error. The probe was capped at 16 output tokens and returned `incomplete`, deliberately testing schema admission rather than full planning. No GPU job was submitted. The SSH client emitted a local handle error after printing the successful API result. Creator prompt completion remains to be confirmed by resubmitting the failed prompt.
