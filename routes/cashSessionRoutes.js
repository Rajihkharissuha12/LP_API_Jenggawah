// src/routes/admin.routes.ts
const { Router } = require("express");
const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  cekSessionByIdAdmin,
  openShift,
  closeShift,
  getAllSession,
} = require("../controller/cashSessionController");

const router = Router();

router.get(
  "/getall",
  authenticate,
  authorizeRoles("MANAGEMENT", "ADMIN"),
  getAllSession,
);
router.get("/:id", authenticate, authorizeRoles("KASIR"), cekSessionByIdAdmin);

router.post("/openshift", authenticate, authorizeRoles("KASIR"), openShift);
router.post("/closeshift", authenticate, authorizeRoles("KASIR"), closeShift);

module.exports = router;
