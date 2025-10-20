// controllers/booking.controller.js
const {
  PrismaClient,
  BookingStatus,
  PricingType,
  VerificationMethod,
  PaymentStatus,
  TransactionType,
  PaymentMethod,
} = require("@prisma/client");
const dayjs = require("dayjs");
const { sendEmail } = require("../middleware/emailService");
const prisma = new PrismaClient();

// Helper: ekstrak jam/menit dari string ISO tanpa kehilangan zona
function extractTimeFromISO(iso) {
  try {
    const m = iso.match(/T(\d{2}):(\d{2})/);
    if (!m) return null;
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return { hours, minutes };
  } catch {
    return null;
  }
}

// Helper: overlap waktu
function overlaps(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

const createBooking = async (req, res) => {
  try {
    const {
      customer,
      facilityId,
      bookingDate,
      startTime,
      endTime,
      participants,
      purpose,
      source,
      day,
    } = req.body || {};

    // ===== Validasi dasar payload =====
    if (!customer || !customer.fullName || !customer.phone || !customer.nik) {
      return res.status(400).json({ message: "Nama, Telepon, dan NIK wajib" });
    }

    if (!facilityId) {
      return res.status(400).json({ message: "facilityId wajib" });
    }

    if (!bookingDate) {
      return res.status(400).json({ message: "bookingDate wajib" });
    }

    const pax = Number(participants ?? 1);
    if (!Number.isInteger(pax) || pax <= 0) {
      return res
        .status(400)
        .json({ message: "participants harus bilangan bulat >= 1" });
    }

    // ===== Ambil facility + rules + price aktif =====
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
      include: {
        bookingRules: true,
        priceLists: {
          where: { effectiveFrom: { lte: new Date() } },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });

    if (!facility || facility.isDeleted) {
      return res.status(404).json({ message: "Fasilitas tidak ditemukan" });
    }

    const pricingType = facility.pricingType;

    // ===== Validasi kondisional berdasarkan pricingType =====
    let numDays = 1; // default untuk PER_DAY

    if (pricingType === "PER_DAY") {
      // PER_DAY: day WAJIB, startTime & endTime TIDAK perlu
      if (day === undefined || day === null) {
        return res.status(400).json({
          message: "day wajib diisi untuk fasilitas dengan tipe PER_DAY",
        });
      }

      numDays = Number(day);
      if (!Number.isInteger(numDays) || numDays <= 0) {
        return res
          .status(400)
          .json({ message: "day harus bilangan bulat >= 1" });
      }
    } else if (pricingType === "PER_HOUR") {
      // PER_HOUR: startTime & endTime WAJIB
      if (!startTime || !endTime) {
        return res.status(400).json({
          message:
            "startTime dan endTime wajib untuk fasilitas dengan tipe PER_HOUR",
        });
      }
    }
    // PER_TICKET: tidak perlu validasi khusus untuk time atau day

    const priceList = facility.priceLists[0] || null;
    const unitPrice = Number(priceList?.unitPrice ?? facility.basePrice);
    const visitDate = new Date(bookingDate);

    if (Number.isNaN(visitDate.getTime())) {
      return res.status(400).json({ message: "bookingDate tidak valid" });
    }

    // ===== Validasi booking window days =====
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const visitDateOnly = new Date(visitDate);
    visitDateOnly.setHours(0, 0, 0, 0);

    if (visitDateOnly < today) {
      return res
        .status(400)
        .json({ message: "Tanggal booking tidak boleh di masa lalu" });
    }

    if (facility.bookingRules?.bookingWindowDays) {
      const maxBookingDate = new Date(today);
      maxBookingDate.setDate(
        maxBookingDate.getDate() + facility.bookingRules.bookingWindowDays
      );
      if (visitDateOnly > maxBookingDate) {
        return res.status(400).json({
          message: `Booking hanya dapat dilakukan maksimal ${
            facility.bookingRules.bookingWindowDays
          } hari ke depan. Tanggal maksimal: ${
            maxBookingDate.toISOString().split("T")[0]
          }`,
        });
      }
    }

    // ===== Validasi jam operasional (hanya untuk PER_HOUR) =====
    const OPENING_HOUR = 9; // 09:00
    const CLOSING_HOUR = 21; // 21:00

    const sTime = startTime ? new Date(startTime) : null;
    const eTime = endTime ? new Date(endTime) : null;

    if (pricingType === "PER_HOUR") {
      const startTimeData = extractTimeFromISO(startTime);
      const endTimeData = extractTimeFromISO(endTime);

      if (!startTimeData) {
        return res.status(400).json({
          message:
            "Format startTime tidak valid. Gunakan ISO 8601 (contoh: 2025-10-08T09:00:00Z)",
        });
      }
      if (!endTimeData) {
        return res.status(400).json({
          message:
            "Format endTime tidak valid. Gunakan ISO 8601 (contoh: 2025-10-08T21:00:00Z)",
        });
      }

      const { hours: startHour, minutes: startMinute } = startTimeData;
      const { hours: endHour, minutes: endMinute } = endTimeData;

      if (
        startHour < 0 ||
        startHour > 23 ||
        startMinute < 0 ||
        startMinute > 59
      ) {
        return res
          .status(400)
          .json({ message: "startTime memiliki nilai jam/menit tidak valid" });
      }
      if (endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
        return res
          .status(400)
          .json({ message: "endTime memiliki nilai jam/menit tidak valid" });
      }

      if (startHour < OPENING_HOUR) {
        return res.status(400).json({
          message: `Jam mulai minimal ${String(OPENING_HOUR).padStart(
            2,
            "0"
          )}:00 (Input: ${String(startHour).padStart(2, "0")}:${String(
            startMinute
          ).padStart(2, "0")})`,
        });
      }
      if (endHour > CLOSING_HOUR) {
        return res.status(400).json({
          message: `Jam selesai maksimal ${String(CLOSING_HOUR).padStart(
            2,
            "0"
          )}:00 (Input: ${String(endHour).padStart(2, "0")}:${String(
            endMinute
          ).padStart(2, "0")})`,
        });
      }
      if (endHour === CLOSING_HOUR && endMinute > 0) {
        return res.status(400).json({
          message: `Jam selesai harus <= ${String(CLOSING_HOUR).padStart(
            2,
            "0"
          )}:00 (Input: ${String(endHour).padStart(2, "0")}:${String(
            endMinute
          ).padStart(2, "0")})`,
        });
      }

      const startTotal = startHour * 60 + startMinute;
      const endTotal = endHour * 60 + endMinute;
      if (endTotal <= startTotal) {
        return res
          .status(400)
          .json({ message: "Jam selesai harus lebih lama dari jam mulai" });
      }

      if (facility.minDuration) {
        const dur = endTotal - startTotal;
        if (dur < facility.minDuration) {
          return res.status(400).json({
            message: `Durasi booking minimal ${facility.minDuration} menit (Durasi: ${dur} menit)`,
          });
        }
      }
    }

    // ===== Advance notice =====
    if (facility.bookingRules?.advanceNoticeHours) {
      const now = new Date();
      const visitDateTime = startTime ? new Date(startTime) : visitDate;
      const diffHours = (visitDateTime.getTime() - now.getTime()) / 3_600_000;
      if (diffHours < facility.bookingRules.advanceNoticeHours) {
        return res.status(400).json({
          message: `Booking minimal ${facility.bookingRules.advanceNoticeHours} jam sebelum waktu kunjungan`,
        });
      }
    }

    // ===== Kapasitas sederhana =====
    if (
      facility.bookingRules?.maxParticipants &&
      pax > facility.bookingRules.maxParticipants
    ) {
      return res
        .status(400)
        .json({ message: "Jumlah peserta melebihi kapasitas per booking" });
    }

    // ===== Hitung total berdasarkan pricingType =====
    let unitCount = 1;
    let totalAmount = 0;

    if (pricingType === "PER_HOUR") {
      // Hitung durasi dalam menit
      const durationMinutes = (eTime.getTime() - sTime.getTime()) / 60000;

      if (durationMinutes <= 0) {
        return res.status(400).json({
          message: "Durasi booking tidak valid (endTime harus > startTime)",
        });
      }

      // Bulatkan ke atas per jam: 1-60 menit = 1 jam, 61-120 menit = 2 jam
      unitCount = Math.ceil(durationMinutes / 60);

      // PER_HOUR: unitPrice × jumlah jam
      totalAmount = Number((unitPrice * unitCount).toFixed(2));
    } else if (pricingType === "PER_TICKET") {
      // PER_TICKET: unitPrice × jumlah pengunjung
      unitCount = 1; // 1 slot waktu
      totalAmount = Number((unitPrice * pax).toFixed(2));
    } else if (pricingType === "PER_DAY") {
      // PER_DAY: unitPrice × jumlah hari (dari input day)
      unitCount = numDays;
      totalAmount = Number((unitPrice * unitCount).toFixed(2));
    }

    // ===== Cek double booking =====
    const sameDayBookings = await prisma.booking.findMany({
      where: {
        facilityId,
        bookingDate: visitDate,
        status: { in: ["NEW", "APPROVED", "CONFIRMED"] },
      },
      select: {
        id: true,
        customer: { select: { id: true, nik: true } },
        startTime: true,
        endTime: true,
      },
    });

    let customerHasSameDateBooking = false;
    let customerHasSameSlot = false;
    let slotTakenBySomeone = false;

    if (pricingType === "PER_TICKET" || pricingType === "PER_DAY") {
      // Untuk PER_TICKET dan PER_DAY: cek berdasarkan tanggal saja
      for (const b of sameDayBookings) {
        const sameCustomer =
          b.customer?.nik && customer.nik && b.customer.nik === customer.nik;
        if (sameCustomer) {
          customerHasSameDateBooking = true;
          break;
        }
      }
      if (customerHasSameDateBooking) {
        return res.status(409).json({
          message:
            "Anda sudah memiliki booking pada tanggal ini untuk fasilitas ini",
        });
      }
    } else if (pricingType === "PER_HOUR") {
      // Untuk PER_HOUR: cek overlap waktu
      for (const b of sameDayBookings) {
        const sameCustomer =
          b.customer?.nik && customer.nik && b.customer.nik === customer.nik;
        const hasOverlap = overlaps(
          sTime,
          eTime,
          b.startTime ? new Date(b.startTime) : null,
          b.endTime ? new Date(b.endTime) : null
        );
        if (hasOverlap) {
          if (sameCustomer) {
            customerHasSameSlot = true;
            break;
          } else {
            slotTakenBySomeone = true;
            break;
          }
        }
      }
      if (customerHasSameSlot) {
        return res.status(409).json({
          message:
            "Anda sudah memiliki booking pada waktu ini untuk fasilitas ini",
        });
      }
      if (slotTakenBySomeone) {
        return res.status(409).json({
          message: "Slot waktu ini sudah dibooking oleh pelanggan lain",
        });
      }
    }

    // ===== Transaksi pembuatan booking + audit terstruktur =====
    const bookingResult = await prisma.$transaction(async (db) => {
      // Upsert Customer berdasarkan NIK
      const cust = await db.customer.upsert({
        where: { nik: customer.nik },
        create: {
          fullName: customer.fullName,
          phone: customer.phone,
          nik: customer.nik,
          email: customer.email ?? null,
          address: customer.address ?? null,
        },
        update: {
          fullName: customer.fullName,
          email: customer.email ?? null,
          address: customer.address ?? null,
        },
        select: { id: true },
      });

      // Kode booking sederhana
      const code = "BK" + Date.now().toString().slice(-6);

      // Snapshot meta item
      const itemMeta = {
        facilityName: facility.name,
        pricingType,
        appliedUnitPrice: unitPrice,
        unitCount,
        participants: pax,
        ...(pricingType === "PER_DAY" && { daysBooked: numDays }),
        basePrice: Number(facility.basePrice),
        calculation: {
          formula:
            pricingType === "PER_HOUR"
              ? `unitPrice (${unitPrice}) × hours (${unitCount})`
              : pricingType === "PER_TICKET"
              ? `unitPrice (${unitPrice}) × participants (${pax})`
              : `unitPrice (${unitPrice}) × days (${unitCount})`,
          totalAmount,
        },
        priceListId: priceList?.id ?? null,
        priceListEffectiveFrom: priceList?.effectiveFrom ?? null,
        priceListEffectiveTo: priceList?.effectiveTo ?? null,
        rules: {
          bookingWindowDays: facility.bookingRules?.bookingWindowDays ?? null,
          advanceNoticeHours: facility.bookingRules?.advanceNoticeHours ?? null,
          minDuration: facility.minDuration ?? null,
          maxParticipants: facility.bookingRules?.maxParticipants ?? null,
        },
        snapshotAt: new Date().toISOString(),
      };

      // Create booking + item
      const booking = await db.booking.create({
        data: {
          bookingCode: code,
          customerId: cust.id,
          facilityId: facility.id,
          bookingDate: visitDate,
          startTime: sTime,
          endTime: eTime,
          participants: pax,
          purpose: purpose ?? null,
          status: "NEW",
          verificationMethod: "NONE",
          source: source ?? "WEB",
          totalAmount,
          currency: "IDR",
          items: {
            create: [
              {
                date: visitDate,
                startTime: sTime,
                endTime: eTime,
                unitType: pricingType,
                unitCount,
                price: unitPrice,
                meta: itemMeta,
              },
            ],
          },
        },
        include: { items: true },
      });

      // Buat payment awal
      const payment = await db.payment.create({
        data: {
          bookingId: booking.id,
          status: "PENDING",
          totalDue: totalAmount,
          totalPaid: 0,
        },
      });

      // Audit untuk booking create
      await db.auditLog.create({
        data: {
          actorType: "CUSTOMER",
          action: "BOOKING_CREATE",
          entity: "booking",
          entityId: booking.id,
          bookingId: booking.id,
          before: null,
          after: {
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            facilityId: booking.facilityId,
            customerId: booking.customerId,
            status: booking.status,
            pricingType,
            totalAmount,
            currency: booking.currency,
            item: itemMeta,
            participants: pax,
            purpose: booking.purpose,
            source: booking.source,
            timing: {
              bookingDate: booking.bookingDate,
              startTime: booking.startTime,
              endTime: booking.endTime,
            },
          },
        },
      });

      // Audit untuk payment init
      await db.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "PAYMENT_INIT",
          entity: "payment",
          entityId: payment.id,
          bookingId: booking.id,
          before: null,
          after: {
            paymentId: payment.id,
            bookingId: booking.id,
            status: payment.status,
            totalDue: Number(payment.totalDue),
            totalPaid: Number(payment.totalPaid),
          },
        },
      });

      return booking;
    });

    const rupiah = (n) => (Number(n) || 0).toLocaleString("id-ID");
    const fmtDate = (d) =>
      new Date(d).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZoneName: undefined,
      });

    const html = `<!doctype html>
    <html lang="id">
    <head>
      <meta charset="utf-8">
      <meta name="x-apple-disable-message-reformatting">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Konfirmasi Booking - Bukit Nuansa</title>
      <style>
        body { margin:0; padding:0; background:#f6f9fc; font-family: Arial, Helvetica, sans-serif; color:#243043; }
        .wrapper { width:100%; background:#f6f9fc; padding:24px 0; }
        .container { width:100%; max-width:640px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.06); }
        .header { background:#0e9f6e; padding:16px 24px; text-align:center; }
        .logo { height:40px; display:block; margin:0 auto 8px; }
        .brand { color:#ffffff; font-size:16px; margin:0; letter-spacing:0.3px; }
        .hero { padding:24px; }
        .h1 { margin:0 0 8px; font-size:22px; color:#111827; line-height:1.3; }
        .lead { margin:0 0 16px; font-size:14px; color:#4b5563; line-height:1.6; }
        .card { background:#f9fafb; border:1px solid #eef2f7; border-radius:10px; padding:16px; margin:16px 0; }
        .row { display:flex; justify-content:space-between; align-items:flex-start; margin:6px 0; font-size:13px; color:#374151; }
        .label { color:#6b7280; min-width:140px; }
        .value { color:#111827; text-align:right; }
        .divider { height:1px; background:#eef2f7; margin:16px 0; }
        .amount { font-size:18px; font-weight:bold; color:#0e9f6e; }
        .btn { display:inline-block; padding:12px 18px; background:#0e9f6e; color:#ffffff !important; text-decoration:none; border-radius:8px; font-weight:bold; font-size:14px; }
        .hint { font-size:12px; color:#6b7280; margin-top:10px; }
        .footer { padding:16px 24px; background:#ffffff; color:#6b7280; font-size:12px; text-align:center; }
        .small { font-size:11px; color:#9ca3af; }
        @media only screen and (max-width: 480px) {
          .row { flex-direction:column; gap:4px; }
          .value { text-align:left; }
          .label { min-width:auto; }
        }
      </style>
    </head>
    <body>
      <div style="display:none;opacity:0;color:transparent;height:0;width:0;overflow:hidden;visibility:hidden;">
        Konfirmasi Booking ${bookingResult.bookingCode} di Bukit Nuansa untuk ${
      customer.fullName
    } pada ${fmtDate(bookingResult.bookingDate)}.
      </div>

      <div class="wrapper">
        <div class="container">
          <div class="header">
            <img class="logo" src="https://res.cloudinary.com/dvuza2lpc/image/upload/v1759565049/jenggawah/logo_bukit_nuansa_rcuwvt.png" alt="Logo Bukit Nuansa" width="160" height="40" style="height:40px; width:auto; border:0; outline:none; text-decoration:none;">
            <p class="brand">Bukit Nuansa Jenggawah</p>
          </div>

          <div class="hero">
            <h1 class="h1">Konfirmasi Booking: ${bookingResult.bookingCode}</h1>
            <p class="lead">
              Halo ${
                customer.fullName
              }, terima kasih telah melakukan pemesanan di Bukit Nuansa. Detail ringkas pesanan tercantum di bawah ini. Simpan kode booking untuk keperluan verifikasi saat kedatangan.
            </p>

            <div class="card">
              <div class="row">
                <div class="label">Fasilitas</div>
                <div class="value">${facility.name}</div>
              </div>
              <div class="row">
                <div class="label">Tanggal Kunjungan</div>
                <div class="value">${fmtDate(bookingResult.bookingDate)}</div>
              </div>
              ${
                pricingType === "PER_HOUR" &&
                bookingResult.startTime &&
                bookingResult.endTime
                  ? `
              <div class="row">
                <div class="label">Waktu</div>
                <div class="value">${fmtDate(
                  bookingResult.startTime
                )} - ${fmtDate(bookingResult.endTime)}</div>
              </div>
              `
                  : ""
              }
              <div class="row">
                <div class="label">Jumlah Peserta</div>
                <div class="value">${participants} orang</div>
              </div>
              ${
                pricingType === "PER_DAY"
                  ? `
              <div class="row">
                <div class="label">Durasi</div>
                <div class="value">${numDays} hari</div>
              </div>
              `
                  : ""
              }
              <div class="row">
                <div class="label">Tujuan</div>
                <div class="value">${purpose || "Kunjungan"}</div>
              </div>
              <div class="divider"></div>
              <div class="row">
                <div class="label">Tipe Harga</div>
                <div class="value">${
                  pricingType === "PER_HOUR"
                    ? "Per Jam"
                    : pricingType === "PER_DAY"
                    ? "Per Hari"
                    : "Per Tiket"
                }</div>
              </div>
              <div class="row">
                <div class="label">Total</div>
                <div class="value amount">Rp ${rupiah(totalAmount)}</div>
              </div>
            </div>

            <p class="lead" style="margin-top:16px;">
              Status saat ini: <strong style="color:#0e9f6e;">Baru</strong>. Jika diperlukan, lakukan konfirmasi kepada admin agar slot terjamin.
            </p>

            <div style="margin:14px 0 8px;">
              <a href="https://wa.me/6287857434161?text=Halo%20Admin,%20saya%20ingin%20konfirmasi%20booking%20${
                bookingResult.bookingCode
              }%20atas%20nama%20${customer.fullName}%20pada%20${fmtDate(
      bookingResult.bookingDate
    )}." class="btn" target="_blank" rel="noopener noreferrer">Konfirmasi via WhatsApp</a>
            </div>
            <p class="hint">
              Kode Booking: <strong>${
                bookingResult.bookingCode
              }</strong> • Sumber: ${bookingResult.source || "Web"}
            </p>
          </div>

          <div class="hero" style="padding-top:0;">
            <div class="card" style="background:#eefbf4; border-color:#d7f3e6;">
              <p class="lead" style="margin:0;">
                Mohon datang tepat waktu sesuai jadwal yang dipilih. Untuk perubahan jadwal atau pertanyaan, hubungi admin melalui WhatsApp yang tersedia pada halaman booking.
              </p>
            </div>
          </div>

          <div class="footer">
            <div style="margin-bottom:8px;">
              Bukit Nuansa Jenggawah • Jember, Jawa Timur
            </div>
            <div class="small">
              Email ini dikirim otomatis. Jangan membalas langsung ke email ini.
            </div>
          </div>
        </div>
      </div>
    </body>
      </html>`;

    const result = await sendEmail({
      to: customer.email,
      subject: "Booking Berhasil",
      html,
    });

    return res.status(201).json({
      message: "Booking berhasil dibuat, menunggu verifikasi admin",
      data: {
        id: bookingResult.id,
        bookingCode: bookingResult.bookingCode,
        bookingDate: bookingResult.bookingDate,
        status: bookingResult.status,
        totalAmount,
        currency: "IDR",
      },
    });
  } catch (err) {
    if (err?.code === "P2002") {
      return res
        .status(409)
        .json({ message: "Terjadi konflik data unik, coba lagi" });
    }
    console.error("createBooking error:", err);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Admin update schedule booking pelanggan
const updateBookingSchedule = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { bookingDate, startTime, endTime } = req.body || {};
    const adminId = req.user?.id || null;
    const adminName = req.user?.username || req.user?.email || null;

    if (!bookingId) {
      return res.status(400).json({ message: "Param id booking wajib" });
    }
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi" });
    }

    if (!bookingDate) {
      return res.status(400).json({ message: "bookingDate wajib" });
    }

    const newDate = new Date(bookingDate);
    if (Number.isNaN(newDate.getTime())) {
      return res.status(400).json({ message: "bookingDate tidak valid" });
    }

    const sTime = startTime ? new Date(startTime) : null;
    const eTime = endTime ? new Date(endTime) : null;

    if (
      (sTime && Number.isNaN(sTime.getTime())) ||
      (eTime && Number.isNaN(eTime.getTime()))
    ) {
      return res.status(400).json({ message: "startTime/endTime tidak valid" });
    }

    if (sTime && eTime && eTime <= sTime) {
      return res
        .status(400)
        .json({ message: "endTime harus lebih besar dari startTime" });
    }

    // Ambil booking + fasilitas + rule + customer email
    const current = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        facility: { include: { bookingRules: true, priceLists: true } },
        customer: {
          select: { id: true, nik: true, fullName: true, email: true },
        },
        items: {
          orderBy: { date: "asc" },
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            unitCount: true,
            price: true,
          },
        },
        payments: { select: { id: true, totalDue: true, totalPaid: true } },
      },
    });

    if (!current || current.isDeleted) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    const facilityId = current.facilityId;
    const facility = current.facility;
    const pricingType = facility.pricingType;

    // =============== VALIDASI TANGGAL MASA LALU ===============
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newDateOnly = new Date(newDate);
    newDateOnly.setHours(0, 0, 0, 0);

    if (newDateOnly < today) {
      return res
        .status(400)
        .json({ message: "Tanggal booking tidak boleh di masa lalu" });
    }

    // =============== VALIDASI BOOKING WINDOW DAYS ===============
    const now = new Date();
    if (facility.bookingRules?.bookingWindowDays != null) {
      const maxDate = new Date(today);
      maxDate.setDate(
        maxDate.getDate() + facility.bookingRules.bookingWindowDays
      );

      if (newDateOnly > maxDate) {
        return res.status(400).json({
          message: `Booking hanya dapat dilakukan maksimal ${
            facility.bookingRules.bookingWindowDays
          } hari ke depan. Tanggal maksimal: ${
            maxDate.toISOString().split("T")[0]
          }`,
        });
      }
    }

    // =============== VALIDASI JAM OPERASIONAL FASILITAS ===============
    const OPENING_HOUR = 9;
    const CLOSING_HOUR = 21;

    if (pricingType === "PER_HOUR") {
      if (!sTime || !eTime) {
        return res.status(400).json({
          message: "startTime dan endTime wajib untuk booking per jam",
        });
      }

      const startHour = sTime.getHours();
      const startMinute = sTime.getMinutes();
      const endHour = eTime.getHours();
      const endMinute = eTime.getMinutes();

      if (startHour < OPENING_HOUR) {
        return res.status(400).json({
          message: `Jam mulai harus pada atau setelah jam ${OPENING_HOUR}:00`,
        });
      }

      if (
        endHour > CLOSING_HOUR ||
        (endHour === CLOSING_HOUR && endMinute > 0)
      ) {
        return res.status(400).json({
          message: `Jam selesai harus pada atau sebelum jam ${CLOSING_HOUR}:00`,
        });
      }

      if (facility.minDuration) {
        const durationMinutes = (eTime - sTime) / (1000 * 60);
        if (durationMinutes < facility.minDuration) {
          return res.status(400).json({
            message: `Durasi booking minimal ${facility.minDuration} menit`,
          });
        }
      }
    }

    if ((pricingType === "PER_TICKET" || pricingType === "PER_DAY") && sTime) {
      const startHour = sTime.getHours();
      if (startHour < OPENING_HOUR || startHour >= CLOSING_HOUR) {
        return res.status(400).json({
          message: `Jam kedatangan harus antara ${OPENING_HOUR}:00 - ${CLOSING_HOUR}:00`,
        });
      }
    }

    // =============== VALIDASI ADVANCE NOTICE HOURS ===============
    if (facility.bookingRules?.advanceNoticeHours != null) {
      const visitDateTime = sTime ?? new Date(newDateOnly);
      const minStart = new Date(
        now.getTime() + facility.bookingRules.advanceNoticeHours * 3600 * 1000
      );
      if (visitDateTime < minStart) {
        return res.status(400).json({
          message: `Booking harus dilakukan minimal ${facility.bookingRules.advanceNoticeHours} jam sebelum waktu kunjungan`,
        });
      }
    }

    // =============== CEK OVERLAP/DOUBLE BOOKING ===============
    const sameDay = await prisma.booking.findMany({
      where: {
        facilityId,
        bookingDate: newDate,
        status: { in: ["NEW", "APPROVED", "CONFIRMED"] },
        NOT: { id: bookingId },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        customer: { select: { nik: true } },
      },
    });

    if (pricingType === "PER_TICKET" || pricingType === "PER_DAY") {
      if (sTime) {
        const sameSlotBySameCustomer = sameDay.some(
          (b) =>
            b.customer?.nik &&
            current.customer?.nik &&
            b.customer.nik === current.customer.nik &&
            b.startTime &&
            new Date(b.startTime).getTime() === sTime.getTime()
        );
        if (sameSlotBySameCustomer) {
          return res.status(409).json({
            message:
              "Pelanggan sudah memiliki booking pada tanggal & jam mulai tersebut",
          });
        }
      }
    } else if (pricingType === "PER_HOUR") {
      const conflict = sameDay.some((b) =>
        overlaps(
          sTime,
          eTime,
          b.startTime ? new Date(b.startTime) : null,
          b.endTime ? new Date(b.endTime) : null
        )
      );
      if (conflict) {
        return res
          .status(409)
          .json({ message: "Slot waktu tersebut sudah dibooking" });
      }
    }

    // =============== HITUNG ULANG UNIT & TOTAL (khusus PER_HOUR) ===============
    const priceList = facility.priceLists?.find(
      (p) =>
        p.effectiveFrom <= new Date() &&
        (!p.effectiveTo || p.effectiveTo >= new Date())
    );
    const unitPrice = Number(priceList?.unitPrice ?? facility.basePrice);

    let newUnitCount = 1;
    if (pricingType === "PER_HOUR") {
      if (!sTime || !eTime) {
        return res.status(400).json({
          message: "startTime dan endTime wajib untuk pricing PER_HOUR",
        });
      }
      const durationMinutes = (eTime.getTime() - sTime.getTime()) / 60000;
      if (durationMinutes <= 0) {
        return res.status(400).json({
          message: "Durasi booking tidak valid (endTime harus > startTime)",
        });
      }
      newUnitCount = Math.ceil(durationMinutes / 60);
    } else if (pricingType === "PER_DAY" || pricingType === "PER_TICKET") {
      newUnitCount = Math.max(1, facility.minDuration ?? 1);
    }

    const newTotalAmount = Number((unitPrice * newUnitCount).toFixed(2));
    const oldTotalAmount = Number(current.totalAmount);

    // =============== TRANSAKSI UPDATE BOOKING + PAYMENT + LOG + EMAIL ===============
    const updated = await prisma.$transaction(async (db) => {
      const beforeSnapshot = {
        bookingId: current.id,
        bookingCode: current.bookingCode,
        bookingDate: current.bookingDate,
        startTime: current.startTime,
        endTime: current.endTime,
        totalAmount: oldTotalAmount,
        firstItem: current.items?.[0]
          ? {
              id: current.items[0].id,
              date: current.items[0].date,
              startTime: current.items[0].startTime,
              endTime: current.items[0].endTime,
              unitCount: current.items[0].unitCount,
              price: Number(current.items[0].price),
            }
          : null,
      };

      // Update booking
      const booking = await db.booking.update({
        where: { id: bookingId },
        data: {
          bookingDate: newDate,
          startTime: sTime,
          endTime: eTime,
          totalAmount: newTotalAmount,
        },
        select: {
          id: true,
          bookingCode: true,
          bookingDate: true,
          startTime: true,
          endTime: true,
          facilityId: true,
          totalAmount: true,
        },
      });

      // Update item pertama
      let updatedItem = null;
      const firstItem = await db.bookingItem.findFirst({
        where: { bookingId },
        orderBy: { date: "asc" },
        select: { id: true },
      });

      if (firstItem) {
        updatedItem = await db.bookingItem.update({
          where: { id: firstItem.id },
          data: {
            date: newDate,
            startTime: sTime,
            endTime: eTime,
            unitCount: newUnitCount,
            price: unitPrice,
          },
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            unitCount: true,
            price: true,
          },
        });
      }

      // Update Payment totalDue jika ada
      if (current.payments) {
        await db.payment.update({
          where: { id: current.payments.id },
          data: { totalDue: newTotalAmount },
        });
      }

      const afterSnapshot = {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        bookingDate: booking.bookingDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        totalAmount: newTotalAmount,
        updatedItem,
        facilityId: facilityId,
        pricingType,
        rules: {
          bookingWindowDays: facility.bookingRules?.bookingWindowDays ?? null,
          advanceNoticeHours: facility.bookingRules?.advanceNoticeHours ?? null,
          minDuration: facility.minDuration ?? null,
          maxParticipants: facility.bookingRules?.maxParticipants ?? null,
        },
        rescheduledAt: new Date().toISOString(),
        rescheduledBy: {
          adminId,
          adminName,
        },
      };

      // AuditLog terstruktur
      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          adminId,
          bookingId: booking.id,
          action: "BOOKING_RESCHEDULE",
          entity: "booking",
          entityId: booking.id,
          before: beforeSnapshot,
          after: afterSnapshot,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return booking;
    });

    // =============== KIRIM EMAIL NOTIFIKASI ===============
    if (current.customer?.email) {
      try {
        const rupiah = (n) => (Number(n) || 0).toLocaleString("id-ID");
        const fmtDate = (d) =>
          new Date(d).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
        const fmtTime = (d) =>
          new Date(d).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

        const timeRange =
          updated.startTime && updated.endTime
            ? `${fmtTime(updated.startTime)}–${fmtTime(updated.endTime)} WIB`
            : "—";

        const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Perubahan Jadwal Booking - Bukit Nuansa</title>
  <style>
    body { margin:0; padding:0; background:#f6f9fc; font-family: Arial, Helvetica, sans-serif; color:#243043; }
    .wrapper { width:100%; background:#f6f9fc; padding:24px 0; }
    .container { width:100%; max-width:640px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,0.06); }
    .header { background:#0e9f6e; padding:16px 24px; text-align:center; }
    .logo { height:40px; display:block; margin:0 auto 8px; }
    .brand { color:#ffffff; font-size:16px; margin:0; letter-spacing:0.3px; }
    .hero { padding:24px; }
    .h1 { margin:0 0 8px; font-size:22px; color:#111827; line-height:1.3; }
    .lead { margin:0 0 16px; font-size:14px; color:#4b5563; line-height:1.6; }
    .card { background:#f9fafb; border:1px solid #eef2f7; border-radius:10px; padding:16px; margin:16px 0; }
    .card-warning { background:#fff7ed; border-color:#fed7aa; }
    .row { display:flex; justify-content:space-between; align-items:flex-start; margin:6px 0; font-size:13px; color:#374151; }
    .label { color:#6b7280; min-width:140px; }
    .value { color:#111827; text-align:right; }
    .divider { height:1px; background:#eef2f7; margin:16px 0; }
    .amount { font-size:18px; font-weight:bold; color:#0e9f6e; }
    .btn { display:inline-block; padding:12px 18px; background:#0e9f6e; color:#ffffff !important; text-decoration:none; border-radius:8px; font-weight:bold; font-size:14px; }
    .hint { font-size:12px; color:#6b7280; margin-top:10px; }
    .footer { padding:16px 24px; background:#ffffff; color:#6b7280; font-size:12px; text-align:center; }
    .small { font-size:11px; color:#9ca3af; }
    @media only screen and (max-width: 480px) {
      .row { flex-direction:column; gap:4px; }
      .value { text-align:left; }
      .label { min-width:auto; }
    }
  </style>
</head>
<body>
  <div style="display:none;opacity:0;color:transparent;height:0;width:0;overflow:hidden;visibility:hidden;">
    Pemberitahuan Perubahan Jadwal Booking ${
      current.bookingCode
    } di Bukit Nuansa untuk ${current.customer.fullName}.
  </div>

  <div class="wrapper">
    <div class="container">
      <div class="header">
        <img class="logo" src="https://res.cloudinary.com/dvuza2lpc/image/upload/v1759565049/jenggawah/logo_bukit_nuansa_rcuwvt.png" alt="Logo Bukit Nuansa" width="160" height="40" style="height:40px; width:auto; border:0; outline:none; text-decoration:none;">
        <p class="brand">Bukit Nuansa Jenggawah</p>
      </div>

      <div class="hero">
        <h1 class="h1">Perubahan Jadwal Booking: ${current.bookingCode}</h1>
        <p class="lead">
          Halo ${
            current.customer.fullName
          }, jadwal booking Anda telah diubah oleh admin. Berikut adalah detail jadwal terbaru. Harap simpan kode booking untuk keperluan verifikasi saat kedatangan.
        </p>

        <div class="card card-warning">
          <p style="margin:0; font-size:13px; color:#92400e;">
            <strong>⚠️ Pemberitahuan:</strong> Jadwal booking Anda telah diperbarui. Pastikan untuk menyesuaikan rencana kunjungan Anda.
          </p>
        </div>

        <div class="card">
          <div class="row"><div class="label">Fasilitas</div><div class="value">${
            facility.name
          }</div></div>
          <div class="row"><div class="label">Tanggal Kunjungan</div><div class="value">${fmtDate(
            updated.bookingDate
          )}</div></div>
          <div class="row"><div class="label">Waktu</div><div class="value">${timeRange}</div></div>
          <div class="row"><div class="label">Jumlah Peserta</div><div class="value">${
            current.participants
          } orang</div></div>
          <div class="row"><div class="label">Tujuan</div><div class="value">${
            current.purpose || "Kunjungan"
          }</div></div>
          <div class="divider"></div>
          <div class="row"><div class="label">Tipe Harga</div><div class="value">${
            pricingType === "PER_HOUR"
              ? "Per Jam"
              : pricingType === "PER_DAY"
              ? "Per Hari"
              : "Per Tiket"
          }</div></div>
          <div class="row"><div class="label">Total</div><div class="value amount">Rp ${rupiah(
            newTotalAmount
          )}</div></div>
        </div>

        <p class="lead" style="margin-top:16px;">
          Status saat ini: <strong style="color:#0e9f6e;">${
            current.status === "NEW"
              ? "Baru"
              : current.status === "APPROVED"
              ? "Disetujui"
              : current.status
          }</strong>. Jika ada pertanyaan, silakan hubungi admin.
        </p>

        <div style="margin:14px 0 8px;">
          <a href="https://wa.me/6287857434161?text=Halo%20Admin,%20saya%20ingin%20konfirmasi%20perubahan%20jadwal%20booking%20${
            current.bookingCode
          }%20atas%20nama%20${
          current.customer.fullName
        }." class="btn" target="_blank" rel="noopener noreferrer">Hubungi Admin via WhatsApp</a>
        </div>
        <p class="hint">
          Kode Booking: <strong>${current.bookingCode}</strong> • Sumber: ${
          current.source || "Web"
        }
        </p>
      </div>

      <div class="hero" style="padding-top:0;">
        <div class="card" style="background:#eefbf4; border-color:#d7f3e6;">
          <p class="lead" style="margin:0;">
            Mohon datang tepat waktu sesuai jadwal baru yang dipilih. Untuk pertanyaan lebih lanjut, hubungi admin melalui WhatsApp.
          </p>
        </div>
      </div>

      <div class="footer">
        <div style="margin-bottom:8px;">Bukit Nuansa Jenggawah • Jember, Jawa Timur</div>
        <div class="small">Email ini dikirim otomatis. Jangan membalas langsung ke email ini.</div>
      </div>
    </div>
  </div>
</body>
</html>`;

        await sendEmail({
          to: current.customer.email,
          subject: `Perubahan Jadwal Booking ${current.bookingCode}`,
          html,
        });
      } catch (emailErr) {
        console.warn("Email reschedule gagal dikirim:", emailErr);
        // Tidak gagalkan response jika email gagal
      }
    }

    console.info(
      `[AUDIT] Admin ${adminId} mengubah jadwal booking ${current.bookingCode} (${bookingId})`
    );

    return res.status(200).json({
      message: "Jadwal booking berhasil diubah",
      data: updated,
    });
  } catch (err) {
    console.error("updateBookingSchedule error:", err);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Admin membatalkan booking pelanggan
const cancelBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { reason } = req.body || {};
    const adminId = req.user?.id || null;
    const adminName = req.user?.username || req.user?.email || null;

    if (!bookingId) {
      return res.status(400).json({ message: "Param id booking wajib" });
    }
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi" });
    }

    // Ambil snapshot awal untuk audit
    const current = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        bookingCode: true,
        adminNote: true,
        facilityId: true,
        customerId: true,
      },
    });
    if (!current) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    // Hanya boleh cancel dari NEW/APPROVED/CONFIRMED
    const cancellable = ["NEW", "APPROVED", "CONFIRMED"];
    if (!cancellable.includes(current.status)) {
      return res
        .status(400)
        .json({ message: "Status saat ini tidak dapat dibatalkan" });
    }

    // Transaksi pembatalan + audit log
    const updated = await prisma.$transaction(async (db) => {
      const b = await db.booking.update({
        where: { id: bookingId },
        data: {
          status: "CANCELLED",
          adminNote: reason ?? current.adminNote ?? null,
          // Opsional: increment version jika pakai optimistic locking
          // version: { increment: 1 },
        },
        select: {
          id: true,
          status: true,
          bookingCode: true,
          adminNote: true,
          facilityId: true,
          customerId: true,
        },
      });

      // Siapkan before/after untuk audit trail
      const beforeSnapshot = {
        bookingId: current.id,
        bookingCode: current.bookingCode,
        status: current.status,
        adminNote: current.adminNote ?? null,
        facilityId: current.facilityId,
        customerId: current.customerId,
      };

      const afterSnapshot = {
        bookingId: b.id,
        bookingCode: b.bookingCode,
        status: b.status,
        reason: reason ?? null,
        adminNote: b.adminNote ?? null,
        facilityId: b.facilityId,
        customerId: b.customerId,
        cancelledAt: new Date().toISOString(),
        cancelledBy: {
          adminId,
          adminName,
        },
      };

      // AuditLog terstruktur
      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          adminId,
          bookingId: b.id,
          action: "BOOKING_CANCEL",
          entity: "booking",
          entityId: b.id,
          before: beforeSnapshot,
          after: afterSnapshot,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      // Opsional: jika perlu void transaksi payment yang masih pending, tambahkan di sini
      // Contoh (sesuaikan dengan kebijakan bisnis):
      // await voidOpenPaymentTransactions(db, b.id, adminId, adminName, reason);

      return b;
    });

    return res.status(200).json({
      message: "Booking dibatalkan",
      data: updated,
    });
  } catch (err) {
    console.error("cancelBooking error:", err);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Admin meng-approve booking pelanggan
const approveBooking = async (req, res) => {
  console.log("APPROVE BOOKING");
  try {
    const bookingId = req.params.id;
    const { note, dpAmount, totalAmount } = req.body || {};
    const adminId = req.user?.id || null;
    const adminName = req.user?.username || req.user?.email || null;
    console.log(bookingId);
    console.log(adminId);
    console.log(adminName);

    // ===== Validasi parameter =====
    if (!bookingId) {
      return res.status(400).json({ message: "Param id booking wajib" });
    }
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi" });
    }

    // Validasi angka
    const dp = Number(dpAmount);
    const total = Number(totalAmount);
    if (
      !Number.isFinite(dp) ||
      !Number.isFinite(total) ||
      dp <= 0 ||
      total <= 0
    ) {
      return res
        .status(400)
        .json({ message: "dpAmount dan totalAmount harus angka > 0" });
    }
    if (dp > total) {
      return res
        .status(400)
        .json({ message: "dpAmount tidak boleh melebihi totalAmount" });
    }

    // Cek booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        bookingCode: true,
        facilityId: true,
        bookingDate: true,
        totalAmount: true,
        customerId: true,
        payments: {
          select: { id: true, status: true, totalDue: true, totalPaid: true },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    // Validasi status
    if (!["NEW", "APPROVED"].includes(booking.status)) {
      return res
        .status(400)
        .json({ message: "Status saat ini tidak dapat di-approve" });
    }

    // Validasi payment record
    if (!booking.payments) {
      return res
        .status(400)
        .json({ message: "Data payment tidak ditemukan untuk booking ini" });
    }

    // Opsi: validasi totalAmount konsisten dengan booking.totalAmount (jika ingin strict)
    // if (Math.abs(Number(booking.totalAmount) - total) > 0.009) {
    //   return res.status(400).json({ message: "totalAmount tidak konsisten dengan data booking" });
    // }

    // ===== Transaksi approve + audit =====
    const result = await prisma.$transaction(async (db) => {
      // Snapshot awal untuk audit
      const bookingBefore = {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        status: booking.status,
        totalAmount: Number(booking.totalAmount),
        facilityId: booking.facilityId,
        customerId: booking.customerId,
      };
      const paymentBefore = {
        paymentId: booking.payments.id,
        status: booking.payments.status,
        totalDue: Number(booking.payments.totalDue),
        totalPaid: Number(booking.payments.totalPaid),
      };

      // 1) Update status booking -> CONFIRMED
      const updatedBooking = await db.booking.update({
        where: { id: bookingId },
        data: {
          status: "CONFIRMED",
          adminNote: note ?? null,
          // version: { increment: 1 }, // opsional jika pakai optimistic locking
        },
        select: {
          id: true,
          status: true,
          bookingCode: true,
          facilityId: true,
          customerId: true,
          totalAmount: true,
        },
      });

      // 2) Update payment -> DP
      const updatedPayment = await db.payment.update({
        where: { bookingId: booking.id },
        data: {
          status: "DP",
          totalDue: total, // sinkronisasi total tagihan bila perlu
          totalPaid: dp,
          lastTransactionAt: new Date(),
        },
        select: {
          id: true,
          status: true,
          totalDue: true,
          totalPaid: true,
          lastTransactionAt: true,
        },
      });

      // 3) Create payment transaction untuk DP
      const dpTx = await db.paymentTransaction.create({
        data: {
          bookingId: booking.id,
          paymentId: booking.payments.id,
          amount: dp,
          type: "DP",
          method: "TRANSFER_MANUAL",
          status: "RECORDED",
          paidAt: new Date(),
          notes: note ?? null,
        },
        select: {
          id: true,
          bookingId: true,
          paymentId: true,
          amount: true,
          type: true,
          method: true,
          status: true,
          paidAt: true,
        },
      });

      // 4) Audit log: booking approve
      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          adminId,
          bookingId: updatedBooking.id,
          action: "BOOKING_APPROVE",
          entity: "booking",
          entityId: updatedBooking.id,
          before: bookingBefore,
          after: {
            bookingId: updatedBooking.id,
            bookingCode: updatedBooking.bookingCode,
            status: updatedBooking.status,
            adminNote: note ?? null,
            totalAmount: Number(updatedBooking.totalAmount),
            approvedAt: new Date().toISOString(),
            approvedBy: { adminId, adminName },
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      // 5) Audit log: payment update ke DP
      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          adminId,
          bookingId: updatedBooking.id,
          action: "PAYMENT_UPDATE",
          entity: "payment",
          entityId: updatedPayment.id,
          before: paymentBefore,
          after: {
            paymentId: updatedPayment.id,
            status: updatedPayment.status,
            totalDue: Number(updatedPayment.totalDue),
            totalPaid: Number(updatedPayment.totalPaid),
            lastTransactionAt: updatedPayment.lastTransactionAt,
            context: "Set DP setelah approval booking",
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      // 6) Audit log: transaksi DP dibuat
      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          adminId,
          bookingId: updatedBooking.id,
          action: "PAYMENT_TRANSACTION_CREATE",
          entity: "paymentTransaction",
          entityId: dpTx.id,
          before: null,
          after: {
            transactionId: dpTx.id,
            bookingId: dpTx.bookingId,
            paymentId: dpTx.paymentId,
            amount: Number(dpTx.amount),
            type: dpTx.type,
            method: dpTx.method,
            status: dpTx.status,
            paidAt: dpTx.paidAt,
            createdBy: { adminId, adminName },
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return {
        booking: updatedBooking,
        payment: updatedPayment,
        transaction: dpTx,
      };
    });

    return res.status(200).json({
      message: "Booking berhasil di-approve dan DP tercatat",
      data: result,
    });
  } catch (err) {
    console.error("approveBooking error:", err);
    return res.status(500).json({
      message: "Terjadi kesalahan server",
      error: err.message,
    });
  }
};

// Admin menyelesaikan booking (complete)
const completeBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { note, remainingAmount, paymentMethod } = req.body || {};

    const adminId = req.user?.id || null;
    const adminName = req.user?.username || req.user?.email || null;

    // ===== Validasi parameter =====
    if (!bookingId) {
      return res.status(400).json({ message: "Param id booking wajib" });
    }
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi" });
    }

    // Cek booking dan payment
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        bookingCode: true,
        facilityId: true,
        bookingDate: true,
        totalAmount: true,
        adminNote: true,
        customerId: true,
        payments: {
          select: {
            id: true,
            status: true,
            totalDue: true,
            totalPaid: true,
            lastTransactionAt: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    // Hanya CONFIRMED yang bisa complete
    if (booking.status !== "CONFIRMED") {
      return res.status(400).json({
        message: `Status booking saat ini (${booking.status}) tidak dapat di-complete. Hanya booking dengan status CONFIRMED yang dapat diselesaikan.`,
      });
    }

    if (!booking.payments) {
      return res
        .status(400)
        .json({ message: "Data payment tidak ditemukan untuk booking ini" });
    }

    // Hitung sisa pembayaran
    const totalDue = Number(booking.payments.totalDue);
    const totalPaid = Number(booking.payments.totalPaid);
    const calculatedRemaining = Number((totalDue - totalPaid).toFixed(2));

    // Validasi pelunasan
    const hasRemaining = calculatedRemaining > 0.009; // toleransi cent
    const payInput = remainingAmount != null ? Number(remainingAmount) : 0;

    if (hasRemaining && !Number.isFinite(payInput)) {
      return res.status(400).json({
        message: `Masih ada sisa pembayaran sebesar ${calculatedRemaining}. Harap kirim remainingAmount numerik.`,
        remainingAmount: calculatedRemaining,
      });
    }

    if (hasRemaining && Math.abs(payInput - calculatedRemaining) > 0.009) {
      return res.status(400).json({
        message: `Jumlah pembayaran tidak sesuai. Sisa yang harus dibayar: ${calculatedRemaining}`,
      });
    }

    // Validasi metode pembayaran bila ada input
    let methodToUse = "CASH";
    if (paymentMethod) {
      const allowed = ["CASH", "TRANSFER_MANUAL", "QRIS_OFFLINE"];
      if (!allowed.includes(paymentMethod)) {
        return res.status(400).json({ message: "paymentMethod tidak valid" });
      }
      methodToUse = paymentMethod;
    }

    // ===== Transaksi complete + audit =====
    const updated = await prisma.$transaction(async (db) => {
      // Snapshot awal untuk audit
      const bookingBefore = {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        status: booking.status,
        totalAmount: Number(booking.totalAmount),
        facilityId: booking.facilityId,
        customerId: booking.customerId,
      };
      const paymentBefore = {
        paymentId: booking.payments.id,
        status: booking.payments.status,
        totalDue: Number(booking.payments.totalDue),
        totalPaid: Number(booking.payments.totalPaid),
        lastTransactionAt: booking.payments.lastTransactionAt,
      };

      let createdTx = null;
      let updatedPayment = null;

      // 1) Jika masih ada sisa pembayaran, catat transaksi pelunasan dan update payment
      if (hasRemaining && payInput > 0) {
        createdTx = await db.paymentTransaction.create({
          data: {
            bookingId: booking.id,
            paymentId: booking.payments.id,
            amount: payInput,
            type: "PAID",
            method: methodToUse,
            status: "RECORDED",
            paidAt: new Date(),
            notes: note ?? "Pelunasan saat penyelesaian booking",
          },
          select: {
            id: true,
            bookingId: true,
            paymentId: true,
            amount: true,
            type: true,
            method: true,
            status: true,
            paidAt: true,
          },
        });

        updatedPayment = await db.payment.update({
          where: { bookingId: booking.id },
          data: {
            status: "PAID",
            totalPaid: totalDue, // lunas
            lastTransactionAt: new Date(),
          },
          select: {
            id: true,
            status: true,
            totalDue: true,
            totalPaid: true,
            lastTransactionAt: true,
          },
        });

        // Audit: transaksi pelunasan dibuat
        await db.auditLog.create({
          data: {
            actorType: "ADMIN",
            adminId,
            bookingId: booking.id,
            action: "PAYMENT_TRANSACTION_CREATE",
            entity: "paymentTransaction",
            entityId: createdTx.id,
            before: null,
            after: {
              transactionId: createdTx.id,
              bookingId: createdTx.bookingId,
              paymentId: createdTx.paymentId,
              amount: Number(createdTx.amount),
              type: createdTx.type,
              method: createdTx.method,
              status: createdTx.status,
              paidAt: createdTx.paidAt,
              createdBy: { adminId, adminName },
            },
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });

        // Audit: payment menjadi PAID
        await db.auditLog.create({
          data: {
            actorType: "ADMIN",
            adminId,
            bookingId: booking.id,
            action: "PAYMENT_UPDATE",
            entity: "payment",
            entityId: updatedPayment.id,
            before: paymentBefore,
            after: {
              paymentId: updatedPayment.id,
              status: updatedPayment.status,
              totalDue: Number(updatedPayment.totalDue),
              totalPaid: Number(updatedPayment.totalPaid),
              lastTransactionAt: updatedPayment.lastTransactionAt,
              context: "Pelunasan pada penyelesaian booking",
            },
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });
      }

      // 2) Update status booking -> COMPLETED
      const mergedNote = note
        ? booking.adminNote
          ? `${booking.adminNote}\n---\n${note}`
          : note
        : booking.adminNote;

      const updatedBooking = await db.booking.update({
        where: { id: bookingId },
        data: {
          status: "COMPLETED",
          adminNote: mergedNote,
          // version: { increment: 1 }, // opsional optimistic locking
        },
        select: {
          id: true,
          status: true,
          bookingCode: true,
          bookingDate: true,
          customer: { select: { fullName: true, phone: true, email: true } },
          facility: { select: { name: true } },
          payments: {
            select: { status: true, totalDue: true, totalPaid: true },
          },
        },
      });

      // 3) Audit: booking complete
      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          adminId,
          bookingId: booking.id,
          action: "BOOKING_COMPLETE",
          entity: "booking",
          entityId: booking.id,
          before: bookingBefore,
          after: {
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            status: "COMPLETED",
            note: note ?? null,
            remainingAmount: hasRemaining ? payInput : 0,
            completedAt: new Date().toISOString(),
            completedBy: { adminId, adminName },
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return updatedBooking;
    });

    return res.status(200).json({
      message: "Booking berhasil diselesaikan",
      data: updated,
    });
  } catch (err) {
    console.error("completeBooking error:", err);
    return res.status(500).json({
      message: "Terjadi kesalahan server",
      error: err.message,
    });
  }
};

// Controller: Memulai percakapan WhatsApp dari Booking
const startWhatsAppFromBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const adminId = req.user?.id; // diasumsikan sudah dari middleware auth

    if (!bookingId) {
      return res
        .status(400)
        .json({ message: "Parameter 'id' booking wajib diisi." });
    }
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi." });
    }

    // Ambil booking terkait, hanya ambil id & customer
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        bookingCode: true,
        customerId: true,
        facilityId: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking tidak ditemukan." });
    }

    // Buat log percakapan WA (arah OUT)
    const contactLog = await prisma.contactLog.create({
      data: {
        bookingId: booking.id,
        customerId: booking.customerId,
        adminId,
        channel: "WHATSAPP",
        direction: "OUT",
        messageSummary:
          "Admin memulai percakapan WhatsApp untuk verifikasi atau koordinasi booking.",
      },
    });

    // Buat AuditLog dengan struktur lengkap agar mudah dilacak
    await prisma.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorId: adminId,
        adminId,
        action: "CONTACT_WHATSAPP_START",
        entity: "ContactLog",
        entityId: contactLog.id,
        bookingId: booking.id,
        before: null,
        after: {
          actionDescription:
            "Admin memulai sesi kontak WhatsApp dengan pelanggan.",
          bookingCode: booking.bookingCode,
          facilityId: booking.facilityId,
          contactLogId: contactLog.id,
          channel: "WHATSAPP",
          direction: "OUT",
          initiatedBy: adminId,
          timestamp: new Date().toISOString(),
        },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    console.info(
      `[AUDIT] Admin ${adminId} memulai kontak WhatsApp untuk Booking ${booking.bookingCode} (${booking.id})`
    );

    return res.status(201).json({
      message: "Log kontak WhatsApp berhasil dibuat untuk booking ini.",
      data: contactLog,
    });
  } catch (err) {
    console.error("❌ startWhatsAppFromBooking error:", err);
    return res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server.", error: err.message });
  }
};

// Admin Get Kalender Booking
const getCalendarBookings = async (req, res) => {
  try {
    const {
      year,
      month,
      range = "month",
      start,
      end,
      facilityId,
    } = req.query || {};

    let startDate, endDate;
    console.log(facilityId);

    if (range === "week" && start && end) {
      startDate = new Date(start);
      endDate = new Date(end);
    } else {
      // Default mode bulanan
      const y = Number(year);
      const m = Number(month);
      if (!y || !m || m < 1 || m > 12) {
        return res
          .status(400)
          .json({ message: "Parameter year dan month wajib dan valid" });
      } // best practice param validasi [web:146]
      startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59)); // akhir bulan
    }

    // Query bookings dalam rentang
    const bookings = await prisma.booking.findMany({
      where: {
        bookingDate: { gte: startDate, lte: endDate },
        ...(facilityId ? { facilityId } : {}),
        isDeleted: false,
      },
      include: {
        facility: { select: { id: true, name: true, pricingType: true } },
        customer: { select: { fullName: true } },
      },
      orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
    }); // query dan sorting untuk kalender [web:206][web:209]

    // Map ke event ringkas
    const events = bookings.map((b) => {
      const dateISO = new Date(b.bookingDate).toISOString().slice(0, 10);
      const s = b.startTime ? new Date(b.startTime) : null;
      const e = b.endTime ? new Date(b.endTime) : null;

      // Warna status (disesuaikan dengan legenda)
      const color =
        b.status === BookingStatus.CONFIRMED
          ? "green"
          : b.status === BookingStatus.CANCELLED
          ? "red"
          : "orange"; // NEW/APPROVED → Pending

      // Label singkat seperti di chip kalender
      const timeLabel = s ? s.toISOString().slice(11, 16) : "00:00";
      const label = `${timeLabel} - ${b.facility.name}`;

      return {
        id: b.id,
        bookingCode: b.bookingCode,
        facilityId: b.facility.id,
        facilityName: b.facility.name,
        date: dateISO,
        startTime: s ? s.toISOString() : null,
        endTime: e ? e.toISOString() : null,
        status: b.status,
        color,
        label,
      };
    }); // modelisasi event UI-friendly [web:206]

    // Panel “Booking Hari Ini”
    const today = new Date();
    const todayStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0
      )
    );
    const todayEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59
      )
    );
    const todayBookings = await prisma.booking.findMany({
      where: {
        bookingDate: { gte: todayStart, lte: todayEnd },
        ...(facilityId ? { facilityId } : {}),
        isDeleted: false,
      },
      include: {
        facility: { select: { name: true } },
        customer: { select: { fullName: true } },
      },
      orderBy: [{ startTime: "asc" }],
    }); // panel kanan “hari ini” [web:206][web:209]

    const todayPanel = todayBookings.map((b) => {
      const s = b.startTime ? new Date(b.startTime) : null;
      const timeLabel = s ? s.toISOString().slice(11, 16) : "00:00";
      const statusLabel =
        b.status === "CONFIRMED"
          ? "Confirmed"
          : b.status === "CANCELLED"
          ? "Canceled"
          : "Pending";
      return {
        timeLabel,
        facilityName: b.facility.name,
        customerName: b.customer.fullName,
        status: statusLabel,
      };
    }); // desktop sidebar list [web:206]

    // Agregasi counts per tanggal untuk badge “+1 lainnya” dan ringkasan
    const countsByDate = {};
    for (const ev of events) {
      if (!countsByDate[ev.date]) {
        countsByDate[ev.date] = { total: 0, byStatus: {}, byFacility: {} };
      }
      countsByDate[ev.date].total += 1;
      countsByDate[ev.date].byStatus[ev.status] =
        (countsByDate[ev.date].byStatus[ev.status] || 0) + 1;
      countsByDate[ev.date].byFacility[ev.facilityName] =
        (countsByDate[ev.date].byFacility[ev.facilityName] || 0) + 1;
    } // ringkasan kalender umum [web:205]

    return res.status(200).json({
      range: { start: startDate.toISOString(), end: endDate.toISOString() },
      events,
      today: todayPanel,
      countsByDate,
    });
  } catch (err) {
    console.error("getCalendarBookings error:", err);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Admin get Booking Filter
async function getBookingsList(req, res) {
  try {
    const {
      search = "",
      status = "",
      facilityId = "",
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const whereClause = {
      isDeleted: false,
      ...(status && { status: status.toUpperCase() }),
      ...(facilityId && { facilityId }),
    };

    if (search && search.trim().length > 0) {
      whereClause.OR = [
        { bookingCode: { contains: search.trim(), mode: "insensitive" } },
        {
          customer: {
            fullName: { contains: search.trim(), mode: "insensitive" },
          },
        },
        {
          customer: { phone: { contains: search.trim(), mode: "insensitive" } },
        },
        {
          customer: { email: { contains: search.trim(), mode: "insensitive" } },
        },
        { customer: { nik: { contains: search.trim(), mode: "insensitive" } } },
        {
          facility: { name: { contains: search.trim(), mode: "insensitive" } },
        },
      ];
    }

    // Execute queries
    const [bookings, totalCount] = await Promise.all([
      prisma.booking.findMany({
        where: whereClause,
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              nik: true,
            },
          },
          facility: {
            select: {
              id: true,
              name: true,
              pricingType: true,
            },
          },
          payments: {
            select: {
              status: true,
              totalDue: true,
              totalPaid: true,
            },
          },
        },
        // SORTING LOGIC:
        // 1. Tanggal booking terbaru dulu (DESC)
        // 2. Dalam hari yang sama, jam paling pagi dulu (ASC)
        // 3. Fallback: yang dibuat lebih dulu (ASC untuk konsistensi urutan)
        orderBy: [
          { bookingDate: "desc" }, // Tanggal terbaru ke lama
          { startTime: "asc" }, // Jam paling pagi ke sore (dalam hari yang sama)
          { createdAt: "asc" }, // Yang dibuat lebih dulu (untuk konsistensi)
        ],
        skip,
        take: limitNum,
      }),
      prisma.booking.count({
        where: whereClause,
      }),
    ]); // [web:334][web:342]

    // Get status counts for summary
    const statusCounts = await prisma.booking.groupBy({
      by: ["status"],
      where: { isDeleted: false },
      _count: { status: true },
    });

    const statusSummary = {
      PENDING: 0,
      CONFIRMED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };

    statusCounts.forEach((item) => {
      if (item.status === "NEW" || item.status === "APPROVED") {
        statusSummary.PENDING += item._count.status;
      } else if (
        ["CONFIRMED", "COMPLETED", "CANCELLED"].includes(item.status)
      ) {
        statusSummary[item.status] = item._count.status;
      }
    });

    // Format booking data
    const formattedBookings = bookings.map((booking) => {
      const startTime = booking.startTime ? new Date(booking.startTime) : null;
      const endTime = booking.endTime ? new Date(booking.endTime) : null;

      let duration = "1 hari";
      if (startTime && endTime) {
        const diffMs = endTime - startTime;
        const diffHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
        duration = `${diffHours} jam`;
      }

      const bookingDate = new Date(booking.bookingDate);
      const timeRange =
        startTime && endTime
          ? `${startTime.toTimeString().slice(0, 5)} - ${endTime
              .toTimeString()
              .slice(0, 5)}`
          : "Sehari penuh";

      const createdDate = new Date(booking.createdAt);
      const formattedCreatedDate = `${createdDate.getFullYear()}-${String(
        createdDate.getMonth() + 1
      ).padStart(2, "0")}-${String(createdDate.getDate()).padStart(
        2,
        "0"
      )} ${String(createdDate.getHours()).padStart(2, "0")}:${String(
        createdDate.getMinutes()
      ).padStart(2, "0")}`;

      return {
        id: booking.id,
        bookingCode: booking.bookingCode,
        createdAt: booking.createdAt,
        createdAtFormatted: formattedCreatedDate,
        customer: {
          name: booking.customer.fullName,
          phone: booking.customer.phone,
          email: booking.customer.email,
          nik: booking.customer.nik,
        },
        facility: {
          id: booking.facility.id,
          name: booking.facility.name,
          type: booking.facility.pricingType,
        },
        bookingDate: bookingDate.toISOString().split("T")[0],
        bookingDateFormatted: `${bookingDate.getFullYear()}-${String(
          bookingDate.getMonth() + 1
        ).padStart(2, "0")}-${String(bookingDate.getDate()).padStart(2, "0")}`,
        timeRange,
        duration,
        participants: booking.participants,
        totalAmount: booking.totalAmount,
        currency: booking.currency,
        status: booking.status,
        adminNote: booking.adminNote,
        payment: booking.payments
          ? {
              status: booking.payments.status,
              totalDue: booking.payments.totalDue,
              totalPaid: booking.payments.totalPaid,
            }
          : null,
      };
    });

    const totalPages = Math.ceil(totalCount / limitNum);
    const pagination = {
      currentPage: pageNum,
      totalPages,
      totalItems: totalCount,
      itemsPerPage: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    };

    return res.status(200).json({
      success: true,
      message: `Menampilkan ${formattedBookings.length} dari ${totalCount} booking`,
      data: {
        bookings: formattedBookings,
        pagination,
        summary: statusSummary,
        filters: {
          search: search || null,
          status: status || null,
          facilityId: facilityId || null,
        },
      },
    });
  } catch (err) {
    console.error("getBookingsList error:", err);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}
// Admin get Detail Boooking
function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return null;

  const start = dayjs(startTime);
  const end = dayjs(endTime);

  const hours = end.diff(start, "hour");
  const minutes = end.diff(start, "minute") % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} jam ${minutes} menit`;
  } else if (hours > 0) {
    return `${hours} jam`;
  } else {
    return `${minutes} menit`;
  }
}

function calculateDaysDifference(date1, date2) {
  return dayjs(date2).diff(dayjs(date1), "day");
}

async function getBookingDetail(req, res) {
  try {
    const { id } = req.params;

    // Validasi parameter ID
    if (!id || typeof id !== "string") {
      return res.status(400).json({
        success: false,
        message: "ID booking harus berupa string yang valid",
      });
    }

    // Fetch booking detail dengan relasi sesuai schema
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            nik: true,
            address: true,
            identityType: true,
            identityNumber: true,
            createdAt: true,
          },
        },
        facility: {
          select: {
            id: true,
            name: true,
            description: true,
            pricingType: true,
            minDuration: true,
            basePrice: true,
            heroImage: true,
            images: true,
            category: true,
            rating: true,
            ratingCount: true,
            features: true,
            capacityLabel: true,
            durationLabel: true,
            rules: true,
            availability: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        payments: {
          include: {
            transactions: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
        items: {
          orderBy: { date: "asc" },
        },
      },
    });

    // Check if booking exists SEBELUM akses properti apapun
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking tidak ditemukan",
      });
    }

    // Format response data
    const formattedBooking = {
      // Basic booking info
      id: booking.id,
      bookingCode: booking.bookingCode,

      // Booking schedule details
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,

      // Booking details
      participants: booking.participants,
      purpose: booking.purpose,
      totalAmount: booking.totalAmount,
      currency: booking.currency,

      // Status and notes
      status: booking.status,
      adminNote: booking.adminNote,
      verificationMethod: booking.verificationMethod,
      verifiedAt: booking.verifiedAt,
      source: booking.source,

      // Timestamps
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,

      // Customer information
      customer: {
        id: booking.customer.id,
        name: booking.customer.fullName,
        phone: booking.customer.phone,
        email: booking.customer.email,
        nik: booking.customer.nik,
        address: booking.customer.address,
        identityType: booking.customer.identityType,
        identityNumber: booking.customer.identityNumber,
        registeredAt: booking.customer.createdAt,
      },

      // Facility information
      facility: {
        id: booking.facility.id,
        name: booking.facility.name,
        description: booking.facility.description,
        pricingType: booking.facility.pricingType,
        minDuration: booking.facility.minDuration,
        basePrice: booking.facility.basePrice,
        heroImage: booking.facility.heroImage,
        images: booking.facility.images,
        category: booking.facility.category,
        rating: booking.facility.rating,
        ratingCount: booking.facility.ratingCount,
        features: booking.facility.features || [],
        capacityLabel: booking.facility.capacityLabel,
        durationLabel: booking.facility.durationLabel,
        rules: booking.facility.rules,
        availability: booking.facility.availability,
        createdAt: booking.facility.createdAt,
        updatedAt: booking.facility.updatedAt,
      },

      // Booking items (detail per hari/slot)
      items: booking.items.map((item) => ({
        id: item.id,
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        unitType: item.unitType,
        unitCount: item.unitCount,
        price: item.price,
        meta: item.meta,
      })),

      // Payment information (one-to-one relation, bukan array)
      payment: booking.payments
        ? {
            id: booking.payments.id,
            status: booking.payments.status,
            totalDue: booking.payments.totalDue,
            totalPaid: booking.payments.totalPaid,
            lastTransactionAt: booking.payments.lastTransactionAt,
            transactions: booking.payments.transactions.map((trx) => ({
              id: trx.id,
              amount: trx.amount,
              type: trx.type,
              method: trx.method,
              status: trx.status,
              receiptNumber: trx.receiptNumber,
              paidAt: trx.paidAt,
              proofUrl: trx.proofUrl,
              notes: trx.notes,
              createdAt: trx.createdAt,
              isVoided: trx.isVoided,
            })),
            latestTransaction:
              booking.payments.transactions.length > 0
                ? {
                    id: booking.payments.transactions[0].id,
                    amount: booking.payments.transactions[0].amount,
                    type: booking.payments.transactions[0].type,
                    method: booking.payments.transactions[0].method,
                    status: booking.payments.transactions[0].status,
                    paidAt: booking.payments.transactions[0].paidAt,
                  }
                : null,
          }
        : null,

      // Calculated fields
      duration:
        booking.startTime && booking.endTime
          ? calculateDuration(booking.startTime, booking.endTime)
          : null,
      daysDifference: calculateDaysDifference(
        new Date(),
        new Date(booking.bookingDate)
      ),
      isUpcoming: new Date(booking.bookingDate) > new Date(),
      isPast: new Date(booking.bookingDate) < new Date(),

      // Payment summary
      paymentSummary: booking.payments
        ? {
            totalDue: booking.payments.totalDue,
            totalPaid: booking.payments.totalPaid,
            remainingAmount:
              parseFloat(booking.payments.totalDue) -
              parseFloat(booking.payments.totalPaid),
            isPaid: booking.payments.status === "PAID",
            status: booking.payments.status,
          }
        : {
            totalDue: booking.totalAmount,
            totalPaid: 0,
            remainingAmount: booking.totalAmount,
            isPaid: false,
            status: "PENDING",
          },
    };

    return res.status(200).json({
      success: true,
      message: "Detail booking berhasil ditemukan",
      data: formattedBooking,
    });
  } catch (err) {
    console.error("getBookingDetail error:", err);

    // Handle Prisma specific errors
    if (err.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Booking tidak ditemukan",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

module.exports = {
  createBooking,
  updateBookingSchedule,
  cancelBooking,
  approveBooking,
  startWhatsAppFromBooking,
  getCalendarBookings,
  getBookingsList,
  getBookingDetail,
  completeBooking,
};
