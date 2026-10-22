const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = 'src/common/hydration.js'
const source = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : 'module.exports = {}'
const context = { module: { exports: {} }, Date }
vm.runInNewContext(source, context)
const h = context.module.exports
const now = new Date(2026, 9, 22, 10).getTime()

test('fresh day starts at zero and schedules a reminder in 60 minutes', () => {
  const s = h.restore('', now)
  assert.equal(s.total, 0)
  assert.equal(s.nextAt, now + 3600000)
})
test('record and undo restore the previous amount and reminder', () => {
  const s = h.restore('', now)
  const added = h.drink(s, 250, now + 60000)
  assert.equal(added.total, 250)
  assert.equal(added.nextAt, now + 3660000)
  const undone = h.undo(added, now + 120000)
  assert.equal(undone.total, 0)
  assert.equal(undone.nextAt, s.nextAt)
})
test('new local day clears records but preserves preferences', () => {
  const s = h.drink(h.restore('', now), 250, now)
  s.goal = 1500
  const next = h.restore(JSON.stringify(s), now + 86400000)
  assert.equal(next.total, 0)
  assert.equal(next.goal, 1500)
})
test('corrupt and invalid stored values recover safely', () => {
  assert.equal(h.restore('{', now).total, 0)
  const s = h.restore('{"goal":-2,"interval":0,"total":-20}', now)
  assert.equal(s.goal, 2000)
  assert.equal(s.interval, 60)
  assert.equal(s.total, 0)
})
test('quiet hours, pause and completed goal suppress reminders', () => {
  const s = h.restore('', now)
  s.nextAt = now
  assert.equal(h.isDue(s, now), true)
  assert.equal(h.isDue(s, new Date(2026, 9, 22, 22).getTime()), false)
  s.enabled = false
  assert.equal(h.isDue(s, now), false)
  s.enabled = true
  s.total = s.goal
  assert.equal(h.isDue(s, now), false)
})
test('next reminder is moved out of quiet hours', () => {
  const s = h.restore('', now)
  const late = new Date(2026, 9, 22, 21, 40).getTime()
  assert.equal(h.nextReminder(s, late), new Date(2026, 9, 23, 8).getTime())
})
