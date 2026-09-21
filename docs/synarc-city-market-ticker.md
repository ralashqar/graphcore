# City market ticker

A compact map overlay reuses the existing `market_public` read and its 15-second refresh. It displays the latest confirmed event, labelled Paid Market, with its recorded date, a link into the feed and an explicit replay button. Central takeovers name the previous leader only when before/after movement snapshots prove the displacement. Corrections use neutral wording. Empty, demonstration and unavailable states do not invent activity; failed refreshes retain the last event with an offline label.

The ticker has no marquee, automatic carousel, live-region announcements or automatic camera action. Replay uses the existing historical playback boundary. Reads pause in hidden tabs and refresh on return. Keyboard focus, reduced motion and mobile map controls are preserved. No backend, schema, worker, notification or provider change is involved.

Validation: market headline evidence tests; browser checks for ticker-to-feed and replay alongside existing desktop/mobile, reduced-motion and paid market regression checks; TypeScript, production build and dev startup.
