# Community roadmap

Framecut's core product scope remains deliberately narrow: ordered video sequencing, stop motion, split, trim, crop, resize, compression, and MP4 export. The items below are optional, issue-sized extensions that contributors can start without turning the editor into a general-purpose nonlinear editing suite.

Before starting an item, open a GitHub issue describing the intended user flow and technical approach. Keep each pull request focused on one roadmap item.

If you are new to the project, start with **editor keyboard shortcuts**, **reusable export presets**, or **improved empty and error states**. Each can ship independently without changing the Cloudflare data model or rendering architecture.

## Good first issues

### Add editor keyboard shortcuts

**Scope:** Add Space for play/pause, Left/Right for frame-aware seeking, `I` and `O` for trim bounds, and `?` for a shortcut reference.

**Acceptance criteria:** Shortcuts do not fire while typing in an input, are documented in the UI and README, and have component tests.

### Add reusable export presets

**Scope:** Let a user save a named combination of frame rate, crop aspect, output size, and compression settings in local storage.

**Acceptance criteria:** Presets can be created, renamed, applied, and removed; project settings are not silently overwritten without an explicit apply action.

### Improve empty and error states

**Scope:** Add targeted recovery actions for unsupported media, interrupted upload, failed rendering, and storage errors.

**Acceptance criteria:** Each known failure has a plain-language explanation, a next action, and accessible focus behavior.

## Intermediate

### Resumable multipart uploads

**Scope:** Persist R2 multipart upload state in D1 and resume incomplete source uploads after a page reload.

**Acceptance criteria:** Completed parts are not uploaded twice, stale multipart sessions can be aborted, ownership is enforced on every operation, and retry behavior has tests.

### Storage usage and retention controls

**Scope:** Show per-user stored bytes, allow deletion of old exports, and introduce a configurable retention policy for superseded exports.

**Acceptance criteria:** Counts match R2 object metadata, destructive actions require confirmation, and object deletion remains scoped to the authenticated user.

### Account recovery and email verification

**Scope:** Extend Better Auth with verified email addresses and password-reset emails through a configurable mail provider.

**Acceptance criteria:** Unverified-account behavior is documented, tokens expire, secrets remain in Worker bindings, and tests cover successful and expired recovery flows.

### End-to-end browser test suite

**Scope:** Cover signup, project creation, initial upload, appending and removing a second clip, playback across the join, all edit operations, a 4 fps render, reload persistence, and deletion using short generated fixtures.

**Acceptance criteria:** Tests run against local D1/R2 emulation, leave no state behind, and are documented for CI.

### Accessible timeline refinement

**Scope:** Add a screen-reader timeline summary, exact time inputs, stronger focus treatments, and keyboard manipulation of trim handles.

**Acceptance criteria:** The core edit flow is usable without pointer input and passes an automated accessibility scan plus manual keyboard review.

## Advanced

### WebCodecs acceleration path

**Scope:** Prototype WebCodecs for supported crop, resize, and stop-motion exports while retaining ffmpeg.wasm as the compatibility fallback.

**Acceptance criteria:** Capability detection is reliable, output timing matches the existing renderer, fallback is automatic, and representative benchmarks are published.

### Offline-capable project workspace

**Scope:** Cache the application shell and active source safely so editing can continue through a temporary connection loss, then synchronize metadata and exports later.

**Acceptance criteria:** The UI clearly communicates sync state, account data is cleared on sign-out, and conflicts cannot silently discard newer settings.

### Optional server render jobs

**Scope:** Design an opt-in server-side render queue for devices unable to complete large local exports. Keep it separate from the default privacy-first browser path.

**Acceptance criteria:** The design documents Cloudflare runtime choice, job state, retries, cost controls, cancellation, access control, retention, and observability before implementation begins.

### Import and export a portable project manifest

**Scope:** Define a versioned JSON format for editor settings and source metadata so users can back up or transfer project configuration.

**Acceptance criteria:** The schema is versioned and validated, imports never trust object keys or ownership fields, and round-trip tests cover every current setting.

## Explicitly out of core scope

Multi-track editing, transitions, effects libraries, titles, stock media, collaboration, and social publishing are not planned for the core editor. Proposals in these areas should explain why they belong in this focused product before implementation starts.
