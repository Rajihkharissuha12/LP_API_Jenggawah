// src/routes/admin.routes.ts
const { Router } = require("express");

const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  tambahBahan,
  getAllBahan,
  updateBahan,
  getDetailBahan,
} = require("../controller/bahanController");

const router = Router();

router.get(
  "/",
  authenticate,
  authorizeRoles("DAPUR", "MANAGEMENT"),
  getAllBahan,
);
router.get(
  "/detail-bahan/:id",
  authenticate,
  authorizeRoles("DAPUR", "MANAGEMENT"),
  getDetailBahan,
);
router.post(
  "/tambah-bahan",
  authenticate,
  authorizeRoles("DAPUR", "MANAGEMENT"),
  tambahBahan,
);
router.put(
  "/edit-bahan/:id",
  authenticate,
  authorizeRoles("DAPUR", "MANAGEMENT"),
  updateBahan,
);

module.exports = router;
