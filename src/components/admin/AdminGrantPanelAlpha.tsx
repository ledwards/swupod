'use client'

/**
 * AdminGrantPanelAlpha: the themed Grant Access panel on /admin (alpha).
 *
 * Same behavior as AdminGrantPanel (the legacy panel, kept verbatim for
 * everyone else): type-ahead over GET /api/admin/users/search, a
 * pre-provision row for a pasted Discord ID, a Friends of the Pod / Beta /
 * Alpha toggle, and POST /api/admin/grant on Add. The flag is kept after a
 * grant, so granting the same flag to many people is one search and one
 * click each. The combobox is ARIA-driven by aria-activedescendant.
 *
 * Add is the page's one primary action.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import SearchInput from '@/src/components/SearchInput'
import Button from '@/src/components/Button'
import { ThemedPanel } from '@/src/components/ThemedPage/ThemedPage'
import { CheckIcon } from '@/src/components/PodHub/icons'
import { grantSuccessMessage, type GrantFlag, type GrantedUser } from './adminGrantMessages'

interface SuggestedUser {
  kind?: 'user'
  id: string
  discord_id: string
  username: string
}

interface PreprovisionRow {
  kind: 'preprovision'
  discordId: string
}

type Option = SuggestedUser | PreprovisionRow

const SNOWFLAKE_RE = /^\d{17,25}$/
const LISTBOX_ID = 'adma-grant-options'

const FLAGS: Array<{ flag: GrantFlag; label: string }> = [
  { flag: 'is_patron', label: 'Friends of the Pod' },
  { flag: 'is_beta_tester', label: 'Beta Access' },
  { flag: 'is_alpha_tester', label: 'Alpha Access' },
]

export default function AdminGrantPanelAlpha() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([])
  const [selected, setSelected] = useState<Option | null>(null)
  const [flag, setFlag] = useState<GrantFlag>('is_patron')
  const [status, setStatus] = useState<'idle' | 'searching' | 'submitting' | 'success' | 'error'>('idle')
  const [lastGranted, setLastGranted] = useState<{ user: GrantedUser; preProvisioned: boolean; flag: GrantFlag } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // SearchInput debounces; under two characters never hits the network.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setHighlighted(null)
      return
    }
    let cancelled = false
    setStatus('searching')
    fetch('/api/admin/users/search?q=' + encodeURIComponent(trimmed), { credentials: 'include' })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return
        if (!ok || !json?.success) {
          setSuggestions([])
          setHighlighted(null)
          setStatus('error')
          setErrorMessage(json?.message ?? 'Search failed')
          return
        }
        const users: SuggestedUser[] = json?.data?.users ?? []
        setSuggestions(users)
        setHighlighted(users.length > 0 ? 0 : null)
        setStatus('idle')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setSuggestions([])
        setHighlighted(null)
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Search failed')
      })
    return () => {
      cancelled = true
    }
  }, [query])

  useEffect(() => {
    setOpen(query.trim().length >= 2 && status !== 'submitting' && status !== 'success')
  }, [query, status])

  // A tap outside the field closes the list, so it never traps a stray tap.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current
      if (root && e.target instanceof Node && !root.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const trimmed = query.trim()
  const isSnowflake = SNOWFLAKE_RE.test(trimmed)
  const showPreprovision = isSnowflake && !suggestions.some((u) => u.discord_id === trimmed)
  const showEmpty = !isSnowflake && suggestions.length === 0 && trimmed.length >= 2
  const options: Option[] = [
    ...suggestions,
    ...(showPreprovision ? [{ kind: 'preprovision' as const, discordId: trimmed }] : []),
  ]

  function choose(option: Option) {
    setSelected(option)
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setHighlighted(null)
      return
    }
    if (!open || options.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => (i === null ? 0 : Math.min(i + 1, options.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => (i === null ? 0 : Math.max(i - 1, 0)))
    } else if (e.key === 'Enter' && highlighted !== null && options[highlighted]) {
      e.preventDefault()
      choose(options[highlighted]!)
    }
  }

  async function handleAdd() {
    if (!selected) return
    setStatus('submitting')
    setErrorMessage(null)
    const discordId = selected.kind === 'preprovision' ? selected.discordId : selected.discord_id
    const username = selected.kind === 'preprovision' ? undefined : selected.username
    try {
      const res = await fetch('/api/admin/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ flag, discordId, username }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.message ?? `HTTP ${res.status}`)
      setLastGranted({ user: json.data.user, preProvisioned: json.data.preProvisioned, flag })
      setStatus('success')
      setQuery('')
      setSuggestions([])
      setSelected(null)
      setHighlighted(null)
      setOpen(false)
      rootRef.current?.querySelector('input')?.focus()
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Grant failed')
      setStatus('error')
    }
  }

  const activeId = open && highlighted !== null ? `adma-grant-opt-${highlighted}` : undefined
  const isSelected = (option: Option) =>
    option.kind === 'preprovision'
      ? selected?.kind === 'preprovision'
      : !!selected && selected.kind !== 'preprovision' && selected.id === option.id
  const listShown = open && (options.length > 0 || showEmpty)

  return (
    <ThemedPanel label="Grant Access">
      <p className="tpage-muted">
        Find someone by their Discord handle, choose what to give them, and press Add.{' '}
        <strong>Friends of the Pod</strong> turns on the supporter features without them paying on
        Patreon. <strong>Beta</strong> lets them into unreleased sets and features early.{' '}
        <strong>Alpha</strong> is the smaller testing group and includes beta access. Tester access
        does not grant patron or administrator privileges.
      </p>

      <div className="tpage-field" ref={rootRef}>
        <label className="tpage-label" htmlFor="adma-grant-q">Player</label>
        <div className="adma-search" onKeyDown={onKeyDown}>
          <SearchInput
            id="adma-grant-q"
            value={query}
            onChange={(v: string) => {
              setQuery(v)
              setSelected(null)
            }}
            debounce={300}
            placeholder="Search by Discord handle or paste a Discord user ID"
            clearable
            role="combobox"
            aria-expanded={listShown}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
          />
        </div>
        {listShown && (
          <ul id={LISTBOX_ID} role="listbox" aria-label="Matching users" className="adma-list" aria-busy={status === 'searching' || undefined}>
            {options.map((option, i) => (
              <li
                key={option.kind === 'preprovision' ? 'preprovision' : option.id}
                id={`adma-grant-opt-${i}`}
                role="option"
                aria-selected={isSelected(option)}
                className={`adma-opt${highlighted === i ? ' is-highlighted' : ''}`}
                onClick={() => choose(option)}
                onMouseEnter={() => setHighlighted(i)}
              >
                {option.kind === 'preprovision' ? (
                  <>
                    <span>Pre-provision Discord ID {option.discordId}</span>
                    <span className="adma-opt-id">No account yet</span>
                  </>
                ) : (
                  <>
                    <span>{option.username}</span>
                    <span className="adma-opt-id">{option.discord_id}</span>
                  </>
                )}
              </li>
            ))}
            {showEmpty && (
              <li role="option" aria-selected={false} aria-disabled className="adma-opt adma-opt--empty">
                No matches. To pre-provision a new user, enter their Discord user ID (Copy User ID in
                Discord with Developer Mode on).
              </li>
            )}
          </ul>
        )}
        {selected && (
          <p className="tpage-meta">
            Selected: {selected.kind === 'preprovision' ? `Discord ID ${selected.discordId}` : `${selected.username} (${selected.discord_id})`}
          </p>
        )}
      </div>

      <div className="tpage-field">
        <span className="tpage-label" id="adma-grant-flag">Access</span>
        <div className="tpage-row" role="group" aria-labelledby="adma-grant-flag">
          {FLAGS.map(({ flag: value, label }) => (
            <Button key={value} variant="toggle" active={flag === value} aria-pressed={flag === value} onClick={() => setFlag(value)}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="tpage-row">
        <Button
          variant="primary"
          disabled={!selected || status === 'submitting' || status === 'searching'}
          onClick={handleAdd}
        >
          {status === 'submitting' ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {status === 'success' && lastGranted && (
        <p className="tpage-raised tpage-status tpage-status--success" role="status">
          <CheckIcon />
          <span>{grantSuccessMessage(lastGranted)}</span>
        </p>
      )}
      {status === 'error' && errorMessage && (
        <p className="tpage-raised tpage-status tpage-status--danger" role="alert">{errorMessage}</p>
      )}
    </ThemedPanel>
  )
}
