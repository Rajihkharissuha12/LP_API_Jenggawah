// src/routes/admin.routes.ts
const { Router } = require("express");

const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  tambahSupplier,
  getSupplierById,
  updateSupplier,
  getSupplier,
} = require("../controller/supplierController");

const router = Router();

router.get(
  "/",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  getSupplier,
);
router.post(
  "/tambah-supplier",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  tambahSupplier,
);
router.get(
  "/:id",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  getSupplierById,
);
router.put(
  "/:id",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  updateSupplier,
);

module.exports = router;
