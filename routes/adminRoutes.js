// src/routes/admin.routes.ts
const { Router } = require("express");
const {
  loginAdmin,
  getDashboardStats,
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
  createAdmin,
} = require("../controller/adminController");
const { authenticate, authorizeRoles } = require("../middleware/auth");

const router = Router();
router.post("/register", authenticate, authorizeRoles("ADMIN"), createAdmin);

router.post("/login", loginAdmin);
router.get("/stats", getDashboardStats);
router.get("/all", authenticate, authorizeRoles("ADMIN"), getAllAdmins);
router.get("/:id", authenticate, authorizeRoles("ADMIN"), getAdminById);
router.put("/update/:id", authenticate, authorizeRoles("ADMIN"), updateAdmin);
router.delete(
  "/delete/:id",
  authenticate,
  authorizeRoles("ADMIN"),
  deleteAdmin
);

module.exports = router;
