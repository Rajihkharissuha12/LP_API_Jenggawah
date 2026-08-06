// src/routes/admin.routes.ts
const { Router } = require("express");
const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  createRole,
  addRole,
  getRole,
} = require("../controller/roleController");

const router = Router();

router.get("/", authenticate, authorizeRoles("ADMIN"), getRole);
router.post("/create-role", authenticate, authorizeRoles("ADMIN"), createRole);
router.post(
  "/add-role",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  addRole,
);

module.exports = router;
