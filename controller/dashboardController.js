const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

class DashboardController {
  // =====================================================
  // DATE FILTER HELPER
  // =====================================================

  getDateRange(period, startDate, endDate) {
    const now = new Date();

    // Custom range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      end.setHours(23, 59, 59, 999);

      return {
        start,
        end,
        previousStart: new Date(
          start.getTime() - (end.getTime() - start.getTime()),
        ),
        previousEnd: new Date(start.getTime() - 1),
      };
    }

    let start = new Date(now);
    let end = new Date(now);

    switch (period) {
      case "today":
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;

      case "yesterday":
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);

        end = new Date(start);
        end.setHours(23, 59, 59, 999);
        break;

      case "7d":
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;

      case "30d":
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;

      case "year":
        start = new Date(now.getFullYear(), 0, 1);

        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;

      case "month":
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);

        end = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );
        break;
    }

    const duration = end.getTime() - start.getTime();

    return {
      start,
      end,

      previousStart: new Date(start.getTime() - duration),

      previousEnd: new Date(start.getTime() - 1),
    };
  }

  // =====================================================
  // SUMMARY
  // =====================================================

  getSummary = async (req, res) => {
    try {
      const { period = "month", startDate, endDate } = req.query;

      const range = this.getDateRange(period, startDate, endDate);

      /**
       * SALES
       */
      const sales = await prisma.penjualan.aggregate({
        where: {
          createdAt: {
            gte: range.start,
            lte: range.end,
          },
          paymentStatus: "PAID",
        },
        _sum: {
          grandTotal: true,
        },
        _count: {
          id: true,
        },
      });

      /**
       * PREVIOUS SALES
       */
      const previousSales = await prisma.penjualan.aggregate({
        where: {
          createdAt: {
            gte: range.previousStart,
            lte: range.previousEnd,
          },
          paymentStatus: "PAID",
        },
        _sum: {
          grandTotal: true,
        },
      });

      /**
       * PURCHASE / CASH OUT
       */
      const purchases = await prisma.pembelianBahan.aggregate({
        where: {
          tanggal: {
            gte: range.start,
            lte: range.end,
          },
        },
        _sum: {
          hargaTotal: true,
        },
      });

      /**
       * PREVIOUS PURCHASE
       */
      const previousPurchases = await prisma.pembelianBahan.aggregate({
        where: {
          tanggal: {
            gte: range.previousStart,
            lte: range.previousEnd,
          },
        },
        _sum: {
          hargaTotal: true,
        },
      });

      const revenue = Number(sales._sum.grandTotal || 0);

      const previousRevenue = Number(previousSales._sum.grandTotal || 0);

      const cashOut = Number(purchases._sum.hargaTotal || 0);

      const previousCashOut = Number(previousPurchases._sum.hargaTotal || 0);

      const revenueGrowth =
        previousRevenue > 0
          ? ((revenue - previousRevenue) / previousRevenue) * 100
          : 0;

      const expenseGrowth =
        previousCashOut > 0
          ? ((cashOut - previousCashOut) / previousCashOut) * 100
          : 0;

      /**
       * HPP
       */
      const details = await prisma.penjualanDetail.findMany({
        where: {
          penjualan: {
            createdAt: {
              gte: range.start,
              lte: range.end,
            },
            paymentStatus: "PAID",
          },
        },
        select: {
          qty: true,
          hpp: true,
          subtotal: true,
        },
      });

      const hpp = details.reduce(
        (total, item) => total + Number(item.hpp || 0) * Number(item.qty || 0),
        0,
      );

      const grossProfit = revenue - hpp;

      const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      const netCashFlow = revenue - cashOut;

      console.log("========== DASHBOARD SUMMARY ==========");

      console.log("Revenue:", revenue);
      console.log("Cash In:", revenue);
      console.log("Cash Out:", cashOut);
      console.log("Gross Profit:", grossProfit);
      console.log("Net Cash Flow:", netCashFlow);

      console.log("Transaction Count:", sales._count.id);

      console.log(
        "Average Order Value:",
        sales._count.id > 0 ? revenue / sales._count.id : 0,
      );

      console.log("HPP:", hpp);
      console.log("Profit Margin:", profitMargin);

      console.log("Revenue Growth:", revenueGrowth);

      console.log("Expense Growth:", expenseGrowth);

      console.log("========================================");

      return res.json({
        success: true,
        data: {
          revenue,
          cashIn: revenue,
          cashOut,
          grossProfit,
          netCashFlow,

          transactionCount: sales._count.id,

          averageOrderValue:
            sales._count.id > 0 ? revenue / sales._count.id : 0,

          hpp,
          profitMargin,

          revenueGrowth,
          expenseGrowth,
        },
      });
    } catch (error) {
      console.error("Dashboard Summary Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil dashboard summary",
      });
    }
  };

  // =====================================================
  // REVENUE
  // =====================================================

  getRevenue = async (req, res) => {
    try {
      const { period = "month", startDate, endDate } = req.query;

      const range = this.getDateRange(period, startDate, endDate);

      const sales = await prisma.penjualan.aggregate({
        where: {
          createdAt: {
            gte: range.start,
            lte: range.end,
          },
          paymentStatus: "PAID",
        },
        _sum: {
          grandTotal: true,
        },
      });

      const bookingPayments = await prisma.paymentTransaction.aggregate({
        where: {
          createdAt: {
            gte: range.start,
            lte: range.end,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const cafeRevenue = Number(sales._sum.grandTotal || 0);

      const bookingRevenue = Number(bookingPayments._sum.amount || 0);

      return res.json({
        success: true,
        data: {
          cafeRevenue,
          bookingRevenue,
          totalRevenue: cafeRevenue + bookingRevenue,
        },
      });
    } catch (error) {
      console.error("Dashboard Revenue Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil revenue",
      });
    }
  };

  // =====================================================
  // CASH FLOW
  // =====================================================

  getCashFlow = async (req, res) => {
    try {
      const { period = "month", startDate, endDate } = req.query;

      const range = this.getDateRange(period, startDate, endDate);

      const cafe = await prisma.penjualanPayment.aggregate({
        where: {
          createdAt: {
            gte: range.start,
            lte: range.end,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const booking = await prisma.paymentTransaction.aggregate({
        where: {
          createdAt: {
            gte: range.start,
            lte: range.end,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const purchase = await prisma.pembelianBahan.aggregate({
        where: {
          tanggal: {
            gte: range.start,
            lte: range.end,
          },
        },
        _sum: {
          hargaTotal: true,
        },
      });

      const cafeCashIn = Number(cafe._sum.amount || 0);

      const bookingCashIn = Number(booking._sum.amount || 0);

      const cashOut = Number(purchase._sum.hargaTotal || 0);

      const cashIn = cafeCashIn + bookingCashIn;

      return res.json({
        success: true,
        data: {
          cashIn,
          cashOut,
          netCashFlow: cashIn - cashOut,

          breakdown: {
            cafe: cafeCashIn,

            booking: bookingCashIn,

            purchase: cashOut,
          },
        },
      });
    } catch (error) {
      console.error("Dashboard Cash Flow Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil cash flow",
      });
    }
  };

  // =====================================================
  // PROFIT
  // =====================================================

  getProfit = async (req, res) => {
    try {
      const { period = "month", startDate, endDate } = req.query;

      const range = this.getDateRange(period, startDate, endDate);

      const sales = await prisma.penjualan.aggregate({
        where: {
          createdAt: {
            gte: range.start,
            lte: range.end,
          },
          paymentStatus: "PAID",
        },
        _sum: {
          grandTotal: true,
        },
      });

      const details = await prisma.penjualanDetail.findMany({
        where: {
          penjualan: {
            createdAt: {
              gte: range.start,
              lte: range.end,
            },
            paymentStatus: "PAID",
          },
        },
        select: {
          qty: true,
          hpp: true,
        },
      });

      const revenue = Number(sales._sum.grandTotal || 0);

      const hpp = details.reduce(
        (total, item) => total + Number(item.hpp || 0) * Number(item.qty || 0),
        0,
      );

      const grossProfit = revenue - hpp;

      return res.json({
        success: true,
        data: {
          revenue,
          hpp,
          grossProfit,
          grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        },
      });
    } catch (error) {
      console.error("Dashboard Profit Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil profit",
      });
    }
  };

  // =====================================================
  // SALES TREND
  // =====================================================

  getSalesTrend = async (req, res) => {
    try {
      const { period = "30d", startDate, endDate } = req.query;

      const range = this.getDateRange(period, startDate, endDate);

      const sales = await prisma.penjualan.findMany({
        where: {
          createdAt: {
            gte: range.start,
            lte: range.end,
          },
          paymentStatus: "PAID",
        },
        select: {
          createdAt: true,
          grandTotal: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      const grouped = new Map();

      for (const sale of sales) {
        if (!sale.createdAt) continue;

        const date = sale.createdAt.toISOString().split("T")[0];

        grouped.set(
          date,
          (grouped.get(date) || 0) + Number(sale.grandTotal || 0),
        );
      }

      const data = Array.from(grouped.entries()).map(([date, revenue]) => ({
        date,
        revenue,
      }));

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Sales Trend Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil sales trend",
      });
    }
  };

  // =====================================================
  // MONTHLY PERFORMANCE
  // =====================================================

  getMonthlyPerformance = async (req, res) => {
    try {
      const year = req.query.year
        ? Number(req.query.year)
        : new Date().getFullYear();

      const start = new Date(year, 0, 1);

      const end = new Date(year, 11, 31, 23, 59, 59, 999);

      const sales = await prisma.penjualan.findMany({
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
          paymentStatus: "PAID",
        },
        select: {
          createdAt: true,
          grandTotal: true,
        },
      });

      const purchases = await prisma.pembelianBahan.findMany({
        where: {
          tanggal: {
            gte: start,
            lte: end,
          },
        },
        select: {
          tanggal: true,
          hargaTotal: true,
        },
      });

      const months = Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        revenue: 0,
        expense: 0,
        profit: 0,
      }));

      for (const sale of sales) {
        if (!sale.createdAt) continue;

        const month = sale.createdAt.getMonth();

        months[month].revenue += Number(sale.grandTotal || 0);
      }

      for (const purchase of purchases) {
        const month = purchase.tanggal.getMonth();

        months[month].expense += Number(purchase.hargaTotal || 0);
      }

      for (const item of months) {
        item.profit = item.revenue - item.expense;
      }

      return res.json({
        success: true,
        data: months,
      });
    } catch (error) {
      console.error("Monthly Performance Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil performa bulanan",
      });
    }
  };

  // =====================================================
  // TOP MENUS
  // =====================================================

  getTopMenus = async (req, res) => {
    try {
      const { period = "month", startDate, endDate, limit = "10" } = req.query;

      const range = this.getDateRange(period, startDate, endDate);

      const parsedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

      const details = await prisma.penjualanDetail.findMany({
        where: {
          penjualan: {
            createdAt: {
              gte: range.start,
              lte: range.end,
            },
            paymentStatus: "PAID",
          },
        },

        select: {
          qty: true,
          subtotal: true,
          hpp: true,

          menu: {
            select: {
              id: true,
              nama: true,
            },
          },
        },
      });

      const grouped = new Map();

      for (const detail of details) {
        if (!detail.menu) continue;

        const menuId = detail.menu.id;

        const existing = grouped.get(menuId);

        const qty = Number(detail.qty || 0);

        const revenue = Number(detail.subtotal || 0);

        const hpp = Number(detail.hpp || 0) * qty;

        if (existing) {
          existing.quantity += qty;
          existing.revenue += revenue;
          existing.hpp += hpp;
          existing.profit += revenue - hpp;
        } else {
          grouped.set(menuId, {
            menuId,
            menuName: detail.menu.nama,
            quantity: qty,
            revenue,
            hpp,
            profit: revenue - hpp,
          });
        }
      }

      const data = Array.from(grouped.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, parsedLimit);

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Dashboard Top Menus Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil top menus",
      });
    }
  };

  // =====================================================
  // TOP FACILITIES
  // =====================================================

  getTopFacilities = async (req, res) => {
    try {
      const { period = "month", startDate, endDate, limit = "10" } = req.query;

      const range = this.getDateRange(period, startDate, endDate);

      const parsedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

      const bookingItems = await prisma.bookingItem.findMany({
        where: {
          booking: {
            bookingDate: {
              gte: range.start,
              lte: range.end,
            },

            // Optional:
            // jangan masukkan booking yang dihapus
            isDeleted: false,

            // Optional:
            // tambahkan filter status sesuai enum kamu
          },
        },

        select: {
          unitCount: true,
          price: true,

          booking: {
            select: {
              id: true,
              bookingCode: true,
              bookingDate: true,
              status: true,

              facility: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      const grouped = new Map();

      for (const item of bookingItems) {
        const facility = item.booking?.facility;

        if (!facility) {
          continue;
        }

        const facilityId = facility.id;

        const quantity = Number(item.unitCount || 1);

        const price = Number(item.price || 0);

        const revenue = quantity * price;

        const existing = grouped.get(facilityId);

        if (existing) {
          existing.bookingCount += 1;

          existing.quantity += quantity;

          existing.revenue += revenue;
        } else {
          grouped.set(facilityId, {
            facilityId,

            facilityName: facility.name,

            bookingCount: 1,

            quantity,

            revenue,
          });
        }
      }

      const data = Array.from(grouped.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, parsedLimit);

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Dashboard Top Facilities Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil top facilities",

        error: error.message,
      });
    }
  };

  // =====================================================
  // PAYMENT METHODS
  // =====================================================

  getPaymentMethods = async (req, res) => {
    try {
      const { period = "month", startDate, endDate } = req.query;

      const range = this.getDateRange(period, startDate, endDate);

      /**
       * CAFE PAYMENT
       */
      const cafePayments = await prisma.penjualanPayment.findMany({
        where: {
          createdAt: {
            gte: range.start,
            lte: range.end,
          },
        },

        select: {
          method: true,
          amount: true,
        },
      });

      /**
       * BOOKING PAYMENT
       */
      const bookingPayments = await prisma.paymentTransaction.findMany({
        where: {
          createdAt: {
            gte: range.start,
            lte: range.end,
          },
        },

        select: {
          method: true,
          amount: true,
        },
      });

      const grouped = new Map();

      for (const payment of cafePayments) {
        const method = String(payment.method);

        const amount = Number(payment.amount || 0);

        const existing = grouped.get(method);

        if (existing) {
          existing.transactionCount += 1;
          existing.amount += amount;
        } else {
          grouped.set(method, {
            method,
            transactionCount: 1,
            amount,
          });
        }
      }

      for (const payment of bookingPayments) {
        const method = String(payment.method);

        const amount = Number(payment.amount || 0);

        const existing = grouped.get(method);

        if (existing) {
          existing.transactionCount += 1;
          existing.amount += amount;
        } else {
          grouped.set(method, {
            method,
            transactionCount: 1,
            amount,
          });
        }
      }

      const totalAmount = Array.from(grouped.values()).reduce(
        (sum, item) => sum + item.amount,
        0,
      );

      const data = Array.from(grouped.values())
        .map((item) => ({
          ...item,
          percentage:
            totalAmount > 0
              ? Number(((item.amount / totalAmount) * 100).toFixed(2))
              : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Dashboard Payment Methods Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil metode pembayaran",
      });
    }
  };

  // =====================================================
  // PEAK HOURS
  // =====================================================

  getPeakHours = async (req, res) => {
    try {
      const { period = "month", startDate, endDate } = req.query;

      const range = this.getDateRange(period, startDate, endDate);

      /**
       * Ambil transaksi cafe
       *
       * Peak hour dihitung berdasarkan
       * waktu transaksi dibayar (paidAt)
       *
       * Bukan createdAt karena transaksi
       * bisa dibuat sebelum pembayaran selesai.
       */
      const sales = await prisma.penjualan.findMany({
        where: {
          paidAt: {
            gte: range.start,
            lte: range.end,
          },

          paymentStatus: "PAID",
        },

        select: {
          id: true,
          nomorInvoice: true,
          paidAt: true,
          grandTotal: true,
        },

        orderBy: {
          paidAt: "asc",
        },
      });

      /**
       * Group berdasarkan jam
       *
       * Contoh:
       *
       * 10:15 -> jam 10
       * 10:30 -> jam 10
       * 10:45 -> jam 10
       *
       * Hasil:
       * 10:00
       * transactionCount = 3
       */
      const grouped = new Map();

      for (const sale of sales) {
        if (!sale.paidAt) {
          continue;
        }

        const hour = sale.paidAt.getHours();

        const revenue = Number(sale.grandTotal || 0);

        const existing = grouped.get(hour);

        if (existing) {
          existing.transactionCount += 1;

          existing.revenue += revenue;
        } else {
          grouped.set(hour, {
            hour,

            transactionCount: 1,

            revenue,
          });
        }
      }

      /**
       * Pastikan hasil diurutkan
       * berdasarkan jam
       */
      const data = Array.from(grouped.values())
        .sort((a, b) => a.hour - b.hour)
        .map((item) => ({
          ...item,

          label: `${String(item.hour).padStart(2, "0")}:00`,
        }));

      /**
       * Peak berdasarkan revenue
       */
      const peakByRevenue =
        [...data].sort((a, b) => b.revenue - a.revenue)[0] || null;

      /**
       * Peak berdasarkan jumlah transaksi
       */
      const peakByTransaction =
        [...data].sort((a, b) => b.transactionCount - a.transactionCount)[0] ||
        null;

      return res.json({
        success: true,

        data,

        peakHour: peakByRevenue,

        peakByRevenue,

        peakByTransaction,
      });
    } catch (error) {
      console.error("Dashboard Peak Hours Error:", error);

      return res.status(500).json({
        success: false,

        message: "Gagal mengambil peak hours",
      });
    }
  };

  // =====================================================
  // INVENTORY
  // =====================================================

  getInventory = async (req, res) => {
    try {
      /**
       * Ambil semua bahan aktif
       */
      const bahan = await prisma.bahan.findMany({
        where: {
          isDeleted: false,
        },

        select: {
          id: true,
          nama: true,
          kategori: true,
          satuan: true,
          stok: true,
          minimum_stok: true,
          hargaPerSatuan: true,

          /**
           * Ambil pembelian terakhir
           * berdasarkan tanggal pembelian
           */
          pembelian: {
            where: {
              isDeleted: false,
            },

            orderBy: {
              tanggal: "desc",
            },

            take: 1,

            select: {
              id: true,
              tanggal: true,
              qtyBeli: true,
              satuanBeli: true,
              isiPerSatuan: true,
              hargaSatuan: true,
              hargaTotal: true,
              hargaPerUnit: true,

              supplier: {
                select: {
                  id: true,
                  nama: true,
                },
              },
            },
          },
        },

        orderBy: {
          stok: "asc",
        },
      });

      /**
       * Total jenis bahan aktif
       */
      const totalItems = bahan.length;

      /**
       * Bahan dengan stok rendah
       */
      const lowStockItems = bahan.filter(
        (item) => Number(item.stok || 0) <= Number(item.minimum_stok || 0),
      );

      /**
       * Hitung total nilai stok
       *
       * Menggunakan hargaPerUnit
       * dari pembelian terakhir.
       *
       * Jika belum pernah ada pembelian,
       * fallback ke hargaPerSatuan
       * dari master Bahan.
       */
      const totalStockValue = bahan.reduce((total, item) => {
        const lastPurchase = item.pembelian?.[0];

        const currentStock = Number(item.stok || 0);

        const lastPurchasePrice = Number(lastPurchase?.hargaPerUnit || 0);

        const masterPrice = Number(item.hargaPerSatuan || 0);

        const price = lastPurchasePrice > 0 ? lastPurchasePrice : masterPrice;

        return total + currentStock * price;
      }, 0);

      /**
       * Format low stock items
       */
      const formattedLowStockItems = lowStockItems.map((item) => {
        const lastPurchase = item.pembelian?.[0];

        const currentStock = Number(item.stok || 0);

        const minimumStock = Number(item.minimum_stok || 0);

        const lastPurchasePrice = Number(lastPurchase?.hargaPerUnit || 0);

        const masterPrice = Number(item.hargaPerSatuan || 0);

        return {
          id: item.id,

          name: item.nama,

          category: item.kategori,

          currentStock,

          minimumStock,

          unit: item.satuan,

          /**
           * Berapa kekurangan stok
           */
          stockDeficit: Math.max(minimumStock - currentStock, 0),

          /**
           * Harga dari master bahan
           */
          masterUnitPrice: masterPrice,

          /**
           * Harga per unit
           * pembelian terakhir
           */
          lastPurchaseUnitPrice: lastPurchasePrice,

          /**
           * Tanggal pembelian terakhir
           */
          lastPurchaseDate: lastPurchase?.tanggal || null,

          /**
           * Supplier terakhir
           */
          lastSupplier: lastPurchase?.supplier
            ? {
                id: lastPurchase.supplier.id,

                name: lastPurchase.supplier.nama,
              }
            : null,
        };
      });

      /**
       * Return response
       */
      return res.json({
        success: true,

        data: {
          /**
           * Summary
           */
          totalItems,

          lowStockCount: lowStockItems.length,

          totalStockValue,

          /**
           * Low stock
           */
          lowStockItems: formattedLowStockItems,
        },
      });
    } catch (error) {
      console.error("Dashboard Inventory Error:", error);

      return res.status(500).json({
        success: false,

        message: "Gagal mengambil inventory",

        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // =====================================================
  // RECENT TRANSACTIONS
  // =====================================================

  getRecentTransactions = async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

      const sales = await prisma.penjualan.findMany({
        take: limit,

        orderBy: {
          createdAt: "desc",
        },

        select: {
          id: true,
          nomorInvoice: true,
          createdAt: true,
          paidAt: true,
          grandTotal: true,
          paymentStatus: true,
          customerName: true,
        },
      });

      const bookings = await prisma.booking.findMany({
        take: limit,

        orderBy: {
          createdAt: "desc",
        },

        select: {
          id: true,
          bookingCode: true,
          createdAt: true,
          bookingDate: true,
          status: true,

          customer: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      const transactions = [
        ...sales.map((sale) => ({
          id: sale.id,
          type: "SALE",
          code: sale.nomorInvoice,
          customerName: sale.customer?.nama || "Umum",
          amount: Number(sale.grandTotal || 0),
          status: sale.paymentStatus,
          createdAt: sale.createdAt,
          paidAt: sale.paidAt,
        })),

        ...bookings.map((booking) => ({
          id: booking.id,
          type: "BOOKING",
          code: booking.bookingCode,
          customerName: booking.customer?.nama || "Umum",
          amount: 0,
          status: booking.status,
          createdAt: booking.createdAt,
          paidAt: null,
          bookingDate: booking.bookingDate,
        })),
      ]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, limit);

      return res.json({
        success: true,
        data: transactions,
      });
    } catch (error) {
      console.error("Dashboard Recent Transactions Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil transaksi terbaru",
      });
    }
  };

  // =====================================================
  // UPCOMING BOOKINGS
  // =====================================================

  getUpcomingBookings = async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

      const now = new Date();

      const bookings = await prisma.booking.findMany({
        where: {
          bookingDate: {
            gte: now,
          },
        },

        take: limit,

        orderBy: {
          bookingDate: "asc",
        },

        select: {
          id: true,
          bookingCode: true,
          bookingDate: true,
          status: true,

          customer: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      const data = bookings.map((booking) => ({
        id: booking.id,

        bookingCode: booking.kodeBooking,

        bookingDate: booking.bookingDate,

        customerName: booking.customer?.nama || "Umum",

        status: booking.status,

        facilities: booking.bookingItems.map((item) => ({
          id: item.facility?.id,

          name: item.facility?.nama,

          quantity: Number(item.quantity || 0),

          subtotal: Number(item.subtotal || 0),
        })),
      }));

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Dashboard Upcoming Bookings Error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil upcoming bookings",
      });
    }
  };
}

module.exports = new DashboardController();
