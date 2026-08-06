const { PrismaClient, Role } = require("@prisma/client");
const prisma = new PrismaClient();

const createRole = async (req, res) => {
  const { roleName } = req.body;
  try {
    const addRole = await prisma.role.create({
      data: { role: roleName },
    });

    return res.status(201).json({ success: true, message: "Success add role" });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Failed to create admin" });
  }
};

const getRole = async (req, res) => {
  try {
    const get = await prisma.role.findMany({
      where: {
        isDeleted: false,
      },
      orderBy: {
        role: "asc",
      },
    });

    return res
      .status(201)
      .json({ success: true, message: "Success add role", data: get });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: "Failed to create admin" });
  }
};

const addRole = async (req, res) => {
  const { adminId, roleId } = req.body;

  try {
    const findAdmin = await prisma.admin.findUnique({
      where: {
        id: adminId,
      },
    });

    if (!findAdmin) {
      return res.status(404).json({ message: "User Not Found" });
    }

    const findRole = await prisma.role.findUnique({
      where: {
        id: roleId,
      },
    });

    if (!findRole) {
      return res.status(404).json({ message: "Role Not Found" });
    }

    const addRole = await prisma.adminRole.create({
      data: {
        adminId: adminId,
        roleId: roleId,
      },
    });

    return res.status(201).json({ success: true, message: "Success add role" });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to add admin" });
  }
};

module.exports = {
  createRole,
  addRole,
  getRole,
};
