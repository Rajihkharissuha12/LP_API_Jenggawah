import {
  PrismaClient,
  Prisma,
  OrderType,
  SalesStatus,
  PaymentStatuss,
  SalesPaymentMethod,
  PaymentStatus,
  PaymentMethod,
  TransactionType,
  BookingStatus,
  VerificationMethod,
  PricingType,
  FacilityCategory,
  BahanType,
  BahanTypePembelian,
  JenisMutasi,
} from "@prisma/client";

const prisma = new PrismaClient();
const SEED = "[DASHBOARD-SEED]";

const rupiah = (n: number) => Math.round(n);
const pick = <T>(arr: T[], i: number) => arr[i % arr.length];
const pad = (n: number, len = 4) => String(n).padStart(len, "0");
const dayStart = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, days: number) =>
  new Date(d.getTime() + days * 86400000);
const addHours = (d: Date, hours: number) =>
  new Date(d.getTime() + hours * 3600000);
const monthStart = (d: Date, offset: number) =>
  new Date(d.getFullYear(), d.getMonth() + offset, 1);
const randomHour = (i: number) =>
  [9, 10, 11, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21][i % 15];

function dateForIndex(base: Date, i: number, count: number) {
  const spanDays = Math.max(
    1,
    Math.floor((base.getTime() - addDays(base, -365).getTime()) / 86400000),
  );
  const dayOffset = (i * 17 + Math.floor(i / 11) * 3) % spanDays;
  const d = addDays(dayStart(base), -dayOffset);
  d.setHours(randomHour(i), (i * 13) % 60, (i * 29) % 60, 0);
  return d;
}

async function main() {
  const now = new Date();
  console.log("Cleaning previous dashboard seed...");

  // Remove seeded transactional data first.
  await prisma.paymentTransaction.deleteMany({
    where: { notes: { startsWith: SEED } },
  });
  await prisma.payment.deleteMany({ where: { notes: { startsWith: SEED } } });
  await prisma.bookingItem.deleteMany({
    where: { meta: { path: ["seed"], equals: SEED } },
  });
  await prisma.booking.deleteMany({
    where: { adminNote: { startsWith: SEED } },
  });

  await prisma.stokMutasi.deleteMany({
    where: { keterangan: { startsWith: SEED } },
  });
  await prisma.penjualan.deleteMany({ where: { notes: { startsWith: SEED } } });
  await prisma.pembelianBahan.deleteMany({
    where: { imgStrukPath: { startsWith: SEED } },
  });

  await prisma.menuRecipe.deleteMany({
    where: { menu: { nama: { startsWith: SEED } } },
  });
  await prisma.menu.deleteMany({ where: { nama: { startsWith: SEED } } });
  await prisma.menuCategory.deleteMany({
    where: { nama: { startsWith: SEED } },
  });
  await prisma.bahan.deleteMany({ where: { nama: { startsWith: SEED } } });
  await prisma.supplier.deleteMany({ where: { nama: { startsWith: SEED } } });
  await prisma.facility.deleteMany({ where: { name: { startsWith: SEED } } });
  await prisma.customer.deleteMany({
    where: { fullName: { startsWith: SEED } },
  });

  const admin = await prisma.admin.upsert({
    where: { username: "dashboard_seed_admin" },
    update: {},
    create: {
      username: "dashboard_seed_admin",
      password: "dashboard-seed-not-for-production",
    },
  });

  const role = await prisma.role.create({
    data: { role: `${SEED} OWNER_TEST` },
  });
  await prisma.adminRole.upsert({
    where: { adminId_roleId: { adminId: admin.id, roleId: role.id } },
    update: {},
    create: { adminId: admin.id, roleId: role.id },
  });

  const suppliers = await Promise.all(
    [
      ["PT Sumber Segar", "Budi", "081200000001"],
      ["CV Bahan Nusantara", "Sari", "081200000002"],
      ["UD Kopi Priangan", "Andi", "081200000003"],
      ["Distributor Minuman Jabar", "Dina", "081200000004"],
    ].map(([nama, pic, no_hp]) =>
      prisma.supplier.create({ data: { nama: `${SEED} ${nama}`, pic, no_hp } }),
    ),
  );

  const bahanSpecs: Array<[string, string, BahanType, number, number]> = [
    ["Biji Kopi Arabika", "Kopi", BahanType.GRAM, 2000, 0.12],
    ["Susu Full Cream", "Dairy", BahanType.ML, 5000, 0.018],
    ["Gula Aren", "Pemanis", BahanType.GRAM, 3000, 0.025],
    ["Gula Pasir", "Pemanis", BahanType.GRAM, 3000, 0.018],
    ["Cokelat Bubuk", "Cokelat", BahanType.GRAM, 1500, 0.09],
    ["Teh Hitam", "Teh", BahanType.GRAM, 1000, 0.08],
    ["Sirup Vanilla", "Sirup", BahanType.ML, 2000, 0.035],
    ["Air Mineral", "Minuman", BahanType.BOTOL, 100, 3500],
    ["Roti Brioche", "Bakery", BahanType.PCS, 100, 5500],
    ["Telur", "Protein", BahanType.PCS, 100, 2200],
    ["Keju Slice", "Dairy", BahanType.PCS, 100, 2800],
    ["Ayam Fillet", "Protein", BahanType.GRAM, 5000, 0.055],
    ["Kentang", "Sayur", BahanType.GRAM, 5000, 0.022],
    ["Minyak Goreng", "Minyak", BahanType.ML, 5000, 0.02],
  ];

  const bahan: any[] = [];
  for (const [nama, kategori, satuan, minimum_stok, harga] of bahanSpecs) {
    bahan.push(
      await prisma.bahan.create({
        data: {
          nama: `${SEED} ${nama}`,
          kategori,
          satuan,
          minimum_stok,
          stok: minimum_stok * 2,
          hargaPerSatuan: new Prisma.Decimal(harga),
        },
      }),
    );
  }

  const categoryNames = ["Coffee", "Non Coffee", "Food", "Snack"];
  const categories = await Promise.all(
    categoryNames.map((nama) =>
      prisma.menuCategory.create({
        data: {
          nama: `${SEED} ${nama}`,
          deskripsi: `${SEED} kategori dashboard`,
        },
      }),
    ),
  );

  const menuSpecs = [
    ["Es Kopi Susu Gula Aren", 28000, 9000, 0],
    ["Americano", 22000, 5500, 0],
    ["Cappuccino", 30000, 10500, 0],
    ["Cafe Latte", 30000, 10000, 0],
    ["Vanilla Latte", 32000, 11500, 1],
    ["Chocolate", 28000, 9000, 1],
    ["Iced Tea", 18000, 4500, 1],
    ["Chicken Burger", 42000, 19000, 2],
    ["French Fries", 28000, 9500, 3],
    ["Chicken Rice Bowl", 45000, 21000, 2],
    ["Egg Toast", 30000, 12000, 3],
    ["Mineral Water", 10000, 3500, 1],
  ] as const;

  const menus: any[] = [];
  for (const [nama, hargaJual, hpp, catIdx] of menuSpecs) {
    const margin = hargaJual - hpp;
    menus.push(
      await prisma.menu.create({
        data: {
          nama: `${SEED} ${nama}`,
          categoryId: categories[catIdx].id,
          hargaJual,
          hpp,
          marginNominal: margin,
          marginPersen: Math.round((margin / hargaJual) * 100),
        },
      }),
    );
  }

  const recipeMap: Record<string, Array<[number, number]>> = {
    "Es Kopi Susu Gula Aren": [
      [0, 18],
      [1, 120],
      [2, 25],
    ],
    Americano: [
      [0, 18],
      [1, 20],
    ],
    Cappuccino: [
      [0, 18],
      [1, 150],
    ],
    "Cafe Latte": [
      [0, 18],
      [1, 160],
    ],
    "Vanilla Latte": [
      [0, 18],
      [1, 150],
      [6, 15],
    ],
    Chocolate: [
      [1, 180],
      [4, 25],
      [3, 15],
    ],
    "Iced Tea": [
      [5, 8],
      [3, 15],
    ],
    "Chicken Burger": [
      [8, 1],
      [9, 1],
      [10, 1],
      [11, 100],
    ],
    "French Fries": [
      [12, 180],
      [13, 30],
    ],
    "Chicken Rice Bowl": [
      [11, 120],
      [12, 50],
      [13, 20],
    ],
    "Egg Toast": [
      [8, 1],
      [9, 2],
      [10, 1],
    ],
    "Mineral Water": [[7, 1]],
  };

  for (const menu of menus) {
    const originalName = menu.nama.replace(`${SEED} `, "");
    for (const [bahanIdx, qty] of recipeMap[originalName] ?? []) {
      await prisma.menuRecipe.create({
        data: {
          menuId: menu.id,
          bahanId: bahan[bahanIdx].id,
          qty: new Prisma.Decimal(qty),
        },
      });
    }
  }

  const facilities = await Promise.all(
    [
      ["Camping Ground", PricingType.PER_DAY, 350000, FacilityCategory.OUTDOOR],
      ["Glamping Tent", PricingType.PER_DAY, 750000, FacilityCategory.OUTDOOR],
      ["Kolam Renang", PricingType.PER_HOUR, 50000, FacilityCategory.WATER],
      ["Lapangan Futsal", PricingType.PER_HOUR, 120000, FacilityCategory.SPORT],
      ["Ruang Event", PricingType.PER_HOUR, 250000, FacilityCategory.EVENT],
    ].map(([name, pricingType, basePrice, category]) =>
      prisma.facility.create({
        data: {
          name: `${SEED} ${name}`,
          description: `${SEED} fasilitas untuk pengujian dashboard owner`,
          pricingType: pricingType as PricingType,
          basePrice: new Prisma.Decimal(basePrice as number),
          category: category as FacilityCategory,
          rating: new Prisma.Decimal("4.70"),
          ratingCount: 100,
          features: ["Parking", "Toilet", "Security"],
          availability: "OPEN",
        },
      }),
    ),
  );

  const customers: any[] = [];
  for (let i = 1; i <= 80; i++) {
    customers.push(
      await prisma.customer.create({
        data: {
          fullName: `${SEED} Customer ${pad(i, 3)}`,
          nik: `DASHSEED${pad(i, 12)}`,
          phone: `081299${pad(i, 6)}`,
          email: `dashboard.seed.${i}@example.com`,
          address: `Alamat dummy ${i}`,
          identityType: i % 2 === 0 ? "KTP" : "SIM",
          identityNumber: `IDSEED${pad(i, 10)}`,
        },
      }),
    );
  }

  console.log("Creating cash sessions...");
  const sessions: any[] = [];
  for (let i = 0; i < 12; i++) {
    const opened = monthStart(now, -i);
    sessions.push(
      await prisma.cashSession.create({
        data: {
          adminId: admin.id,
          openedAt: opened,
          closedAt: addHours(opened, 12),
        },
      }),
    );
  }

  // Purchases: 500 records spread over 12 months. Every purchase is paid immediately.
  console.log("Creating purchases and stock-in mutations...");
  for (let i = 0; i < 500; i++) {
    const b = bahan[i % bahan.length];
    const supplier = suppliers[i % suppliers.length];
    const tanggal = dateForIndex(now, i + 7, 500);
    const qtyBeli = 2 + (i % 8);
    const isiPerSatuan =
      b.satuan === BahanType.PCS || b.satuan === BahanType.BOTOL ? 10 : 1000;
    const unitPrice =
      b.satuan === BahanType.GRAM || b.satuan === BahanType.ML
        ? Number(b.hargaPerSatuan) * isiPerSatuan
        : Number(b.hargaPerSatuan);
    const total = rupiah(qtyBeli * unitPrice);
    const stokMasuk = qtyBeli * isiPerSatuan;
    b.stok += stokMasuk;
    await prisma.pembelianBahan.create({
      data: {
        bahanId: b.id,
        supplierId: supplier.id,
        tanggal,
        qtyBeli,
        satuanBeli: pick(
          [
            BahanTypePembelian.DUS,
            BahanTypePembelian.PACK,
            BahanTypePembelian.KARUNG,
            BahanTypePembelian.BOTOL,
          ],
          i,
        ),
        isiPerSatuan,
        hargaSatuan: new Prisma.Decimal(unitPrice),
        hargaTotal: new Prisma.Decimal(total),
        hargaPerUnit: new Prisma.Decimal(Number(b.hargaPerSatuan)),
        imgStrukPath: `${SEED}/receipt/${i}.jpg`,
        imgBarangPath: `${SEED}/goods/${i}.jpg`,
      },
    });
    await prisma.stokMutasi.create({
      data: {
        bahanId: b.id,
        jenis: JenisMutasi.MASUK,
        qty: stokMasuk,
        stokSetelah: b.stok,
        keterangan: `${SEED} Pembelian bahan langsung dibayar`,
      },
    });
  }
  for (const b of bahan)
    await prisma.bahan.update({ where: { id: b.id }, data: { stok: b.stok } });

  // Sales: 1,800 records, with extra records today to make today's dashboard non-empty.
  console.log("Creating sales, payments, recipes and stock-out mutations...");
  const salesCount = 1800;
  for (let i = 0; i < salesCount; i++) {
    const isToday = i < 35;
    const createdAt = isToday
      ? new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          9 + (i % 12),
          (i * 7) % 60,
        )
      : dateForIndex(now, i + 101, salesCount);
    const itemCount = 1 + (i % 4);
    const selectedMenus = Array.from(
      { length: itemCount },
      (_, j) => menus[(i * 3 + j * 5) % menus.length],
    );
    const details = selectedMenus.map((m, j) => {
      const qty = 1 + ((i + j) % 3);
      const price = Number(m.hargaJual);
      return { menu: m, qty, subtotal: price * qty };
    });
    const subtotal = details.reduce((s, x) => s + x.subtotal, 0);
    const discount = i % 13 === 0 ? Math.round(subtotal * 0.1) : 0;
    const taxEnabled = i % 5 === 0;
    const afterDiscount = subtotal - discount;
    const tax = taxEnabled ? Math.round(afterDiscount * 0.1) : 0;
    const grandTotal = afterDiscount + tax;
    const paidAt = addHours(createdAt, i % 7 === 0 ? 2 : 0);
    const method = pick(
      [
        SalesPaymentMethod.CASH,
        SalesPaymentMethod.QRIS,
        SalesPaymentMethod.TRANSFER,
      ],
      i,
    );
    const orderType = pick(
      [OrderType.DINE_IN, OrderType.TAKE_AWAY, OrderType.DELIVERY],
      i + 1,
    );
    const session = sessions[i % sessions.length];

    const sale = await prisma.penjualan.create({
      data: {
        nomorInvoice: `DS-${createdAt.getFullYear()}${pad(createdAt.getMonth() + 1, 2)}-${pad(i + 1, 5)}`,
        queueNumber: `${pad((i % 99) + 1, 2)}`,
        adminId: admin.id,
        cashSessionId: session.id,
        customerName: customers[i % customers.length].fullName.replace(
          `${SEED} `,
          "",
        ),
        orderType,
        tableNumber:
          orderType === OrderType.DINE_IN ? `T-${(i % 20) + 1}` : null,
        subtotal,
        discountAmount: discount,
        discountPercent: discount ? 10 : 0,
        isTaxEnabled: taxEnabled,
        taxPercent: taxEnabled ? 10 : 0,
        taxRate: taxEnabled ? 10 : 0,
        taxAmount: tax,
        grandTotal,
        status: SalesStatus.COMPLETED,
        notes: `${SEED} Dashboard sales test data`,
        paidAt,
        totalItem: details.reduce((s, x) => s + x.qty, 0),
        paymentStatus: PaymentStatuss.PAID,
        printedAt: addHours(createdAt, 1),
        createdAt,
        updatedAt: paidAt,
      },
    });

    await prisma.penjualanPayment.create({
      data: {
        penjualanId: sale.id,
        method,
        amount: grandTotal,
        paidAmount: grandTotal,
        changeAmount: 0,
        referenceNo:
          method === SalesPaymentMethod.CASH ? null : `REF-DS-${pad(i + 1, 7)}`,
        notes: `${SEED} paid immediately`,
        createdAt: paidAt,
        updatedAt: paidAt,
      },
    });

    for (const d of details) {
      const detail = await prisma.penjualanDetail.create({
        data: {
          penjualanId: sale.id,
          menuId: d.menu.id,
          namaMenu: d.menu.nama.replace(`${SEED} `, ""),
          hargaJual: Number(d.menu.hargaJual),
          hpp: Number(d.menu.hpp),
          qty: d.qty,
          subtotal: d.subtotal,
          categoryName: "Dashboard Seed",
          createdAt,
        },
      });

      const originalName = d.menu.nama.replace(`${SEED} `, "");
      const recipes = recipeMap[originalName] ?? [];
      for (const [bahanIdx, recipeQty] of recipes) {
        const b = bahan[bahanIdx];
        const qtyUsed = recipeQty * d.qty;
        const totalHpp = Number(b.hargaPerSatuan) * qtyUsed;
        await prisma.penjualanDetailRecipe.create({
          data: {
            penjualanDetailId: detail.id,
            bahanId: b.id,
            namaBahan: b.nama.replace(`${SEED} `, ""),
            qty: new Prisma.Decimal(qtyUsed),
            hargaPerUnit: new Prisma.Decimal(Number(b.hargaPerSatuan)),
            totalHpp: new Prisma.Decimal(totalHpp),
          },
        });
        b.stok = Math.max(0, b.stok - qtyUsed);
        await prisma.stokMutasi.create({
          data: {
            bahanId: b.id,
            jenis: JenisMutasi.KELUAR,
            qty: qtyUsed,
            stokSetelah: b.stok,
            penjualanId: sale.id,
            keterangan: `${SEED} Pemakaian bahan penjualan ${sale.nomorInvoice}`,
          },
        });
      }
    }
  }
  for (const b of bahan)
    await prisma.bahan.update({ where: { id: b.id }, data: { stok: b.stok } });

  // Booking + booking items + payments + payment transactions.
  console.log("Creating bookings and booking payments...");
  for (let i = 0; i < 450; i++) {
    const isToday = i < 8;
    const bookingDate = isToday
      ? dayStart(now)
      : dayStart(dateForIndex(now, i + 2000, 450));
    const facility = facilities[i % facilities.length];
    const customer = customers[(i * 7) % customers.length];
    const price = Number(facility.basePrice);
    const unitCount =
      facility.pricingType === PricingType.PER_HOUR ? 2 + (i % 4) : 1;
    const total = price * unitCount;
    const status =
      i % 19 === 0
        ? BookingStatus.CANCELLED
        : i % 23 === 0
          ? BookingStatus.COMPLETED
          : BookingStatus.CONFIRMED;
    const paymentStatus =
      i % 17 === 0
        ? PaymentStatus.REFUNDED
        : i % 4 === 0
          ? PaymentStatus.DP
          : PaymentStatus.PAID;
    const createdAt = addHours(bookingDate, -24 - (i % 72));
    const start = new Date(bookingDate);
    start.setHours(10 + (i % 8), 0, 0, 0);
    const end = addHours(start, unitCount);
    const paid =
      paymentStatus === PaymentStatus.DP ? Math.round(total * 0.3) : total;

    const booking = await prisma.booking.create({
      data: {
        bookingCode: `DS-BK-${bookingDate.getFullYear()}${pad(bookingDate.getMonth() + 1, 2)}-${pad(i + 1, 5)}`,
        customerId: customer.id,
        facilityId: facility.id,
        bookingDate,
        startTime: start,
        endTime: end,
        participants: 2 + (i % 8),
        purpose:
          i % 3 === 0
            ? "Family trip"
            : i % 3 === 1
              ? "Company outing"
              : "Leisure",
        status,
        adminNote: `${SEED} booking dashboard test data`,
        verificationMethod: VerificationMethod.WHATSAPP,
        verifiedAt: addHours(createdAt, 3),
        source: i % 2 === 0 ? "WEB" : "ADMIN",
        totalAmount: new Prisma.Decimal(total),
        createdAt,
        updatedAt: createdAt,
      },
    });

    await prisma.bookingItem.create({
      data: {
        bookingId: booking.id,
        date: bookingDate,
        startTime: start,
        endTime: end,
        unitType: facility.pricingType,
        unitCount,
        price: new Prisma.Decimal(price),
        meta: {
          seed: SEED,
          facilityName: facility.name.replace(`${SEED} `, ""),
        },
      },
    });

    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        status: paymentStatus,
        totalDue: new Prisma.Decimal(total),
        totalPaid: new Prisma.Decimal(
          status === BookingStatus.CANCELLED ? 0 : paid,
        ),
        lastTransactionAt: createdAt,
        notes: `${SEED} booking payment`,
        createdAt,
        updatedAt: createdAt,
      },
    });

    if (status !== BookingStatus.CANCELLED) {
      await prisma.paymentTransaction.create({
        data: {
          bookingId: booking.id,
          paymentId: payment.id,
          amount: paid,
          type:
            paymentStatus === PaymentStatus.DP
              ? TransactionType.DP
              : TransactionType.PAID,
          method: pick(
            [
              PaymentMethod.CASH,
              PaymentMethod.TRANSFER_MANUAL,
              PaymentMethod.QRIS_OFFLINE,
            ],
            i,
          ),
          status: "RECORDED",
          receiptNumber: `DS-RC-${pad(i + 1, 6)}`,
          cashierId: admin.id,
          paidAt: addHours(createdAt, 1),
          notes: `${SEED} booking cash-in`,
        },
      });
    }

    if (paymentStatus === PaymentStatus.REFUNDED) {
      await prisma.paymentTransaction.create({
        data: {
          bookingId: booking.id,
          paymentId: payment.id,
          amount: paid,
          type: TransactionType.REFUND,
          method: PaymentMethod.TRANSFER_MANUAL,
          status: "RECORDED",
          receiptNumber: `DS-RF-${pad(i + 1, 6)}`,
          cashierId: admin.id,
          paidAt: addDays(createdAt, 2),
          notes: `${SEED} booking refund`,
        },
      });
    }
  }

  console.log("Updating seeded stock values...");
  for (const b of bahan) {
    const current = await prisma.bahan.findUnique({
      where: { id: b.id },
      select: { stok: true },
    });
    if (current)
      await prisma.bahan.update({
        where: { id: b.id },
        data: { stok: Math.max(0, current.stok) },
      });
  }

  const [sales, bookings, purchases, payments] = await Promise.all([
    prisma.penjualan.count({ where: { notes: { startsWith: SEED } } }),
    prisma.booking.count({ where: { adminNote: { startsWith: SEED } } }),
    prisma.pembelianBahan.count({
      where: { imgStrukPath: { startsWith: SEED } },
    }),
    prisma.paymentTransaction.count({ where: { notes: { startsWith: SEED } } }),
  ]);

  console.log("\nDashboard seed completed.");
  console.log({ sales, bookings, purchases, paymentTransactions: payments });
  console.log("Seed marker:", SEED);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
