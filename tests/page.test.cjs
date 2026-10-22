const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const hydration = require('../src/common/hydration')
function page(name = 'index') {
  let stored = ''
  let readFails = false
  const routes = []
  let pending
  let vibrations = 0
  let stopped = 0
  const storage = { get: o => readFails ? o.fail() : o.success(stored), set: o => { pending = o } }
  const source = fs.readFileSync(`src/pages/${name}/${name}.ux`, 'utf8').split('<script>')[1].split('</script>')[0]
    .replace(/^import .*$/gm, '').replace("const hydration = require('../../common/hydration')", '')
    .replace('export default', 'module.exports =')
  const ctx = { module: { exports: {} }, hydration, storage, Date,
    router: { push: o => routes.push(o.uri), back: () => routes.push('back') },
    vibrator: { vibrate: () => { vibrations++ } },
    setInterval: () => 42, clearInterval: () => { stopped++ } }
  vm.runInNewContext(source, ctx)
  const p = ctx.module.exports
  Object.assign(p, p.private)
  p.onInit()
  return { p, routes, failReads: () => { readFails = true }, setStored: raw => { stored = raw }, pending: () => pending, vibrations: () => vibrations, stopped: () => stopped }
}
test('storage failure keeps the previous total and allows retry', () => {
  const { p, pending } = page()
  p.addWater()
  assert.equal(p.total, 0)
  assert.equal(p.saving, true)
  pending().fail()
  pending().complete()
  assert.equal(p.total, 0)
  assert.equal(p.saving, false)
  p.addWater()
  pending().success()
  pending().complete()
  assert.equal(p.total, 250)
})
test('one due reminder vibrates once; hiding the page clears its timer', () => {
  const { p, vibrations, stopped } = page()
  p.state.quiet = false
  p.state.nextAt = Date.now() - 1000
  p.refresh()
  p.refresh()
  assert.equal(vibrations(), 1)
  p.onShow()
  p.onHide()
  assert.equal(stopped(), 1)
})
test('settings entry navigates and reloads saved preferences when returning', () => {
  const { p, routes, setStored } = page()
  p.openSettings()
  assert.equal(routes[0], '/pages/settings')
  const saved = hydration.drink(hydration.restore('', Date.now()), 250, Date.now())
  saved.cup = 350
  saved.goal = 1500
  setStored(JSON.stringify(saved))
  p.onShow()
  assert.equal(p.cup, 350)
  assert.equal(p.goal, 1500)
  assert.equal(p.total, 250)
})
test('settings saves preferences without losing drinks and returns via router', () => {
  const { p, routes, setStored, pending } = page('settings')
  const saved = hydration.drink(hydration.restore('', Date.now()), 250, Date.now())
  setStored(JSON.stringify(saved))
  p.onInit()
  p.changeCup()
  p.onPickerChange({ newSelected: 2 })
  p.confirmPicker()
  const written = JSON.parse(pending().value)
  assert.equal(written.cup, 350)
  assert.equal(written.total, 250)
  pending().success()
  pending().complete()
  assert.equal(p.cup, 350)
  p.goBack()
  assert.equal(routes[0], 'back')
})

test('returning can reload without lifecycle hooks exposed as instance methods', () => {
  const { p, routes } = page()
  // The framework dispatches hooks; application logic must not invoke them.
  const show = p.onShow
  delete p.onInit
  for (let i = 0; i < 3; i++) {
    p.openSettings()
    p.onHide()
    assert.doesNotThrow(() => show.call(p))
    assert.equal(p.ready, true)
  }
  assert.equal(routes.length, 3)
})
test('failed reload does not lock navigation to settings', () => {
  const { p, routes, failReads } = page()
  p.openSettings()
  p.onHide()
  failReads()
  p.onShow()
  p.openSettings()
  assert.equal(routes.length, 2)
  assert.equal(p.ready, false)
})

test('wheel starts at current value and cancellation leaves storage untouched', () => {
  const { p, pending } = page('settings')
  p.changeCup()
  assert.equal(p.pickerIndex, 1)
  p.onPickerChange({ newSelected: 3 })
  p.cancelPicker()
  assert.equal(p.cup, 250)
  assert.equal(pending(), undefined)
  p.changeCup()
  assert.equal(p.pickerIndex, 1)
})
test('wheel confirms goal and interval and ignores invalid selection', () => {
  const { p, pending } = page('settings')
  p.changeGoal()
  assert.equal(p.pickerIndex, 2)
  p.onPickerChange({ newSelected: 4 })
  p.confirmPicker()
  assert.equal(JSON.parse(pending().value).goal, 3000)
  pending().success(); pending().complete()
  assert.equal(p.pickerKey, '')
  p.changeInterval()
  p.onPickerChange({ newSelected: -1 })
  assert.equal(p.pickerIndex, 2)
  p.onPickerChange({ newSelected: 3 })
  const before = Date.now()
  p.state.quiet = false
  p.confirmPicker()
  const written = JSON.parse(pending().value)
  assert.equal(written.interval, 90)
  assert.ok(written.nextAt >= before + 90 * 60000)
})
test('failed wheel save keeps selection open for retry and back cancels editor', () => {
  const { p, routes, pending } = page('settings')
  p.changeCup()
  p.onPickerChange({ newSelected: 3 })
  p.confirmPicker()
  pending().fail(); pending().complete()
  assert.equal(p.cup, 250)
  assert.equal(p.pickerKey, 'cup')
  assert.equal(p.pickerIndex, 3)
  assert.equal(p.onBackPress(), true)
  assert.equal(p.pickerKey, '')
  assert.equal(routes.length, 0)
})
