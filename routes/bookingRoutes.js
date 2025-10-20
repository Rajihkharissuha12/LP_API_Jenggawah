// src/routes/admin.routes.ts
const { Router } = require("express");
const {
  createBooking,
  updateBookingSchedule,
  approveBooking,
  cancelBooking,
  startWhatsAppFromBooking,
  getCalendarBookings,
  getBookingsList,
  getBookingDetail,
  completeBooking,
} = require("../controller/bookingController");
const { authenticate, authorizeRoles } = require("../middleware/auth");

const router = Router();
router.post("/bookingcreate", createBooking);
router.put(
  "/bookingupdate/:id",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  updateBookingSchedule
);
router.put(
  "/bookingapprove/:id",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  approveBooking
);
router.put(
  "/bookingcomplete/:id",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  completeBooking
);
router.put(
  "/bookingcancel/:id",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  cancelBooking
);
router.post(
  "/bookingstartwhatsapp/:id",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  startWhatsAppFromBooking
);
router.get(
  "/bookingkalender",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  getCalendarBookings
);

router.get(
  "/listbooking",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  getBookingsList
);

router.get(
  "/detailbooking/:id",
  authenticate,
  authorizeRoles("ADMIN", "STAFF"),
  getBookingDetail
);

module.exports = router;
