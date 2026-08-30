const { PrismaClient } = require("@prisma/client");
const { toZonedTime, fromZonedTime } = require("date-fns-tz");

const prisma = new PrismaClient();
const TIMEZONE = "Asia/Jakarta";

// Ambil rentang awal & akhir hari ini dalam WIB (hasil dalam UTC Date).
function getTodayRangeWIB() {
  const now = new Date();

  const start = toZonedTime(now, TIMEZONE);
  start.setHours(0, 0, 0, 0);
  const startOfDay = fromZonedTime(start, TIMEZONE);

  const end = toZonedTime(now, TIMEZONE);
  end.setHours(23, 59, 59, 999);
  const endOfDay = fromZonedTime(end, TIMEZONE);

  return { startOfDay, endOfDay };
}

// Rentang tanggal berdasarkan filter (dalam WIB -> UTC Date).
function getRangeByFilter(filter) {
  const now = new Date();

  // Akhir = akhir hari ini WIB
  const endZoned = toZonedTime(now, TIMEZONE);
  endZoned.setHours(23, 59, 59, 999);
  const endOfRange = fromZonedTime(endZoned, TIMEZONE);

  const startZoned = toZonedTime(now, TIMEZONE);

  if (filter === "MINGGUAN") {
    // Awal minggu (Senin) WIB
    const day = startZoned.getDay(); // 0=Minggu ... 6=Sabtu
    const mundur = (day + 6) % 7; // jarak ke Senin
    startZoned.setDate(startZoned.getDate() - mundur);
  } else {
    // BULANAN -> awal bulan berjalan
    startZoned.setDate(1);
  }
  startZoned.setHours(0, 0, 0, 0);
  const startOfRange = fromZonedTime(startZoned, TIMEZONE);

  return { startOfRange, endOfRange };
}

function getTodayInfoWIB() {
  const now = new Date();

  const start = toZonedTime(now, TIMEZONE);
  start.setHours(0, 0, 0, 0);
  const startOfDay = fromZonedTime(start, TIMEZONE);

  const end = toZonedTime(now, TIMEZONE);
  end.setHours(23, 59, 59, 999);
  const endOfDay = fromZonedTime(end, TIMEZONE);

  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replace(/-/g, "");

  return { startOfDay, endOfDay, dateStr };
}

// Label "Minggu ke-N" dari tanggal (WIB).
function labelMinggu(tanggal) {
  const zoned = toZonedTime(new Date(tanggal), TIMEZONE);
  const mingguKe = Math.ceil(zoned.getDate() / 7);
  return `Minggu ke-${mingguKe}`;
}

const cekOpnameHariIni = async (req, res) => {
  try {
    const { startOfDay, endOfDay } = getTodayRangeWIB();

    // SO harian bersifat resto-wide (1 per hari), jadi dicek global.
    // Kalau mau per-admin, tambahkan: createdBy: req.user.id
    const existing = await prisma.stockOpname.findFirst({
      where: {
        isDeleted: false,
        tanggal: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        id: true,
        nomor: true,
        tanggal: true,
        status: true,
      },
    });

    return res.status(200).json({
      success: true,
      alreadyOpname: Boolean(existing),
      data: existing || null,
    });
  } catch (error) {
    console.error("CEK OPNAME ERROR:", error);
    return res.status(500).json({
      success: false,
      alreadyOpname: false,
      message: "Gagal memeriksa status opname",
    });
  }
};

const getAllStockOpname = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

    // filter: MINGGUAN | BULANAN | SEMUA
    const allowed = ["MINGGUAN", "BULANAN", "SEMUA"];
    const filter = allowed.includes(req.query.filter)
      ? req.query.filter
      : "BULANAN";

    const search = (req.query.search || "").trim();

    // SEMUA -> tanpa batas tanggal. Selain itu pakai rentang WIB.
    const rangeFilter =
      filter === "SEMUA"
        ? {}
        : (() => {
            const { startOfRange, endOfRange } = getRangeByFilter(filter);
            return { tanggal: { gte: startOfRange, lte: endOfRange } };
          })();

    const where = {
      isDeleted: false,
      ...rangeFilter,
      ...(search ? { nomor: { contains: search, mode: "insensitive" } } : {}),
    };

    const skip = (page - 1) * limit;

    // Hitung total + ambil data sekaligus (paralel).
    const [total, rows] = await Promise.all([
      prisma.stockOpname.count({ where }),
      prisma.stockOpname.findMany({
        where,
        orderBy: { tanggal: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          nomor: true,
          tanggal: true,
          status: true,
          totalBarang: true,
          totalSelisih: true,
        },
      }),
    ]);

    const data = rows.map((row) => ({
      ...row,
      minggu: labelMinggu(row.tanggal),
    }));

    const hasNext = skip + rows.length < total;

    return res.status(200).json({
      success: true,
      data,
      pagination: { page, limit, total, hasNext },
    });
  } catch (error) {
    console.error("GET ALL OPNAME ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data stock opname",
    });
  }
};

const createStockOpname = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { tanggal, keterangan, items } = req.body;

    // ---- VALIDASI ----
    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Item opname wajib diisi" });
    }

    const { startOfDay, endOfDay, dateStr } = getTodayInfoWIB();

    // ---- GUARD 1 SO/HARI (cek awal, cepat) ----
    const existing = await prisma.stockOpname.findFirst({
      where: {
        isDeleted: false,
        tanggal: { gte: startOfDay, lte: endOfDay },
      },
      select: { id: true, nomor: true },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Stock opname hari ini sudah dibuat (${existing.nomor})`,
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        // ---- Guard ulang di dalam tx (cegah race dua submit) ----
        const dobel = await tx.stockOpname.findFirst({
          where: {
            isDeleted: false,
            tanggal: { gte: startOfDay, lte: endOfDay },
          },
          select: { id: true },
        });
        if (dobel) throw new Error("Stock opname hari ini sudah dibuat");

        // ---- Ambil semua bahan terkait ----
        const bahanIds = [...new Set(items.map((it) => it.bahanId))];
        const bahanList = await tx.bahan.findMany({
          where: { id: { in: bahanIds }, isDeleted: false },
        });
        const bahanMap = new Map(bahanList.map((b) => [b.id, b]));

        // ---- Bangun detail + hitung selisih ----
        const detailData = [];
        let totalSelisih = 0; // jumlah bahan yang TIDAK cocok

        for (const item of items) {
          const bahan = bahanMap.get(item.bahanId);
          if (!bahan) throw new Error(`Bahan ${item.bahanId} tidak ditemukan`);

          const stokFisik = Number(item.stokFisik);
          if (!Number.isFinite(stokFisik) || stokFisik < 0) {
            throw new Error(`Stok fisik ${bahan.nama} tidak valid`);
          }

          const stokSistem = Number(bahan.stok);
          const selisih = stokFisik - stokSistem;
          if (selisih !== 0) totalSelisih += 1;

          detailData.push({
            bahanId: bahan.id,
            stokSistem,
            stokFisik,
            selisih,
            catatan: item.catatan || null,
          });
        }

        // ---- Nomor SO: SO-YYYYMMDD-XXX ----
        const countHariIni = await tx.stockOpname.count({
          where: {
            tanggal: { gte: startOfDay, lte: endOfDay },
            isDeleted: false,
          },
        });
        const nomor = `SO-${dateStr}-${String(countHariIni + 1).padStart(3, "0")}`;

        // ---- Buat StockOpname + detail (status langsung COMPLETED) ----
        const opname = await tx.stockOpname.create({
          data: {
            nomor,
            tanggal: new Date(tanggal),
            status: "COMPLETED",
            totalBarang: items.length,
            totalSelisih,
            keterangan: keterangan || "Stock Opname Harian",
            createdBy: adminId,
            details: { create: detailData },
          },
          include: { details: true },
        });

        // ---- KOREKSI STOK + catat mutasi (hanya yang selisih != 0) ----
        for (const d of detailData) {
          if (d.selisih === 0) continue;

          // set stok bahan = hasil hitung fisik
          await tx.bahan.update({
            where: { id: d.bahanId },
            data: { stok: d.stokFisik },
          });

          // catat mutasi penyesuaian (qty bertanda: + tambah / - kurang)
          await tx.stokMutasi.create({
            data: {
              bahanId: d.bahanId,
              jenis: "ADJUSTMENT",
              qty: d.selisih,
              stokSetelah: d.stokFisik,
              keterangan: `Penyesuaian stock opname ${nomor}`,
            },
          });
        }

        return opname;
      },
      { timeout: 15000 },
    );

    return res.status(201).json({
      success: true,
      message: "Stock opname berhasil disimpan",
      data: result,
    });
  } catch (error) {
    console.error("CREATE OPNAME ERROR:", error);

    const msg = error instanceof Error ? error.message : "Unknown error";
    const isBusiness =
      msg.includes("sudah dibuat") ||
      msg.includes("tidak ditemukan") ||
      msg.includes("tidak valid") ||
      msg.includes("wajib");

    return res
      .status(isBusiness ? (msg.includes("sudah dibuat") ? 409 : 400) : 500)
      .json({
        success: false,
        message: isBusiness ? msg : "Gagal menyimpan stock opname",
      });
  }
};

const getStockOpnameDetail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "ID opname wajib diisi" });
    }

    const opname = await prisma.stockOpname.findFirst({
      where: { id, isDeleted: false },
      include: {
        details: {
          include: {
            // relasi ke Bahan (field 'bahan' di schema Prisma).
            // Kalau nama relasi-mu beda, sesuaikan di sini.
            bahan: { select: { nama: true, satuan: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!opname) {
      return res
        .status(404)
        .json({ success: false, message: "Stock opname tidak ditemukan" });
    }

    // Ambil nama petugas (Admin pakai kolom 'username').
    let createdByName = null;
    if (opname.createdBy) {
      const admin = await prisma.admin.findUnique({
        where: { id: opname.createdBy },
        select: { username: true },
      });
      createdByName = admin?.username ?? null;
    }

    return res.status(200).json({
      success: true,
      data: {
        ...opname,
        createdByName,
      },
    });
  } catch (error) {
    console.error("GET OPNAME DETAIL ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil detail stock opname",
    });
  }
};

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
    console.log("STOK OPNAME ", opname);

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

  getTodayRangeWIB,
  cekOpnameHariIni,
  getAllStockOpname,
  getStockOpnameDetail,
};
