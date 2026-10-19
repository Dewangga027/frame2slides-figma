# Frame2Slides

Private Figma plugin for local PowerPoint (`.pptx`) and PDF export. Uses the existing React + TypeScript + Vite UI and an esbuild-bundled Figma adapter. Product decisions and release acceptance criteria live in [PRD.md](PRD.md).

## Build and run

Use Node.js 22.12+ (Node.js 24 was used for verification).

```sh
npm ci
npm run typecheck
npm test
npm run build
```

In Figma Desktop, open **Plugins → Development → Import plugin from manifest…** and choose this repository's `manifest.json`. The build creates `dist/index.html` and `dist/plugin.js`; no development server is required in Figma. For a Figma-created development plugin, retain the plugin ID assigned by Figma in `manifest.json` rather than using this repository's development identifier for publication. See [Figma's manifest documentation](https://developers.figma.com/docs/plugins/manifest/).

After source updates, rebuild and reopen the development plugin. `npm run dev` previews the UI only: a normal browser does not provide the Figma API or a selection.

**Load selected frames** is enabled only after the plugin handshake completes (and while no job is running), not merely when a frame is selected. If it remains disabled with **Waiting for Figma**, close and reopen the plugin after rebuilding; selection changes cannot repair a disconnected UI.

## Export workflow

1. Select one or more **frames** in Figma, then open the plugin.
2. Choose **Load selected frames**. Non-frame selections are reported; frames are identified by node ID, not by potentially duplicated names.
3. Drag frames into order, or use the labelled up/down buttons. Remove only affects the export list, never the source document. Canvas selection changes do not replace your order; **Reload selection** explicitly replaces the list.
4. Choose PowerPoint or PDF and PNG quality **1× / 2× / 3×** (default **2×**).
5. Export. Preflight runs before raster generation and file assembly; only a complete file triggers a download. Concurrent export/selection jobs are prevented.
6. Review conversion warnings and optionally download the local JSON report. It includes frame/node IDs, reasons, elapsed duration, file size, slide/page count and raster pixel usage. Peak memory is explicitly unmeasured.

Outputs use a centered, proportional fit on a **16:9, 1920×1080 reference canvas** (720×405 PDF points). Other aspect ratios have white padding, never stretch or an implicit crop. Filenames follow `Frame2Slides_<first frame in final order>_<YYYYMMDD>.pptx` / `.pdf`, with invalid filename characters sanitized.

## Conversion support

| Source | PowerPoint behavior |
| --- | --- |
| Basic/mixed-style text | Editable text runs: portable font family, size, regular/bold/italic, solid color and alpha, standard underline/strike, alignment, spacing and multiline content. |
| Sharp rectangles, full ellipses and plain lines | Native shapes where solid fill/stroke geometry is representable. Rectangular borders preserve inside/center/outside placement using flat native strips. |
| Simple frames/components/instances | Background/border plus flattened child objects, preserving paint order. |
| Nested Auto Layout | Final absolute geometry; no PowerPoint reflow engine or nested shape groups. |
| Vectors, images/crops, gradients, rounded geometry, effects, unsupported typography | Independent node/subtree PNG with alpha and a recorded reason; unaffected native siblings remain editable. |
| Self-contained nested clipping/masks or translucent containers | Smallest self-contained ancestor PNG, with descendants included once and explicitly reported as rasterized. |
| Hidden or fully transparent nodes | Not rendered. |
| Missing/non-portable fonts | Arial substitution with an explicit warning to check wrapping. Fonts are not downloaded or embedded. |

PDF is **visual-first**: the complete frame is rendered by Figma and embedded as PNG on each fitted page. PDF text is therefore not selectable. Internal masks, clipping and effects are rendered by Figma rather than reconstructed by the PDF writer.

### Controlled failures, not silent degradation

PowerPoint export refuses backdrop-dependent blending/background blur, a fallback that would require flattening the entire selected frame, and ancestor clipping that cannot be included in an independent node render. Use a self-contained nested composition, simplify the identified effect, or export PDF. PDF also refuses a rotated source canvas or frame effects requiring an external backdrop. Non-clipping content overflowing the frame is rejected rather than leaking into padding. Changed/deleted frames, ambiguous PNG bounds, corrupt assets and writer failures do not produce a purportedly complete download.

Outward strokes on the selected source frame are also refused; use Inside stroke alignment. A rotated/reflected/sheared fallback is promoted to the nearest suitable independent ancestor, or blocked if that would require flattening the source frame.

Basic text remains native; unsupported typography is not falsely labelled editable. Font substitution and renderer differences can change wrapping: target fidelity is not a claim of identical rendering.

### Resource safety

Current conservative guards: **16,384 pixels per PNG edge** and **100,000,000 total raster pixels per job**. These are defensive allocation guards, **not benchmark-derived release capacity guarantees**. Lower quality, split the selection or simplify raster regions when a guard is reached. Physical placement stays unchanged at every raster scale.

## Architecture and privacy

- `src/shared/scene.ts`: ordered immutable snapshot, native/raster elements and conversion issues.
- `src/shared/messages.ts`: selection, job/progress, snapshot and completion messages.
- `src/plugin/`: read-only Figma selection, geometry/planning, PNG rendering and source-change detection.
- `src/export/`: local PPTX/PDF generators; embedded bytes only, no URL assets.
- `src/ui/`: selection order, accessible controls, progress, report and Blob download.
- `tests/`: exported-file and Figma-shaped fixture integration coverage.

Runtime libraries are bundled into the plugin UI. `networkAccess.allowedDomains` remains `["none"]`; no backend, remote fonts, design uploads or design telemetry. The adapter does not create temporary nodes, alter styles/layout/text, detach instances or change selection. A before/after source fingerprint rejects changes made while rendering. This is not a claim that the Figma application itself works offline.

## Verification and release gates

`npm run typecheck`, **20 behavior tests** in `npm test`, and `npm run build` pass. Tests cover editable native file objects, ordered output, 16:9 fit, scale-independent placement, mixed styles/alpha/rotation, invalid and blocked outputs, duplicate frame names, hidden/nested geometry, mask fallback, font substitution, source-change rejection, job locking and UI handshake/selection-error recovery.

A real local smoke run generated PPTX/PDF and exercised the actual browser UI (selection, button and drag reordering, repeated activation, preflight failure, corrupt-asset failure, downloads and recovery). A second run loaded both **production bundles** (`dist/plugin.js` and `dist/index.html`) in an iframe host: real adapter → native/raster snapshot → writer → PPTX/PDF and JSON downloads, with no HTTP requests observed during export. The host supplies Figma-shaped read/export fixtures, not a live Figma document; this is not live-document Figma verification.

The initial sourceless-event fix did not resolve the reported live **Waiting for Figma** state. The receiver now uses the [documented `window.onmessage` callback](https://developers.figma.com/docs/plugins/creating-ui/#sending-a-message-from-the-plugin-code-to-the-ui) and validates the `pluginMessage` envelope/payload without assuming a parent Window identity; request/job correlation remains enforced. Regressions for direct callback delivery and non-parent host forwarding failed before this change and pass afterward. Both production bundles were then exercised through a nested-iframe host: a direct callback bridge and a relay whose source differs from the immediate parent each completed handshake → frame/thumbnail loading → actual PPTX download. These are transport simulations with Figma-shaped API fixtures; the exact sender/delivery mechanism in the user's live Figma session has not been captured.

A subsequent native smoke reran the development plugin in the running **Figma Desktop 126.9.13** session. The real UI displayed **Connected to Figma**; **Load selected frames** successfully loaded the selected 1920×1080 frame and its real thumbnail, and the PPTX export button became enabled. This directly verifies the live connection/selection bug fix. The native smoke stopped before file export; it does not close the visual-fidelity, source-integrity or full compatibility release gates below.

The writer-only fixture opened in installed **PowerPoint 16.0** in C–A–B order, with three objects per slide. The production-bundle download also opened in C–A–B order, with four objects per slide (background, native rectangle, PNG, native text). Both used a 720×405-point canvas; native text was edited, saved and rendered to PNG by PowerPoint. The generated three-page PDF rendered in Chromium's PDF viewer. This proves those fixture paths, not every target/application/design combination.

Synthetic writer-only measurements (Node.js 24, simple native objects and reusable 320×180 raster pages; not representative Figma workloads):

| Slides/pages | PPTX ms | PPTX bytes | PDF ms | PDF bytes | PDF input pixels |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2 | 46,279 | 4 | 1,438 | 57,600 |
| 10 | 4 | 104,832 | 11 | 4,452 | 576,000 |
| 25 | 7 | 202,767 | 14 | 7,234 | 1,440,000 |
| 50 | 11 | 365,992 | 45 | 12,134 | 2,880,000 |

All eight synthetic writer runs completed. Raster pixels above describe PDF source pages; PPTX contains a tiny reusable transparent raster fixture. RSS after each run ranged from 79,228,928 to 106,299,392 bytes; **peak memory was not measured**. Fidelity/editability were not benchmarked across those sizes. Do not use these figures to set production limits.

Still required before declaring the PRD fully accepted:

- Live Figma fixture export, source/selection integrity checks and network inspection.
- Figma-reference visual comparisons: geometry ±1 px, rotation ±0.1°, line count and SSIM ≥0.98.
- Full PowerPoint 2016+/M365 Windows/Mac and Google Slides import/render/edit matrix, including fonts, masking and alpha.
- Representative Figma 1/10/25/50-slide benchmarks, measured failures/fidelity/editability and evaluated release capacity limits (OQ08).
- Historical conversation reconciliation (OQ11); that source conversation is not contained in the repository.
