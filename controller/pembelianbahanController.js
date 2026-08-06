const { PrismaClient, Role } = require("@prisma/client");
const prisma = new PrismaClient();

const createPembelianBahan = async (req, res) => {
  try {
    const {
      tanggal,
      supplier,
      bahanId,
      qtyBeli,
      satuanBeli,
      isiPerSatuan,
      hargaSatuan,
      hargaTotal,
      hargaPerunit,
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
      return res.status(400).json({
        message: "Data tidak lengkap",
      });
    }

    // ============================
    // TRANSACTION
    // ============================

    const result = await prisma.$transaction(async (tx) => {
      // =====================================
      // 1. AMBIL BAHAN
      // =====================================

      const dataBahan = await tx.bahan.findFirst({
        where: {
          id: bahanId,
          isDeleted: false,
        },
      });

      if (!dataBahan) {
        throw new Error("Bahan tidak ditemukan");
      }

      // =====================================
      // 2. HITUNG STOK BARU
      // =====================================

      const qtyMasuk = Number(qtyBeli) * Number(isiPerSatuan);

      const qtySetelah = Number(dataBahan.stok) + qtyMasuk;

      // =====================================
      // 3. UPDATE BAHAN
      // =====================================

      const updateBahan = await tx.bahan.update({
        where: {
          id: bahanId,
        },

        data: {
          stok: qtySetelah,

          hargaPerSatuan: Number(hargaSatuan),
        },
      });

      // =====================================
      // 4. INSERT PEMBELIAN
      // =====================================

      const pembelian = await tx.pembelianBahan.create({
        data: {
          tanggal: new Date(tanggal),

          supplierId: supplier,

          bahanId,

          qtyBeli: Number(qtyBeli),

          satuanBeli,

          isiPerSatuan: Number(isiPerSatuan),

          hargaSatuan: Number(hargaPerunit),

          hargaTotal: Number(hargaTotal),

          hargaPerUnit: Number(hargaSatuan),

          imgStrukUrl: imgStrukUrl || null,

          imgStrukPath: imgStrukPath || null,

          imgBarangUrl: imgBarangUrl || null,

          imgBarangPath: imgBarangPath || null,
        },
      });

      // =====================================
      // 5. CREATE STOK MUTASI
      // =====================================

      await tx.stokMutasi.create({
        data: {
          bahanId,

          jenis: "MASUK",

          qty: qtyMasuk,

          stokSetelah: qtySetelah,

          keterangan: "Pembelian bahan baru",
        },
      });

      // =====================================
      // 6. CARI MENU YANG TERDAMPAK
      // =====================================

      const affectedRecipes = await tx.menuRecipe.findMany({
        where: {
          bahanId: bahanId,

          menu: {
            isDeleted: false,
          },
        },

        select: {
          menuId: true,
        },

        distinct: ["menuId"],
      });

      // =====================================
      // 7. AMBIL ID MENU
      // =====================================

      const menuIds = affectedRecipes.map((recipe) => recipe.menuId);

      // =====================================
      // 8. UPDATE HPP SEMUA MENU
      // =====================================

      for (const menuId of menuIds) {
        // =================================
        // 1. AMBIL SEMUA RECIPE MENU
        // =================================

        const recipes = await tx.menuRecipe.findMany({
          where: {
            menuId,
          },
          include: {
            bahan: true,
          },
        });

        // =================================
        // 2. HITUNG TOTAL HPP
        // =================================

        let totalHpp = 0;

        for (const recipe of recipes) {
          const qtyRecipe = Number(recipe.qty);

          const hargaBahan = Number(recipe.bahan.hargaPerSatuan);

          const subtotalHpp = qtyRecipe * hargaBahan;

          totalHpp += subtotalHpp;
        }

        // =================================
        // 3. AMBIL MENU
        // =================================

        const menu = await tx.menu.findUnique({
          where: {
            id: menuId,
          },
        });

        if (!menu) {
          continue;
        }

        // =================================
        // 4. HARGA JUAL
        // =================================

        const hargaJual = Number(menu.hargaJual);

        // =================================
        // 5. MARGIN NOMINAL
        // =================================

        const marginNominal = hargaJual - totalHpp;

        // =================================
        // 6. MARGIN PERSEN
        // =================================

        const marginPersen =
          hargaJual > 0 ? Math.round((marginNominal / hargaJual) * 100) : 0;

        // =================================
        // 7. UPDATE MENU
        // =================================

        await tx.menu.update({
          where: {
            id: menuId,
          },

          data: {
            hpp: Math.round(totalHpp),

            marginNominal: Math.round(marginNominal),

            marginPersen: marginPersen,
          },
        });
      }

      return {
        pembelian,

        affectedMenus: menuIds.length,
      };
    });

    // =====================================
    // RESPONSE
    // =====================================

    return res.status(201).json({
      success: true,

      message: "Pembelian berhasil dibuat dan HPP menu berhasil diperbarui",

      data: result,
    });
  } catch (error) {
    console.error("CREATE PEMBELIAN ERROR:", error);

    return res.status(500).json({
      success: false,

      message: "Gagal membuat pembelian bahan",

      error: error instanceof Error ? error.message : "Unknown error",
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
