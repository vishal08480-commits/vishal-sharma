// This file IS the "proper working flow" — every status change in the
// whole app is checked against this map. Nothing bypasses it.

const STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'blocked'];

// key = current status, value = statuses it is allowed to move to next
const TRANSITIONS = {
  todo: ['in_progress', 'blocked'],
  in_progress: ['in_review', 'blocked', 'todo'],
  in_review: ['done', 'in_progress', 'blocked'],
  blocked: ['todo', 'in_progress'],
  done: ['in_progress'] // allow re-opening a done task
};

function isValidStatus(status) {
  return STATUSES.includes(status);
}

function canTransition(from, to) {
  if (!isValidStatus(from) || !isValidStatus(to)) return false;
  if (from === to) return true; // setting the same status again is a no-op, not an error
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
}

module.exports = { STATUSES, TRANSITIONS, isValidStatus, canTransition };
