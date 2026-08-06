const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const tambahSupplier = async (req, res) => {
  try {
    const { nama, pic, no_hp, email, alamat, keterangan } = req.body;

    if (!nama || !nama.trim()) {
      return res.status(400).json({
        success: false,
        message: "Nama supplier wajib diisi.",
      });
    }

    // Cek nama supplier sudah ada atau belum
    const existing = await prisma.supplier.findFirst({
      where: {
        nama,
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Supplier sudah terdaftar.",
      });
    }

    const supplier = await prisma.supplier.create({
      data: {
        nama: nama.trim(),
        pic: pic?.trim() || null,
        no_hp: no_hp?.trim() || null,
        email: email?.trim() || null,
        alamat: alamat?.trim() || null,
        keterangan: keterangan?.trim() || null,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Supplier berhasil ditambahkan.",
      data: supplier,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

const getSupplier = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const cursor = req.query.cursor;
    const search = req.query.search || "";

    const suppliers = await prisma.supplier.findMany({
      where: {
        nama: {
          contains: search,
          mode: "insensitive",
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: {
          id: cursor,
        },
      }),
    });

    const hasMore = suppliers.length > limit;

    if (hasMore) {
      suppliers.pop();
    }

    return res.status(200).json({
      success: true,
      data: suppliers,
      nextCursor: hasMore ? suppliers[suppliers.length - 1].id : null,
      hasMore,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
};

const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
      },
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const { nama, pic, no_hp, email, alamat, keterangan } = req.body;

    // cek supplier ada atau tidak
    const existing = await prisma.supplier.findFirst({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Supplier tidak ditemukan",
      });
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        nama: nama?.trim(),
        pic: pic?.trim() || null,
        no_hp: no_hp?.trim() || null,
        email: email?.trim() || null,
        alamat: alamat?.trim() || null,
        keterangan: keterangan?.trim() || null,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Supplier berhasil diupdate",
      data: updated,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

module.exports = {
  tambahSupplier,
  getSupplier,
  getSupplierById,
  updateSupplier,
};
