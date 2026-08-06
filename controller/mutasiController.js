// controllers/inventoryMutasi.controller.ts

const { PrismaClient, Prisma } = require("@prisma/client");

const prisma = new PrismaClient();

const createAdjustment = async (req, res) => {
  try {
    const { bahanId, stokFisik, keterangan } = req.body;

    if (!bahanId) {
      return res.status(400).json({
        message: "Bahan wajib dipilih.",
      });
    }

    if (stokFisik === undefined || stokFisik === null) {
      return res.status(400).json({
        message: "Stok fisik wajib diisi.",
      });
    }

    if (!keterangan) {
      return res.status(400).json({
        message: "Keterangan wajib diisi.",
      });
    }

    const bahan = await prisma.bahan.findUnique({
      where: {
        id: bahanId,
      },
    });

    if (!bahan) {
      return res.status(404).json({
        message: "Bahan tidak ditemukan.",
      });
    }

    const stokSebelum = bahan.stok;

    const stokSesudah = Number(stokFisik);

    const selisih = stokSesudah - stokSebelum;

    await prisma.$transaction(async (tx) => {
      await tx.bahan.update({
        where: {
          id: bahan.id,
        },
        data: {
          stok: stokSesudah,
        },
      });

      await tx.stokMutasi.create({
        data: {
          bahanId: bahan.id,

          jenis: "ADJUSTMENT",

          qty: selisih,

          stokSetelah: stokSesudah,

          keterangan,
        },
      });
    });

    return res.status(201).json({
      success: true,
      message: "Adjustment berhasil disimpan.",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server.",
    });
  }
};

const getStatisticMutasi = async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const data = await prisma.stokMutasi.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        jenis: true,
      },
    });

    const masuk = data.filter((i) => i.jenis === "MASUK").length;

    const keluar = data.filter((i) => i.jenis === "KELUAR").length;

    const adjustment = data.filter((i) => i.jenis === "ADJUSTMENT").length;

    return res.status(200).json({
      success: true,
      message: "Berhasil get statistic",
      data: {
        masuk,
        keluar,
        adjustment,
        total: data.length,
      },
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getMutasi = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const skip = (page - 1) * limit;

    const search = (req.query.search || "").trim();

    const jenis = (req.query.jenis || "").trim();

    const where = {
      isDeleted: false,
    };

    if (jenis) {
      where.jenis = jenis;
    }

    if (search) {
      where.OR = [
        {
          bahan: {
            nama: {
              contains: search,
              mode: "insensitive",
            },
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

    const total = await prisma.stokMutasi.count({
      where,
    });

    const data = await prisma.stokMutasi.findMany({
      where,

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
        createdAt: "desc",
      },

      skip,
      take: limit,
    });

    return res.status(200).json({
      success: true,
      data,

      pagination: {
        page,
        limit,
        total,
        totalPage: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = { createAdjustment, getStatisticMutasi, getMutasi };
