import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const base = 'https://peak-bit-486121-n6-74a84.web.app'
const expected = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
const assets = [...expected.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1])
assert.ok(assets.length, 'Built HTML must reference compiled assets')
const request = url => fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } })
const page = await request(base)
assert.equal(page.status, 200, 'Hosting must serve index.html')
const html = await page.text()
for (const asset of assets) {
  assert.ok(html.includes(asset), `Hosting is not serving the tested build: missing ${asset}`)
  assert.equal((await request(new URL(asset, base))).status, 200, `Missing live asset: ${asset}`)
}
console.log(`Verified ${base} serves the tested build and ${assets.length} compiled assets.`)
