// src/routes/admin.routes.ts
const { Router } = require("express");
const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  getDataOpnameNow,
  createStockOpname,
  getStockOpname,
  getDetailStockOpname,
  cekOpnameHariIni,
  getAllStockOpname,
  getStockOpnameDetail,
} = require("../controller/opnameController");

const router = Router();

router.get(
  "/so-today",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR", "MANAGEMENT"),
  cekOpnameHariIni,
);

router.get(
  "/getall",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  getAllStockOpname,
);
router.get(
  "/",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  getDataOpnameNow,
);

router.get(
  "/detail/:id",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  getStockOpnameDetail,
);

router.post(
  "/",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  createStockOpname,
);

module.exports = router;
