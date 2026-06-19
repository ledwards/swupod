// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useStickyTab } from '../../src/hooks/useStickyTab'
import '../../src/App.css'
import './api-docs.css'

type Language = 'curl' | 'javascript' | 'python'

const BASE = 'https://protectthepod.com'

function makeExamples(tok: string): Record<string, Record<Language, string>> {
  return {
    myPools: {
      curl: `curl "${BASE}/api/me/pools?limit=10" \\
  -H "Authorization: Bearer ${tok}"`,
      javascript: `const TOKEN = "${tok}";

const response = await fetch("${BASE}/api/me/pools?limit=10", {
  headers: { Authorization: \`Bearer \${TOKEN}\` },
});
const { data } = await response.json();
console.log(data.pools);`,
      python: `import requests

TOKEN = "${tok}"

response = requests.get(
    "${BASE}/api/me/pools",
    headers={"Authorization": f"Bearer {TOKEN}"},
    params={"limit": 10}
)
pools = response.json()["data"]["pools"]`,
    },
    myPoolDetail: {
      curl: `curl "${BASE}/api/me/pools/abc123" \\
  -H "Authorization: Bearer ${tok}"`,
      javascript: `const shareId = "abc123";
const response = await fetch(
  \`${BASE}/api/me/pools/\${shareId}\`,
  { headers: { Authorization: \`Bearer \${TOKEN}\` } }
);
const { data } = await response.json();
console.log(data.cards, data.deck);`,
      python: `share_id = "abc123"
response = requests.get(
    f"${BASE}/api/me/pools/{share_id}",
    headers={"Authorization": f"Bearer {TOKEN}"}
)
pool = response.json()["data"]`,
    },
    myDrafts: {
      curl: `curl "${BASE}/api/me/drafts?status=complete" \\
  -H "Authorization: Bearer ${tok}"`,
      javascript: `const response = await fetch(
  "${BASE}/api/me/drafts?status=complete",
  { headers: { Authorization: \`Bearer \${TOKEN}\` } }
);
const { data } = await response.json();
console.log(data.drafts);`,
      python: `response = requests.get(
    "${BASE}/api/me/drafts",
    headers={"Authorization": f"Bearer {TOKEN}"},
    params={"status": "complete"}
)
drafts = response.json()["data"]["drafts"]`,
    },
    myDraftPicks: {
      curl: `curl "${BASE}/api/me/drafts/abc123/picks" \\
  -H "Authorization: Bearer ${tok}"`,
      javascript: `const shareId = "abc123";
const response = await fetch(
  \`${BASE}/api/me/drafts/\${shareId}/picks\`,
  { headers: { Authorization: \`Bearer \${TOKEN}\` } }
);
const { data } = await response.json();
console.log(data.picks);`,
      python: `share_id = "abc123"
response = requests.get(
    f"${BASE}/api/me/drafts/{share_id}/picks",
    headers={"Authorization": f"Bearer {TOKEN}"}
)
picks = response.json()["data"]["picks"]`,
    },
    myDecks: {
      curl: `curl "${BASE}/api/me/decks" \\
  -H "Authorization: Bearer ${tok}"`,
      javascript: `const response = await fetch("${BASE}/api/me/decks", {
  headers: { Authorization: \`Bearer \${TOKEN}\` },
});
const { data } = await response.json();
console.log(data.decks);`,
      python: `response = requests.get(
    "${BASE}/api/me/decks",
    headers={"Authorization": f"Bearer {TOKEN}"}
)
decks = response.json()["data"]["decks"]`,
    },
    draftLog: {
      curl: `curl "${BASE}/api/public/draft-log/abc123"`,
      javascript: `const shareId = "abc123";
const response = await fetch(
  \`${BASE}/api/public/draft-log/\${shareId}\`
);
const { data } = await response.json();
console.log(data);`,
      python: `import requests

share_id = "abc123"
response = requests.get(
    f"${BASE}/api/public/draft-log/{share_id}"
)
data = response.json()["data"]`,
    },
  }
}

const TOC_SECTIONS = [
  { id: 'authentication', label: 'Authentication' },
  { id: 'rate-limits', label: 'Rate Limits' },
  { divider: true, label: 'Public' },
  { id: 'draft-log', label: 'Draft Log' },
  { divider: true, label: 'Your Data' },
  { id: 'your-pools', label: 'Your Pools' },
  { id: 'pool-detail', label: 'Pool Detail' },
  { id: 'your-drafts', label: 'Your Drafts' },
  { id: 'draft-picks', label: 'Draft Picks' },
  { id: 'your-decks', label: 'Your Decks' },
]

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="api-code-block">
      <pre>{code}</pre>
    </div>
  )
}

export default function ApiDocsPage() {
  // Code-sample language — remembered across visits (localStorage; not a deep link).
  const [language, setLanguage] = useStickyTab<Language>(['curl', 'javascript', 'python'], 'curl', { url: false, storageKey: 'ptp:api-lang' })
  const [activeSection, setActiveSection] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [bearerCopied, setBearerCopied] = useState(false)
  const [bearerRevealed, setBearerRevealed] = useState(false)

  // Fetch token on mount if user is logged in
  useEffect(() => {
    fetch('/api/auth/token', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.token) {
          setToken(data.data.token)
        }
      })
      .catch(() => {})
      .finally(() => setTokenLoading(false))
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px' }
    )

    const sections = document.querySelectorAll('.api-docs-section[id]')
    sections.forEach(s => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  const handleCopy = () => {
    if (token) {
      navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleBearerCopy = () => {
    if (token) {
      navigator.clipboard.writeText(`Authorization: Bearer ${token}`)
      setBearerCopied(true)
      setTimeout(() => setBearerCopied(false), 2000)
    }
  }

  // Use real token in examples when available
  const t = token || 'YOUR_TOKEN'
  const EXAMPLES = makeExamples(t)

  return (
    <div className="api-docs-page">
      <div className="api-docs-layout">
        {/* Sidebar TOC */}
        <nav className="api-docs-toc">
          <div className="api-toc-title">Contents</div>
          {TOC_SECTIONS.map((item, i) =>
            item.divider ? (
              <div key={i} className="api-toc-divider">{item.label}</div>
            ) : (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`api-toc-link${activeSection === item.id ? ' active' : ''}`}
              >
                {item.label}
              </a>
            )
          )}
        </nav>

        {/* Content */}
        <div className="api-docs-content">
          <h1>API Documentation</h1>
          <p>Access your Protect the Pod data programmatically. Authenticated endpoints for your pools, drafts, decks, and picks.</p>

          {/* Language toggle */}
          <div className="api-lang-toggle">
            <button
              className={`api-lang-btn${language === 'curl' ? ' active' : ''}`}
              onClick={() => setLanguage('curl')}
            >cURL</button>
            <button
              className={`api-lang-btn${language === 'javascript' ? ' active' : ''}`}
              onClick={() => setLanguage('javascript')}
            >JavaScript</button>
            <button
              className={`api-lang-btn${language === 'python' ? ' active' : ''}`}
              onClick={() => setLanguage('python')}
            >Python</button>
          </div>

          {/* Authentication */}
          <div id="authentication" className="api-docs-section">
            <h2>Authentication</h2>

            {tokenLoading ? (
              <div className="api-token-box api-token-loading">
                <p>Checking login status...</p>
              </div>
            ) : token ? (
              <div className="api-token-box api-token-ready">
                <div className="api-token-header">
                  <span>Your API Token</span>
                  <div className="api-token-actions">
                    <button className="api-token-btn" onClick={() => setRevealed(!revealed)}>
                      {revealed ? 'Hide' : 'Reveal'}
                    </button>
                    <button className="api-token-btn" onClick={handleCopy}>
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className={`api-token-value${revealed ? '' : ' masked'}`}>
                  {revealed ? token : '\u2022'.repeat(40)}
                </div>
                <p className="api-token-note">This is your personal token. It expires in 30 days. Keep it secret — it grants access to your data. The code examples below use this token.</p>
              </div>
            ) : (
              <div className="api-token-box api-token-logged-out">
                <p><a href="/api/auth/signin/discord?return_to=/api">Log in with Discord</a> to get your API token. It will appear right here — no extra steps.</p>
              </div>
            )}

            <div className="api-bearer-section">
              <div className="api-bearer-header">
                <p>Include your token as a header in authenticated requests:</p>
                {token && (
                  <div className="api-token-code-actions">
                    <button className="api-token-btn" onClick={() => setBearerRevealed(!bearerRevealed)}>
                      {bearerRevealed ? 'Hide' : 'Reveal'}
                    </button>
                    <button className="api-token-btn" onClick={handleBearerCopy}>
                      {bearerCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
              <CodeBlock code={`Authorization: Bearer ${token ? (bearerRevealed ? token : '\u2022'.repeat(20)) : 'YOUR_TOKEN'}`} />
            </div>
          </div>

          {/* Rate Limiting */}
          <div id="rate-limits" className="api-docs-section">
            <h2>Rate Limiting</h2>
            <div className="api-rate-limit-box">
              <p>All API endpoints are rate limited to <strong>60 requests per minute</strong> per IP address.</p>
              <p>When rate limited, you will receive a <code>429</code> response with a <code>Retry-After</code> header.</p>
            </div>
          </div>

          {/* Draft Log (Public) */}
          <div id="draft-log" className="api-docs-section">
            <h2>Draft Log <span className="api-public-badge">Public</span></h2>
            <div className="api-endpoint">
              <span className="api-endpoint-method">GET</span>
              <span className="api-endpoint-path">/api/public/draft-log/:shareId</span>
            </div>
            <p>
              Returns anonymized draft pick data for a completed draft that has been made public by the host.
              Player identities are replaced with seat numbers for privacy. No authentication required.
            </p>

            <h3>Path Parameters</h3>
            <table className="api-params-table">
              <thead>
                <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>shareId</code></td>
                  <td>string</td>
                  <td>The draft share ID (from the draft URL)</td>
                </tr>
              </tbody>
            </table>

            <h3>Example</h3>
            <CodeBlock code={EXAMPLES.draftLog[language]} />

            <h3>Response</h3>
            <CodeBlock code={`{
  "data": {
    "draft": {
      "setCode": "JTL",
      "setName": "Jump to Lightspeed",
      "totalSeats": 4,
      "startedAt": "2026-01-01T00:00:00.000Z",
      "completedAt": "2026-01-01T01:30:00.000Z"
    },
    "leaderPicks": [
      {
        "seat": 1,
        "leaderRound": 1,
        "id": "19476",
        "number": "JTL-1",
        "title": "Asajj Ventress",
        "subtitle": "I Work Alone",
        "rarity": "Rare",
        "type": "Leader",
        "aspects": ["Vigilance", "Villainy"],
        "cost": 6,
        "treatment": "Normal"
      }
    ],
    "picks": [
      {
        "seat": 1,
        "packNumber": 1,
        "pickInPack": 1,
        "pickNumber": 1,
        "id": "19542",
        "number": "JTL-42",
        "title": "Han Solo",
        "subtitle": "Worth the Risk",
        "rarity": "Rare",
        "type": "Unit",
        "aspects": ["Cunning", "Heroism"],
        "cost": 5,
        "treatment": "Normal"
      }
    ]
  }
}`} />

            <h3>Fields</h3>
            <table className="api-params-table">
              <thead>
                <tr><th>Field</th><th>Description</th></tr>
              </thead>
              <tbody>
                <tr><td><code>id</code></td><td>Unique card ID (primary key from CMS)</td></tr>
                <tr><td><code>number</code></td><td>Set-number identifier (e.g. JTL-42) — display only, not a unique key</td></tr>
                <tr><td><code>title</code></td><td>Card name</td></tr>
                <tr><td><code>subtitle</code></td><td>Card subtitle, or null</td></tr>
                <tr><td><code>treatment</code></td><td>Normal, Foil, Hyperspace, Hyperspace Foil, or Showcase</td></tr>
                <tr><td><code>leaderPicks</code></td><td>Always 3 per seat (leader draft rounds 1-3)</td></tr>
              </tbody>
            </table>

            <h3>Error Codes</h3>
            <ul className="api-error-list">
              <li><code>400</code> Draft is not complete yet</li>
              <li><code>403</code> Draft log is not public</li>
              <li><code>404</code> Draft not found</li>
              <li><code>429</code> Rate limit exceeded</li>
            </ul>
          </div>

          {/* Your Pools */}
          <div id="your-pools" className="api-docs-section">
            <h2>Your Pools</h2>
            <div className="api-endpoint">
              <span className="api-endpoint-method">GET</span>
              <span className="api-endpoint-path">/api/me/pools</span>
            </div>
            <p>Returns a list of your sealed and draft pools with summary info.</p>

            <h3>Query Parameters</h3>
            <table className="api-params-table">
              <thead>
                <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
              </thead>
              <tbody>
                <tr><td><code>type</code></td><td>string</td><td>Filter by pool type: sealed, draft, chaos_sealed, etc.</td></tr>
                <tr><td><code>limit</code></td><td>number</td><td>Max results (default 50, max 100)</td></tr>
                <tr><td><code>offset</code></td><td>number</td><td>Pagination offset (default 0)</td></tr>
              </tbody>
            </table>

            <h3>Example</h3>
            <CodeBlock code={EXAMPLES.myPools[language]} />

            <h3>Response</h3>
            <CodeBlock code={`{
  "data": {
    "pools": [
      {
        "shareId": "abc123",
        "setCode": "JTL",
        "setName": "Jump to Lightspeed",
        "poolType": "sealed",
        "name": "JTL Sealed 01/15/2026",
        "cardCount": 96,
        "leaderName": "Han Solo",
        "baseName": "Echo Base",
        "mainDeckCount": 30,
        "createdAt": "2026-01-15T00:00:00.000Z"
      }
    ],
    "total": 42
  }
}`} />
          </div>

          {/* Pool Detail */}
          <div id="pool-detail" className="api-docs-section">
            <h2>Pool Detail</h2>
            <div className="api-endpoint">
              <span className="api-endpoint-method">GET</span>
              <span className="api-endpoint-path">/api/me/pools/:shareId</span>
            </div>
            <p>Returns the full card list and deck for one of your pools.</p>

            <h3>Example</h3>
            <CodeBlock code={EXAMPLES.myPoolDetail[language]} />

            <h3>Response</h3>
            <CodeBlock code={`{
  "data": {
    "shareId": "abc123",
    "setCode": "JTL",
    "poolType": "sealed",
    "cards": [
      { "id": "19542", "cardId": "JTL-042", "name": "Han Solo", "rarity": "Rare", ... }
    ],
    "deck": {
      "leader": { "id": "19476", "cardId": "JTL-001", "name": "Luke Skywalker", ... },
      "base": { "id": "19580", "cardId": "JTL-080", "name": "Echo Base", ... },
      "mainDeck": [ ... ],
      "sideboard": [ ... ]
    }
  }
}`} />
          </div>

          {/* Your Drafts */}
          <div id="your-drafts" className="api-docs-section">
            <h2>Your Drafts</h2>
            <div className="api-endpoint">
              <span className="api-endpoint-method">GET</span>
              <span className="api-endpoint-path">/api/me/drafts</span>
            </div>
            <p>Returns a list of draft pods you have participated in.</p>

            <h3>Query Parameters</h3>
            <table className="api-params-table">
              <thead>
                <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
              </thead>
              <tbody>
                <tr><td><code>status</code></td><td>string</td><td>Filter by status: complete, waiting, drafting, building</td></tr>
                <tr><td><code>limit</code></td><td>number</td><td>Max results (default 50, max 100)</td></tr>
                <tr><td><code>offset</code></td><td>number</td><td>Pagination offset (default 0)</td></tr>
              </tbody>
            </table>

            <h3>Example</h3>
            <CodeBlock code={EXAMPLES.myDrafts[language]} />

            <h3>Response</h3>
            <CodeBlock code={`{
  "data": {
    "drafts": [
      {
        "shareId": "xyz789",
        "setCode": "JTL",
        "setName": "Jump to Lightspeed",
        "status": "complete",
        "playerCount": 4,
        "isHost": true,
        "poolShareId": "abc123",
        "name": "Friday Draft",
        "leaderName": "Han Solo",
        "baseName": "Echo Base",
        "mainDeckCount": 30,
        "createdAt": "2026-01-15T00:00:00.000Z",
        "completedAt": "2026-01-15T01:30:00.000Z"
      }
    ]
  }
}`} />
          </div>

          {/* Draft Picks */}
          <div id="draft-picks" className="api-docs-section">
            <h2>Draft Picks</h2>
            <div className="api-endpoint">
              <span className="api-endpoint-method">GET</span>
              <span className="api-endpoint-path">/api/me/drafts/:shareId/picks</span>
            </div>
            <p>Returns your individual card picks from a draft, in order.</p>

            <h3>Example</h3>
            <CodeBlock code={EXAMPLES.myDraftPicks[language]} />

            <h3>Response</h3>
            <CodeBlock code={`{
  "data": {
    "draft": {
      "shareId": "xyz789",
      "setCode": "JTL",
      "setName": "Jump to Lightspeed",
      "status": "complete",
      "startedAt": "2026-01-15T00:00:00.000Z",
      "completedAt": "2026-01-15T01:30:00.000Z"
    },
    "leaderPicks": [
      {
        "leaderRound": 1,
        "id": "19476",
        "number": "JTL-1",
        "title": "Asajj Ventress",
        "subtitle": "I Work Alone",
        "rarity": "Rare",
        "type": "Leader",
        "aspects": ["Vigilance", "Villainy"],
        "cost": 6,
        "treatment": "Normal"
      }
    ],
    "picks": [
      {
        "packNumber": 1,
        "pickInPack": 1,
        "pickNumber": 1,
        "id": "19542",
        "number": "JTL-42",
        "title": "Han Solo",
        "subtitle": "Worth the Risk",
        "rarity": "Rare",
        "type": "Unit",
        "aspects": ["Cunning", "Heroism"],
        "cost": 5,
        "treatment": "Normal"
      }
    ]
  }
}`} />
          </div>

          {/* Your Decks */}
          <div id="your-decks" className="api-docs-section">
            <h2>Your Decks</h2>
            <div className="api-endpoint">
              <span className="api-endpoint-method">GET</span>
              <span className="api-endpoint-path">/api/me/decks</span>
            </div>
            <p>Returns your built decks with leader, base, main deck, and sideboard.</p>

            <h3>Example</h3>
            <CodeBlock code={EXAMPLES.myDecks[language]} />

            <h3>Response</h3>
            <CodeBlock code={`{
  "data": {
    "decks": [
      {
        "poolShareId": "abc123",
        "setCode": "JTL",
        "setName": "Jump to Lightspeed",
        "poolType": "sealed",
        "leader": { "id": "19476", "cardId": "JTL-001", "name": "Luke Skywalker", ... },
        "base": { "id": "19580", "cardId": "JTL-080", "name": "Echo Base", ... },
        "deck": [ ... ],
        "sideboard": [ ... ],
        "builtAt": "2026-01-15T02:00:00.000Z"
      }
    ]
  }
}`} />
          </div>

          {/* Common errors */}
          <div className="api-docs-section">
            <h2>Common Error Codes</h2>
            <ul className="api-error-list">
              <li><code>401</code> Authentication required (missing or invalid token)</li>
              <li><code>404</code> Resource not found (or not owned by you)</li>
              <li><code>429</code> Rate limit exceeded (60 req/min)</li>
              <li><code>500</code> Internal server error</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
