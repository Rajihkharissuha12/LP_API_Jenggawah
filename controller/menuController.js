const { PrismaClient, Prisma } = require("@prisma/client");

const prisma = new PrismaClient();

const createMenuCategory = async (req, res) => {
  try {
    const { nama, deskripsi, isActive } = req.body;

    if (!nama) {
      return res.status(400).json({
        success: false,
        message: "Nama kategori wajib diisi.",
      });
    }

    const exist = await prisma.menuCategory.findFirst({
      where: {
        nama: {
          equals: nama.trim(),
          mode: "insensitive",
        },
        isDeleted: false,
      },
    });

    if (exist) {
      return res.status(400).json({
        success: false,
        message: "Kategori sudah ada.",
      });
    }

    const category = await prisma.menuCategory.create({
      data: {
        nama: nama.trim(),
        deskripsi,
        isActive: isActive ?? true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Kategori berhasil ditambahkan.",
      data: category,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const getAllMenuCategory = async (req, res) => {
  console.log("GET ALL MENU CATEGORY");
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = req.query.search || "";

    const skip = (page - 1) * limit;

    const where = {
      isDeleted: false,
      ...(search && {
        nama: {
          contains: search,
          mode: "insensitive",
        },
      }),
    };

    const [data, total] = await Promise.all([
      prisma.menuCategory.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),

      prisma.menuCategory.count({
        where,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil data kategori menu.",
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const updateMenuCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, deskripsi, isActive } = req.body;

    if (!nama || !nama.trim()) {
      return res.status(400).json({
        success: false,
        message: "Nama kategori wajib diisi.",
      });
    }

    const category = await prisma.menuCategory.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori menu tidak ditemukan.",
      });
    }

    const duplicate = await prisma.menuCategory.findFirst({
      where: {
        nama: {
          equals: nama.trim(),
          mode: "insensitive",
        },
        id: {
          not: id,
        },
        isDeleted: false,
      },
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Nama kategori sudah digunakan.",
      });
    }

    const updated = await prisma.menuCategory.update({
      where: {
        id,
      },
      data: {
        nama: nama.trim(),
        deskripsi,
        isActive,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Kategori berhasil diperbarui.",
      data: updated,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const getMenuCategoryById = async (req, res) => {
  try {
    console.log("GET MENU CATEGORY BY ID");
    const { id } = req.params;

    const category = await prisma.menuCategory.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori menu tidak ditemukan.",
      });
    }

    return res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const deleteMenuCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await prisma.menuCategory.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      include: {
        _count: {
          select: {
            menus: true,
          },
        },
      },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori menu tidak ditemukan.",
      });
    }

    if (category._count.menus > 0) {
      return res.status(400).json({
        success: false,
        message: "Kategori masih digunakan oleh menu dan tidak dapat dihapus.",
      });
    }

    await prisma.menuCategory.update({
      where: {
        id,
      },
      data: {
        isDeleted: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Kategori berhasil dihapus.",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const createMenu = async (req, res) => {
  console.log("tambah menu");
  try {
    const {
      categoryId,
      nama,
      deskripsi,
      foto,
      hargaJual,
      isActive = true,
      recipe,
    } = req.body;

    // ===================================
    // VALIDATION
    // ===================================

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Kategori wajib dipilih.",
      });
    }

    if (!nama || nama.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Nama menu wajib diisi.",
      });
    }

    if (!hargaJual || Number(hargaJual) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Harga jual tidak valid.",
      });
    }

    if (!Array.isArray(recipe) || recipe.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Recipe wajib diisi.",
      });
    }

    // ===================================
    // DUPLIKAT MENU
    // ===================================

    const menuExist = await prisma.menu.findFirst({
      where: {
        nama: nama.trim(),
        isDeleted: false,
      },
    });

    if (menuExist) {
      return res.status(400).json({
        success: false,
        message: "Nama menu sudah digunakan.",
      });
    }

    // ===================================
    // VALIDASI CATEGORY
    // ===================================

    const category = await prisma.menuCategory.findFirst({
      where: {
        id: categoryId,
        isDeleted: false,
        isActive: true,
      },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori menu tidak ditemukan.",
      });
    }

    // ===================================
    // VALIDASI DUPLIKAT BAHAN
    // ===================================

    const bahanIds = recipe.map((item) => item.bahanId);

    const uniqueIds = [...new Set(bahanIds)];

    if (uniqueIds.length !== bahanIds.length) {
      return res.status(400).json({
        success: false,
        message: "Terdapat bahan yang dipilih lebih dari satu kali.",
      });
    }

    // ===================================
    // AMBIL DATA BAHAN
    // ===================================

    const bahanList = await prisma.bahan.findMany({
      where: {
        id: {
          in: bahanIds,
        },
        isDeleted: false,
      },
    });

    if (bahanList.length !== recipe.length) {
      return res.status(400).json({
        success: false,
        message: "Ada bahan yang tidak ditemukan.",
      });
    }

    // ===================================
    // HITUNG HPP
    // ===================================

    const hpp = recipe.reduce((total, item) => {
      const bahan = bahanList.find((b) => b.id === item.bahanId);

      if (!bahan) return total;

      return total + Number(bahan.hargaPerSatuan) * Number(item.qty);
    }, 0);

    // ===================================
    // HITUNG MARGIN
    // ===================================

    const marginNominal = Number(hargaJual) - hpp;

    const marginPersen =
      Number(hargaJual) > 0
        ? Number(((marginNominal / Number(hargaJual)) * 100).toFixed(2))
        : 0;

    // ===================================
    // TRANSACTION
    // ===================================

    const menu = await prisma.$transaction(async (tx) => {
      const newMenu = await tx.menu.create({
        data: {
          categoryId,

          nama: nama.trim(),

          deskripsi,

          foto,

          hargaJual: hargaJual,

          hpp: hpp,

          marginNominal: marginNominal,

          marginPersen: marginPersen,

          isActive,
        },
      });

      await tx.menuRecipe.createMany({
        data: recipe.map((item) => ({
          menuId: newMenu.id,
          bahanId: item.bahanId,
          qty: new Prisma.Decimal(item.qty),
        })),
      });

      return await tx.menu.findUnique({
        where: {
          id: newMenu.id,
        },
        include: {
          category: true,
          recipes: {
            include: {
              bahan: true,
            },
          },
        },
      });
    });

    return res.status(201).json({
      success: true,
      message: "Menu berhasil ditambahkan.",
      data: menu,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const landingMenu = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 9,
      search = "",
      category = "",
      status = "",
    } = req.query;

    const currentPage = Number(page);
    const take = Number(limit);
    const skip = (currentPage - 1) * take;

    const where = {
      isDeleted: false,

      ...(search && {
        nama: {
          contains: search,
          mode: "insensitive",
        },
      }),

      ...(category && {
        categoryId: category,
      }),

      ...(status !== "" && {
        isActive: status === "true",
      }),
    };

    const [menu, total] = await prisma.$transaction([
      prisma.menu.findMany({
        where,

        include: {
          category: {
            select: {
              id: true,
              nama: true,
            },
          },

          recipes: {
            select: {
              id: true,
              qty: true,

              bahan: {
                select: {
                  id: true,
                  nama: true,
                  stok: true,
                  minimum_stok: true,
                  satuan: true,
                  isDeleted: true,
                },
              },
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },

        skip,
        take,
      }),

      prisma.menu.count({
        where,
      }),
    ]);

    // ==========================================
    // TAMBAHKAN WARNING STOK
    // ==========================================

    const menuWithWarning = menu.map((item) => {
      const warning = item.recipes
        .filter((recipe) => {
          const bahan = recipe.bahan;

          // Bahan sudah dihapus
          if (bahan.isDeleted) {
            return false;
          }

          // Stok <= minimum stok
          return bahan.stok <= bahan.minimum_stok;
        })
        .map((recipe) => {
          const bahan = recipe.bahan;

          return {
            bahanId: bahan.id,
            nama: bahan.nama,
            stok: bahan.stok,
            minimumStok: bahan.minimum_stok,
            satuan: bahan.satuan,

            status: bahan.stok <= 0 ? "OUT_OF_STOCK" : "LOW_STOCK",
          };
        });

      return {
        ...item,

        warning,
      };
    });

    return res.status(200).json({
      success: true,

      message: "Berhasil mengambil data menu",

      data: menuWithWarning,

      pagination: {
        page: currentPage,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
};

const getAllMenu = async (req, res) => {
  console.log("SEMUA MENU");
  const adminId = req.user.id;

  try {
    const {
      page = 1,
      limit = 9,
      search = "",
      category = "",
      status = "",
      kasir = "",
    } = req.query;

    const currentPage = Number(page);
    const take = Number(limit);
    const skip = (currentPage - 1) * take;

    const where = {
      isDeleted: false,

      ...(search && {
        nama: {
          contains: search,
          mode: "insensitive",
        },
      }),

      ...(category && {
        categoryId: category,
      }),

      ...(status !== "" && {
        isActive: status === "true",
      }),
    };

    const [menu, total] = await prisma.$transaction([
      prisma.menu.findMany({
        where,

        include: {
          category: {
            select: {
              id: true,
              nama: true,
            },
          },

          recipes: {
            select: {
              id: true,
              qty: true,

              bahan: {
                select: {
                  id: true,
                  nama: true,
                  stok: true,
                  minimum_stok: true,
                  satuan: true,
                  isDeleted: true,
                },
              },
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },

        skip,
        take,
      }),

      prisma.menu.count({
        where,
      }),
    ]);

    // ==========================================
    // TAMBAHKAN WARNING STOK
    // ==========================================

    const menuWithWarning = menu.map((item) => {
      const warning = item.recipes
        .filter((recipe) => {
          const bahan = recipe.bahan;

          // Bahan sudah dihapus
          if (bahan.isDeleted) {
            return false;
          }

          // Stok <= minimum stok
          return bahan.stok <= bahan.minimum_stok;
        })
        .map((recipe) => {
          const bahan = recipe.bahan;

          return {
            bahanId: bahan.id,
            nama: bahan.nama,
            stok: bahan.stok,
            minimumStok: bahan.minimum_stok,
            satuan: bahan.satuan,

            status: bahan.stok <= 0 ? "OUT_OF_STOCK" : "LOW_STOCK",
          };
        });

      return {
        ...item,

        warning,
      };
    });

    let sisaCash;
    if (kasir !== "false") {
      const shift = await prisma.cashSession.findFirst({
        where: {
          adminId: adminId,
          status: "OPEN",
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      sisaCash = shift.openingCash;
    }

    return res.status(200).json({
      success: true,

      message: "Berhasil mengambil data menu",

      data: menuWithWarning,
      sisaCash: sisaCash,

      pagination: {
        page: currentPage,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
};

const getMenuById = async (req, res) => {
  try {
    const { id } = req.params;

    const menu = await prisma.menu.findFirst({
      where: {
        id,
        isDeleted: false,
      },

      include: {
        category: {
          select: {
            id: true,
            nama: true,
          },
        },

        recipes: {
          include: {
            bahan: {
              select: {
                id: true,
                nama: true,
                kategori: true,
                satuan: true,
                hargaPerSatuan: true,
              },
            },
          },
        },
      },
    });

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil detail menu.",
      data: menu,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const getDetailMenu = async (req, res) => {
  console.log("DETAIL MENUS");
  try {
    const { id } = req.params;

    const menu = await prisma.menu.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      include: {
        category: {
          select: {
            id: true,
            nama: true,
          },
        },
        recipes: {
          include: {
            bahan: {
              select: {
                id: true,
                nama: true,
                satuan: true,
                hargaPerSatuan: true,
              },
            },
          },
        },
      },
    });

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan",
      });
    }

    const recipes = menu.recipes.map((recipe) => ({
      id: recipe.id,
      qty: Number(recipe.qty),
      subtotal: Number(recipe.qty) * Number(recipe.bahan.hargaPerSatuan),
      bahan: recipe.bahan,
    }));

    return res.status(200).json({
      success: true,
      message: "Detail menu berhasil diambil",
      data: {
        id: menu.id,
        nama: menu.nama,
        deskripsi: menu.deskripsi,
        foto: menu.foto,
        hargaJual: Number(menu.hargaJual),
        hpp: Number(menu.hpp),
        marginNominal: Number(menu.marginNominal),
        marginPersen: Number(menu.marginPersen),
        isActive: menu.isActive,
        createdAt: menu.createdAt,
        updatedAt: menu.updatedAt,

        category: menu.category,

        totalRecipe: recipes.length,

        recipes,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

const updateMenu = async (req, res) => {
  try {
    const { id } = req.params;

    const { categoryId, nama, deskripsi, foto, hargaJual, isActive, recipe } =
      req.body;

    // =========================
    // VALIDATION
    // =========================

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Kategori wajib dipilih.",
      });
    }

    if (!nama || nama.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Nama menu wajib diisi.",
      });
    }

    if (!hargaJual || Number(hargaJual) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Harga jual tidak valid.",
      });
    }

    if (!Array.isArray(recipe) || recipe.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Recipe wajib diisi.",
      });
    }

    // =========================
    // CEK MENU
    // =========================

    const menu = await prisma.menu.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan.",
      });
    }

    // =========================
    // CEK DUPLIKAT NAMA
    // =========================

    const duplicate = await prisma.menu.findFirst({
      where: {
        id: {
          not: id,
        },
        nama: nama.trim(),
        isDeleted: false,
      },
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "Nama menu sudah digunakan.",
      });
    }

    // =========================
    // CEK KATEGORI
    // =========================

    const category = await prisma.menuCategory.findFirst({
      where: {
        id: categoryId,
        isDeleted: false,
        isActive: true,
      },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan.",
      });
    }

    // =========================
    // VALIDASI DUPLIKAT BAHAN
    // =========================

    const bahanIds = recipe.map((item) => item.bahanId);

    if (new Set(bahanIds).size !== bahanIds.length) {
      return res.status(400).json({
        success: false,
        message: "Terdapat bahan yang dipilih lebih dari satu kali.",
      });
    }

    // =========================
    // AMBIL DATA BAHAN
    // =========================

    const bahanList = await prisma.bahan.findMany({
      where: {
        id: {
          in: bahanIds,
        },
        isDeleted: false,
      },
    });

    if (bahanList.length !== recipe.length) {
      return res.status(400).json({
        success: false,
        message: "Ada bahan yang tidak ditemukan.",
      });
    }

    // =========================
    // HITUNG HPP
    // =========================

    const hpp = recipe.reduce((total, item) => {
      const bahan = bahanList.find((b) => b.id === item.bahanId);

      if (!bahan) return total;

      return total + Number(bahan.hargaPerSatuan) * Number(item.qty);
    }, 0);

    // =========================
    // HITUNG MARGIN
    // =========================

    const marginNominal = Number(hargaJual) - hpp;

    const marginPersen =
      Number(hargaJual) > 0
        ? Number(((marginNominal / Number(hargaJual)) * 100).toFixed(2))
        : 0;

    // =========================
    // TRANSACTION
    // =========================

    const updatedMenu = await prisma.$transaction(async (tx) => {
      await tx.menu.update({
        where: {
          id,
        },

        data: {
          categoryId,

          nama: nama.trim(),

          deskripsi,

          foto,

          hargaJual: new Prisma.Decimal(hargaJual),

          hpp: new Prisma.Decimal(hpp),

          marginNominal: new Prisma.Decimal(marginNominal),

          marginPersen: new Prisma.Decimal(marginPersen),

          isActive,
        },
      });

      await tx.menuRecipe.deleteMany({
        where: {
          menuId: id,
        },
      });

      await tx.menuRecipe.createMany({
        data: recipe.map((item) => ({
          menuId: id,

          bahanId: item.bahanId,

          qty: new Prisma.Decimal(item.qty),
        })),
      });

      return tx.menu.findUnique({
        where: {
          id,
        },

        include: {
          category: true,

          recipes: {
            include: {
              bahan: true,
            },
          },
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: "Menu berhasil diperbarui.",
      data: updatedMenu,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const deleteMenu = async (req, res) => {
  try {
    const { id } = req.params;

    // =========================
    // CEK MENU
    // =========================

    const menu = await prisma.menu.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu tidak ditemukan.",
      });
    }

    // =========================
    // CEK PRODUKSI
    // =========================

    const production = await prisma.production.findFirst({
      where: {
        menuId: id,
      },
    });

    if (production) {
      return res.status(400).json({
        success: false,
        message:
          "Menu tidak dapat dihapus karena sudah pernah digunakan pada data produksi.",
      });
    }

    // =========================
    // SOFT DELETE
    // =========================

    await prisma.menu.update({
      where: {
        id,
      },

      data: {
        isDeleted: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Menu berhasil dihapus.",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const getListHpp = async (req, res) => {
  try {
    const {
      page = "1",
      limit = "10",
      search = "",
      categoryId,
      status,
      sort = "nama",
      order = "asc",
    } = req.query;

    const currentPage = Number(page);
    const take = Number(limit);
    const skip = (currentPage - 1) * take;

    const where = {
      isDeleted: false,
    };

    if (search) {
      where.nama = {
        contains: String(search),
        mode: "insensitive",
      };
    }

    if (categoryId) {
      where.categoryId = String(categoryId);
    }

    if (status !== undefined) {
      where.isActive = status === "active";
    }

    const menus = await prisma.menu.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            nama: true,
          },
        },
        _count: {
          select: {
            recipes: true,
          },
        },
      },
      orderBy: {
        [String(sort)]: order === "desc" ? "desc" : "asc",
      },
      skip,
      take,
    });

    const totalMenu = await prisma.menu.count({
      where: {
        isDeleted: false,
      },
    });

    const total = await prisma.menu.count({
      where,
    });

    const aggregate = await prisma.menu.aggregate({
      where: {
        isDeleted: false,
      },
      _avg: {
        hpp: true,
        hargaJual: true,
        marginPersen: true,
      },
      _max: {
        hpp: true,
        hargaJual: true,
      },
    });

    const lowMarginMenu = await prisma.menu.count({
      where: {
        isDeleted: false,
        marginPersen: {
          lt: 30,
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "List HPP berhasil diambil",

      statistics: {
        totalMenu,

        averageMargin: Number(aggregate._avg.marginPersen ?? 0),

        averageHpp: Number(aggregate._avg.hpp ?? 0),

        averageSellingPrice: Number(aggregate._avg.hargaJual ?? 0),

        highestHpp: Number(aggregate._max.hpp ?? 0),

        highestSellingPrice: Number(aggregate._max.hargaJual ?? 0),

        lowMarginMenu,
      },

      data: menus,

      pagination: {
        total,
        page: currentPage,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("LIST HPP", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
};

module.exports = {
  // Menu Category
  createMenuCategory,
  getAllMenuCategory,
  updateMenuCategory,
  getMenuCategoryById,
  deleteMenuCategory,

  //   Menu
  createMenu,
  getAllMenu,
  getMenuById,
  updateMenu,
  deleteMenu,
  getDetailMenu,
  getListHpp,
  landingMenu,
};
