import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCaseId } from '../../functions/caseIds.js'

const canonical = '86083611-d3e7-49d0-84de-0e8af90c710f'
test('compact Data Connect and hyphenated UUIDs share a canonical notification key', () => {
  assert.equal(normalizeCaseId(canonical.replaceAll('-', '')), canonical)
  assert.equal(normalizeCaseId(canonical), canonical)
  assert.equal(normalizeCaseId(` ${canonical.toUpperCase()} `), canonical)
})
test('malformed UUIDs do not become notification keys', () => {
  for (const value of [null, {}, '', 'bad', '86083611d3e749d084de0e8af90c710f-extra',
    '86083611-d3e7-49d084de-0e8af90c710f', '00000000000000000000000000000000']) {
    assert.equal(normalizeCaseId(value), '')
  }
})
