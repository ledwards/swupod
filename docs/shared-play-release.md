# Shared play integration, October 8

Preserves production homepage console, card fan, table art, account/settings, Watch/Stats/History, recordings, and Leebo champion policy. Shared play controls render inside the console; queues and forming pods sit below. No Petranaki web UI or routes.

PTP validates pool ownership and deck legality; Purrgil stores reservations and matches identical policy/format/card-pool/limited-subtype/set keys. Chaos explicitly permits unlike limited origins. The existing adaptive Elo matcher remains intact. Older pre-contract reservations stay cancellable and isolated from new queues.

PTP completes solo deck building at the shared Play entry; competitive/pod routes remain unchanged. Leader draft results from 230afb89 remain available. Current card pool is enabled; Next Set remains gated until preview policy is reviewed.

Validation: 17 deck/format tests; 29 lobby/matching/shared bridge tests; desktop and phone coverage checks original shell, non-overlapping sections, readable history, strict deck selection, Chaos, retries, export menu and cancellation. Real engine test verifies public/private/seats/actions/replays/restart and AI with synthetic PTP identity and the local FlatMC fixture; deployed Leebo policy is unchanged.
