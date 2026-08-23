const { PrismaClient } = require("@prisma/client");
const { fromZonedTime, toZonedTime } = require("date-fns-tz");

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

    const configtax = await prisma.config.findFirst({
      where: {
        name: "tax",
      },
    });
    console.log(configtax);

    return res.status(200).json({
      message: "Berhasil mengambil total transaksi hari ini",
      data: {
        totalTransactionToday,
        configtax: configtax.value,
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
      grandTotal,
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

    const timeZone = "Asia/Jakarta";

    const now = new Date();

    // Tetap untuk nomor invoice
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const dateString = formatter.format(now).replace(/-/g, "");

    // Awal hari WIB
    const start = toZonedTime(now, timeZone);
    start.setHours(0, 0, 0, 0);
    const startOfDay = fromZonedTime(start, timeZone);

    // Akhir hari WIB
    const end = toZonedTime(now, timeZone);
    end.setHours(23, 59, 59, 999);
    const endOfDay = fromZonedTime(end, timeZone);

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

    const penjualan = await prisma.$transaction(
      async (tx) => {
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
        // 4. CREATE Session
        // ==========================================

        const createSession = await tx.cashSession.findFirst({
          where: {
            adminId: adminId,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        // ==========================================
        // 4. CREATE PENJUALAN
        // ==========================================

        const penjualan = await tx.penjualan.create({
          data: {
            nomorInvoice,
            queueNumber,

            adminId,

            cashSessionId: createSession.id,

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
        const get = await prisma.cashSession.findFirst({
          where: {
            adminId: adminId,
            status: "OPEN",
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (payment.method === "CASH") {
          await prisma.cashSession.update({
            where: {
              id: get.id,
            },
            data: {
              openingCash: {
                increment: payment.paidAmount,
              },
              totalCashIn: {
                increment: grandTotal,
              },
            },
          });
        }

        if (changeAmount > 0 && payment.method === "CASH") {
          await prisma.cashSession.update({
            where: {
              id: get.id,
            },
            data: {
              openingCash: {
                decrement: payment.changeAmount,
              },
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
      },
      {
        timeout: 15000,
      },
    );
    console.log("PENJUALAN BERHASIL DI BUAT");

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

const updatePenjualanItems = async (req, res) => {
  console.log("UPDATE PENJUALAN ITEMS");

  try {
    const { id } = req.params;
    const { payload } = req.body;
    const items = payload.items;
    const payment = payload.payment;
    const service = payload.service;
    console.log(payment);
    console.log(payload.service);

    // =====================================================
    // 1. VALIDASI REQUEST
    // =====================================================

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID transaksi wajib diisi",
      });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Items harus berupa array",
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Minimal ada satu menu dalam transaksi",
      });
    }

    if (payment !== null && payment !== undefined) {
      if (typeof payment !== "object" || Array.isArray(payment)) {
        return res.status(400).json({
          success: false,
          message: "Data payment tidak valid",
        });
      }
    }

    // =====================================================
    // 2. TRANSACTION DATABASE
    // =====================================================

    const result = await prisma.$transaction(async (tx) => {
      // =====================================================
      // 2.1 AMBIL TRANSAKSI LAMA
      // =====================================================

      const transaction = await tx.penjualan.findUnique({
        where: {
          id,
        },
        include: {
          details: {
            include: {
              recipes: true,
            },
          },
        },
      });

      if (!transaction) {
        throw new Error("Transaksi tidak ditemukan");
      }

      // =====================================================
      // 3. VALIDASI MENU BARU
      // =====================================================

      const menuIds = [...new Set(items.map((item) => item.menuId))];

      const menus = await tx.menu.findMany({
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
        throw new Error("Ada menu yang tidak ditemukan atau tidak aktif");
      }

      // =====================================================
      // 4. BUAT MAP MENU
      // =====================================================

      const menuMap = new Map(menus.map((menu) => [menu.id, menu]));

      // =====================================================
      // 5. HITUNG STOK LAMA
      //
      // Stok lama sebelumnya sudah dikurangi ketika
      // transaksi dibuat.
      // =====================================================

      const oldBahanUsage = new Map();

      for (const detail of transaction.details) {
        const menu = menuMap.get(detail.menuId);

        if (!menu) {
          throw new Error(`Menu ${detail.menuId} tidak ditemukan`);
        }

        const qty = Number(detail.qty);

        for (const recipe of menu.recipes) {
          const usage = Number(recipe.qty) * qty;

          const current = oldBahanUsage.get(recipe.bahanId) || 0;

          oldBahanUsage.set(recipe.bahanId, current + usage);
        }
      }

      // =====================================================
      // 6. HITUNG STOK BARU
      // =====================================================

      const newBahanUsage = new Map();

      for (const item of items) {
        const menu = menuMap.get(item.menuId);

        if (!menu) {
          throw new Error(`Menu ${item.menuId} tidak ditemukan`);
        }

        const qty = Number(item.qty);

        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error(`Qty menu ${menu.nama} tidak valid`);
        }

        for (const recipe of menu.recipes) {
          const usage = Number(recipe.qty) * qty;

          const current = newBahanUsage.get(recipe.bahanId) || 0;

          newBahanUsage.set(recipe.bahanId, current + usage);
        }
      }

      // =====================================================
      // 7. HITUNG SELISIH STOK
      //
      // positive = stok harus dikurangi
      // negative = stok harus dikembalikan
      // =====================================================

      const bahanIds = new Set([
        ...oldBahanUsage.keys(),
        ...newBahanUsage.keys(),
      ]);

      const stockChanges = new Map();

      for (const bahanId of bahanIds) {
        const oldUsage = oldBahanUsage.get(bahanId) || 0;

        const newUsage = newBahanUsage.get(bahanId) || 0;

        const difference = newUsage - oldUsage;

        if (difference !== 0) {
          stockChanges.set(bahanId, difference);
        }
      }

      // =====================================================
      // 8. VALIDASI STOK
      // =====================================================

      for (const [bahanId, difference] of stockChanges) {
        // Kalau stok tidak bertambah kebutuhannya,
        // tidak perlu validasi stok tersedia.
        if (difference <= 0) {
          continue;
        }

        const bahan = await tx.bahan.findUnique({
          where: {
            id: bahanId,
          },
        });

        if (!bahan) {
          throw new Error(`Bahan ${bahanId} tidak ditemukan`);
        }

        if (bahan.isDeleted) {
          throw new Error(`Bahan ${bahan.nama} sudah dihapus`);
        }

        if (Number(bahan.stok) < difference) {
          throw new Error(
            `Stok bahan ${bahan.nama} tidak cukup. ` +
              `Stok tersedia: ${bahan.stok}, ` +
              `tambahan dibutuhkan: ${difference}`,
          );
        }
      }

      // =====================================================
      // 9. UPDATE STOK
      // =====================================================

      for (const [bahanId, difference] of stockChanges) {
        await tx.bahan.update({
          where: {
            id: bahanId,
          },
          data: {
            stok:
              difference > 0
                ? {
                    decrement: difference,
                  }
                : {
                    increment: Math.abs(difference),
                  },
          },
        });
      }

      // =====================================================
      // 10. HAPUS DETAIL LAMA
      //
      // recipes detail lama ikut terhapus karena
      // relasi cascade.
      // =====================================================

      await tx.penjualanDetail.deleteMany({
        where: {
          penjualanId: id,
        },
      });

      // =====================================================
      // 11. BUAT DETAIL BARU
      // =====================================================

      const detailData = [];

      let subtotal = 0;
      let totalItem = 0;

      for (const item of items) {
        const menu = menuMap.get(item.menuId);

        if (!menu) {
          throw new Error(`Menu ${item.menuId} tidak ditemukan`);
        }

        const qty = Number(item.qty);

        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error(`Qty menu ${menu.nama} tidak valid`);
        }

        const itemSubtotal = Number(menu.hargaJual) * qty;

        subtotal += itemSubtotal;
        totalItem += qty;

        detailData.push({
          menuId: menu.id,
          namaMenu: menu.nama,
          hargaJual: menu.hargaJual,
          hpp: menu.hpp,
          qty,
          subtotal: itemSubtotal,
          catatan: item.catatan || null,

          recipes: {
            create: menu.recipes.map((recipe) => ({
              bahanId: recipe.bahanId,
              namaBahan: recipe.bahan.nama,
              qty: Number(recipe.qty),
              hargaPerUnit: recipe.bahan.hargaPerSatuan,
              totalHpp:
                Number(recipe.qty) * Number(recipe.bahan.hargaPerSatuan),
            })),
          },
        });
      }

      // =====================================================
      // 12. HITUNG DISKON
      // =====================================================

      const discount = Math.max(
        0,
        Math.min(Number(transaction.discountAmount || 0), subtotal),
      );

      const afterDiscount = subtotal - discount;

      // =====================================================
      // 13. HITUNG PAJAK
      // =====================================================

      let taxAmount = 0;

      if (transaction.isTaxEnabled) {
        taxAmount = Math.round(
          afterDiscount * (Number(transaction.taxPercent || 0) / 100),
        );
      }

      // =====================================================
      // 14. HITUNG GRAND TOTAL
      // =====================================================

      const grandTotal =
        Number(afterDiscount) + Number(taxAmount) + Number(service);
      console.log(afterDiscount);
      console.log(taxAmount);
      console.log(service);

      // Selisih dengan grand total sebelumnya
      const difference = grandTotal - Number(transaction.grandTotal);

      // =====================================================
      // 15. HANDLE PAYMENT
      // =====================================================

      // -----------------------------------------------------
      // PAYMENT TAMBAHAN
      // -----------------------------------------------------

      if (difference > 0) {
        if (!payment) {
          throw new Error("Data pembayaran tambahan wajib diisi");
        }

        if (!payment.method) {
          throw new Error("Metode pembayaran wajib dipilih");
        }

        const paidAmount = Number(payment.paidAmount || 0);

        if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
          throw new Error("Nominal pembayaran tidak valid");
        }

        // Customer minimal harus membayar sebesar
        // selisih transaksi.
        if (paidAmount < difference) {
          throw new Error(
            `Nominal pembayaran tidak cukup. ` +
              `Minimal Rp${difference.toLocaleString("id-ID")}`,
          );
        }

        const changeAmount = Math.max(0, paidAmount - difference);

        // =====================================================
        // UPDATE CASH SESSION
        // =====================================================

        if (payment.method === "CASH") {
          const cashSession = await tx.cashSession.findFirst({
            where: {
              adminId: transaction.adminId,
              status: "OPEN",
              isdeleted: false,
            },
            orderBy: {
              openedAt: "desc",
            },
          });

          if (!cashSession) {
            throw new Error("Cash session yang aktif tidak ditemukan");
          }

          console.log("UANG DI KASIH ", paidAmount);
          console.log("YANG HARUS DI BAYAR ", payment.amount);
          console.log("UANG YANG DI KEMBALIKAN ", payment.changeAmount);
          await tx.cashSession.update({
            where: {
              id: cashSession.id,
            },
            data: {
              openingCash: {
                increment: paidAmount,
              },
              totalCashIn: {
                increment: payment.amount,
              },
            },
          });
        }

        // ---------------------------------------------------
        // NON CASH WAJIB ADA BUKTI
        // ---------------------------------------------------

        if (payment.method !== "CASH") {
          if (!payment.proofImagePath && !payment.proofImageUrl) {
            throw new Error("Bukti transaksi wajib diupload");
          }
        }

        await tx.penjualanPayment.create({
          data: {
            penjualanId: transaction.id,

            method: payment.method,

            // Nominal yang benar-benar menjadi
            // tambahan transaksi.
            amount: difference,

            // Nominal uang yang dibayarkan customer.
            paidAmount,

            // Kembalian.
            changeAmount,

            proofImagePath: payment.proofImagePath || null,

            proofImageUrl: payment.proofImageUrl || null,

            referenceNo: payment.referenceNo || null,

            notes: payment.notes || "Adjust Menu Tambah",
          },
        });
      }

      // -----------------------------------------------------
      // TIDAK ADA SELISIH
      // -----------------------------------------------------

      // difference === 0
      // Tidak perlu membuat payment baru.

      // -----------------------------------------------------
      // REFUND
      // -----------------------------------------------------

      if (difference < 0) {
        const refundAmount = Math.abs(difference);

        const cashSession = await tx.cashSession.findFirst({
          where: {
            adminId: transaction.adminId,
            status: "OPEN",
            isdeleted: false,
          },
          orderBy: {
            openedAt: "desc",
          },
        });

        if (!cashSession) {
          throw new Error("Cash session yang aktif tidak ditemukan");
        }

        await tx.cashSession.update({
          where: {
            id: cashSession.id,
          },
          data: {
            openingCash: {
              decrement: payment.changeAmount,
            },
          },
        });

        await tx.penjualanPayment.create({
          data: {
            penjualanId: transaction.id,

            // Refund sementara menggunakan CASH.
            method: "CASH",

            // Tidak ada pembayaran masuk.
            amount: 0,

            paidAmount: 0,

            // Nilai uang yang harus dikembalikan.
            changeAmount: refundAmount,

            // Untuk refund sementara tidak ada
            // bukti pembayaran masuk.
            proofImagePath: null,
            proofImageUrl: null,
            referenceNo: null,

            notes: payment?.notes || "Adjust Pengembalian",
          },
        });
      }

      // =====================================================
      // 16. UPDATE PENJUALAN
      // =====================================================

      console.log("GRANT total ", grandTotal);
      const updatedTransaction = await tx.penjualan.update({
        where: {
          id,
        },

        data: {
          subtotal,
          discountAmount: discount,
          taxAmount,
          grandTotal,

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

          payments: true,
        },
      });

      return updatedTransaction;
    });

    // =====================================================
    // 17. RESPONSE
    // =====================================================

    console.log("UPDATE PENJUALAN BERHASIL");

    console.log(result);

    return res.status(200).json({
      success: true,
      message: "Pesanan berhasil diperbarui",
      data: result,
    });
  } catch (error) {
    console.error("UPDATE PENJUALAN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Gagal memperbarui pesanan",
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

    const result = await prisma.$transaction(
      async (tx) => {
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
      },
      {
        timeout: 15000,
      },
    );

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
  const adminId = req.user.id;
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
        cashSession: {
          adminId: adminId,
          status: "OPEN",
          closedAt: null,
        },
      },

      include: {
        details: true,
      },

      orderBy: {
        createdAt: "asc",
      },
    });
    console.log("DASHBOARD ", penjualanHariIni);

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
          cashSession: {
            adminId: adminId,
            status: "OPEN",
            closedAt: null,
          },
        },
      },

      select: {
        paidAmount: true,
        amount: true,
        changeAmount: true,
        method: true,
      },
    });

    const cashIn = pembayaranHariIni.reduce(
      (total, payment) =>
        total + Number(payment.paidAmount) - Number(payment.changeAmount),
      0,
    );

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

    for (const payment of pembayaranHariIni) {
      const amount = Number(payment.paidAmount) - Number(payment.changeAmount);

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

          payment: paymentSummary,
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
  const adminId = req.user.id;
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
        cashSession: {
          adminId: adminId,
          status: "OPEN",
          closedAt: null,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    console.log(transactionToday);

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

const getTransactionDetail = async (req, res) => {
  console.log("GET DETAIL TRANSACTION");
  try {
    const { id } = req.params;
    console.log(id);

    if (!id) {
      return res.status(400).json({
        message: "ID transaksi wajib diisi",
      });
    }

    const transaction = await prisma.penjualan.findUnique({
      where: {
        id,
      },

      include: {
        admin: {
          select: {
            id: true,
            username: true,
          },
        },

        cashSession: {
          include: {
            admin: {
              select: {
                username: true,
              },
            },
          },
        },

        details: true,

        payments: true,
      },
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Transaksi tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil detail transaksi",
      data: {
        transaction,
      },
    });
  } catch (error) {
    console.error("GET TRANSACTION DETAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil detail transaksi",
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

const getAllTransaction = async (req, res) => {
  try {
    const {
      search = "",
      status,
      paymentStatus,
      orderType,
      adminId,
      cashSessionId,
      dateFrom,
      dateTo,
      cursor,
      limit = "20",
    } = req.query;

    // =========================
    // PAGINATION
    // =========================
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    // =========================
    // WHERE
    // =========================
    const where = {};

    // =========================
    // SEARCH
    // =========================
    if (search.trim()) {
      const keyword = search.trim();

      where.OR = [
        {
          nomorInvoice: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        {
          queueNumber: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        {
          customerName: {
            contains: keyword,
            mode: "insensitive",
          },
        },
        {
          tableNumber: {
            contains: keyword,
            mode: "insensitive",
          },
        },
      ];
    }

    // =========================
    // FILTER STATUS
    // =========================
    if (status) {
      where.status = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (orderType) {
      where.orderType = orderType;
    }

    // =========================
    // FILTER ADMIN / KASIR
    // =========================
    if (adminId) {
      where.adminId = adminId;
    }

    // =========================
    // FILTER CASH SESSION
    // =========================
    if (cashSessionId) {
      where.cashSessionId = cashSessionId;
    }

    // =========================
    // FILTER TANGGAL
    // =========================
    if (dateFrom || dateTo) {
      where.createdAt = {};

      if (dateFrom) {
        const startDate = new Date(dateFrom);

        if (isNaN(startDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Format dateFrom tidak valid",
          });
        }

        // Mulai dari 00:00:00
        startDate.setHours(0, 0, 0, 0);

        where.createdAt.gte = startDate;
      }

      if (dateTo) {
        const endDate = new Date(dateTo);

        if (isNaN(endDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Format dateTo tidak valid",
          });
        }

        // Sampai 23:59:59
        endDate.setHours(23, 59, 59, 999);

        where.createdAt.lte = endDate;
      }
    }

    // =========================
    // TOTAL DATA
    // =========================
    const total = await prisma.penjualan.count({
      where,
    });

    // =========================
    // QUERY DATA
    // =========================
    const transactions = await prisma.penjualan.findMany({
      where,

      take: parsedLimit + 1,

      ...(cursor
        ? {
            cursor: {
              id: cursor,
            },
            skip: 1,
          }
        : {}),

      orderBy: {
        createdAt: "desc",
      },

      select: {
        id: true,
        nomorInvoice: true,
        queueNumber: true,

        customerName: true,

        orderType: true,
        tableNumber: true,

        subtotal: true,
        discountAmount: true,
        discountPercent: true,

        isTaxEnabled: true,
        taxPercent: true,
        taxRate: true,
        taxAmount: true,

        grandTotal: true,

        status: true,
        notes: true,

        totalItem: true,

        paymentStatus: true,

        paidAt: true,
        printedAt: true,

        createdAt: true,
        updatedAt: true,

        // =========================
        // KASIR
        // =========================
        admin: {
          select: {
            id: true,
            username: true,
          },
        },

        // =========================
        // CASH SESSION
        // =========================
        cashSession: {
          select: {
            admin: {
              select: {
                username: true,
              },
            },
          },
        },

        // =========================
        // DETAIL TRANSAKSI
        // =========================
        details: {
          select: {
            id: true,
            penjualanId: true,
            menuId: true,
            namaMenu: true,
            catatan: true,
            hargaJual: true,
            hpp: true,
            qty: true,
            subtotal: true,
            fotoMenu: true,
            categoryName: true,
            createdAt: true,
            updatedAt: true,
          },
        },

        // =========================
        // PAYMENT
        // =========================
        payments: {
          select: {
            id: true,
            penjualanId: true,

            method: true,

            amount: true,
            paidAmount: true,
            changeAmount: true,
            method: true,

            proofImagePath: true,
            proofImageUrl: true,

            referenceNo: true,
            notes: true,

            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    // =========================
    // CEK HAS MORE
    // =========================
    const hasMore = transactions.length > parsedLimit;

    const data = hasMore ? transactions.slice(0, parsedLimit) : transactions;

    // =====================================================
    // PERHITUNGAN UANG DARI DATA YANG SEDANG DITAMPILKAN
    // =====================================================

    let uangMasuk = 0;
    let uangKeluar = 0;

    for (const transaction of data) {
      // Hanya transaksi yang sudah PAID
      if (transaction.paymentStatus === "PAID") {
        for (const payment of transaction.payments) {
          uangMasuk += Number(payment.amount || 0);
        }
      }
    }

    // =========================
    // NEXT CURSOR
    // =========================
    const nextCursor =
      hasMore && data.length > 0 ? data[data.length - 1].id : null;

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil data transaksi",

      data,

      summary: {
        uangMasuk,
      },

      pagination: {
        total,
        limit: parsedLimit,
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data transaksi",
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
  getAllTransaction,
  getTransactionDetail,
  updatePenjualanItems,
};
