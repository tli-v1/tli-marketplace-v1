import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesCaseRanges } from '../../src/caseFilters.js'
const blank = { damageMin: '', damageMax: '', docsMin: '', docsMax: '' }
const item = { medicalDamageUsd: 1000, propertyDamageUsd: 500, otherExpensesUsd: 50, lostWagesUsd: 100, documents: [{}, {}] }
test('ranges use the sum of reported losses and inclusive bounds', () => {
  assert.ok(matchesCaseRanges(item, { ...blank, damageMin: '1650', damageMax: '1650', docsMin: '2', docsMax: '2' }))
  assert.ok(!matchesCaseRanges(item, { ...blank, damageMax: '1649.99' }))
  assert.ok(!matchesCaseRanges(item, { ...blank, docsMin: '3' }))
})
test('blank bounds, zero documents and zero damages remain distinct', () => {
  assert.ok(matchesCaseRanges(item, blank))
  assert.ok(matchesCaseRanges({}, { ...blank, damageMax: '0', docsMax: '0' }))
  assert.ok(!matchesCaseRanges(item, { ...blank, docsMax: '0' }))
})
