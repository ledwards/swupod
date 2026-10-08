// Design-system entry for /design-sync (claude.ai/design).
//
// swupod is a Next.js APP, not a packaged component library — there is no
// built dist/ to bundle. Rather than let the converter synth-bundle ALL of
// src/ (which would drag in contexts, hooks, Socket.io, next/*, and server
// code and fail to bundle), this file re-exports ONLY the app-independent UI
// primitives we scope into the design system. It is passed to the converter
// via `--entry .design-sync/entry.tsx`, so the build is driven from here, not
// from a glob of src/. See .design-sync/NOTES.md for the exact command.
//
// All primitives expose a default export; we re-export each as a named binding
// so it lands on window.Swupod.<Name>. Keep this list in sync with
// `componentSrcMap` in design-sync.config.json.

// ── Core primitives ─────────────────────────────────────────────────────
export { default as Button } from '../src/components/Button';
export { default as Card } from '../src/components/Card';
export { default as AspectIcon } from '../src/components/AspectIcon';
export { default as CostIcon } from '../src/components/CostIcon';
export { default as Modal } from '../src/components/Modal';
export { default as ConfirmModal } from '../src/components/ConfirmModal';
export { default as CollapsibleSection } from '../src/components/CollapsibleSection';
export { default as InfoTooltip } from '../src/components/InfoTooltip';
export { default as SearchInput } from '../src/components/SearchInput';
export { default as EditableTitle } from '../src/components/EditableTitle';
export { default as UserAvatar } from '../src/components/UserAvatar';

// ── Timers ──────────────────────────────────────────────────────────────
export { default as Countdown } from '../src/components/Countdown';
export { default as CountdownTimer } from '../src/components/CountdownTimer';
export { default as DraftTimer } from '../src/components/DraftTimer';
export { default as TimerButton } from '../src/components/TimerButton';
export { default as TimerPanel } from '../src/components/TimerPanel';

// ── Game / draft presentational ─────────────────────────────────────────
export { default as DraftableCard } from '../src/components/DraftableCard';
export { default as PassDirectionArrow } from '../src/components/PassDirectionArrow';
export { default as PlayerSeat } from '../src/components/PlayerSeat';
export { default as MatchCard } from '../src/components/MatchCard';
export { default as DraftReportButton } from '../src/components/DraftReportButton';
export { default as WayfinderStoreButtons } from '../src/components/WayfinderStoreButtons';
