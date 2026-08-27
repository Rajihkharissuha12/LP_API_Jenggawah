const { toZonedTime, fromZonedTime } = require("date-fns-tz");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const TIMEZONE = "Asia/Jakarta";

function getYesterdayRangeWIB() {
  const now = new Date();

  const start = toZonedTime(now, TIMEZONE);
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const startOfYesterday = fromZonedTime(start, TIMEZONE);

  const end = toZonedTime(now, TIMEZONE);
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  const endOfYesterday = fromZonedTime(end, TIMEZONE);

  return { startOfYesterday, endOfYesterday };
}

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
    const take = Number(limit);

    const bahan = await prisma.bahan.findMany({
      where: {
        isDeleted: false,
        OR: [
          { nama: { contains: search, mode: "insensitive" } },
          { kategori: { contains: search, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });

    // ---- Ambil SO KEMARIN untuk bahan-bahan di halaman ini ----
    const bahanIds = bahan.map((b) => b.id);
    const lastByBahan = new Map();

    if (bahanIds.length > 0) {
      const { startOfYesterday, endOfYesterday } = getYesterdayRangeWIB();

      const details = await prisma.stockOpnameDetail.findMany({
        where: {
          bahanId: { in: bahanIds },
          stockOpname: {
            isDeleted: false,
            status: "COMPLETED",
            // KUNCI: hanya SO tanggal kemarin
            tanggal: { gte: startOfYesterday, lte: endOfYesterday },
          },
        },
        select: {
          bahanId: true,
          stokFisik: true,
          stokSistem: true,
          selisih: true,
          stockOpname: { select: { nomor: true, tanggal: true } },
        },
        // kalau (edge) ada >1 SO kemarin, ambil yang paling baru dibuat
        orderBy: [
          { stockOpname: { tanggal: "desc" } },
          { stockOpname: { createdAt: "desc" } },
        ],
      });

      console.log(details);

      for (const d of details) {
        if (!lastByBahan.has(d.bahanId)) lastByBahan.set(d.bahanId, d);
      }
    }

    // ---- Gabungkan ke tiap bahan ----
    const data = bahan.map((b) => {
      const last = lastByBahan.get(b.id);

      return {
        ...b,
        lastOpname: last
          ? {
              nomor: last.stockOpname.nomor,
              tanggal: last.stockOpname.tanggal,
              stokFisik: last.stokFisik,
              stokSistem: last.stokSistem,
              selisih: last.selisih,
            }
          : null,
        // "Belum SO" di sini berarti: KEMARIN tidak dilakukan SO
        statusOpname: last ? "SUDAH_SO" : "Belum SO",
      };
    });

    const nextCursor =
      bahan.length === take ? bahan[bahan.length - 1].id : null;

    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil data bahan",
      data,
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
