# Petranaki analysis practice

`POST /api/play/native/petranaki` accepts a retry-stable request UUID through the existing authenticated native-play/beta/CSRF boundary. It calls Purrgil's trusted `/internal/petranaki/practice`, with subject and session expiry, and validates the engine, analysis kind, public origin and exact player path before returning a launch URL.

This path owns no competitive reservation/result/Elo writes. It accepts no arbitrary deck or engine URL. Its only admitted configuration is Purrgil's pinned Marine scenario and smoke bot. Purrgil verifies the full adapter and generated-source digests, applies durable session expiry/revocation and retains private native grants. Existing Baize admission and historical archives are unchanged.

Enable using `PTP_PETRANAKI_ENABLED=true` alongside the existing native-play configuration, only after the matching Purrgil/runtime deployment is qualified. Set it false to stop new admission; existing Purrgil sessions and authorized recording downloads remain usable. The beta practice controls expose “Petranaki scenario”.

Tests: `node --import tsx --test src/services/play/native/petranaki.test.ts`; TypeScript typecheck; Wayfinder's `apps/petranaki-engine/tests/host-roundtrip.integration.mjs` exercises the actual PTP client, Purrgil gateway and PHP engine through a terminal game, recording export, admission rollback and account revocation.

The coordinating delivery packet is Wayfinder `docs/engines/petranaki-delivery.md`. Twin Suns, arbitrary-deck competitive play and cross-engine continuation remain separate capability gates.
