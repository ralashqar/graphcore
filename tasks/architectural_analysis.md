# Architectural Analysis: UI/UX & Business Logic Separation

To prepare for completely ripping out and replacing the UI with a "spatial desktop" paradigm while preserving the core mechanics, I've conducted a thorough audit of the React + React Flow application structure. 

Here is the architectural analysis of the codebase.

## 1. The Coupling Assessment

**Coupling Score: 2 / 10 (Highly Tangled)**

**Why this score?**
While the repository follows a pseudo-Domain-Driven Design folder structure (`src/domain`, `src/application`, `src/features`), the reality of the React implementation is that it relies heavily on "God Components". 

Specifically, the application suffers from extreme prop-drilling and intertwined state. `App.tsx` is nearly 6,000 lines long, responsible for orchestrating domain functions and passing massive payloads of data to child components. Its primary child, `WorldGraphPage.tsx` (over 6,300 lines), acts as a monolithic controller that mixes React Flow's geometric canvas math, visual transition timings, API polling, and deep domain entity logic in the exact same render cycle.

The business logic is not isolated in standard headless hooks or stores; instead, it is tightly bound to the React component lifecycle, making a UI swap a delicate surgical procedure.

## 2. State Management Audit

**Where does the source of truth live?**
The source of truth is primarily scattered across **Local React State (`useState`)** and **Prop Drilling** from the root, rather than a centralized state manager.
- The root domain state (`ProjectSnapshot` containing nodes, edges, relationships, and entities) is stored in a `useState` hook at the very top of `App.tsx`.
- The transient graph state (coordinates, `canvasNodes`, `canvasEdges`) lives inside `useState` hooks inside `WorldGraphPage.tsx` (e.g., lines 1111-1112).
- There is a Zustand store (`src/state/editorStore.ts`), but it is shockingly underutilized. It only manages superficial UI selections (`PromptComposerSlice` and `WorkspaceSelectionSlice`) rather than the actual heavy-lifting of graph or entity state.

**Is it bleeding into visual components?**
Yes, profusely. `WorldGraphPage.tsx` contains dozens of `useState` and `useMemo` hooks that compute complex business rules (e.g., node visibility, world growth playback models, turn lenses) right next to purely visual concerns (e.g., camera zooming, hover reveals, canvas positioning). There is no "headless" hook abstracting the business rules away from the canvas DOM.

## 3. Custom Node Analysis (The Danger Zone)

**The Good News:**
The custom React Flow nodes (e.g., `WorldNodeCard` in `worldGraphPage.tsx` and `WorldEdge`) are surprisingly well-behaved. 
- They are **"dumb/pure"** components. 
- They receive `data`, `selected`, `displayTier`, `visualMode`, etc., as props from React Flow and simply render JSX (`<div>`, `<Handle>`, `<img />`). 
- They contain no `fetch` calls, no side-effects, and no direct state mutations. All styling logic is cleanly derived from the props (e.g., calculating `toneClass` or `iconId`).

This means that replacing the nodes themselves with spatial desktop windows or cards will be straightforward, as you only need to swap the visual rendering layers and attach the React Flow `<Handle />` components.

## 4. Identification of "Hotspots"

The following files are the primary bottlenecks and danger zones for your refactoring:

1. **`src/App.tsx`**
   - *Danger:* It acts as the ultimate God Component. It holds the `snapshot` state and contains hundreds of lines of pure domain reconciliation logic (`mergeWorldBuildStatusIntoSnapshot`, `normalizeSnapshot`) directly inside the file alongside the React router/view switching logic.
2. **`src/features/worldGraphPage.tsx`**
   - *Danger:* This 6,300+ line file is the most tangled hotspot. Specific instances of bad coupling include:
     - Math and collision detection logic (`resolveWorldNodeCenterCollision`, `worldFlowNodeIntersectsViewport`) are defined in the same file as the JSX.
     - 50+ lines of `useState` and `useMemo` hooks starting at line 1083 that intertwine business logic (Prompt Session tracking) with visual logic (`growWorkbenchWidth`, `draftPositions`).
3. **`src/domain/worldGraphHelpers.ts` & `src/domain/graphcore.ts`**
   - *Danger:* While these are cleanly separated from the UI, they are tightly coupled to the exact schema shapes expected by `App.tsx`. When moving state to a Zustand store, these helper functions must be carefully integrated into the store actions.

## 5. The Refactoring Roadmap

To safely implement your new "spatial desktop" UI without breaking the core mechanics, you must transition to a Headless Architecture using Zustand.

**Phase 1: Promote the Root State to Zustand**
1. Create a new `src/state/graphcoreStore.ts` using Zustand.
2. Move the `snapshot` state out of `App.tsx` and into this store.
3. Extract all the domain reconciliation functions (e.g., `mergeWorldBuildStatusIntoSnapshot`, `mergeWorldPromptEventIntoSnapshot`) from `App.tsx` and convert them into Zustand actions. `App.tsx` should only be responsible for layout routing.

**Phase 2: Decouple the Canvas State from the View**
1. Create a `useWorldGraphState()` hook or a dedicated Zustand slice for the canvas.
2. Extract all graph-specific logic (`canvasNodes`, `canvasEdges`, node collision math, camera focus refs) out of `WorldGraphPage.tsx` into this headless hook.
3. The hook should return a clean API: `{ nodes, edges, onNodesChange, onEdgesChange, applyPatch }`.

**Phase 3: Isolate Business Logic Derivatives**
1. Extract the massive `useMemo` blocks inside `WorldGraphPage.tsx` (which calculate `sessionTurns`, `activeTurnLens`, `growthPlaybackModel`) into custom selector hooks (e.g., `useSessionLenses()`). 

**Phase 4: Swap the Presentation Layer**
1. With the business logic now living in Zustand and headless hooks, `WorldGraphPage.tsx` can be safely deleted or hollowed out.
2. Build your new "Spatial Desktop" container. 
3. Connect your new Spatial Desktop UI components directly to the Zustand store/hooks to consume the nodes and edges, applying your new visual styling while the underlying engine continues to run untouched.
