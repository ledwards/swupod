'use client'

// @ts-nocheck
/**
 * AdminGrantPanel
 *
 * Type-ahead autocomplete + Patron/Beta toggle + Add CTA. Drives
 * GET /api/admin/users/search for suggestions and POST /api/admin/grant
 * for the actual flag-set. ARIA combobox shape (input + listbox driven by
 * aria-activedescendant — not focus-walked).
 *
 * Workflow optimization (per plan KTD): after a successful grant the input
 * resets but the flag toggle is PRESERVED, so granting the same flag to many
 * users is one keystroke + one click each.
 */
import { useState, useEffect, useRef } from 'react'
import SearchInput from '@/src/components/SearchInput'
import Button from '@/src/components/Button'
import './AdminGrantPanel.css'

type Flag = 'is_patron' | 'is_beta_tester'

interface SuggestedUser {
  kind?: 'user'
  id: string
  discord_id: string
  username: string
  is_patron: boolean
  is_beta_tester: boolean
}

interface PreprovisionSentinel {
  kind: 'preprovision'
  discordId: string
}

type Selected = SuggestedUser | PreprovisionSentinel | null

interface LastGranted {
  user: {
    id: string
    discord_id: string
    username: string
    email: string | null
    is_patron: boolean
    is_beta_tester: boolean
  }
  preProvisioned: boolean
  flag: Flag
}

const SNOWFLAKE_RE = /^\d{17,25}$/

function successMessage(lastGranted: LastGranted): string {
  const { user, preProvisioned, flag } = lastGranted
  if (preProvisioned && flag === 'is_patron') {
    return `Pre-provisioned new user with Discord ID ${user.discord_id} and granted patron access. They will see patron features on first sign-in.`
  }
  if (preProvisioned && flag === 'is_beta_tester') {
    return `Pre-provisioned new user with Discord ID ${user.discord_id} and granted beta access. They will see beta features on first sign-in.`
  }
  if (!preProvisioned && flag === 'is_patron') {
    return `Granted patron access to ${user.username} (${user.discord_id}).`
  }
  // !preProvisioned && flag === 'is_beta_tester'
  return `Granted beta access to ${user.username} (${user.discord_id}). Tell them to sign out and back in to see beta features immediately.`
}

export default function AdminGrantPanel() {
  const [query, setQuery] = useState<string>('')
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([])
  const [selected, setSelected] = useState<Selected>(null)
  const [flag, setFlag] = useState<Flag>('is_patron')
  const [status, setStatus] = useState<
    'idle' | 'searching' | 'submitting' | 'success' | 'error'
  >('idle')
  const [lastGranted, setLastGranted] = useState<LastGranted | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Debounced search. SearchInput already debounces (default 300ms); we react
  // to the debounced onChange. Sub-2-char queries short-circuit without hitting
  // the network, mirroring the API route's own short-circuit.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setHighlightedIndex(null)
      return
    }
    let cancelled = false
    setStatus('searching')
    fetch('/api/admin/users/search?q=' + encodeURIComponent(trimmed), {
      credentials: 'include',
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return
        if (!ok || !json?.success) {
          setSuggestions([])
          setHighlightedIndex(null)
          setStatus('error')
          setErrorMessage(json?.message ?? 'Search failed')
          return
        }
        const users = json?.data?.users ?? []
        setSuggestions(users)
        setHighlightedIndex(users.length > 0 ? 0 : null)
        setStatus('idle')
      })
      .catch((err) => {
        if (cancelled) return
        setSuggestions([])
        setHighlightedIndex(null)
        setStatus('error')
        setErrorMessage(err?.message ?? 'Search failed')
      })
    return () => {
      cancelled = true
    }
  }, [query])

  // Dropdown open whenever the user has typed at least 2 chars and the panel
  // isn't mid-submit. The combobox uses aria-expanded mirroring this state.
  useEffect(() => {
    const trimmed = query.trim()
    setDropdownOpen(trimmed.length >= 2 && status !== 'submitting' && status !== 'success')
  }, [query, status])

  // Mobile + desktop: clicking outside the panel closes the dropdown so the
  // listbox never traps an accidental tap. tracked via pointerdown for
  // immediate response (vs click which fires later).
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const root = panelRef.current
      if (!root) return
      if (e.target instanceof Node && !root.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  // Pre-provision row is offered ONLY when the query is a valid snowflake AND
  // there's no exact discord_id match in the current suggestions. Non-digit
  // queries with no matches get the empty-state row instead.
  const trimmedQuery = query.trim()
  const isSnowflakeQuery = SNOWFLAKE_RE.test(trimmedQuery)
  const hasExactSnowflakeMatch =
    isSnowflakeQuery &&
    suggestions.some((u) => u.discord_id === trimmedQuery)
  const showPreprovisionRow = isSnowflakeQuery && !hasExactSnowflakeMatch
  const showEmptyStateRow =
    !isSnowflakeQuery && suggestions.length === 0 && trimmedQuery.length >= 2

  // Total selectable option count (suggestions + optional preprovision row).
  // The empty-state row is NOT selectable so it doesn't enter this count.
  const optionRows: Array<SuggestedUser | PreprovisionSentinel> = [
    ...suggestions,
    ...(showPreprovisionRow
      ? [{ kind: 'preprovision' as const, discordId: trimmedQuery }]
      : []),
  ]

  function selectOption(opt: SuggestedUser | PreprovisionSentinel) {
    setSelected(opt)
    setDropdownOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!dropdownOpen || optionRows.length === 0) {
      if (e.key === 'Escape') {
        setDropdownOpen(false)
        setHighlightedIndex(null)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((idx) => {
        if (idx === null) return 0
        return Math.min(idx + 1, optionRows.length - 1)
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((idx) => {
        if (idx === null) return 0
        return Math.max(idx - 1, 0)
      })
    } else if (e.key === 'Enter') {
      if (highlightedIndex !== null && optionRows[highlightedIndex]) {
        e.preventDefault()
        selectOption(optionRows[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDropdownOpen(false)
      setHighlightedIndex(null)
    }
  }

  async function handleAdd() {
    if (!selected) return
    setStatus('submitting')
    setErrorMessage(null)
    const discordId =
      selected.kind === 'preprovision' ? selected.discordId : selected.discord_id
    const username =
      selected.kind === 'preprovision' ? undefined : selected.username
    try {
      const res = await fetch('/api/admin/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ flag, discordId, username }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.message ?? `HTTP ${res.status}`)
      }
      setLastGranted({
        user: json.data.user,
        preProvisioned: json.data.preProvisioned,
        flag,
      })
      setStatus('success')
      setQuery('')
      setSuggestions([])
      setSelected(null)
      setHighlightedIndex(null)
      setDropdownOpen(false)
      // flag is PRESERVED (per KTD: grant-many-same-flag workflow optimization)
      // Return focus to input so the next type starts immediately.
      inputRef.current?.focus()
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Grant failed')
      setStatus('error')
    }
  }

  // The combobox aria-activedescendant points at the currently-highlighted
  // option's id. Empty when nothing is highlighted.
  const activeDescendantId =
    dropdownOpen && highlightedIndex !== null ? 'opt-' + highlightedIndex : undefined

  // Capture the SearchInput's underlying <input> via ref so we can wire ARIA
  // attributes and key handling onto it. The wrapping div is the keydown sink.
  function captureInputRef(node: HTMLDivElement | null) {
    if (!node) {
      inputRef.current = null
      return
    }
    const input = node.querySelector('input') as HTMLInputElement | null
    inputRef.current = input
    if (input) {
      input.setAttribute('role', 'combobox')
      input.setAttribute('aria-expanded', dropdownOpen ? 'true' : 'false')
      input.setAttribute('aria-controls', 'admin-grant-suggestions')
      input.setAttribute('aria-autocomplete', 'list')
      if (activeDescendantId) {
        input.setAttribute('aria-activedescendant', activeDescendantId)
      } else {
        input.removeAttribute('aria-activedescendant')
      }
    }
  }

  return (
    <div className="admin-grant-panel" ref={panelRef}>
      <h1 className="admin-grant-title">Give a player Friends of the Pod or Beta</h1>
      <p className="admin-grant-subtitle">
        Find someone by their Discord handle, choose which one to give them, and
        press Add. <strong>Friends of the Pod</strong> turns on the supporter
        features — Competitive Practice, and the rest of the Patreon perks —
        without them paying on Patreon. <strong>Beta</strong> lets them into
        unreleased sets and features early. Adding one never touches the other,
        and neither makes anyone an admin.
      </p>

      <div
        className="admin-grant-input-wrap"
        onKeyDown={onKeyDown}
        ref={captureInputRef}
      >
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v)
            setSelected(null)
          }}
          debounce={300}
          placeholder="Search by Discord handle or paste a Discord user ID"
          clearable
        />

        {dropdownOpen && (suggestions.length > 0 || showPreprovisionRow || showEmptyStateRow) && (
          <ul
            id="admin-grant-suggestions"
            role="listbox"
            aria-label="Matching users"
            className={
              'admin-grant-suggestions' +
              (status === 'searching' ? ' admin-grant-suggestions--searching' : '')
            }
          >
            {suggestions.map((u, i) => {
              const isHighlighted = highlightedIndex === i
              const isSelected =
                selected && selected.kind !== 'preprovision' && selected.id === u.id
              return (
                <li
                  key={u.id}
                  role="option"
                  id={'opt-' + i}
                  aria-selected={isSelected ? true : false}
                  className={
                    'admin-grant-row' +
                    (isHighlighted ? ' admin-grant-row--highlighted' : '') +
                    (isSelected ? ' admin-grant-row--selected' : '')
                  }
                >
                  <div
                    role="button"
                    tabIndex={-1}
                    onClick={() => selectOption(u)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className="admin-grant-row-inner"
                  >
                    <span className="admin-grant-row-username">{u.username}</span>
                    <span className="admin-grant-row-discord-id">{u.discord_id}</span>
                  </div>
                </li>
              )
            })}

            {showPreprovisionRow && (() => {
              const i = suggestions.length
              const isHighlighted = highlightedIndex === i
              const isSelected = selected?.kind === 'preprovision'
              return (
                <li
                  key="preprovision"
                  role="option"
                  id={'opt-' + i}
                  aria-selected={isSelected ? true : false}
                  className={
                    'admin-grant-row admin-grant-row--preprovision' +
                    (isHighlighted ? ' admin-grant-row--highlighted' : '') +
                    (isSelected ? ' admin-grant-row--selected' : '')
                  }
                >
                  <div
                    role="button"
                    tabIndex={-1}
                    onClick={() =>
                      selectOption({ kind: 'preprovision', discordId: trimmedQuery })
                    }
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className="admin-grant-row-inner admin-grant-row-inner--preprovision"
                  >
                    <span className="admin-grant-row-preprovision-icon" aria-hidden="true">+</span>
                    <span className="admin-grant-row-preprovision-label">
                      <span className="admin-grant-row-preprovision-line1">
                        Pre-provision Discord ID {trimmedQuery}
                      </span>
                      <span className="admin-grant-row-preprovision-line2">
                        (no swupod account yet)
                      </span>
                    </span>
                  </div>
                </li>
              )
            })()}

            {showEmptyStateRow && (
              <li
                key="empty-state"
                role="option"
                aria-disabled={true}
                className="admin-grant-row admin-grant-row--empty-state"
              >
                <span className="admin-grant-empty-state-text">
                  No matches. To pre-provision a new user, enter their Discord user ID (a long number — see Discord's Copy User ID with Developer Mode on).
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="admin-grant-toggle-row">
        <Button
          variant="toggle"
          glowColor="blue"
          active={flag === 'is_patron'}
          onClick={() => setFlag('is_patron')}
        >
          Friends of the Pod
        </Button>
        <Button
          variant="toggle"
          glowColor="blue"
          active={flag === 'is_beta_tester'}
          onClick={() => setFlag('is_beta_tester')}
        >
          Beta access
        </Button>
      </div>

      <div className="admin-grant-add-row">
        <Button
          variant="primary"
          disabled={!selected || status === 'submitting' || status === 'searching'}
          onClick={handleAdd}
        >
          {status === 'submitting' ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {status === 'success' && lastGranted && (
        <div className="admin-grant-success" role="status">
          {successMessage(lastGranted)}
        </div>
      )}

      {status === 'error' && errorMessage && (
        <div className="admin-grant-error" role="alert">
          {errorMessage}
        </div>
      )}
    </div>
  )
}
