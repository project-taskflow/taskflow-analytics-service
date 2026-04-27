const express = require('express');
const mongoose = require('mongoose');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

let Task;
const getTask = () => {
  if (!Task) {
    const schema = new mongoose.Schema(
      { title: String, status: String, priority: String, dueDate: Date, userId: String, tags: [String], createdAt: Date },
      { collection: 'tasks' }
    );
    Task = mongoose.model('AnalyticsTask', schema);
  }
  return Task;
};

// GET /analytics/overview — summary stats for the authenticated user
router.get('/overview', authenticate, async (req, res) => {
  try {
    const T = getTask();
    const userId = req.user.id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);

    const [statusBreakdown, priorityBreakdown, overdueTasks, recentlyCompleted, totalTasks] =
      await Promise.all([
        T.aggregate([
          { $match: { userId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        T.aggregate([
          { $match: { userId } },
          { $group: { _id: '$priority', count: { $sum: 1 } } },
        ]),
        T.countDocuments({ userId, status: { $ne: 'done' }, dueDate: { $lt: now } }),
        T.countDocuments({ userId, status: 'done', updatedAt: { $gte: thirtyDaysAgo } }),
        T.countDocuments({ userId }),
      ]);

    const statusMap = { todo: 0, 'in-progress': 0, done: 0 };
    statusBreakdown.forEach(({ _id, count }) => { statusMap[_id] = count; });

    const priorityMap = { low: 0, medium: 0, high: 0 };
    priorityBreakdown.forEach(({ _id, count }) => { priorityMap[_id] = count; });

    const completionRate = totalTasks > 0
      ? Math.round((statusMap.done / totalTasks) * 100)
      : 0;

    res.json({
      totalTasks,
      statusBreakdown: statusMap,
      priorityBreakdown: priorityMap,
      completionRate,
      overdueTasks,
      recentlyCompleted,
    });
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// GET /analytics/trends — tasks created per day for the last 14 days
router.get('/trends', authenticate, async (req, res) => {
  try {
    const T = getTask();
    const userId = req.user.id;
    const days = Math.min(30, parseInt(req.query.days) || 14);
    const since = new Date(Date.now() - days * 86400000);

    const [created, completed] = await Promise.all([
      T.aggregate([
        { $match: { userId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      T.aggregate([
        { $match: { userId, status: 'done', updatedAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Fill in all days in range (even with 0 counts)
    const dateMap = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dateMap[key] = { date: key, created: 0, completed: 0 };
    }
    created.forEach(({ _id, count }) => { if (dateMap[_id]) dateMap[_id].created = count; });
    completed.forEach(({ _id, count }) => { if (dateMap[_id]) dateMap[_id].completed = count; });

    res.json({ trends: Object.values(dateMap), days });
  } catch (err) {
    console.error('Trends error:', err);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// GET /analytics/tags — most used tags
router.get('/tags', authenticate, async (req, res) => {
  try {
    const T = getTask();
    const tags = await T.aggregate([
      { $match: { userId: req.user.id } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { tag: '$_id', count: 1, _id: 0 } },
    ]);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tag stats' });
  }
});

// GET /analytics/admin/overview — global stats (admin only)
router.get('/admin/overview', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const T = getTask();
    const [totalTasks, statusBreakdown, topUsers] = await Promise.all([
      T.countDocuments(),
      T.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      T.aggregate([
        { $group: { _id: '$userId', taskCount: { $sum: 1 } } },
        { $sort: { taskCount: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const statusMap = { todo: 0, 'in-progress': 0, done: 0 };
    statusBreakdown.forEach(({ _id, count }) => { statusMap[_id] = count; });

    res.json({ totalTasks, statusBreakdown: statusMap, topUsers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin overview' });
  }
});

module.exports = router;
