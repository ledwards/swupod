/**
 * What each cue is for, in plain language, with a suggested line.
 *
 * Two surfaces read this and must not drift apart: the creator form, which tells a
 * creator what to record, and the redemption confirmation, which lets a listener
 * play back what they just unlocked. Adding a clip type without an entry here is a
 * type error, which is the point.
 */
import { type VoicePackClipType } from './voicePacks'

/** What each cue is for, in the creator's language, with a suggested line. */
export const CLIP_GUIDE: Record<
  VoicePackClipType,
  { label: string; when: string; suggestion: string }
> = {
  greeting: {
    label: 'Greeting',
    when: 'Plays when someone unlocks your pack, and any time they click your logo.',
    // Their name, not ours. This read "this is Leebo" back when Leebo was the
    // default pack every creator was copying; as a suggested line for somebody
    // recording their OWN pack it was telling them to introduce themselves as
    // someone else.
    suggestion: '“Hi, this is [your name]. Welcome to the Pod!”',
  },
  'ready-the-draft': {
    label: 'Ready the draft',
    when: 'Plays for the whole table when the host deals the packs.',
    suggestion: '“Ready to draft.”',
  },
  'start-the-draft': {
    label: 'Start the draft',
    when: 'Plays for the whole table when picking opens.',
    suggestion: '“Start the draft!”',
  },
  'count-30': {
    label: '30 seconds left',
    when: 'Pick-timer warning.',
    suggestion: '“Thirty seconds remaining.”',
  },
  'count-15': {
    label: '15 seconds left',
    when: 'Pick-timer warning.',
    suggestion: '“Fifteen seconds remaining.”',
  },
  'count-5': {
    label: '5 seconds left',
    when: 'Pick-timer warning.',
    suggestion: '“Five seconds remaining!”',
  },
  'time-is-up': {
    label: 'Time is up',
    when: 'Plays when the pick timer runs out.',
    suggestion: '“Time is up.”',
  },
  'sound-on': {
    label: 'Sound on',
    when: 'Plays when a player turns the draft calls on.',
    suggestion: '“Sound on.”',
  },
  'timer-paused': {
    label: 'Timer paused',
    when: 'Plays for the table when the host pauses the clock.',
    suggestion: '“Timer paused.”',
  },
  'timer-resumed': {
    label: 'Timer resumed',
    when: 'Plays for the table when the host restarts the clock.',
    suggestion: '“Timer resumed.”',
  },
  'next-pick': {
    label: 'Next pick',
    when: 'Plays when a fresh pack reaches a player and the pick clock restarts.',
    suggestion: '“Next pick begins.”',
  },
}
