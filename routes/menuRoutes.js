// src/routes/admin.routes.ts
const { Router } = require("express");
const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  createMenuCategory,
  getAllMenuCategory,
  updateMenuCategory,
  getMenuCategoryById,
  deleteMenuCategory,
  createMenu,
  getAllMenu,
  getMenuById,
  updateMenu,
  deleteMenu,
  getDetailMenu,
  getListHpp,
} = require("../controller/menuController");

const router = Router();

router.get(
  "/getall",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  getAllMenuCategory,
);

router.get(
  "/menu-all",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  getAllMenu,
);

router.get(
  "/hpp",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  getListHpp,
);

router.get(
  "/menu-detail/:id",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  getMenuById,
);

router.get(
  "/detail-menu/:id",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  getDetailMenu,
);

router.get(
  "/:id",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  getMenuCategoryById,
);

router.post(
  "/menu-category",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  createMenuCategory,
);

router.post(
  "/menu-create",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  createMenu,
);

router.put(
  "/menu-edit/:id",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  updateMenuCategory,
);

router.put(
  "/menu-detail-edit/:id",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  updateMenu,
);

router.delete(
  "/menu-delete/:id",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  deleteMenuCategory,
);

router.delete(
  "/menu-detail-delete/:id",
  authenticate,
  authorizeRoles("ADMIN", "MANAGEMENT"),
  deleteMenu,
);

module.exports = router;
