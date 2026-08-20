import { Router } from "express";
import { generateTask } from "../controllers/aiController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);
router.post("/task", generateTask);

export default router;
