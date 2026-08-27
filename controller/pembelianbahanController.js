const { PrismaClient, Role } = require("@prisma/client");
const { options } = require("../routes/penjualanRoutes");
const prisma = new PrismaClient();

async function recalcMenuHpp(tx, menuId) {
  const recipes = await tx.menuRecipe.findMany({
    where: { menuId },
    include: { bahan: true },
  });

  const totalHpp = recipes.reduce(
    (sum, r) => sum + Number(r.qty) * Number(r.bahan.hargaPerSatuan),
    0,
  );

  const menu = await tx.menu.findUnique({ where: { id: menuId } });
  if (!menu) return;

  const hargaJual = Number(menu.hargaJual);
  const marginNominal = hargaJual - totalHpp;
  const marginPersen =
    hargaJual > 0 ? Math.round((marginNominal / hargaJual) * 100) : 0;

  await tx.menu.update({
    where: { id: menuId },
    data: {
      hpp: Math.round(totalHpp),
      marginNominal: Math.round(marginNominal),
      marginPersen,
    },
  });
}

const createPembelianBahan = async (req, res) => {
  try {
    const {
      tanggal,
      supplier,
      bahanId,
      qtyBeli,
      satuanBeli,
      isiPerSatuan,
      hargaSatuan, // harga per unit terkecil (per PCS) -> dipakai HPP
      hargaPerunit, // harga per satuan pembelian (per DUS)
      optional, // [BARU] array biaya tambahan
      imgStrukUrl,
      imgStrukPath,
      imgBarangUrl,
      imgBarangPath,
    } = req.body;

    // ============================
    // VALIDATION
    // ============================
    if (
      !tanggal ||
      !supplier ||
      !bahanId ||
      !qtyBeli ||
      !satuanBeli ||
      !isiPerSatuan ||
      !hargaSatuan ||
      !hargaPerunit
    ) {
      return res.status(400).json({ message: "Data tidak lengkap" });
    }

    // ============================
    // [BARU] NORMALISASI BIAYA OPTIONAL (server-side, tidak percaya client)
    // ============================
    const optionalItems = Array.isArray(optional)
      ? optional
          .filter(
            (it) =>
              it &&
              typeof it.nama === "string" &&
              it.nama.trim() &&
              Number(it.harga) > 0,
          )
          .map((it) => ({ nama: it.nama.trim(), harga: Number(it.harga) }))
      : [];

    const totalOptional = optionalItems.reduce((t, it) => t + it.harga, 0);

    // [FIX] Total dihitung server: (qty * harga per satuan beli) + biaya tambahan.
    const hargaTotalBahan = Number(qtyBeli) * Number(hargaPerunit);
    const hargaTotalFinal = hargaTotalBahan + totalOptional;

    // ============================
    // TRANSACTION
    // ============================
    const result = await prisma.$transaction(async (tx) => {
      // 1. AMBIL BAHAN
      const dataBahan = await tx.bahan.findFirst({
        where: { id: bahanId, isDeleted: false },
      });
      if (!dataBahan) throw new Error("Bahan tidak ditemukan");

      // 2. HITUNG STOK BARU (qty beli * isi per satuan)
      const qtyMasuk = Number(qtyBeli) * Number(isiPerSatuan);
      const qtySetelah = Number(dataBahan.stok) + qtyMasuk;

      // 3. UPDATE BAHAN (stok + harga per unit terkecil untuk HPP)
      await tx.bahan.update({
        where: { id: bahanId },
        data: {
          stok: qtySetelah,
          hargaPerSatuan: Number(hargaSatuan), // per PCS -> dasar HPP
        },
      });

      // 4. INSERT PEMBELIAN
      // PERIKSA: pemetaan hargaSatuan/hargaPerUnit di bawah "menyilang"
      // dari nama field-nya (warisan kode lama). Aku pertahankan supaya
      // data lama tidak berubah artinya. Kalau ternyata keliru, tinggal
      // tukar dua baris bertanda (*).
      const pembelian = await tx.pembelianBahan.create({
        data: {
          tanggal: new Date(tanggal),
          supplierId: supplier,
          bahanId,
          qtyBeli: Number(qtyBeli),
          satuanBeli,
          isiPerSatuan: Number(isiPerSatuan),

          hargaSatuan: Number(hargaPerunit), // (*) per satuan beli (DUS)
          hargaPerUnit: Number(hargaSatuan), // (*) per unit terkecil (PCS)

          hargaTotal: hargaTotalFinal, // [FIX] termasuk biaya tambahan
          optional: optionalItems, // [BARU] JSON
          totalOptional, // [BARU]

          imgStrukUrl: imgStrukUrl || null,
          imgStrukPath: imgStrukPath || null,
          imgBarangUrl: imgBarangUrl || null,
          imgBarangPath: imgBarangPath || null,
        },
      });

      // 5. CATAT MUTASI STOK
      await tx.stokMutasi.create({
        data: {
          bahanId,
          jenis: "MASUK",
          qty: qtyMasuk,
          stokSetelah: qtySetelah,
          keterangan: "Pembelian bahan baru",
        },
      });

      // 6. CARI MENU TERDAMPAK (yang resepnya pakai bahan ini)
      const affectedRecipes = await tx.menuRecipe.findMany({
        where: { bahanId, menu: { isDeleted: false } },
        select: { menuId: true },
        distinct: ["menuId"],
      });

      // 7-8. [CLEAN] RECALC HPP tiap menu terdampak (via helper)
      const menuIds = affectedRecipes.map((r) => r.menuId);
      for (const menuId of menuIds) {
        await recalcMenuHpp(tx, menuId);
      }

      return { pembelian, affectedMenus: menuIds.length };
    });

    return res.status(201).json({
      success: true,
      message: "Pembelian berhasil dibuat dan HPP menu berhasil diperbarui",
      data: result,
    });
  } catch (error) {
    console.error("CREATE PEMBELIAN ERROR:", error);

    // [FIX] error bisnis -> 400
    const msg = error instanceof Error ? error.message : "Unknown error";
    const isBusiness =
      msg.includes("tidak ditemukan") || msg.includes("tidak lengkap");

    return res.status(isBusiness ? 400 : 500).json({
      success: false,
      message: isBusiness ? msg : "Gagal membuat pembelian bahan",
      error: msg,
    });
  }
};

const getPembelianBahan = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      supplierId,
      bahanId,
    } = req.query;

    const currentPage = Number(page);
    const take = Number(limit);
    const skip = (currentPage - 1) * take;

    const where = {
      isDeleted: false,

      ...(supplierId && {
        supplierId: String(supplierId),
      }),

      ...(bahanId && {
        bahanId: String(bahanId),
      }),

      ...(search && {
        OR: [
          {
            supplier: {
              nama: {
                contains: String(search),
                mode: "insensitive",
              },
            },
          },
          {
            bahan: {
              nama: {
                contains: String(search),
                mode: "insensitive",
              },
            },
          },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.pembelianBahan.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              nama: true,
            },
          },
          bahan: {
            select: {
              id: true,
              nama: true,
              satuan: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take,
      }),

      prisma.pembelianBahan.count({
        where,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil data pembelian bahan",
      data,
      pagination: {
        page: currentPage,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data pembelian bahan",
      error: error.message,
    });
  }
};

const getDetailPembelianBahan = async (req, res) => {
  try {
    const { id } = req.params;

    const pembelian = await prisma.pembelianBahan.findFirst({
      where: {
        id,
        isDeleted: false,
      },

      include: {
        supplier: {
          select: {
            id: true,
            nama: true,
          },
        },

        bahan: {
          select: {
            id: true,
            nama: true,
            satuan: true,
          },
        },
      },
    });

    if (!pembelian) {
      return res.status(404).json({
        success: false,
        message: "Data pembelian bahan tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil detail pembelian bahan",
      data: {
        id: pembelian.id,

        tanggal: pembelian.tanggal,

        supplier: pembelian.supplier,

        bahan: pembelian.bahan,

        qtyBeli: pembelian.qtyBeli,

        satuanBeli: pembelian.satuanBeli,

        isiPerSatuan: pembelian.isiPerSatuan,

        hargaSatuan: Number(pembelian.hargaSatuan),

        hargaTotal: Number(pembelian.hargaTotal),

        hargaPerUnit: Number(pembelian.hargaPerUnit),

        optional: pembelian.optional,

        totalOptional: pembelian.totalOptional,

        imgBarang: pembelian.imgBarangUrl,

        imgBarangPath: pembelian.imgBarangPath,

        imgStruk: pembelian.imgStrukUrl,

        imgStrukPath: pembelian.imgStrukPath,

        createdAt: pembelian.createdAt,

        updatedAt: pembelian.updatedAt,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil detail pembelian bahan",
      error: error.message,
    });
  }
};

const editPembelianBahan = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      tanggal,
      supplier,
      bahanId,
      qtyBeli,
      satuanBeli,
      isiPerSatuan,
      hargaSatuan,
      hargaTotal,

      imgBarangUrl,
      imgBarangPath,

      imgStrukUrl,
      imgStrukPath,
    } = req.body;

    const existing = await prisma.pembelianBahan.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Data pembelian bahan tidak ditemukan",
      });
    }

    const pembelian = await prisma.pembelianBahan.update({
      where: {
        id,
      },

      data: {
        tanggal: new Date(tanggal),

        supplierId: supplier,

        bahanId,

        qtyBeli: Number(qtyBeli),

        satuanBeli,

        isiPerSatuan: Number(isiPerSatuan),

        hargaSatuan: Number(hargaSatuan),

        hargaTotal: Number(hargaTotal),

        imgBarangUrl,

        imgBarangPath,

        imgStrukUrl,

        imgStrukPath,
      },

      include: {
        supplier: {
          select: {
            id: true,
            nama: true,
          },
        },

        bahan: {
          select: {
            id: true,
            nama: true,
            satuan: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Pembelian bahan berhasil diperbarui",
      data: pembelian,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Gagal memperbarui pembelian bahan",
      error: error.message,
    });
  }
};

module.exports = {
  createPembelianBahan,
  getPembelianBahan,
  getDetailPembelianBahan,
  editPembelianBahan,
};
