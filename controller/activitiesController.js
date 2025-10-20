const { PrismaClient, Role } = require("@prisma/client");

const prisma = new PrismaClient();
// GET activity logs with filters
const getActivityLogs = async (req, res) => {
  try {
    const {
      page = "1",
      limit = "20",
      actorType,
      adminId,
      action,
      entity,
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter conditions
    const where = {};

    if (actorType) {
      where.actorType = actorType;
    }

    if (adminId) {
      where.adminId = adminId;
    }

    if (action) {
      where.action = {
        contains: action,
        mode: "insensitive",
      };
    }

    if (entity) {
      where.entity = entity;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Fetch logs with pagination
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
          booking: {
            select: {
              bookingCode: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limitNum,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Get statistics
    const stats = await prisma.auditLog.groupBy({
      by: ["actorType"],
      _count: {
        id: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
        stats: stats.reduce((acc, stat) => {
          acc[stat.actorType] = stat._count.id;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Get Activity Logs Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch activity logs",
    });
  }
};

// GET activity log by ID
const getActivityLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: {
        admin: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
        booking: {
          select: {
            bookingCode: true,
            customer: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        error: "Activity log not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: log,
    });
  } catch (error) {
    console.error("Get Activity Log Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch activity log",
    });
  }
};

// GET activity summary/dashboard
const getActivitySummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const [
      todayCount,
      yesterdayCount,
      weekCount,
      totalCount,
      actionBreakdown,
      topUsers,
    ] = await Promise.all([
      // Today's activities
      prisma.auditLog.count({
        where: {
          createdAt: { gte: today },
        },
      }),
      // Yesterday's activities
      prisma.auditLog.count({
        where: {
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
      }),
      // Last 7 days
      prisma.auditLog.count({
        where: {
          createdAt: { gte: lastWeek },
        },
      }),
      // Total count
      prisma.auditLog.count(),
      // Action breakdown
      prisma.auditLog.groupBy({
        by: ["action"],
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        take: 10,
      }),
      // Top users
      prisma.auditLog.groupBy({
        by: ["adminId"],
        where: {
          adminId: { not: null },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        take: 5,
      }),
    ]);

    // Get admin details for top users
    const adminIds = topUsers.map((u) => u.adminId).filter(Boolean);
    const admins = await prisma.admin.findMany({
      where: {
        id: { in: adminIds },
      },
      select: {
        id: true,
        username: true,
        role: true,
      },
    });

    const topUsersWithDetails = topUsers.map((user) => {
      const admin = admins.find((a) => a.id === user.adminId);
      return {
        adminId: user.adminId,
        username: admin?.username || "Unknown",
        role: admin?.role || "UNKNOWN",
        activityCount: user._count.id,
      };
    });

    const percentageChange =
      yesterdayCount > 0
        ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
        : todayCount > 0
        ? 100
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          today: todayCount,
          yesterday: yesterdayCount,
          lastWeek: weekCount,
          total: totalCount,
          percentageChange,
        },
        actionBreakdown: actionBreakdown.map((a) => ({
          action: a.action,
          count: a._count.id,
        })),
        topUsers: topUsersWithDetails,
      },
    });
  } catch (error) {
    console.error("Get Activity Summary Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch activity summary",
    });
  }
};

module.exports = { getActivityLogs, getActivityLogById, getActivitySummary };
