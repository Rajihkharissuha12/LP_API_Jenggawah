const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const getDataOpnameNow = async (req, res) => {
  try {
    const now = new Date();

    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endMonth.setHours(23, 59, 59, 999);

    const opname = await prisma.stockOpname.findFirst({
      where: {
        isDeleted: false,
        tanggal: {
          gte: startMonth,
          lte: endMonth,
        },
      },
      include: {
        details: {
          include: {
            bahan: true,
          },
        },
      },
    });

    if (opname) {
      return res.json({
        success: true,
        alreadyOpname: true,
        data: opname,
      });
    }

    const bahan = await prisma.bahan.findMany({
      where: {
        isDeleted: false,
      },
      orderBy: {
        nama: "asc",
      },
    });

    return res.json({
      success: true,
      alreadyOpname: false,
      data: bahan,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const getStockOpname = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);

    const search = String(req.query.search || "").trim();
    const filter = String(req.query.filter || "BULANAN").toUpperCase();

    const skip = (page - 1) * limit;

    const now = new Date();

    const where = {
      isDeleted: false,
    };

    if (search) {
      where.OR = [
        {
          nomor: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          keterangan: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (filter === "MINGGUAN") {
      const startWeek = new Date(now);

      startWeek.setDate(now.getDate() - now.getDay());

      startWeek.setHours(0, 0, 0, 0);

      const endWeek = new Date(startWeek);

      endWeek.setDate(startWeek.getDate() + 6);

      endWeek.setHours(23, 59, 59, 999);

      where.tanggal = {
        gte: startWeek,
        lte: endWeek,
      };
    }

    if (filter === "BULANAN") {
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      endMonth.setHours(23, 59, 59, 999);

      where.tanggal = {
        gte: startMonth,
        lte: endMonth,
      };
    }

    const total = await prisma.stockOpname.count({
      where,
    });

    const data = await prisma.stockOpname.findMany({
      where,

      include: {
        admin: {
          select: {
            username: true,
          },
        },
      },

      orderBy: {
        tanggal: "desc",
      },

      skip,

      take: limit,
    });

    return res.json({
      success: true,

      data,

      pagination: {
        page,
        limit,
        total,
        totalPage: Math.ceil(total / limit),
        hasNext: skip + limit < total,
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

const createStockOpname = async (req, res) => {
  try {
    const adminId = req.user.id;

    const { tanggal, keterangan, items } = req.body;

    if (!tanggal) {
      return res.status(400).json({
        message: "Tanggal wajib diisi",
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({
        message: "Data bahan tidak boleh kosong",
      });
    }

    const nomor = `SO-${Date.now()}`;

    const result = await prisma.$transaction(async (tx) => {
      const header = await tx.stockOpname.create({
        data: {
          nomor,
          tanggal: new Date(tanggal),
          status: "COMPLETED",
          keterangan,
          createdBy: adminId,
          totalBarang: items.length,
          totalSelisih: 0,
        },
      });

      let totalSelisih = 0;

      for (const item of items) {
        const bahan = await tx.bahan.findUnique({
          where: {
            id: item.bahanId,
          },
        });

        if (!bahan) {
          throw new Error("Bahan tidak ditemukan");
        }

        const stokSistem = bahan.stok;
        const stokFisik = Number(item.stokFisik);

        const selisih = stokFisik - stokSistem;

        await tx.stockOpnameDetail.create({
          data: {
            stockOpnameId: header.id,
            bahanId: bahan.id,
            stokSistem,
            stokFisik,
            selisih,
            catatan: item.catatan || null,
          },
        });

        if (selisih !== 0) {
          totalSelisih++;

          await tx.bahan.update({
            where: {
              id: bahan.id,
            },
            data: {
              stok: stokFisik,
            },
          });

          await tx.stokMutasi.create({
            data: {
              bahanId: bahan.id,
              jenis: "ADJUSTMENT",
              qty: selisih,
              stokSetelah: stokFisik,
              keterangan: `Stock Opname ${nomor}`,
            },
          });
        }
      }

      await tx.stockOpname.update({
        where: {
          id: header.id,
        },
        data: {
          totalSelisih,
        },
      });

      return header;
    });

    return res.status(201).json({
      success: true,
      message: "Stock Opname berhasil disimpan",
      data: result,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getDetailStockOpname = async (req, res) => {
  try {
    const { id } = req.params;

    const opname = await prisma.stockOpname.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      include: {
        admin: {
          select: {
            id: true,
            username: true,
          },
        },
        details: {
          include: {
            bahan: {
              select: {
                id: true,
                nama: true,
                kategori: true,
                satuan: true,
              },
            },
          },
          orderBy: {
            bahan: {
              nama: "asc",
            },
          },
        },
      },
    });

    if (!opname) {
      return res.status(404).json({
        success: false,
        message: "Data stock opname tidak ditemukan.",
      });
    }

    const totalBarang = opname.details.length;

    const totalSelisih = opname.details.reduce(
      (total, item) => total + Math.abs(item.selisih),
      0,
    );

    const selisihPositif = opname.details.filter(
      (item) => item.selisih > 0,
    ).length;

    const selisihNegatif = opname.details.filter(
      (item) => item.selisih < 0,
    ).length;

    return res.json({
      success: true,
      data: {
        ...opname,
        summary: {
          totalBarang,
          totalSelisih,
          selisihPositif,
          selisihNegatif,
        },
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

module.exports = {
  getDataOpnameNow,
  createStockOpname,
  getStockOpname,
  getDetailStockOpname,
};
