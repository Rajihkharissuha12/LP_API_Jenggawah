// middleware/auth.js
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Middleware: autentikasi JWT
 * - Membaca Authorization: Bearer <token>
 * - Verifikasi token dengan JWT_SECRET
 * - Memuat user dari DB (opsional untuk memastikan masih aktif)
 */
async function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const parts = auth.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ message: "Unauthorized" });
    } // pola header bearer standar [1]

    const token = parts[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res
        .status(401)
        .json({ message: "Token invalid atau kedaluwarsa" });
    } // praktik verifikasi JWT di Express/Prisma [2]

    // payload diharapkan: { sub: adminId, role: 'ADMIN'|'STAFF', username, iat, exp }
    const admin = await prisma.admin.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, isDeleted: true },
    });
    if (!admin || admin.isDeleted) {
      return res
        .status(401)
        .json({ message: "Akun tidak ditemukan atau nonaktif" });
    } // verifikasi sisi server setelah token valid [2]

    // Lampirkan ke request context
    req.user = {
      id: admin.id,
      username: admin.username,
      role: admin.role,
    };

    return next();
  } catch (err) {
    console.error("authenticate error:", err);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
}

/**
 * Middleware: otorisasi berdasarkan role
 * - authorizeRoles('ADMIN') untuk admin saja
 * - authorizeRoles('ADMIN','STAFF') untuk keduanya
 */
function authorizeRoles(...allowed) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      } // autentikasi harus jalan dulu [1]
      if (!allowed.includes(req.user.role)) {
        return res.status(403).json({ message: "Forbidden" });
      } // pembatasan akses berbasis peran [3]
      return next();
    } catch (err) {
      console.error("authorizeRoles error:", err);
      return res.status(500).json({ message: "Terjadi kesalahan server" });
    }
  };
}

module.exports = { authenticate, authorizeRoles };
