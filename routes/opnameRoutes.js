// src/routes/admin.routes.ts
const { Router } = require("express");
const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  getDataOpnameNow,
  createStockOpname,
  getStockOpname,
  getDetailStockOpname,
} = require("../controller/opnameController");

const router = Router();

router.get(
  "/getall",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  getStockOpname,
);
router.get(
  "/",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  getDataOpnameNow,
);

router.get(
  "/:id",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  getDetailStockOpname,
);

router.post(
  "/",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR"),
  createStockOpname,
);

module.exports = router;
