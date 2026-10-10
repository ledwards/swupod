# Shared play — revised interaction study

[Open the clickable study](index.html) · [Implementation plan](../../plans/2026-10-07-001-feat-shared-limited-matchmaking-plan.md)

Uses the frontend-design and Impeccable skills, PTP design context, existing PTP deck picker, and PTP/Wayfinder exports. Open locally without a build. Decks, counts, invitations, and game launches are simulated; Copy and Save operate on explicitly labeled sample data.

- Format, Card Pool, and Limited format use buttons. Chaos sits beside Draft and six/eight-pack Sealed. Next Set appears only with the review toolbar’s Preview season toggle.
- A selected-deck button opens a searchable, filterable, paginated PTP-style modal. Incompatible and unfinished decks explain why they cannot be selected.
- Each limited deck selector includes the contextual creation action, including inside the modal and private invite flow.
- Forming draft pods sit alongside public queues. Draft creation offers solo drafting, joining a forming pod, or creating a pod without a separate navigation tab.
- Play vs AI (Experimental) is a full action button. Play Offsite opens an anchored menu: Copy or Save JSON, CSV, and Melee text; save PNG; open Karabast.
- Shared native-select geometry lives in `src/styles/select.css`, imported by the app and study. StyledSelect uses the same 16px indicator inset and reserved text gap.

| Screen | Review |
|---|---|
| [Purrgil](purrgil.png) / [PTP](ptp.png) | Visible shared queues and inline draft pods |
| [Deck picker](deck-picker.png) | Search, filters, compatible decks, creation action |
| [Create a deck](create-deck.png) | Solo draft, shared pods, and sealed creation |
| [Finished deck](builder.png) | Queue, private, AI, Offsite |
| [Chaos](chaos.png) / [Eternal](eternal.png) | Button selection |
| [Preview season](preview.png) | Current / Next Set buttons |
| [Private host](private.png) / [Invitee](invite.png) | Link and modal deck selection |
| [AI](bot.png) / [Offsite](offsite.png) | Action destination and export menu |
| [Phone](mobile.png) / [Phone picker](mobile-picker.png) | Responsive layout |

Try Change → search Vader → select → Use this deck; Play Offsite → Save JSON; Limited format → Draft → Draft a new deck; or Chaos → Create a limited deck. These are interaction mocks, not backend matchmaking or validation implementation.
