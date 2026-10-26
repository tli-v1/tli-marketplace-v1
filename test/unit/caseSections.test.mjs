import assert from 'node:assert/strict'
import test from 'node:test'
import { activeCaseSection } from '../../src/caseSections.js'
const viewport = { viewportHeight: 800, scrollY: 0, pageHeight: 3000 }
test('tracks the section crossing the reading line in either scroll direction', () => {
  assert.equal(activeCaseSection([{ id: 'overview', top: 30 }, { id: 'incident', top: 250 }], viewport), 'overview')
  assert.equal(activeCaseSection([{ id: 'overview', top: -200 }, { id: 'incident', top: 100 }, { id: 'damages', top: 400 }], { ...viewport, scrollY: 300 }), 'incident')
  assert.equal(activeCaseSection([{ id: 'overview', top: 20 }, { id: 'incident', top: 250 }], viewport), 'overview')
})
test('selects the last available section at page bottom', () => {
  assert.equal(activeCaseSection([{ id: 'client', top: 50 }, { id: 'agreement', top: 600 }], { ...viewport, scrollY: 2200 }), 'agreement')
})
test('handles loading and pages that fit without scrolling', () => {
  assert.equal(activeCaseSection([], viewport), 'overview')
  assert.equal(activeCaseSection([{ id: 'overview', top: 0 }, { id: 'incident', top: 300 }], { ...viewport, pageHeight: 800 }), 'overview')
})
