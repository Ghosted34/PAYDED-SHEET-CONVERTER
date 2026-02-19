import { Router } from "express";
import { MulterError } from "multer";
import { batchUpload, template, upload } from "./converter.controller.js";


const router  = Router();


router.post("/", upload.single("file"),batchUpload );

router.get('/template', template)

router.use((err, req, res, next) => {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ error: "File size exceeds 10 MB limit" });
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(500).json({ error: err.message });
  next();
});

export default router