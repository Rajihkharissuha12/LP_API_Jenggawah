const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const getTotalTransactionToday = async (req, res) => {
  console.log("GET TOTAL INVOICE");
  try {
    // Awal hari ini
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Awal hari besok
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const totalTransactionToday = await prisma.penjualan.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },

        // Tidak menghitung transaksi yang dibatalkan
        status: {
          not: "CANCELLED",
        },
      },
    });

    return res.status(200).json({
      message: "Berhasil mengambil total transaksi hari ini",
      data: {
        totalTransactionToday,
      },
    });
  } catch (error) {
    console.error("Get Total Transaction Today Error:", error);

    return res.status(500).json({
      message: "Gagal mengambil total transaksi hari ini",
      error: error.message,
    });
  }
};

const createPenjualan = async (req, res) => {
  console.log("CREATE PENJUALAN");
  try {
    const adminId = req.user.id;

    const {
      customerName,
      orderType,
      tableNumber,
      discountAmount = 0,
      isTaxEnabled = false,
      taxPercent = 0,
      notes,
      details,
      payment,
    } = req.body;
    console.log(req.body);

    // =========================================
    // 1. VALIDASI BASIC
    // =========================================

    if (!orderType) {
      return res.status(400).json({
        message: "Order type wajib diisi",
      });
    }

    if (!details || details.length === 0) {
      return res.status(400).json({
        message: "Minimal ada satu menu dalam transaksi",
      });
    }

    const isPayNow = payment?.isPayNow === true;

    if (isPayNow && !payment?.method) {
      return res.status(400).json({
        message: "Metode pembayaran wajib diisi",
      });
    }

    // =========================================
    // 2. VALIDASI DINE IN
    // =========================================

    if (orderType === "DINE_IN" && !tableNumber) {
      return res.status(400).json({
        message: "Nomor meja wajib diisi untuk Dine In",
      });
    }

    // =========================================
    // 3. AMBIL MENU
    // =========================================

    const menuIds = details.map((item) => item.menuId);

    const menus = await prisma.menu.findMany({
      where: {
        id: {
          in: menuIds,
        },
        isDeleted: false,
        isActive: true,
      },
      include: {
        recipes: {
          include: {
            bahan: true,
          },
        },
      },
    });

    if (menus.length !== menuIds.length) {
      return res.status(400).json({
        message: "Ada menu yang tidak ditemukan atau tidak aktif",
      });
    }

    // =========================================
    // 4. HITUNG TOTAL
    // =========================================

    let subtotal = 0;
    let totalItem = 0;

    const detailData = [];

    for (const item of details) {
      const menu = menus.find((menu) => menu.id === item.menuId);

      if (!menu) {
        return res.status(400).json({
          message: `Menu ${item.menuId} tidak ditemukan`,
        });
      }

      const qty = Number(item.qty);

      if (!qty || qty <= 0) {
        return res.status(400).json({
          message: `Qty ${menu.nama} tidak valid`,
        });
      }

      const itemSubtotal = menu.hargaJual * qty;

      subtotal += itemSubtotal;
      totalItem += qty;

      detailData.push({
        menuId: menu.id,
        namaMenu: menu.nama,
        hargaJual: menu.hargaJual,
        hpp: menu.hpp,
        qty,
        subtotal: itemSubtotal,
        catatan: item.note || null,

        recipes: {
          create: menu.recipes.map((recipe) => ({
            bahanId: recipe.bahanId,
            namaBahan: recipe.bahan.nama,
            qty: Number(recipe.qty),
            hargaPerUnit: recipe.bahan.hargaPerSatuan,
            totalHpp: Number(recipe.qty) * Number(recipe.bahan.hargaPerSatuan),
          })),
        },
      });
    }

    // =========================================
    // 5. DISKON
    // =========================================

    const discount = Math.max(0, Math.min(Number(discountAmount), subtotal));

    const afterDiscount = subtotal - discount;

    // =========================================
    // 6. PAJAK
    // =========================================

    let taxAmount = 0;

    if (isTaxEnabled) {
      taxAmount = Math.round(afterDiscount * (Number(taxPercent) / 100));
    }

    // =========================================
    // 7. GRAND TOTAL
    // =========================================

    const grandTotal = afterDiscount + taxAmount;

    let paidAmount = 0;
    let changeAmount = 0;

    if (isPayNow) {
      paidAmount = Number(payment.paidAmount || 0);

      if (paidAmount < grandTotal) {
        return res.status(400).json({
          message: "Nominal pembayaran kurang",
          grandTotal,
          paidAmount,
          shortage: grandTotal - paidAmount,
        });
      }

      changeAmount = paidAmount - grandTotal;
    }

    const paymentStatus = isPayNow ? "PAID" : "UNPAID";
    const paidAt = isPayNow ? new Date() : null;

    // =========================================
    // 8. NOMOR INVOICE
    // =========================================

    const now = new Date();

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const dateString = formatter.format(now).replace(/-/g, "");

    // Contoh:
    // TRX-20260722-001

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const totalToday = await prisma.penjualan.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          not: "CANCELLED",
        },
      },
    });

    const sequence = String(totalToday + 1).padStart(3, "0");

    const nomorInvoice = `TRX-${dateString}-${sequence}`;
    console.log(nomorInvoice);

    // =========================================
    // 9. QUEUE NUMBER
    // =========================================

    const queueNumber = String(totalToday + 1);

    // =========================================
    // 10. TRANSACTION
    // =========================================

    const penjualan = await prisma.$transaction(async (tx) => {
      // ==========================================
      // 1. VALIDASI & KURANGI STOK BAHAN
      // ==========================================

      // Map untuk menggabungkan kebutuhan bahan
      // jika dalam satu order ada menu yang menggunakan
      // bahan yang sama.
      const bahanUsageMap = new Map();

      for (const item of details) {
        const menu = menus.find((menu) => menu.id === item.menuId);

        if (!menu) {
          throw new Error(`Menu ${item.menuId} tidak ditemukan`);
        }

        const menuQty = Number(item.qty);

        for (const recipe of menu.recipes) {
          const bahanId = recipe.bahanId;

          // Kebutuhan bahan untuk menu ini
          const kebutuhanBahan = Number(recipe.qty) * menuQty;

          if (bahanUsageMap.has(bahanId)) {
            bahanUsageMap.set(
              bahanId,
              bahanUsageMap.get(bahanId) + kebutuhanBahan,
            );
          } else {
            bahanUsageMap.set(bahanId, kebutuhanBahan);
          }
        }
      }

      // ==========================================
      // 2. CEK STOK SEMUA BAHAN
      // ==========================================

      for (const [bahanId, totalUsage] of bahanUsageMap) {
        const bahan = await tx.bahan.findUnique({
          where: {
            id: bahanId,
          },
        });

        if (!bahan) {
          throw new Error(`Bahan dengan ID ${bahanId} tidak ditemukan`);
        }

        if (bahan.isDeleted) {
          throw new Error(`Bahan ${bahan.nama} sudah dihapus`);
        }

        if (Number(bahan.stok) < totalUsage) {
          throw new Error(
            `Stok bahan ${bahan.nama} tidak cukup. ` +
              `Stok tersedia: ${bahan.stok}, ` +
              `dibutuhkan: ${totalUsage}`,
          );
        }
      }

      // ==========================================
      // 3. KURANGI STOK BAHAN
      // ==========================================

      for (const [bahanId, totalUsage] of bahanUsageMap) {
        await tx.bahan.update({
          where: {
            id: bahanId,
          },
          data: {
            stok: {
              decrement: totalUsage,
            },
          },
        });
      }

      // ==========================================
      // 4. CREATE PENJUALAN
      // ==========================================

      const penjualan = await tx.penjualan.create({
        data: {
          nomorInvoice,
          queueNumber,

          adminId,

          customerName: customerName || null,

          orderType,

          tableNumber: orderType === "DINE_IN" ? tableNumber : null,

          subtotal,

          discountAmount: discount,

          isTaxEnabled,

          taxPercent: isTaxEnabled ? Number(taxPercent) : 0,

          taxRate: isTaxEnabled ? Number(taxPercent) / 100 : 0,

          taxAmount,

          grandTotal,

          status: "PREPARING",

          paymentStatus,

          paidAt,

          notes: notes || null,

          totalItem,

          details: {
            create: detailData,
          },
        },

        include: {
          details: {
            include: {
              recipes: true,
            },
          },
        },
      });

      // ==========================================
      // 5. CREATE PAYMENT
      // HANYA JIKA BAYAR SEKARANG
      // ==========================================

      if (isPayNow) {
        await tx.penjualanPayment.create({
          data: {
            penjualanId: penjualan.id,

            method: payment.method,

            amount: grandTotal,

            paidAmount,

            changeAmount,

            referenceNo: payment.referenceNo || null,

            notes: payment.notes || null,

            proofImagePath: payment.proofImagePath || null,

            proofImageUrl: payment.proofImageUrl || null,
          },
        });
      }

      // ==========================================
      // 6. RETURN PENJUALAN
      // ==========================================

      return tx.penjualan.findUnique({
        where: {
          id: penjualan.id,
        },

        include: {
          details: {
            include: {
              recipes: true,
            },
          },

          payments: true,
        },
      });
    });

    return res.status(201).json({
      message: "Order berhasil dibuat",
      data: penjualan,
    });
  } catch (error) {
    console.error("CREATE PENJUALAN ERROR:", error);

    return res.status(500).json({
      message: "Gagal membuat order",
      error: error.message,
    });
  }
};

const payPenjualan = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      method,
      paidAmount,
      referenceNo,
      notes,
      proofImagePath,
      proofImageUrl,
    } = req.body;

    // ==========================================
    // VALIDASI
    // ==========================================

    if (!method) {
      return res.status(400).json({
        message: "Metode pembayaran wajib diisi",
      });
    }

    const penjualan = await prisma.penjualan.findUnique({
      where: {
        id,
      },
    });

    if (!penjualan) {
      return res.status(404).json({
        message: "Transaksi tidak ditemukan",
      });
    }

    // ==========================================
    // CEK SUDAH DIBAYAR
    // ==========================================

    if (penjualan.paymentStatus === "PAID") {
      return res.status(400).json({
        message: "Transaksi sudah dibayar",
      });
    }

    const amount = penjualan.grandTotal;

    const paid = Number(paidAmount);

    // ==========================================
    // VALIDASI PEMBAYARAN
    // ==========================================

    if (paid < amount) {
      return res.status(400).json({
        message: "Nominal pembayaran kurang",

        grandTotal: amount,

        paidAmount: paid,

        shortage: amount - paid,
      });
    }

    const changeAmount = paid - amount;

    // ==========================================
    // TRANSACTION
    // ==========================================

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.penjualanPayment.create({
        data: {
          penjualanId: penjualan.id,

          method,

          amount,

          paidAmount: paid,

          changeAmount,

          referenceNo: referenceNo || null,

          notes: notes || null,

          proofImagePath: proofImagePath || null,

          proofImageUrl: proofImageUrl || null,
        },
      });

      const updated = await tx.penjualan.update({
        where: {
          id: penjualan.id,
        },

        data: {
          paymentStatus: "PAID",

          paidAt: new Date(),
        },

        include: {
          payments: true,
        },
      });

      return {
        penjualan: updated,

        payment,
      };
    });

    return res.status(200).json({
      success: true,

      message: "Pembayaran berhasil",

      data: result,
    });
  } catch (error) {
    console.error("PAY PENJUALAN ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Gagal memproses pembayaran",

      error: error.message,
    });
  }
};

const getDashboardSummary = async (req, res) => {
  try {
    // ==========================================
    // DATE RANGE
    // ==========================================

    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // ==========================================
    // 1. PENJUALAN HARI INI
    // ==========================================

    const penjualanHariIni = await prisma.penjualan.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },

      include: {
        details: true,
      },

      orderBy: {
        createdAt: "asc",
      },
    });

    // ==========================================
    // 2. PENJUALAN SELESAI / PAID
    // ==========================================

    const penjualanSelesai = penjualanHariIni.filter(
      (penjualan) => penjualan.paymentStatus === "PAID",
    );

    // ==========================================
    // 3. TOTAL PENJUALAN HARI INI
    // ==========================================

    const todaySales = penjualanSelesai.reduce(
      (total, penjualan) => total + penjualan.grandTotal,
      0,
    );

    // ==========================================
    // 4. JUMLAH TRANSAKSI
    // ==========================================

    const transactionCount = penjualanSelesai.length;

    // ==========================================
    // 5. TRANSAKSI PENDING
    // ==========================================

    const pendingTransactions = penjualanHariIni.filter(
      (penjualan) => penjualan.paymentStatus !== "PAID",
    ).length;

    // ==========================================
    // 6. TOP PRODUCTS / MENU TERLARIS
    // ==========================================

    const productMap = new Map();

    for (const penjualan of penjualanSelesai) {
      for (const detail of penjualan.details) {
        const existing = productMap.get(detail.menuId);

        if (existing) {
          existing.quantity += detail.qty;
          existing.revenue += detail.subtotal;
        } else {
          productMap.set(detail.menuId, {
            menuId: detail.menuId,
            name: detail.namaMenu,
            quantity: detail.qty,
            revenue: detail.subtotal,
          });
        }
      }
    }

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // ==========================================
    // 7. PRODUK / MENU TERLARIS
    // ==========================================

    const bestSellingProduct = topProducts.length > 0 ? topProducts[0] : null;

    // ==========================================
    // 8. DETAIL MENU TERLARIS
    // Ambil foto dan harga dari tabel Menu
    // ==========================================

    const topMenuIds = topProducts.map((item) => item.menuId);

    const menus = await prisma.menu.findMany({
      where: {
        id: {
          in: topMenuIds,
        },
      },

      select: {
        id: true,
        nama: true,
        foto: true,
        hargaJual: true,
      },
    });

    const bestSellingMenus = topProducts.map((item) => {
      const menu = menus.find((menu) => menu.id === item.menuId);

      return {
        menuId: item.menuId,

        nama: menu?.nama || item.name,

        foto: menu?.foto || null,

        hargaJual: menu?.hargaJual || 0,

        totalTerjual: item.quantity,

        revenue: item.revenue,
      };
    });

    // ==========================================
    // 9. SALES CHART PER JAM
    // ==========================================

    const salesByHour = Array.from({ length: 24 }, (_, hour) => ({
      hour: `${String(hour).padStart(2, "0")}:00`,

      sales: 0,
    }));

    for (const penjualan of penjualanSelesai) {
      const hour = new Date(penjualan.createdAt).getHours();

      salesByHour[hour].sales += penjualan.grandTotal;
    }

    // ==========================================
    // 10. AMBIL SEMUA BAHAN AKTIF
    // ==========================================

    const semuaBahan = await prisma.bahan.findMany({
      where: {
        isDeleted: false,
      },

      select: {
        id: true,
        nama: true,
        kategori: true,
        stok: true,
        minimum_stok: true,
        satuan: true,
        hargaPerSatuan: true,
      },

      orderBy: {
        stok: "asc",
      },
    });

    // ==========================================
    // 11. STOK BAHAN MENIPIS
    // ==========================================

    const lowStock = semuaBahan
      .filter((item) => {
        return item.stok > 0 && item.stok <= item.minimum_stok;
      })
      .map((item) => ({
        id: item.id,

        nama: item.nama,

        kategori: item.kategori,

        satuan: item.satuan,

        stok: item.stok,

        minimumStok: item.minimum_stok,

        kekurangan: Math.max(item.minimum_stok - item.stok, 0),

        status: "LOW_STOCK",
      }));

    // ==========================================
    // 12. STOK HABIS
    // ==========================================

    const outOfStock = semuaBahan
      .filter((item) => item.stok <= 0)
      .map((item) => ({
        id: item.id,

        nama: item.nama,

        kategori: item.kategori,

        satuan: item.satuan,

        stok: item.stok,

        minimumStok: item.minimum_stok,

        kekurangan: item.minimum_stok,

        status: "OUT_OF_STOCK",
      }));

    // ==========================================
    // 13. TOTAL BAHAN MENIPIS + HABIS
    // ==========================================

    const lowStockCount = lowStock.length;

    const outOfStockCount = outOfStock.length;

    const totalStockAlert = lowStockCount + outOfStockCount;

    // ==========================================
    // ==========================================
    // 14. CASH SUMMARY
    // ==========================================

    // ==========================================
    // KAS MASUK
    // Dari pembayaran transaksi hari ini
    // ==========================================

    const pembayaranHariIni = await prisma.penjualanPayment.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },

        // Hanya transaksi yang sudah dibayar
        penjualan: {
          paymentStatus: "PAID",
        },
      },

      select: {
        paidAmount: true,
        amount: true,
        changeAmount: true,
      },
    });
    console.log(pembayaranHariIni);

    const cashIn = pembayaranHariIni.reduce(
      (total, payment) =>
        total + Number(payment.paidAmount) - Number(payment.changeAmount),
      0,
    );
    console.log(cashIn);

    // ==========================================
    // KAS KELUAR
    // Dari pembelian bahan hari ini
    // ==========================================

    const pembelianBahanHariIni = await prisma.pembelianBahan.findMany({
      where: {
        tanggal: {
          gte: startOfDay,
          lte: endOfDay,
        },

        // Abaikan data pembelian yang dihapus
        isDeleted: false,
      },

      select: {
        hargaTotal: true,
      },
    });

    const cashOut = pembelianBahanHariIni.reduce(
      (total, pembelian) => total + Number(pembelian.hargaTotal),
      0,
    );

    // ==========================================
    // SALDO KAS
    // ==========================================

    const balance = cashIn - cashOut;

    // ==========================================
    // 15. NOTIFICATIONS
    // ==========================================

    const notifications = [];

    // ==========================================
    // NOTIFICATION STOK HABIS
    // ==========================================

    for (const bahan of outOfStock) {
      notifications.push({
        id: `out-stock-${bahan.id}`,

        type: "OUT_OF_STOCK",

        message: `${bahan.nama} sudah habis`,

        createdAt: new Date(),
      });
    }

    // ==========================================
    // NOTIFICATION STOK MENIPIS
    // ==========================================

    for (const bahan of lowStock) {
      notifications.push({
        id: `low-stock-${bahan.id}`,

        type: "LOW_STOCK",

        message:
          `${bahan.nama} tersisa ` +
          `${bahan.stok} ` +
          `${String(bahan.satuan)}`,

        createdAt: new Date(),
      });
    }

    // ==========================================
    // NOTIFICATION PENDING TRANSACTION
    // ==========================================

    if (pendingTransactions > 0) {
      notifications.push({
        id: "pending-transactions",

        type: "PENDING_TRANSACTION",

        message: `${pendingTransactions} transaksi belum dibayar`,

        createdAt: new Date(),
      });
    }

    // ==========================================
    // 16. RESPONSE DASHBOARD
    // ==========================================

    return res.status(200).json({
      success: true,

      data: {
        // ======================================
        // KPI
        // ======================================

        kpi: {
          todaySales,

          transactionCount,

          bestSellingProduct,

          pendingTransactions,

          lowStockCount,

          outOfStockCount,

          totalStockAlert,
        },

        // ======================================
        // SALES CHART
        // ======================================

        salesChart: {
          period: "today",

          data: salesByHour,
        },

        // ======================================
        // TOP PRODUCTS
        // ======================================

        topProducts,

        // ======================================
        // MENU TERLARIS
        // ======================================

        bestSellingMenus,

        // ======================================
        // STOK MENIPIS
        // ======================================

        lowStock,

        // ======================================
        // STOK HABIS
        // ======================================

        outOfStock,

        // ======================================
        // CASH
        // ======================================

        cashSummary: {
          cashIn,

          cashOut,

          balance,
        },

        // ======================================
        // NOTIFICATIONS
        // ======================================

        notifications,
      },
    });
  } catch (error) {
    console.error("Dashboard Error:", error);

    return res.status(500).json({
      success: false,

      message: "Gagal mengambil data dashboard",

      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const getDataTransactionToday = async (req, res) => {
  try {
    // Awal hari ini
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Awal hari besok
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const transactionToday = await prisma.penjualan.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      message: "Berhasil mengambil data transaksi hari ini",
      data: {
        transactionToday,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Gagal mengambil  transaksi hari ini",
      error: error.message,
    });
  }
};

const updateStatusPenjualan = async (req, res) => {
  console.log("UPDATE STATUS ORDER");
  try {
    const { id } = req.params;
    const { status } = req.body;

    const update = await prisma.penjualan.update({
      data: {
        status,
      },
      where: {
        id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil data transaksi hari ini",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil  transaksi hari ini",
      error: error.message,
    });
  }
};

module.exports = {
  getTotalTransactionToday,
  getDataTransactionToday,
  createPenjualan,
  getDashboardSummary,
  payPenjualan,
  updateStatusPenjualan,
};
