import { Router } from "express";
import {
  createTask, deleteTask, getStats, getTasks, updateTask
} from "../controllers/taskController.js";
import { protect } from "../middleware/auth.js";
import { getAnalytics } from "../controllers/analyticsController.js";

const router = Router();

router.use(protect);
router.get("/", getTasks);
router.get("/stats", getStats);
router.get("/analytics", getAnalytics);
router.post("/", createTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

export default router;