const { Router } = require("express");

const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  getStatusAbsenHariIni,
  createAbsen,
  getRiwayatAbsen,
  getAbsenKaryawan,
} = require("../controller/absenController");

const router = Router();

// GET /api/admin/activities - List all activities
router.get(
  "/status-hari-ini",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR", "KASIR"),
  getStatusAbsenHariIni,
);

router.get(
  "/riwayat",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR", "KASIR"),
  getRiwayatAbsen,
);

router.get(
  "/karyawan",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR", "KASIR"),
  getAbsenKaryawan,
);

router.post(
  "/",
  authenticate,
  authorizeRoles("ADMIN", "DAPUR", "KASIR"),
  createAbsen,
);

module.exports = router;
