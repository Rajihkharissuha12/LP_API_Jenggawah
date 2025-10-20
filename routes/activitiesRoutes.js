const { Router } = require("express");

const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  getActivityLogs,
  getActivitySummary,
  getActivityLogById,
} = require("../controller/activitiesController");

const router = Router();

// GET /api/admin/activities - List all activities
router.get("/", authenticate, authorizeRoles("ADMIN"), getActivityLogs);

// GET /api/admin/activities/summary - Get summary/dashboard
router.get(
  "/summary",
  authenticate,
  authorizeRoles("ADMIN"),
  getActivitySummary
);

// GET /api/admin/activities/:id - Get single activity
router.get("/:id", authenticate, authorizeRoles("ADMIN"), getActivityLogById);

module.exports = router;
