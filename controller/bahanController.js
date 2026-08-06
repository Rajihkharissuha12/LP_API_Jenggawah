const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const tambahBahan = async (req, res) => {
  console.log("TAMBAH BAHAN");
  try {
    const { nama, kategori, satuan, minimum_stok } = req.body;

    // Validasi
    if (!nama || !kategori || !satuan || !minimum_stok) {
      return res.status(400).json({
        success: false,
        message: "Semua field wajib diisi",
      });
    }

    // Cek nama bahan
    const cekBahan = await prisma.bahan.findFirst({
      where: {
        nama,
        isDeleted: false,
      },
    });

    if (cekBahan) {
      return res.status(400).json({
        success: false,
        message: "Bahan sudah terdaftar",
      });
    }

    const bahan = await prisma.bahan.create({
      data: {
        nama,
        kategori,
        satuan,
        minimum_stok: Number(minimum_stok),
      },
    });

    return res.status(201).json({
      success: true,
      message: "Berhasil menambahkan bahan",
      data: bahan,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
};

const getAllBahan = async (req, res) => {
  try {
    const { search = "", cursor, limit = 20 } = req.query;

    const bahan = await prisma.bahan.findMany({
      where: {
        isDeleted: false,
        OR: [
          {
            nama: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            kategori: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      },

      orderBy: {
        createdAt: "desc",
      },

      take: Number(limit),

      ...(cursor && {
        skip: 1,
        cursor: {
          id: cursor,
        },
      }),
    });

    const nextCursor =
      bahan.length === Number(limit) ? bahan[bahan.length - 1].id : null;

    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil data bahan",
      data: bahan,
      nextCursor,
      hasMore: nextCursor !== null,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
};

const updateBahan = async (req, res) => {
  try {
    const { id } = req.params;

    const { nama, kategori, satuan, minimum_stok } = req.body;

    const bahan = await prisma.bahan.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!bahan) {
      return res.status(404).json({
        success: false,
        message: "Bahan tidak ditemukan",
      });
    }

    const namaSudahAda = await prisma.bahan.findFirst({
      where: {
        nama,
        isDeleted: false,
        NOT: {
          id,
        },
      },
    });

    if (namaSudahAda) {
      return res.status(400).json({
        success: false,
        message: "Nama bahan sudah digunakan",
      });
    }

    const update = await prisma.bahan.update({
      where: {
        id,
      },
      data: {
        nama,
        kategori,
        satuan,
        minimum_stok: Number(minimum_stok),
      },
    });

    return res.json({
      success: true,
      message: "Berhasil mengubah bahan",
      data: update,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
};

const getDetailBahan = async (req, res) => {
  try {
    const { id } = req.params;

    const bahan = await prisma.bahan.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!bahan) {
      return res.status(404).json({
        success: false,
        message: "Bahan tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      data: bahan,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
};

module.exports = {
  tambahBahan,
  getAllBahan,
  updateBahan,
  getDetailBahan,
};
