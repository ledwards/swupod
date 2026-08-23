import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceCueSpeaker, type CueAudioElement } from './voiceCueSpeaker'

/**
 * A stand-in for HTMLAudioElement that lets a test settle `play()` promises by
 * hand — the real bug only ever appeared in the gap between `play()` being
 * called and its promise resolving, so the tests have to own that gap.
 */
class FakeAudio implements CueAudioElement {
  muted = false
  paused = true
  currentTime = 0
  volume = 1
  playCalls = 0
  private pending: Array<() => void> = []
  private listeners = new Map<string, Array<() => void>>()

  constructor(readonly url: string) {}

  play(): Promise<void> {
    this.playCalls += 1
    this.paused = false
    return new Promise<void>(resolve => this.pending.push(resolve))
  }

  pause(): void {
    this.paused = true
  }

  addEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type) ?? []
    existing.push(listener)
    this.listeners.set(type, existing)
  }

  /** Resolve every outstanding `play()` promise, as the browser eventually does. */
  async settle(): Promise<void> {
    const pending = this.pending
    this.pending = []
    for (const resolve of pending) resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  /** Fire `ended`, as the browser does when a clip plays out. */
  end(): void {
    this.paused = true
    for (const listener of this.listeners.get('ended') ?? []) listener()
  }

  /** The only thing that matters: would a human hear this element right now? */
  get audible(): boolean {
    return !this.paused && !this.muted
  }
}

const CLIPS = ['greeting', 'ready-the-draft', 'start-the-draft', 'count-5', 'time-is-up']

function speakerWithPool() {
  const made: FakeAudio[] = []
  const speaker = createVoiceCueSpeaker(url => {
    const el = new FakeAudio(url)
    made.push(el)
    return el
  })
  return { speaker, made }
}

/** Every element the pool holds that a human could hear right now. */
function audible(made: FakeAudio[]): FakeAudio[] {
  return made.filter(el => el.audible)
}

test('priming a whole pack never makes a single clip audible', async () => {
  const { speaker, made } = speakerWithPool()

  for (const clip of CLIPS) {
    const el = speaker.ensure(`leebo::${clip}`, `/sounds/leebo/${clip}.mp3`)
    speaker.prime(el!)
  }

  assert.deepEqual(audible(made), [], 'nothing may be audible mid-prime')

  // Promises resolve in whatever order the browser feels like.
  for (const el of [...made].reverse()) await el.settle()

  assert.deepEqual(audible(made), [], 'nothing may be audible once primes resolve')
  assert.ok(made.every(el => el.paused), 'every primed clip is left paused')
})

test('priming the same element twice still leaves it silent', async () => {
  // The exact regression: ensure() primes a newly created element and prime()
  // then primes the whole pack, so one element gets primed twice. The second
  // prime used to resolve against an element the first had already released and
  // leave it playing out loud.
  const { speaker, made } = speakerWithPool()
  const el = speaker.ensure('leebo::greeting', '/sounds/leebo/greeting.mp3')!

  speaker.prime(el)
  speaker.prime(el)
  await el.settle()
  speaker.prime(el)
  await el.settle()

  assert.equal(el.audible, false)
  assert.equal(el.paused, true)
})

test('speaking a clip leaves exactly one audible element', async () => {
  const { speaker, made } = speakerWithPool()

  const greeting = speaker.ensure('leebo::greeting', '/sounds/leebo/greeting.mp3')!
  for (const clip of CLIPS.slice(1)) {
    speaker.prime(speaker.ensure(`leebo::${clip}`, `/sounds/leebo/${clip}.mp3`)!)
  }
  speaker.speak(greeting)

  assert.deepEqual(audible(made), [greeting], 'only the greeting may be heard')

  for (const el of made) await el.settle()

  assert.deepEqual(audible(made), [greeting], 'and still only the greeting after settling')
})

test('a prime that resolves after the speaker started cannot steal the floor', async () => {
  const { speaker, made } = speakerWithPool()

  const greeting = speaker.ensure('leebo::greeting', '/sounds/leebo/greeting.mp3')!
  const other = speaker.ensure('leebo::time-is-up', '/sounds/leebo/time-is-up.mp3')!

  speaker.prime(other)
  speaker.speak(greeting)
  await other.settle()

  assert.deepEqual(audible(made), [greeting])
})

test('switching packs silences the pack that was speaking', async () => {
  const { speaker, made } = speakerWithPool()

  const zoe = speaker.ensure('zoe::greeting', '/sounds/zoe/greeting.mp3')!
  speaker.speak(zoe)
  assert.equal(zoe.audible, true)

  // Now the host picks Leebo: his clips are primed, his greeting speaks.
  for (const clip of CLIPS.slice(1)) {
    speaker.prime(speaker.ensure(`leebo::${clip}`, `/sounds/leebo/${clip}.mp3`)!)
  }
  const leebo = speaker.ensure('leebo::greeting', '/sounds/leebo/greeting.mp3')!
  speaker.speak(leebo)

  assert.deepEqual(audible(made), [leebo], 'Zoe stops the instant Leebo starts')
  assert.equal(zoe.muted, true, 'and is left muted, so no late promise can revive her')

  for (const el of made) await el.settle()
  assert.deepEqual(audible(made), [leebo])
})

test('a clip that plays to the end releases the floor and re-mutes', () => {
  const { speaker } = speakerWithPool()
  const greeting = speaker.ensure('leebo::greeting', '/sounds/leebo/greeting.mp3') as FakeAudio

  speaker.speak(greeting)
  greeting.end()

  assert.equal(greeting.muted, true, 'back to muted-at-rest once it has played out')
  assert.equal(speaker.speaking(), null, 'and the floor is free for the next cue')
})

test('ensure returns the same element for a key, and null when the factory fails', () => {
  const speaker = createVoiceCueSpeaker(() => null)
  assert.equal(speaker.ensure('leebo::greeting', '/x.mp3'), null)

  const { speaker: real } = speakerWithPool()
  const first = real.ensure('leebo::greeting', '/x.mp3')
  const second = real.ensure('leebo::greeting', '/x.mp3')
  assert.ok(first)
  assert.equal(first, second, 'one element per clip, shared by every hook instance')
  assert.equal(real.has('leebo::greeting'), true)
  assert.equal(real.has('leebo::nope'), false)
})

test('speak recovers the floor when the browser refuses to play', async () => {
  const made: FakeAudio[] = []
  const speaker = createVoiceCueSpeaker(url => {
    const el = new (class extends FakeAudio {
      override play(): Promise<void> {
        this.playCalls += 1
        this.paused = false
        return Promise.reject(new Error('NotAllowedError'))
      }
    })(url)
    made.push(el)
    return el
  })

  const el = speaker.ensure('leebo::greeting', '/x.mp3')!
  speaker.speak(el)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(el.muted, true, 'a refused clip goes back to muted-at-rest')
  assert.equal(speaker.speaking(), null, 'and does not hold the floor forever')
})

test('a sequence plays back to back, never together', async () => {
  const { speaker, made } = speakerWithPool()
  const first = speaker.ensure('en::next-pick', '/a.mp3') as FakeAudio
  const second = speaker.ensure('en::count-30', '/b.mp3') as FakeAudio

  speaker.speakSequence([first, second])

  assert.deepEqual(audible(made), [first], 'only the first is heard to begin with')
  assert.equal(second.playCalls, 0, 'the second has not started')

  first.end()

  assert.deepEqual(audible(made), [second], 'the second takes over when the first ends')
  assert.equal(first.muted, true, 'and the first is back to muted-at-rest')
})

test('a direct cue supersedes a queued sequence', async () => {
  const { speaker, made } = speakerWithPool()
  const first = speaker.ensure('en::next-pick', '/a.mp3') as FakeAudio
  const second = speaker.ensure('en::count-30', '/b.mp3') as FakeAudio
  const urgent = speaker.ensure('en::time-is-up', '/c.mp3') as FakeAudio

  speaker.speakSequence([first, second])
  speaker.speak(urgent)
  first.end()

  // The newer cue is the truer one; the abandoned tail must not pop up later.
  assert.deepEqual(audible(made), [urgent])
  assert.equal(second.playCalls, 0)
})

test('a sequence still advances when a clip refuses to play', async () => {
  const made: FakeAudio[] = []
  let failNext = true
  const speaker = createVoiceCueSpeaker(url => {
    const el = new (class extends FakeAudio {
      override play(): Promise<void> {
        this.playCalls += 1
        this.paused = false
        if (failNext) {
          failNext = false
          return Promise.reject(new Error('NotAllowedError'))
        }
        return super.play()
      }
    })(url)
    made.push(el)
    return el
  })
  const first = speaker.ensure('en::next-pick', '/a.mp3')!
  const second = speaker.ensure('en::count-30', '/b.mp3')!

  speaker.speakSequence([first, second])
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(speaker.speaking(), second, 'a dropped clip must not strand the rest')
})
