# Mobile shared-world client

Status 2026-09-10: first source implementation, not a published application.
See [implementation scope](../prd/evolving-world-mobile-implementation.md) and
[product decisions](../prd/evolving-world-cross-platform-plan.md).

## Resume on the owner's local computer — 2026-09-10

Handoff branch: `codex/mobile-shared-world` in `MishaMgla/opencraft1`.
Implementation commit: `e300d12`; base `main`: `b616c06`. Later handoff-only
commits do not change the runtime. This branch is not merged or deployed.
The owner requested pushing the work to continue locally; no store release or
production deployment is part of this handoff. The VDS has only 523 MiB free
at handoff, no Android SDK and no Xcode. No disk cleanup was performed.

On a clean local clone, fetch and select the branch (preserve any existing work):

```bash
git fetch origin
git switch --track origin/codex/mobile-shared-world
```

If the local branch already exists, switch to it and use `git pull --ff-only`.
Read `AGENT_RULES.md`, this document, then the linked implementation/product plans.
Continue the existing implementation; do not recreate the native projects or
restart product planning. The next steps, in order, are:

1. Inspect local OS, available space and toolchains; follow **Prepare and verify**
   below. Both native projects and dependency lockfiles are committed. Ignored
   `node_modules`, compiled web JS and copied native assets must be regenerated.
2. Produce and install an Android debug APK; on Windows use `gradlew.bat` instead
   of `./gradlew`. Build iOS on macOS with Xcode; a faster Windows/Linux machine
   alone does not remove that requirement. Record actual build results.
3. Before testing entry, check the target server's `/preview-info` for persistent
   mode, `apiVersion: 2` and `mobileAuthVersion: 1`. The default app origin is
   production, but this branch's server support has **not** been deployed there.
   An older server refusing entry is expected, not proof of a native build bug.
   Arrange a compatible HTTPS server or a separately authorized release through
   `../deploy.md`; do not weaken auth, HTTPS or redirect checks to make entry work.
4. Complete the device gates below, especially native cookie survival after
   force-stop/reboot and the Android + iPhone + browser shared-world check.
5. Update this record with device/OS, source revision, commands and outcomes;
   distinguish APK/IPA compilation, device acceptance and production delivery.

No credentials, signing keys, database dumps or installed SDKs travel via Git.
Create separate local test configuration from `.env.example`; do not reuse a
production database. VDS test servers on 8767/8768 and the preview DB container
were stopped; its volume/data remain on the VDS. Prior verification results and
the unresolved WebGL-context-loss observation are recorded below, not new claims
about the owner's devices. The minimum communication-safety plan remains pending.

## Files and data flow

- `mobile/`: pinned Capacitor 8.5.1 and App 8.1.1, native Android/iOS source
  projects; generated default icons/splashes are prototype assets.
- `mobile/tools/build.mjs`: builds from the existing `web/` scene, explicitly
  copies its local JS/CSS/Three.js assets, then inserts the native bootstrap.
  Only the generated `mobile/dist/` is replaced. No remote `server.url`, new
  engine, bundler or image service. `build-info.json` records revision/dirty state.
- `mobile/src/native.js`: native HTTP bridge and app lifecycle/Android Back.
- `mobile/src/transport.js`: pinned HTTPS origin, bounded native HTTP requests,
  no redirects, API path allowlist. Cookie jar belongs to native HTTP; no
  persistent bearer secret is copied into localStorage or socket URLs.
- `web/src/evolving/transport.ts`: same-origin fetch/socket in browsers, injected
  native adapter in apps. `conversation.ts` uses this shared request path.
- `web/src/evolving/main.ts`: pause rendering/input/chat polling on background;
  disconnect; on foreground restore the same guest with bounded reconnects.
  Drafts and idempotent-send keys use the existing conversation implementation.
  Android Back first dismisses focus/chat; otherwise minimizes the app.
- `internal/server/preview_mobile.go`: guest-authenticated, same-origin POST
  `/evolving-api/socket-ticket`, then native GET `/evolving-api/socket?recipes=2`.
  The latter accepts only `capacitor://localhost` or `https://localhost` plus
  a single-use 30-second ticket in `Sec-WebSocket-Protocol`. Tickets are random,
  RAM-only, one per guest, at most 1024 total; expired slots are reclaimed.
  Do not log request cookies or WebSocket protocol headers.
- Native admission consumes the ticket, then reuses normal guest DB checks and
  single-connection ownership. No CORS widening, changes to web `/ws` origin
  checks, wire format, database schema or legacy world. Native-only Hello read
  deadline is 5 seconds, subsequent read deadline 15 seconds; normal 15 Hz
  input frames keep an active native guest alive, including while stationary.
- `/preview-info` advertises `mobileAuthVersion: 1`; native entry also requires
  persistent mode and existing `apiVersion: 2`. Deploy a compatible server before
  distributing an app. All platforms join the same simulation and chat tables.

Guest identity is installation/browser-specific. A shared world does not yet
mean account transfer across devices. No Apple login, moderation implementation,
automated evolution, remote executable client updates or store submission here.

## Prepare and verify

Run from the repository root with Node 22+ and the locked dependencies:

```bash
npm --prefix web ci --ignore-scripts
npm --prefix mobile ci --ignore-scripts
npm --prefix mobile run sync
npm --prefix mobile test
npm --prefix web test
go test ./...
go vet ./...
```

`sync` compiles the shared TypeScript, prepares the explicit asset package and
copies it into both native projects. It does **not** compile an APK/IPA.
`OPENCRAFT_MOBILE_ORIGIN` is build-time only, defaults to
`https://opencraft1.com`, and must be an exact HTTPS origin without trailing slash.
Do not point it at a local HTTP server or enable production cleartext/debugging.
Native logging is disabled because bridge internals may log cookie values.
Android backup is disabled; signing material is ignored, not provisioned.

For Android compilation, supply Android SDK 36, the generated Gradle wrapper
and Java 21 on a machine with sufficient disk space, then run
`./gradlew assembleDebug` from `mobile/android/`. For iOS, sync first, then open
`mobile/ios/App/App.xcodeproj` on macOS with Xcode and configure an owned signing
team. `com.opencraft1.app` is a working identifier, not proof of store ownership.

`TestMobileSharedWorld` runs only when `PREVIEW_TEST_DATABASE_URL` explicitly
names the dedicated loopback preview DB. It creates three test guests and a
message, then checks web + both native Origins, movement, durable chat, idempotent
retry, ticket replay rejection and guest/position restoration. No production DB.
Run with `go test -race ./internal/server -run TestMobile -count=1` after supplying
that variable securely. Without it the DB integration case is skipped.

`node web/tools/check-evolving-ui.mjs` uses agent-browser and a temporary
persistent loopback server on 8767. It closes its own browser sessions. Alongside
existing visual/chat checks it uses a same-origin native transport **shim** to
verify background/foreground and Back handling. This does not test native jars,
OS keyboard behavior or hardware GPU rendering. Stop test servers/DB afterwards;
preserve the local database volume.

## Verification and remaining gates

- Shared asset preparation and `cap sync` succeeded for both native projects.
- Three mobile package/transport checks passed; Go native checks including the
  real DB/shared-world case passed with the race detector; Go vet passed.
- Full Go suite and 42 web tests passed. The browser UI/lifecycle shim passed
  on the second run. The first run lost the WebGL context before entry; the
  cause is unresolved, and a successful rerun is not proof of GPU stability.
- Existing persistence check passed: ownership, CSRF, concurrent deduplication,
  over-100-message catch-up and server restart. Test data stayed in the local
  preview database, including its three native-integration guests and message.
- Device builds remain unverified: VDS has Java 21 but no Android SDK/Xcode and
  only about 0.5 GB free. Do not install a large SDK or delete unrelated files.
- Actual Android + iPhone + browser acceptance is pending: cookie survival after
  process death/reboot, guest restore, keyboard/safe areas, rotation, slow/offline
  transitions and bounded reconnects. Native cookie persistence is not proven
  by a browser shim or Go socket test. Source generation is not an APK/IPA.
- Before store distribution: replace prototype branding, confirm identifiers,
  signing and release builds, implement the approved communication-safety
  minimum and its operational handling, then perform device/store acceptance.
