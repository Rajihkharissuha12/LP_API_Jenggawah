// src/routes/admin.routes.ts
const { Router } = require("express");
const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  createPembelianBahan,
  getPembelianBahan,
  getDetailPembelianBahan,
  editPembelianBahan,
} = require("../controller/pembelianbahanController");

const router = Router();

router.get(
  "/",
  authenticate,
  authorizeRoles("DAPUR", "ADMIN", "MANAGEMENT"),
  getPembelianBahan,
);

router.get(
  "/detail/:id",
  authenticate,
  authorizeRoles("DAPUR", "ADMIN", "MANAGEMENT"),
  getDetailPembelianBahan,
);

router.post(
  "/tambah",
  authenticate,
  authorizeRoles("DAPUR", "ADMIN", "MANAGEMENT"),
  createPembelianBahan,
);

router.put(
  "/edit/:id",
  authenticate,
  authorizeRoles("DAPUR", "ADMIN", "MANAGEMENT"),
  editPembelianBahan,
);

module.exports = router;
