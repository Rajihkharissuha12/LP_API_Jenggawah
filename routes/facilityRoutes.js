// src/routes/admin.routes.ts
const { Router } = require("express");
const {
  createFacility,
  updateFacility,
  getFacilitiesForLanding,
  deleteFacility,
  getFacilityDetailById,
  deleteFacilityHeroImage,
  deleteFacilityGalleryImage,
} = require("../controller/facilityController");
const { authorizeRoles, authenticate } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

const router = Router();
router.post(
  "/createfacilities",
  authenticate,
  authorizeRoles("ADMIN"),
  upload.fields([
    { name: "heroImage", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  createFacility
); // [web:471]

router.put(
  "/updatefacilities/:id",
  authenticate,
  authorizeRoles("ADMIN"),
  upload.fields([
    { name: "heroImage", maxCount: 1 },
    { name: "images", maxCount: 15 },
  ]),
  updateFacility
);
router.get("/fasilitieslist", getFacilitiesForLanding);
router.delete(
  "/deletefacilities/:id",
  authenticate,
  authorizeRoles("ADMIN"),
  deleteFacility
);
router.get("/facilitydetail/:id", getFacilityDetailById);
router.put(
  "/deletefacilityheroimage/:id",
  authenticate,
  authorizeRoles("ADMIN"),
  deleteFacilityHeroImage
);
router.put(
  "/deletefacilitygalleryimage/:id",
  authenticate,
  authorizeRoles("ADMIN"),
  deleteFacilityGalleryImage
);

module.exports = router;
