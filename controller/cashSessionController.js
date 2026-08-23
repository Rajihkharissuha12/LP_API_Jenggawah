const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const cekSessionByIdAdmin = async (req, res) => {
  const { id } = req.params;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  try {
    const getSession = await prisma.cashSession.findFirst({
      where: {
        adminId: id,
        closedAt: null,
        openedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
    console.log(getSession);
    console.log(!!getSession);

    const findTransaction = await prisma.penjualan.findMany({
      where: {
        adminId: id,
        paymentStatus: "PAID",
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        payments: true,
      },
    });

    const paymentSummary = {
      cash: {
        count: 0,
        total: 0,
      },
      transfer: {
        count: 0,
        total: 0,
      },
      qris: {
        count: 0,
        total: 0,
      },
    };

    for (const transaction of findTransaction) {
      for (const payment of transaction.payments) {
        const amount =
          Number(payment.paidAmount) - Number(payment.changeAmount);

        switch (payment.method) {
          case "CASH":
            paymentSummary.cash.count += 1;
            paymentSummary.cash.total += amount;
            break;

          case "TRANSFER":
            paymentSummary.transfer.count += 1;
            paymentSummary.transfer.total += amount;
            break;

          case "QRIS":
            paymentSummary.qris.count += 1;
            paymentSummary.qris.total += amount;
            break;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Success get Session",
      data: {
        status: !!getSession,
        payment: paymentSummary,
        session: getSession,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data session",
      error: error.message,
    });
  }
};

const getAllSession = async (req, res) => {
  console.log("GET ALL SHIFT");

  try {
    const {
      search = "",
      status = "ALL",
      cursor = null,
      limit = 20,
    } = req.query;

    const take = Math.min(Number(limit) || 20, 100);

    // =====================================================
    // WHERE
    // =====================================================

    const where = {
      isdeleted: false,

      ...(status !== "ALL" && {
        status,
      }),

      ...(search && {
        admin: {
          username: {
            contains: search,
            mode: "insensitive",
          },
        },
      }),
    };

    // =====================================================
    // GET SESSION
    // =====================================================

    const getSession = await prisma.cashSession.findMany({
      where,

      take: take + 1,

      ...(cursor && {
        skip: 1,
        cursor: {
          id: cursor,
        },
      }),

      orderBy: {
        createdAt: "desc",
      },

      include: {
        admin: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // =====================================================
    // CEK DATA BERIKUTNYA
    // =====================================================

    const hasMore = getSession.length > take;

    const sessions = hasMore ? getSession.slice(0, take) : getSession;

    const nextCursor = hasMore
      ? (sessions[sessions.length - 1]?.id ?? null)
      : null;

    // =====================================================
    // HITUNG DURASI SHIFT
    // =====================================================

    const data = sessions.map((session) => {
      let duration = null;

      // Hanya hitung untuk shift yang sudah ditutup
      if (session.closedAt !== null) {
        const openedAt = new Date(session.openedAt);
        const closedAt = new Date(session.closedAt);

        const durationMs = closedAt.getTime() - openedAt.getTime();

        const totalMinutes = Math.floor(durationMs / (1000 * 60));

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        duration = {
          totalMinutes,
          hours,
          minutes,
          formatted:
            hours > 0 ? `${hours} jam ${minutes} menit` : `${minutes} menit`,
        };
      }

      return {
        ...session,
        duration,
      };
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      message: "Success get Session",
      data,

      pagination: {
        hasMore,
        nextCursor,
        limit: take,
      },
    });
  } catch (error) {
    console.error("GET ALL CASH SESSION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data session",
      error: error.message,
    });
  }
};

const openShift = async (req, res) => {
  console.log("OPEN SHIFT");
  const { openingCash, id } = req.body;

  try {
    const openshift = await prisma.cashSession.create({
      data: {
        adminId: id,
        openingCash: openingCash,
        openedAt: new Date(),
      },
    });
    return res.status(200).json({
      success: true,
      message: "Success create Session",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Gagal open shift",
      error: error.message,
    });
  }
};

const closeShift = async (req, res) => {
  console.log("CLOSE SHIFT");

  const { id, closingCash } = req.body;

  try {
    // ==========================================
    // 1. VALIDASI
    // ==========================================

    if (closingCash === undefined || closingCash === null) {
      return res.status(400).json({
        success: false,
        message: "Saldo akhir wajib diisi",
      });
    }

    const actualClosingCash = Number(closingCash);

    if (Number.isNaN(actualClosingCash) || actualClosingCash < 0) {
      return res.status(400).json({
        success: false,
        message: "Saldo akhir tidak valid",
      });
    }

    // ==========================================
    // 2. CARI SHIFT YANG MASIH OPEN
    // ==========================================

    const session = await prisma.cashSession.findFirst({
      where: {
        adminId: id,
        status: "OPEN",
        isdeleted: false,
      },
      orderBy: {
        openedAt: "desc",
      },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Tidak ada shift yang sedang aktif",
      });
    }

    // ==========================================
    // 3. AMBIL TRANSAKSI SELAMA SHIFT
    // ==========================================

    const payments = await prisma.penjualanPayment.findMany({
      where: {
        createdAt: {
          gte: session.openedAt,
          lte: new Date(),
        },

        penjualan: {
          paymentStatus: "PAID",
          adminId: id,
        },
      },

      select: {
        paidAmount: true,
        changeAmount: true,
        method: true,
      },
    });

    // ==========================================
    // 4. HITUNG PENJUALAN
    // ==========================================

    let cashTotal = 0;
    let transferTotal = 0;
    let qrisTotal = 0;

    for (const payment of payments) {
      const amount =
        Number(payment.paidAmount) - Number(payment.changeAmount ?? 0);

      switch (payment.method) {
        case "CASH":
          cashTotal += amount;
          break;

        case "TRANSFER":
          transferTotal += amount;
          break;

        case "QRIS":
          qrisTotal += amount;
          break;
      }
    }

    const totalNonCashSales = transferTotal + qrisTotal;

    // ==========================================
    // 5. AMBIL CASH IN / CASH OUT
    // ==========================================

    const totalCashIn = Number(session.totalCashIn ?? 0);
    const totalCashOut = Number(session.totalCashOut ?? 0);

    // ==========================================
    // 6. EXPECTED CASH
    // ==========================================

    const openingCash = Number(session.openingCash ?? 0);

    const expectedCash = openingCash + cashTotal + totalCashIn - totalCashOut;

    // ==========================================
    // 7. HITUNG SELISIH
    // ==========================================

    const difference = actualClosingCash - expectedCash;

    // ==========================================
    // 8. UPDATE CASH SESSION
    // ==========================================

    const closedSession = await prisma.cashSession.update({
      where: {
        id: session.id,
      },

      data: {
        actualCash: actualClosingCash,
        expectedCash,
        difference,

        totalCashSales: cashTotal,
        totalNonCashSales,

        closedAt: new Date(),
        status: "CLOSE",
      },
    });

    // ==========================================
    // 9. RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,
      message: "Shift berhasil ditutup",

      data: {
        sessionId: closedSession.id,

        openingCash,

        sales: {
          cash: cashTotal,
          transfer: transferTotal,
          qris: qrisTotal,
          nonCash: totalNonCashSales,
        },

        cashIn: totalCashIn,
        cashOut: totalCashOut,

        expectedCash,

        actualCash: actualClosingCash,

        difference,
      },
    });
  } catch (error) {
    console.error("Close Shift Error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menutup shift",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const calculateDuration = (openedAt, closedAt) => {
  if (!closedAt) {
    const totalMinutes = Math.floor((Date.now() - openedAt.getTime()) / 60000);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
      totalMinutes,
      hours,
      minutes,
      formatted: `${hours} jam ${minutes} menit`,
    };
  }

  const totalMinutes = Math.floor(
    (closedAt.getTime() - openedAt.getTime()) / 60000,
  );

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    totalMinutes,
    hours,
    minutes,
    formatted: `${hours} jam ${minutes} menit`,
  };
};

const getCashSessionDetail = async (req, res) => {
  console.log("GET DETAIL SHIFT");
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Cash session ID wajib diisi",
      });
    }

    const cashSession = await prisma.cashSession.findFirst({
      where: {
        id,
        isdeleted: false,
      },

      include: {
        admin: {
          select: {
            id: true,
            username: true,
          },
        },

        penjualans: {
          orderBy: {
            createdAt: "desc",
          },

          include: {
            payments: {
              select: {
                id: true,
                method: true,
                amount: true,
                paidAmount: true,
                changeAmount: true,
                proofImagePath: true,
                proofImageUrl: true,
                referenceNo: true,
                notes: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!cashSession) {
      return res.status(404).json({
        success: false,
        message: "Shift tidak ditemukan",
      });
    }

    const duration = calculateDuration(
      cashSession.openedAt,
      cashSession.closedAt,
    );

    return res.status(200).json({
      success: true,
      message: "Detail shift berhasil diambil",
      data: {
        id: cashSession.id,

        admin: cashSession.admin,

        locationId: cashSession.locationId,

        status: cashSession.status,

        openedAt: cashSession.openedAt,
        closedAt: cashSession.closedAt,

        duration,

        openingCash: cashSession.openingCash,
        expectedCash: cashSession.expectedCash,
        actualCash: cashSession.actualCash,
        difference: cashSession.difference,

        totalCashIn: cashSession.totalCashIn,
        totalCashOut: cashSession.totalCashOut,

        totalCashSales: cashSession.totalCashSales,
        totalNonCashSales: cashSession.totalNonCashSales,

        closingNote: cashSession.closingNote,

        createdAt: cashSession.createdAt,
        updatedAt: cashSession.updatedAt,

        transactions: cashSession.penjualans,
        totalTransactions: cashSession.penjualans.length,
      },
    });
  } catch (error) {
    console.error("GET CASH SESSION DETAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil detail shift",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

module.exports = {
  cekSessionByIdAdmin,
  openShift,
  closeShift,
  getAllSession,
  getCashSessionDetail,
};
