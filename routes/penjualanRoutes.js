// src/routes/admin.routes.ts
const { Router } = require("express");

const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  getTotalTransactionToday,
  createPenjualan,
  getDashboardSummary,
  getDataTransactionToday,
  updateStatusPenjualan,
  getAllTransaction,
  getTransactionDetail,
  updatePenjualanItems,
} = require("../controller/penjualanController");

const router = Router();

router.get(
  "/total-today",
  authenticate,
  authorizeRoles("MANAGEMENT", "KASIR"),
  getTotalTransactionToday,
);

router.get(
  "/getall",
  authenticate,
  authorizeRoles("MANAGEMENT", "KASIR"),
  getAllTransaction,
);

router.get(
  "/today",
  authenticate,
  authorizeRoles("MANAGEMENT", "KASIR"),
  getDataTransactionToday,
);

router.get(
  "/detail/transaction/:id",
  authenticate,
  authorizeRoles("MANAGEMENT", "KASIR"),
  getTransactionDetail,
);

router.post(
  "/transaction",
  authenticate,
  authorizeRoles("MANAGEMENT", "KASIR"),
  createPenjualan,
);

router.get(
  "/summary",
  authenticate,
  authorizeRoles("MANAGEMENT", "KASIR"),
  getDashboardSummary,
);

router.put(
  "/status/:id",
  authenticate,
  authorizeRoles("MANAGEMENT", "KASIR"),
  updateStatusPenjualan,
);

router.put(
  "/:id/items",
  authenticate,
  authorizeRoles("MANAGEMENT", "KASIR"),
  updatePenjualanItems,
);

module.exports = router;
