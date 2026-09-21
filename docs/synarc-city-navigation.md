# Reliable City map dragging

The installed Drei MapControls reconnects its DOM listeners whenever `onStart` changes identity. The City camera passed an inline handler, so periodic region/zoom renders and the initial exploration UI update could dispose controls in the middle of a drag. Three-stdlib retains its pointer list during dispose but removes document move/up listeners. Subsequent pointer-down events see a non-empty pointer list and fail to reconnect those listeners, leaving navigation stuck.

CameraRig now supplies a stable callback that reads the current exploration action through a ref. Pointer, wheel and keyboard navigation keep cancelling automatic camera travel. Window blur and hidden-tab transitions cancel tracked canvas pointers through the controls' pointer-cancel path. Listeners are removed on unmount. Paid central framing, explicit reset, selection and launch navigation retain their existing behavior.

The browser regression holds repeated right drags across the one-second region/LOD refresh, checks actual camera movement after each gesture, and covers left drag, wheel zoom, interrupted drag, central reset and reduced motion. The unfixed implementation failed the first held right-drag check. The once-per-second `data-city-camera` diagnostic exposes only local camera coordinates and zoom, alongside existing render diagnostics.

Run `node scripts/city-navigation-browser.mjs` against `CITY_TEST_ORIGIN` (default localhost:5188). Hosted API requests are isolated by the demonstration fixture. No backend migration or worker deployment is involved.
