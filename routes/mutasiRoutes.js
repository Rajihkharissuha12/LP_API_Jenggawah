// src/routes/admin.routes.ts
const { Router } = require("express");
const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  createAdjustment,
  getStatisticMutasi,
  getMutasi,
} = require("../controller/mutasiController");

const router = Router();

router.get("/", authenticate, authorizeRoles("ADMIN", "DAPUR"), getMutasi);
router.get(
  "/statistic",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  getStatisticMutasi,
);
router.post(
  "/add-mutasi",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  createAdjustment,
);

module.exports = router;
