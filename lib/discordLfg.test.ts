// @ts-nocheck
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CARD_BACK_PNG = readFileSync(join(process.cwd(), 'public/card-images/card-back.png'))

function createDeckImageHarnessServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/pool/test-share/deck/play') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!doctype html>
<html>
  <body>
    <button class="play-instructions-action-button" id="deck-image-btn">Deck Image</button>
    <script>
      document.getElementById('deck-image-btn').addEventListener('click', () => {
        const img = document.createElement('img')
        img.className = 'deck-image-modal-image'
        img.style.display = 'block'
        img.width = 300
        img.height = 420
        img.src = '/deck.png'
        document.body.appendChild(img)
      })
    </script>
  </body>
</html>`)
        return
      }

      if (req.url === '/deck.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(CARD_BACK_PNG)
        return
      }

      res.writeHead(404)
      res.end('not found')
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Failed to start harness server')
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` })
    })
  })
}

test('postBotDeckSummaries includes attachments metadata for embed image attachments', async () => {
  const { server, baseUrl } = await createDeckImageHarnessServer()

  const originalEnv = {
    BOT: process.env.DISCORD_BOT_TOKEN,
    CH: process.env.DISCORD_DRAFTBOTS_CHANNEL_ID,
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  }
  const originalFetch = global.fetch

  try {
    process.env.DISCORD_BOT_TOKEN = 'test-bot-token'
    process.env.DISCORD_DRAFTBOTS_CHANNEL_ID = '1482545251137880065'
    process.env.APP_URL = baseUrl
    process.env.NEXT_PUBLIC_APP_URL = baseUrl

    const requests: Array<{ url: string; init: RequestInit }> = []
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init: init || {} })
      return new Response(JSON.stringify({ id: 'msg-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { postBotDeckSummaries } = await import('./discordLfg.ts')

    await postBotDeckSummaries(
      'Test Pod',
      'JTL',
      [{
        botName: 'Bot A',
        strategyDisplayName: 'Aggro',
        mixinDisplayName: 'Tempo',
        strategyDescription: 'Push damage fast.',
        mixinDescription: 'Curves low.',
        poolUrl: `${baseUrl}/pool/test-share/deck`,
        poolShareId: 'test-share',
        leaderName: 'Leader A',
        leaderImageUrl: '',
        baseDisplay: 'Command (30 HP)',
        deckSize: 30,
      }],
      {
        hostName: 'HostUser',
        playerNames: ['HostUser', 'Bot A'],
      }
    )

    assert.equal(requests.length, 1, 'should post one Discord message for one bot summary')

    const req = requests[0]
    assert.ok(req.url.includes('/channels/1482545251137880065/messages'))
    assert.equal((req.init.method || 'GET').toUpperCase(), 'POST')

    const body = req.init.body
    assert.ok(body instanceof FormData, 'bot summary post should use multipart form-data when image exists')

    const payloadRaw = body.get('payload_json')
    assert.equal(typeof payloadRaw, 'string')
    const payload = JSON.parse(payloadRaw as string)

    assert.deepEqual(
      payload.attachments,
      [{ id: 0, filename: 'deck.jpg' }],
      'payload_json should declare attachment metadata so embed image attachment renders reliably'
    )

    const imageFile = body.get('files[0]')
    assert.ok(imageFile instanceof Blob, 'multipart body should include image blob')
  } finally {
    global.fetch = originalFetch
    process.env.DISCORD_BOT_TOKEN = originalEnv.BOT
    process.env.DISCORD_DRAFTBOTS_CHANNEL_ID = originalEnv.CH
    process.env.APP_URL = originalEnv.APP_URL
    process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
  }
}, 90000)
