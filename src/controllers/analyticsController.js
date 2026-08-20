import Task from "../models/Task.js";

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function rangeStart(days) {
  return startOfDay(addDays(new Date(), -(days - 1)));
}

function bucketConfig(days) {
  if (days <= 7) return { unit: "day", count: 7 };
  if (days <= 30) return { unit: "day", count: 30 };
  if (days <= 90) return { unit: "week", count: 13 };
  return { unit: "month", count: 12 };
}

function bucketKey(date, unit) {
  const d = startOfDay(date);
  if (unit === "day") return d.toISOString().slice(0, 10);
  if (unit === "week") {
    const day = d.getDay();
    const monday = addDays(d, day === 0 ? -6 : 1 - day);
    return startOfDay(monday).toISOString().slice(0, 10);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketLabel(key, unit) {
  const d = unit === "month"
    ? new Date(`${key}-01T00:00:00`)
    : new Date(`${key}T00:00:00`);
  if (unit === "month") return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  if (unit === "week") return `Week of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export async function getAnalytics(req, res) {
  try {
    const allowed = [7, 30, 90, 365];
    const days = allowed.includes(Number(req.query.range)) ? Number(req.query.range) : 30;
    const start = rangeStart(days);
    const now = new Date();

    // Tasks created in the selected period drive the main period metrics.
    const tasks = await Task.find({ user: req.userId, createdAt: { $gte: start, $lte: now } })
      .sort({ createdAt: -1 })
      .lean();

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === "Completed").length;
    const inProgress = tasks.filter(t => t.status === "In Progress").length;
    const pending = tasks.filter(t => t.status === "Pending").length;
    const overdueTasks = tasks.filter(t => t.status !== "Completed" && t.dueDate && new Date(t.dueDate) < now);
    const overdue = overdueTasks.length;
    const completionRate = total ? Number(((completed / total) * 100).toFixed(1)) : 0;

    const priority = ["High", "Medium", "Low"].map(name => ({
      name,
      count: tasks.filter(t => t.priority === name).length
    }));

    const status = ["Completed", "In Progress", "Pending"].map(name => ({
      name,
      count: tasks.filter(t => t.status === name).length
    }));

    const config = bucketConfig(days);
    const buckets = [];
    if (config.unit === "day") {
      for (let i = 0; i < config.count; i++) {
        const d = startOfDay(addDays(start, i));
        if (d > now) break;
        const key = bucketKey(d, "day");
        buckets.push({ key, label: bucketLabel(key, "day"), created: 0, completed: 0 });
      }
    } else if (config.unit === "week") {
      const first = startOfDay(start);
      for (let i = 0; i < config.count; i++) {
        const d = addDays(first, i * 7);
        if (d > now) break;
        const key = bucketKey(d, "week");
        buckets.push({ key, label: bucketLabel(key, "week"), created: 0, completed: 0 });
      }
    } else {
      const first = new Date(start.getFullYear(), start.getMonth(), 1);
      for (let i = 0; i < config.count; i++) {
        const d = new Date(first.getFullYear(), first.getMonth() + i, 1);
        if (d > now) break;
        const key = bucketKey(d, "month");
        buckets.push({ key, label: bucketLabel(key, "month"), created: 0, completed: 0 });
      }
    }

    const byKey = new Map(buckets.map(b => [b.key, b]));
    for (const task of tasks) {
      const createdKey = bucketKey(task.createdAt, config.unit);
      if (byKey.has(createdKey)) byKey.get(createdKey).created += 1;
      if (task.status === "Completed") {
        const completionDate = task.completedAt || task.updatedAt || task.createdAt;
        const completedKey = bucketKey(completionDate, config.unit);
        if (byKey.has(completedKey)) byKey.get(completedKey).completed += 1;
      }
    }

    const trend = buckets.map(b => ({
      ...b,
      productivity: b.created ? Number(((b.completed / b.created) * 100).toFixed(1)) : 0
    }));

    const topOverdue = overdueTasks
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 8)
      .map(t => ({
        _id: t._id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        daysOverdue: Math.max(1, Math.ceil((now - new Date(t.dueDate)) / 86400000))
      }));

    const mostProductive = [...trend].sort((a, b) => b.productivity - a.productivity)[0] || null;
    const avgDailyProductivity = trend.length
      ? Number((trend.reduce((sum, x) => sum + x.productivity, 0) / trend.length).toFixed(1))
      : 0;

    res.json({
      range: days,
      period: { start, end: now },
      summary: { total, completed, inProgress, pending, overdue, completionRate },
      priority,
      status,
      trend,
      overdueTasks: topOverdue,
      productivity: {
        average: avgDailyProductivity,
        mostProductive: mostProductive ? { label: mostProductive.label, value: mostProductive.productivity } : null
      }
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ message: "Could not load analytics" });
  }
}
