const dashboardController = require("../controller/dashboardController");
const { Router } = require("express");

const router = Router();

router.get("/summary", dashboardController.getSummary);

router.get("/revenue", dashboardController.getRevenue);

router.get("/cash-flow", dashboardController.getCashFlow);

router.get("/profit", dashboardController.getProfit);

router.get("/sales-trend", dashboardController.getSalesTrend);

router.get("/monthly-performance", dashboardController.getMonthlyPerformance);

router.get("/top-menus", dashboardController.getTopMenus);

router.get("/top-facilities", dashboardController.getTopFacilities);

router.get("/payment-methods", dashboardController.getPaymentMethods);

router.get("/peak-hours", dashboardController.getPeakHours);

router.get("/inventory", dashboardController.getInventory);

router.get("/recent-transactions", dashboardController.getRecentTransactions);

router.get("/upcoming-bookings", dashboardController.getUpcomingBookings);

module.exports = router;
