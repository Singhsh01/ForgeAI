# ADR 0005 — "Nebula" visual system built on the supplied galaxy photograph

**Decision.** The original photograph (`public/galaxy.jpg`, 2576×1718, served unmodified) is the fixed full-screen backdrop on every screen, with pointer/scroll parallax, a canvas particle field tinted from the photo's palette, ambient light orbs and readability scrims. UI surfaces are glass panels; type pairs Instrument Serif (display) with Geist (UI) and Geist Mono (code/data). Colour roles: ember→plasma gradient for the single primary action; ion blue only for live state; aurora/warn/danger for status.

**Why.** Requested by the product owner; colour roles keep a decorative backdrop from competing with operational signals.

**Consequences.** `backdrop-filter` is GPU-heavy on low-end devices; particles pause when the tab is hidden and are disabled under `prefers-reduced-motion`. A light theme was not built because the brief asked for white typography over the image throughout.
