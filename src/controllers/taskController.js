import Task from "../models/Task.js";

export async function getTasks(req, res) {
  try {
    const { search = "", status = "All", priority = "All" } = req.query;
    const filter = { user: req.userId };

    if (status !== "All") filter.status = status;
    if (priority !== "All") filter.priority = priority;
    if (search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } }
      ];
    }

    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    res.json(tasks);
  } catch {
    res.status(500).json({ message: "Could not load tasks" });
  }
}

export async function getStats(req, res) {
  try {
    const [total, pending, completed] = await Promise.all([
      Task.countDocuments({ user: req.userId }),
      Task.countDocuments({ user: req.userId, status: { $ne: "Completed" } }),
      Task.countDocuments({ user: req.userId, status: "Completed" })
    ]);
    res.json({ total, pending, completed });
  } catch {
    res.status(500).json({ message: "Could not load statistics" });
  }
}

export async function createTask(req, res) {
  try {
    const payload = { ...req.body, user: req.userId };
    if (payload.status === "Completed") payload.completedAt = new Date();
    const task = await Task.create(payload);
    res.status(201).json(task);
  } catch {
    res.status(400).json({ message: "Invalid task data" });
  }
}

export async function updateTask(req, res) {
  try {
    const update = { ...req.body };
    if (update.status === "Completed") update.completedAt = new Date();
    if (update.status && update.status !== "Completed") update.completedAt = null;
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      update,
      { new: true, runValidators: true }
    );
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  } catch {
    res.status(400).json({ message: "Could not update task" });
  }
}

export async function deleteTask(req, res) {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json({ message: "Task deleted" });
  } catch {
    res.status(500).json({ message: "Could not delete task" });
  }
}