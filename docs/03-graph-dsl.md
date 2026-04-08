# Graph and DSL Contract

Narrative and gameplay logic are declarative.

- Conditions use `ConditionExpr`
- Effects use `EffectOp`
- Numeric logic uses `FormulaExpr`

V1 node palette:

- `start`, `text`, `choice`, `condition`, `effect`, `quest_step`
- `branch`, `call_subgraph`, `return`, `random`, `market`, `end`

The graph compiler validates entry nodes, broken links, unreachable nodes, and missing item/stat references in effects.
