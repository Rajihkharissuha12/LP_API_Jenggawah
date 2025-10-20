const bcrypt = require("bcrypt");
const { PrismaClient, Role } = require("@prisma/client");
const jwt = require("jsonwebtoken");

const prisma = new PrismaClient();

// Admin membuat admin baru
const createAdmin = async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const adminId = req.user?.id;

    if (!adminId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!username || !password || !role) {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "ADMIN_CREATE",
          entity: "admin",
          entityId: username || "N/A",
          bookingId: null,
          before: null,
          after: null,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return res.status(400).json({
        success: false,
        error: "Username, password, and role are required",
      });
    }

    if (!["ADMIN", "STAFF"].includes(role)) {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "ADMIN_CREATE",
          entity: "admin",
          entityId: username,
          bookingId: null,
          before: null,
          after: { invalidRole: role },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return res.status(400).json({
        success: false,
        error: "Role must be ADMIN or STAFF",
      });
    }

    const exists = await prisma.admin.findUnique({ where: { username } });
    if (exists) {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "ADMIN_CREATE",
          entity: "admin",
          entityId: exists.id,
          bookingId: null,
          before: {
            id: exists.id,
            username: exists.username,
            role: exists.role,
          },
          after: null,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return res
        .status(409)
        .json({ success: false, error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await prisma.$transaction(async (db) => {
      const created = await db.admin.create({
        data: { username, password: hashedPassword, role },
        select: { id: true, username: true, role: true, createdAt: true },
      });

      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "ADMIN_CREATE",
          entity: "admin",
          entityId: created.id,
          bookingId: null,
          before: null,
          after: {
            id: created.id,
            username: created.username,
            role: created.role,
            createdAt: created.createdAt,
            timestamp: new Date().toISOString(),
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return created;
    });

    console.info(
      `[AUDIT] Admin ${adminId} membuat admin baru ${newAdmin.username} (${newAdmin.id})`
    );
    return res.status(201).json({
      success: true,
      data: newAdmin,
      message: "Admin created successfully",
    });
  } catch (error) {
    console.error("Create Admin Error:", error);
    try {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: req.user?.id || null,
          adminId: req.user?.id || null,
          action: "ADMIN_CREATE",
          entity: "admin",
          entityId: req.body?.username || "N/A",
          bookingId: null,
          before: null,
          after: { error: error?.message || "Unhandled error" },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (_) {}
    return res
      .status(500)
      .json({ success: false, error: "Failed to create admin" });
  }
};

// Admin Login
const loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body || {};

    // Validasi input
    if (!username || !password) {
      return res.status(400).json({ message: "username dan password wajib" });
    } // best practice validasi request [3]

    // Cari admin by username
    const admin = await prisma.admin.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        isDeleted: true,
      },
    });
    if (!admin || admin.isDeleted) {
      // Jangan bocorkan apakah username ada, tetap general
      return res.status(401).json({ message: "Kredensial tidak valid" });
    } // cek eksistensi akun [2]

    // Bandingkan password
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) {
      return res.status(401).json({ message: "Kredensial tidak valid" });
    } // bcrypt compare sesuai praktik [1]

    // Buat JWT
    const payload = {
      sub: admin.id,
      username: admin.username,
      role: admin.role,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    }); // JWT untuk sesi autentikasi [2]

    // AuditLog login
    await prisma.auditLog.create({
      data: {
        actorType: "ADMIN",
        adminId: admin.id,
        action: "ADMIN_LOGIN",
        entity: "admin",
        entityId: admin.id,
        after: { username: admin.username, role: admin.role },
      },
    }); // catat aktivitas login [4]

    return res.status(200).json({
      message: "Login berhasil",
      data: {
        token,
        user: {
          id: admin.id,
          username: admin.username,
          role: admin.role,
        },
      },
    });
  } catch (err) {
    console.error("loginAdmin error:", err);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Parallel queries untuk performa optimal
    const [
      totalBookingToday,
      totalBookingYesterday,
      activeBookings,
      activeBookingsYesterday,
      cancelledBookings,
      cancelledBookingsYesterday,
      facilityBookings,
      upcomingBookings,
      recentBookings,
    ] = await Promise.all([
      // 1. Total Booking Hari Ini
      prisma.booking.count({
        where: {
          bookingDate: {
            gte: today,
            lt: tomorrow,
          },
          isDeleted: false,
        },
      }),

      // 2. Total Booking Kemarin
      prisma.booking.count({
        where: {
          bookingDate: {
            gte: yesterday,
            lt: today,
          },
          isDeleted: false,
        },
      }),

      // 3. Jumlah Booking Aktif (APPROVED + CONFIRMED)
      prisma.booking.count({
        where: {
          status: {
            in: ["APPROVED", "CONFIRMED"],
          },
          isDeleted: false,
        },
      }),

      // 4. Booking Aktif Kemarin
      prisma.booking.count({
        where: {
          status: {
            in: ["APPROVED", "CONFIRMED"],
          },
          createdAt: {
            gte: yesterday,
            lt: today,
          },
          isDeleted: false,
        },
      }),

      // 5. Jumlah Booking Dibatalkan
      prisma.booking.count({
        where: {
          status: "CANCELLED",
          isDeleted: false,
        },
      }),

      // 6. Booking Dibatalkan Kemarin
      prisma.booking.count({
        where: {
          status: "CANCELLED",
          createdAt: {
            gte: yesterday,
            lt: today,
          },
          isDeleted: false,
        },
      }),

      // 7. Fasilitas Paling Banyak Dipesan (Group By)
      prisma.booking.groupBy({
        by: ["facilityId"],
        where: {
          status: {
            in: ["APPROVED", "CONFIRMED", "COMPLETED"],
          },
          isDeleted: false,
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        take: 1,
      }),

      // 8. Upcoming Bookings (4 terdekat)
      prisma.booking.findMany({
        where: {
          status: {
            in: ["APPROVED", "CONFIRMED"],
          },
          bookingDate: {
            gte: today,
          },
          isDeleted: false,
        },
        include: {
          facility: {
            select: {
              name: true,
            },
          },
          customer: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
        take: 4,
      }),

      // 9. Recent Bookings (5 terbaru)
      prisma.booking.findMany({
        where: {
          isDeleted: false,
        },
        include: {
          facility: {
            select: {
              name: true,
            },
          },
          customer: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      }),
    ]);

    // Hitung persentase perubahan
    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const bookingPercentageChange = calculatePercentageChange(
      totalBookingToday,
      totalBookingYesterday
    );

    const activePercentageChange = calculatePercentageChange(
      activeBookings,
      activeBookingsYesterday
    );

    const cancelledPercentageChange = calculatePercentageChange(
      cancelledBookings,
      cancelledBookingsYesterday
    );

    // Ambil nama fasilitas terpopuler
    let mostBookedFacility = null;
    if (facilityBookings.length > 0) {
      const facility = await prisma.facility.findUnique({
        where: { id: facilityBookings[0].facilityId },
        select: { name: true },
      });

      mostBookedFacility = {
        name: facility?.name || "Unknown",
        count: facilityBookings[0]._count.id,
      };
    }

    // Format response
    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalBookingToday: {
            value: totalBookingToday,
            percentageChange: bookingPercentageChange,
          },
          activeBookings: {
            value: activeBookings,
            percentageChange: activePercentageChange,
          },
          cancelledBookings: {
            value: cancelledBookings,
            percentageChange: cancelledPercentageChange,
          },
          mostBookedFacility,
        },
        upcomingBookings: upcomingBookings.map((booking) => ({
          id: booking.id,
          bookingCode: booking.bookingCode,
          facilityName: booking.facility.name,
          customerName: booking.customer.fullName,
          date: booking.bookingDate,
          startTime: booking.startTime,
          status: booking.status,
        })),
        recentBookings: recentBookings.map((booking) => ({
          bookingCode: booking.bookingCode,
          customerName: booking.customer.fullName,
          facilityName: booking.facility.name,
          datetime: `${booking.bookingDate.toISOString().split("T")[0]}, ${
            booking.startTime
              ? new Date(booking.startTime).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "-"
          }`,
          status: booking.status,
        })),
      },
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard data",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

const getAllAdmins = async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      where: {
        isDeleted: false,
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        // Jangan return password
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      data: admins,
    });
  } catch (error) {
    console.error("Get Admins Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch admins",
    });
  }
};

const getAdminById = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await prisma.admin.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!admin || admin.isDeleted) {
      return res.status(404).json({
        success: false,
        error: "Admin not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    console.error("Get Admin Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch admin",
    });
  }
};

// Admin Update
const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;
    const adminId = req.user?.id;

    if (!adminId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const existingAdmin = await prisma.admin.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        isDeleted: true,
        updatedAt: true,
      },
    });

    if (!existingAdmin || existingAdmin.isDeleted) {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "ADMIN_UPDATE",
          entity: "admin",
          entityId: id || "N/A",
          bookingId: null,
          before: existingAdmin
            ? {
                id: existingAdmin.id,
                username: existingAdmin.username,
                role: existingAdmin.role,
                isDeleted: existingAdmin.isDeleted,
              }
            : null,
          after: null,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return res.status(404).json({ success: false, error: "Admin not found" });
    }

    const updateData = {};
    const changes = {};

    if (username) {
      const dup = await prisma.admin.findFirst({
        where: { username, id: { not: id }, isDeleted: false },
        select: { id: true, username: true },
      });
      if (dup) {
        await prisma.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: adminId,
            adminId,
            action: "ADMIN_UPDATE",
            entity: "admin",
            entityId: id,
            bookingId: null,
            before: {
              id: existingAdmin.id,
              username: existingAdmin.username,
              role: existingAdmin.role,
            },
            after: null,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });
        return res
          .status(409)
          .json({ success: false, error: "Username already exists" });
      }
      updateData.username = username;
      if (username !== existingAdmin.username)
        changes.username = { from: existingAdmin.username, to: username };
    }

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
      changes.password = { changed: true };
    }

    if (role) {
      if (!["ADMIN", "STAFF"].includes(role)) {
        await prisma.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: adminId,
            adminId,
            action: "ADMIN_UPDATE",
            entity: "admin",
            entityId: id,
            bookingId: null,
            before: {
              id: existingAdmin.id,
              username: existingAdmin.username,
              role: existingAdmin.role,
            },
            after: { invalidRole: role },
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });
        return res
          .status(400)
          .json({ success: false, error: "Role must be ADMIN or STAFF" });
      }
      updateData.role = role;
      if (role !== existingAdmin.role)
        changes.role = { from: existingAdmin.role, to: role };
    }

    if (Object.keys(updateData).length === 0) {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "ADMIN_UPDATE",
          entity: "admin",
          entityId: id,
          bookingId: null,
          before: {
            id: existingAdmin.id,
            username: existingAdmin.username,
            role: existingAdmin.role,
          },
          after: { note: "No changes applied" },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return res.status(200).json({
        success: true,
        data: {
          id: existingAdmin.id,
          username: existingAdmin.username,
          role: existingAdmin.role,
          updatedAt: existingAdmin.updatedAt,
        },
        message: "No changes applied",
      });
    }

    const updatedAdmin = await prisma.$transaction(async (db) => {
      const updated = await db.admin.update({
        where: { id },
        data: updateData,
        select: { id: true, username: true, role: true, updatedAt: true },
      });

      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "ADMIN_UPDATE",
          entity: "admin",
          entityId: id,
          bookingId: null,
          before: {
            id: existingAdmin.id,
            username: existingAdmin.username,
            role: existingAdmin.role,
          },
          after: {
            id: updated.id,
            username: updated.username,
            role: updated.role,
            updatedAt: updated.updatedAt,
            changes,
            timestamp: new Date().toISOString(),
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return updated;
    });

    console.info(
      `[AUDIT] Admin ${adminId} mengubah admin ${existingAdmin.username} -> ${updatedAdmin.username} (${id})`
    );
    return res.status(200).json({
      success: true,
      data: updatedAdmin,
      message: "Admin updated successfully",
    });
  } catch (error) {
    console.error("Update Admin Error:", error);
    try {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: req.user?.id || null,
          adminId: req.user?.id || null,
          action: "ADMIN_UPDATE",
          entity: "admin",
          entityId: req.params?.id || "N/A",
          bookingId: null,
          before: null,
          after: { error: error?.message || "Unhandled error" },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (_) {}
    return res
      .status(500)
      .json({ success: false, error: "Failed to update admin" });
  }
};

// Admin Delete
const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const executorId = req.user?.id; // diambil dari middleware auth

    // Wajib autentikasi eksekutor
    if (!executorId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Admin belum terautentikasi.",
      });
    }

    // Cek admin target
    const existingAdmin = await prisma.admin.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        isDeleted: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!existingAdmin || existingAdmin.isDeleted) {
      // Audit: target tidak ditemukan atau sudah terhapus
      try {
        await prisma.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: executorId,
            adminId: executorId,
            action: "ADMIN_DELETE",
            entity: "admin",
            entityId: id || "N/A",
            bookingId: null,
            before: existingAdmin
              ? {
                  id: existingAdmin.id,
                  username: existingAdmin.username,
                  role: existingAdmin.role,
                  isDeleted: existingAdmin.isDeleted,
                }
              : null,
            after: null,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });
      } catch (_) {}
      return res.status(404).json({
        success: false,
        error: "Admin not found",
      });
    }

    // Soft delete dalam transaksi + audit sukses
    await prisma.$transaction(async (db) => {
      const updated = await db.admin.update({
        where: { id },
        data: { isDeleted: true },
        select: {
          id: true,
          username: true,
          role: true,
          isDeleted: true,
          updatedAt: true,
        },
      });

      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: executorId,
          adminId: executorId,
          action: "ADMIN_DELETE",
          entity: "admin",
          entityId: id,
          bookingId: null,
          before: {
            id: existingAdmin.id,
            username: existingAdmin.username,
            role: existingAdmin.role,
            isDeleted: existingAdmin.isDeleted,
          },
          after: {
            id: updated.id,
            username: updated.username,
            role: updated.role,
            isDeleted: updated.isDeleted, // true
            timestamp: new Date().toISOString(),
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    });

    console.info(
      `[AUDIT] Admin ${executorId} melakukan soft delete admin ${existingAdmin.username} (${existingAdmin.id})`
    );

    return res.status(200).json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (error) {
    console.error("Delete Admin Error:", error);
    // Audit: error tak terduga
    try {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: req.user?.id || null,
          adminId: req.user?.id || null,
          action: "ADMIN_DELETE",
          entity: "admin",
          entityId: req.params?.id || "N/A",
          bookingId: null,
          before: null,
          after: { error: error?.message || "Unhandled error" },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (_) {}
    return res.status(500).json({
      success: false,
      error: "Failed to delete admin",
    });
  }
};

module.exports = {
  createAdmin,
  loginAdmin,
  getDashboardStats,
  getAllAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
};
