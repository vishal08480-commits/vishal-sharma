const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { STATUSES, TRANSITIONS, canTransition, isValidStatus } = require('../utils/workflow');

const PRIORITIES = ['low', 'med', 'high'];

router.use(authMiddleware);

function toIso(v) {
  return v instanceof Date ? v.toISOString() : v;
}
function parseHistory(h) {
  return typeof h === 'string' ? JSON.parse(h) : h;
}

function mapTask(row, isDone) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    dueDate: row.due_date,
    status: isDone ? 'done' : row.status,
    history: parseHistory(row.history),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(isDone ? { archivedAt: toIso(row.archived_at) } : {})
  };
}

// ---------------------------------------------------------------------------
// "tasks"      table -> active board: todo / in_progress / in_review / blocked
// "done_tasks" table -> completed tasks, moved here (not just flagged), so the
//                       board query never sees them but the row is never lost
// ---------------------------------------------------------------------------

// GET /api/tasks?status=todo&priority=high&q=login
router.get('/', async (req, res) => {
  const { status, priority, q } = req.query;
  const params = [req.userId];
  let sql = 'SELECT * FROM tasks WHERE user_id = ?';

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (priority) { sql += ' AND priority = ?'; params.push(priority); }
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)';
    params.push(like, like);
  }
  sql += ' ORDER BY created_at DESC';

  try {
    const [rows] = await pool.query(sql, params);
    const tasks = rows.map((r) => mapTask(r, false));
    res.json({ count: tasks.length, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET /api/tasks/counts/summary — computed straight from the two tables
router.get('/counts/summary', async (req, res) => {
  try {
    const [activeRows] = await pool.query(
      'SELECT status, COUNT(*) AS count FROM tasks WHERE user_id = ? GROUP BY status',
      [req.userId]
    );
    const [doneRows] = await pool.query('SELECT COUNT(*) AS count FROM done_tasks WHERE user_id = ?', [req.userId]);

    const counts = { todo: 0, in_progress: 0, in_review: 0, blocked: 0, done: 0 };
    activeRows.forEach((r) => { counts[r.status] = Number(r.count); });
    counts.done = Number(doneRows[0].count);
    counts.total = counts.todo + counts.in_progress + counts.in_review + counts.blocked + counts.done;

    res.json(counts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET /api/tasks/archive/done — see what's actually stored for completed tasks
router.get('/archive/done', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM done_tasks WHERE user_id = ? ORDER BY archived_at DESC', [req.userId]);
    const tasks = rows.map((r) => mapTask(r, true));
    res.json({ count: tasks.length, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET /api/tasks/:id — checks both tables
router.get('/:id', async (req, res) => {
  try {
    let [rows] = await pool.query('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (rows.length) return res.json(mapTask(rows[0], false));

    [rows] = await pool.query('SELECT * FROM done_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (rows.length) return res.json(mapTask(rows[0], true));

    res.status(404).json({ error: 'Task not found' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// POST /api/tasks — always starts at "todo"
router.post('/', async (req, res) => {
  const { title, description = '', priority = 'med', dueDate = null } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${PRIORITIES.join(', ')}` });
  }

  try {
    const history = JSON.stringify([{ status: 'todo', at: new Date().toISOString() }]);
    const [result] = await pool.query(
      `INSERT INTO tasks (user_id, title, description, priority, due_date, status, history)
       VALUES (?, ?, ?, ?, ?, 'todo', ?)`,
      [req.userId, title.trim(), description, priority, dueDate, history]
    );
    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [result.insertId]);
    res.status(201).json(mapTask(rows[0], false));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// PUT /api/tasks/:id — content fields only, never status; active tasks only
router.put('/:id', async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!existingRows.length) {
      const [archivedRows] = await pool.query('SELECT id FROM done_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
      if (archivedRows.length) {
        return res.status(409).json({ error: 'This task is completed and archived — reopen it first to edit it' });
      }
      return res.status(404).json({ error: 'Task not found' });
    }

    const { title, description, priority, dueDate } = req.body;
    if (priority !== undefined && !PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of: ${PRIORITIES.join(', ')}` });
    }

    const current = existingRows[0];
    await pool.query(
      `UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [
        title !== undefined ? title.trim() : current.title,
        description !== undefined ? description : current.description,
        priority !== undefined ? priority : current.priority,
        dueDate !== undefined ? dueDate : current.due_date,
        req.params.id,
        req.userId
      ]
    );
    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json(mapTask(rows[0], false));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// PATCH /api/tasks/:id/status — THE workflow gate.
// -> "done"      : row is moved from "tasks" into "done_tasks" inside a transaction
// -> out of done : row is moved back from "done_tasks" into "tasks"
// -> otherwise   : ordinary in-place update inside "tasks"
router.patch('/:id/status', async (req, res) => {
  const { status: nextStatus } = req.body;
  if (!isValidStatus(nextStatus)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let [rows] = await connection.query('SELECT * FROM tasks WHERE id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.userId]);
    let task = rows[0];
    let comingFromArchive = false;
    if (!task) {
      [rows] = await connection.query('SELECT * FROM done_tasks WHERE id = ? AND user_id = ? FOR UPDATE', [req.params.id, req.userId]);
      task = rows[0];
      comingFromArchive = true;
    }
    if (!task) {
      await connection.rollback();
      return res.status(404).json({ error: 'Task not found' });
    }

    const currentStatus = comingFromArchive ? 'done' : task.status;
    if (!canTransition(currentStatus, nextStatus)) {
      await connection.rollback();
      return res.status(409).json({
        error: `Cannot move task from "${currentStatus}" to "${nextStatus}"`,
        allowedNext: TRANSITIONS[currentStatus]
      });
    }

    const history = JSON.stringify([...parseHistory(task.history), { status: nextStatus, at: new Date().toISOString() }]);

    // Moving into "done" -> archive it
    if (nextStatus === 'done') {
      await connection.query(
        `INSERT INTO done_tasks (id, user_id, title, description, priority, due_date, history, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [task.id, req.userId, task.title, task.description, task.priority, task.due_date, history, task.created_at]
      );
      await connection.query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [task.id, req.userId]);
      await connection.commit();
      const [fresh] = await pool.query('SELECT * FROM done_tasks WHERE id = ? AND user_id = ?', [task.id, req.userId]);
      return res.json(mapTask(fresh[0], true));
    }

    // Moving out of "done" -> restore it to the active board
    if (comingFromArchive) {
      await connection.query(
        `INSERT INTO tasks (id, user_id, title, description, priority, due_date, status, history, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [task.id, req.userId, task.title, task.description, task.priority, task.due_date, nextStatus, history, task.created_at]
      );
      await connection.query('DELETE FROM done_tasks WHERE id = ? AND user_id = ?', [task.id, req.userId]);
      await connection.commit();
      const [fresh] = await pool.query('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [task.id, req.userId]);
      return res.json(mapTask(fresh[0], false));
    }

    // Ordinary move between active columns
    await connection.query(
      'UPDATE tasks SET status = ?, history = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
      [nextStatus, history, task.id, req.userId]
    );
    await connection.commit();
    const [fresh] = await pool.query('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [task.id, req.userId]);
    res.json(mapTask(fresh[0], false));
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  } finally {
    connection.release();
  }
});

// DELETE /api/tasks/:id — checks both tables
router.delete('/:id', async (req, res) => {
  try {
    const [activeResult] = await pool.query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (activeResult.affectedRows) return res.status(204).end();

    const [archiveResult] = await pool.query('DELETE FROM done_tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (archiveResult.affectedRows) return res.status(204).end();

    res.status(404).json({ error: 'Task not found' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
