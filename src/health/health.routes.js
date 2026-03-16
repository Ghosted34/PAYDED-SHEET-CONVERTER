import { Router } from "express";
import { health, liveness } from "./health.controller.js";

const router = Router();

router.get("/ready", health);


router.get("/live", liveness);

export default router