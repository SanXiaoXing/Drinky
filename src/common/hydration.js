function dayKey(now) {
  const d = new Date(now)
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
}

function nextReminder(state, now) {
  const date = new Date(now + state.interval * 60000)
  if (state.quiet) {
    if (date.getHours() >= 22) {
      date.setDate(date.getDate() + 1)
      date.setHours(8, 0, 0, 0)
    } else if (date.getHours() < 8) {
      date.setHours(8, 0, 0, 0)
    }
  }
  return date.getTime()
}

function restore(raw, now) {
  let saved = {}
  try { saved = JSON.parse(raw) || {} } catch (error) { /* First run or damaged cache. */ }
  const state = {
    day: dayKey(now),
    goal: [1000, 1500, 2000, 2500, 3000].indexOf(saved.goal) >= 0 ? saved.goal : 2000,
    interval: [30, 45, 60, 90, 120].indexOf(saved.interval) >= 0 ? saved.interval : 60,
    cup: [150, 250, 350, 500].indexOf(saved.cup) >= 0 ? saved.cup : 250,
    enabled: saved.enabled !== false,
    quiet: saved.quiet !== false,
    total: 0, records: [], nextAt: 0
  }
  if (saved.day === state.day) {
    state.records = Array.isArray(saved.records) ? saved.records.filter(r => r &&
      [150, 250, 350, 500].indexOf(r.amount) >= 0 && Number.isFinite(r.at) &&
      dayKey(r.at) === state.day && Number.isFinite(r.previousNext)) : []
    state.total = state.records.reduce((sum, r) => sum + r.amount, 0)
    if (Number.isFinite(saved.nextAt) && saved.nextAt > 0) state.nextAt = saved.nextAt
  }
  if (!state.nextAt) state.nextAt = nextReminder(state, now)
  return state
}

function drink(state, amount, now) {
  const next = restore(JSON.stringify(state), now)
  if ([150, 250, 350, 500].indexOf(amount) < 0) return next
  next.records.push({ amount, at: now, previousNext: next.nextAt })
  next.total += amount
  next.nextAt = nextReminder(next, now)
  return next
}

function undo(state, now) {
  const next = restore(JSON.stringify(state), now)
  const record = next.records.pop()
  if (record) {
    next.total -= record.amount
    next.nextAt = record.previousNext
  }
  return next
}

function isDue(state, now) {
  const hour = new Date(now).getHours()
  return state.enabled && state.total < state.goal && now >= state.nextAt &&
    !(state.quiet && (hour >= 22 || hour < 8))
}

module.exports = { dayKey, restore, drink, undo, nextReminder, isDue }
