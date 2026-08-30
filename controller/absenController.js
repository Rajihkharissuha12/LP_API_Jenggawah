const { PrismaClient } = require("@prisma/client");
const { fromZonedTime } = require("date-fns-tz");

const prisma = new PrismaClient();
const WIB = "Asia/Jakarta";
const BUCKET = "absensi"; // buat bucket ini di Supabase Storage

// Haversine — jarak 2 titik dalam METER
const hitungJarak = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // radius bumi (m)
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

// GET /absensi/status-hari-ini
const getStatusAbsenHariIni = async (req, res) => {
  console.log("GET STATUS ABSEN HARI INI");
  try {
    // adminId dari token (auth middleware), JANGAN dari query
    const adminId = req.user?.id;
    if (!adminId) {
      return res.status(401).json({ message: "Tidak terautentikasi" });
    }

    // batas hari ini dalam WIB → konversi ke UTC utk query DB
    const now = new Date();
    const wibDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: WIB, // format YYYY-MM-DD di zona WIB
    }).format(now);

    // awal & akhir hari WIB, di-cast ke instant UTC utk kolom `tanggal`
    const startUtc = fromZonedTime(`${wibDateStr}T00:00:00`, WIB);
    const endUtc = fromZonedTime(`${wibDateStr}T23:59:59.999`, WIB);

    // ambil absen hari ini (bisa 0-2 baris: MASUK &/ PULANG)
    const absensi = await prisma.absensi.findMany({
      where: {
        adminId,
        tanggal: { gte: startUtc, lte: endUtc },
      },
      select: { tipe: true, waktu: true, status: true },
    });

    const sudahMasuk = absensi.some((a) => a.tipe === "MASUK");
    const sudahPulang = absensi.some((a) => a.tipe === "PULANG");

    return res.json({
      data: {
        sudahMasuk,
        sudahPulang,
        // aksi berikutnya utk sidebar: MASUK → PULANG → null
        aksiBerikutnya: !sudahMasuk ? "MASUK" : !sudahPulang ? "PULANG" : null,
        detail: absensi, // opsional: utk tampilkan jam absen
      },
    });
  } catch (err) {
    console.error("getStatusAbsenHariIni error:", err);
    return res.status(500).json({ message: "Gagal cek status absen" });
  }
};

// POST /absen  (multipart: tipe, latitude, longitude, foto)
const createAbsen = async (req, res) => {
  console.log("ABSEN");
  try {
    const adminId = req.user?.id; // dari token, JANGAN dari body
    if (!adminId)
      return res.status(401).json({ message: "Tidak terautentikasi" });

    const { tipe, latitude, longitude, fotoUrl, fotoPath } = req.body;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // validasi input
    if (tipe !== "MASUK" && tipe !== "PULANG")
      return res.status(400).json({ message: "Tipe absen tidak valid" });
    if (Number.isNaN(lat) || Number.isNaN(lng))
      return res.status(400).json({ message: "Lokasi tidak valid" });
    if (!fotoUrl || !fotoPath)
      return res.status(400).json({ message: "Foto absen wajib diambil" });

    // tanggal "hari ini" WIB (konsisten dgn status-hari-ini)
    const wibDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: WIB,
    }).format(new Date());
    const tanggal = fromZonedTime(`${wibDateStr}T00:00:00`, WIB);

    // GUARD DUPLIKAT — cek sebelum upload (hindari file yatim)
    const sudahAda = await prisma.absensi.findFirst({
      where: { adminId, tipe, tanggal },
    });
    if (sudahAda)
      return res.status(400).json({
        message: `Kamu sudah absen ${tipe.toLowerCase()} hari ini`,
      });

    // titik acuan geofence (ambil lokasi aktif)
    const lokasi = await prisma.workLocation.findFirst({
      where: { isActive: true },
    });
    if (!lokasi)
      return res.status(400).json({ message: "Lokasi kerja belum diatur" });

    // hitung jarak SERVER-SIDE (jangan percaya client)
    const jarak = hitungJarak(lat, lng, lokasi.latitude, lokasi.longitude);
    const status = jarak <= lokasi.radius ? "VALID" : "DILUAR_RADIUS";

    try {
      const absen = await prisma.absensi.create({
        data: {
          adminId,
          workLocationId: lokasi.id,
          tipe,
          tanggal,
          latitude: lat,
          longitude: lng,
          jarak,
          status,
          fotoUrl,
          fotoPath,
        },
      });
      return res.status(201).json({ data: absen });
    } catch (dbErr) {
      console.log("ERROR ", dbErr);
      await supabase.storage.from(BUCKET).remove([path]); // cleanup
      throw dbErr;
    }
  } catch (err) {
    console.error("createAbsen error:", err);
    return res.status(500).json({ message: "Gagal menyimpan absen" });
  }
};

// GET /absen/riwayat?dari=YYYY-MM-DD&sampai=YYYY-MM-DD  (dua-duanya opsional)
const getRiwayatAbsen = async (req, res) => {
  try {
    const adminId = req.user?.id; // dari token, JANGAN dari query
    if (!adminId)
      return res.status(401).json({ message: "Tidak terautentikasi" });

    const { dari, sampai } = req.query;

    // filter tanggal opsional (batas hari WIB → instant UTC)
    const filterTanggal = {};
    if (dari) filterTanggal.gte = fromZonedTime(`${dari}T00:00:00`, WIB);
    if (sampai)
      filterTanggal.lte = fromZonedTime(`${sampai}T23:59:59.999`, WIB);

    const riwayat = await prisma.absensi.findMany({
      where: {
        adminId,
        ...(dari || sampai ? { tanggal: filterTanggal } : {}),
      },
      orderBy: [{ tanggal: "desc" }, { waktu: "asc" }],
      // tanpa filter: batasi 60 baris (~30 hari). dgn filter: ikuti rentang.
      ...(dari || sampai ? {} : { take: 60 }),
      select: {
        id: true,
        tipe: true,
        tanggal: true,
        waktu: true,
        jarak: true,
        status: true,
        fotoUrl: true,
      },
    });

    return res.json({ data: riwayat });
  } catch (err) {
    console.error("getRiwayatAbsen error:", err);
    return res.status(500).json({ message: "Gagal memuat riwayat absen" });
  }
};

// GET /absen/karyawan?tanggal=YYYY-MM-DD
const getAbsenKaryawan = async (req, res) => {
  console.log("ABSEN KARYAWAN");
  try {
    // guard role — hanya MANAGEMENT & ADMIN
    const roles = req.user?.roles?.map((r) => r.role) ?? [];
    const boleh = roles.some((r) => ["MANAGEMENT", "ADMIN"].includes(r));
    if (!boleh) return res.status(403).json({ message: "Akses ditolak" });

    // tanggal target (default hari ini WIB)
    const { tanggal } = req.query;
    const wibDateStr =
      tanggal ??
      new Intl.DateTimeFormat("en-CA", { timeZone: WIB }).format(new Date());
    const target = fromZonedTime(`${wibDateStr}T00:00:00`, WIB);

    // 1) semua karyawan (Admin non-deleted)
    // NOTE: kalau owner/role tertentu tak perlu dipantau, filter di sini
    const admins = await prisma.admin.findMany({
      where: { isDeleted: false },
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    });

    // 2) absen pada tanggal target (semua karyawan sekaligus)
    const absensi = await prisma.absensi.findMany({
      where: { tanggal: target },
      select: {
        adminId: true,
        tipe: true,
        waktu: true,
        jarak: true,
        status: true,
        fotoUrl: true,
      },
    });

    // index absen per adminId utk lookup cepat
    const byAdmin = new Map();
    for (const a of absensi) {
      const slot = byAdmin.get(a.adminId) ?? { masuk: null, pulang: null };
      if (a.tipe === "MASUK") slot.masuk = a;
      else slot.pulang = a;
      byAdmin.set(a.adminId, slot);
    }

    // 3) gabung: setiap karyawan pasti muncul (yg belum absen → null)
    const data = admins.map((k) => {
      const slot = byAdmin.get(k.id);
      return {
        adminId: k.id,
        username: k.username,
        masuk: slot?.masuk ?? null,
        pulang: slot?.pulang ?? null,
      };
    });

    return res.json({ data });
  } catch (err) {
    console.error("getAbsenKaryawan error:", err);
    return res.status(500).json({ message: "Gagal memuat absensi karyawan" });
  }
};

module.exports = {
  getStatusAbsenHariIni,
  createAbsen,
  getRiwayatAbsen,
  getAbsenKaryawan,
};
