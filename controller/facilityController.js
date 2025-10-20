// src/controllers/facility.controller.ts
const express = require("express");
const { PrismaClient, PricingType } = require("@prisma/client");
const {
  uploadBufferToCloudinary,
  deleteCloudinaryByPublicId,
} = require("../utils/cloudinary-helpers");
const {
  toDecimalString,
  validatePricingType,
  validateCategory,
  normalizeStringArray,
} = require("../utils/facility-validator");

const prisma = new PrismaClient();

// Admin membuat fasilitas baru
const createFacility = async (req, res) => {
  try {
    const {
      name,
      description,
      pricingType,
      basePrice,
      minDuration,
      category,
      rating,
      ratingCount,
      features,
      capacityLabel,
      durationLabel,
      iconKey,
      // booking rules (opsional)
      bookingWindowDays,
      advanceNoticeHours,
      prepBufferBeforeMin,
      prepBufferAfterMin,
      maxParticipants,
      // aturan ketentuan (HTML dari FE) opsional
      rules,
    } = req.body;

    const adminId = req.user?.id || null;
    const adminName = req.user?.username || req.user?.email || null;

    // 0) Auth
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi" });
    }

    // 1) Validasi wajib
    if (!name || String(name).trim().length < 3) {
      return res
        .status(400)
        .json({ message: "Nama fasilitas wajib dan minimal 3 karakter" });
    }

    const normalizedPricing = validatePricingType(pricingType); // "PER_TICKET" | "PER_HOUR" | "PER_DAY"

    // 2) minDuration khusus PER_DAY
    let minDurationValue = null;
    if (normalizedPricing === "PER_DAY") {
      if (
        minDuration === undefined ||
        minDuration === null ||
        minDuration === ""
      ) {
        minDurationValue = 1;
      } else {
        const md = Number(minDuration);
        if (!Number.isInteger(md) || md < 1) {
          return res.status(400).json({
            message: "minDuration untuk PER_DAY harus bilangan bulat >= 1",
          });
        }
        minDurationValue = md;
      }
    } else {
      minDurationValue = null;
    }

    // 3) Decimal basePrice
    let basePriceStr;
    try {
      basePriceStr = toDecimalString(basePrice); // pastikan mengembalikan string desimal valid "####.##"
    } catch (e) {
      const code = e?.message || "";
      return res.status(400).json({
        message:
          code === "BASE_PRICE_REQUIRED"
            ? "basePrice wajib diisi"
            : "basePrice tidak valid",
      });
    }

    // 4) Presentasi/opsional
    const categoryEnum = validateCategory(category) ?? undefined;
    const featuresArr = normalizeStringArray(features) ?? [];

    let ratingDec = undefined;
    if (rating !== undefined) {
      if (rating === null || rating === "") ratingDec = null;
      else {
        const rv = Number(rating);
        if (!Number.isFinite(rv) || rv < 0 || rv > 5) {
          return res.status(400).json({ message: "rating harus 0..5" });
        }
        ratingDec = Number(rv.toFixed(2));
      }
    }

    let ratingCountInt = undefined;
    if (ratingCount !== undefined) {
      if (ratingCount === null || ratingCount === "") ratingCountInt = null;
      else {
        const rc = Number(ratingCount);
        if (!Number.isInteger(rc) || rc < 0) {
          return res
            .status(400)
            .json({ message: "ratingCount harus bilangan bulat >= 0" });
        }
        ratingCountInt = rc;
      }
    }

    // 5) Cek unik nama
    const exists = await prisma.facility.findFirst({
      where: { name: String(name).trim(), isDeleted: false },
      select: { id: true },
    });
    if (exists) {
      return res
        .status(409)
        .json({ message: "Nama fasilitas sudah digunakan" });
    }

    // 6) Upload Cloudinary (multer.fields)
    const filesObj = req.files;

    const heroFile =
      filesObj && !Array.isArray(filesObj)
        ? filesObj.heroImage?.[0]
        : undefined;

    const imageFiles =
      filesObj && !Array.isArray(filesObj) ? filesObj.images ?? [] : [];

    let heroImageObj = null;
    const imagesArray = [];

    if (heroFile) {
      const up = await uploadBufferToCloudinary(
        heroFile.buffer,
        "facilities/hero"
      );
      // Struktur yang disimpan di kolom Json: { image_url, public_id, ... }
      heroImageObj = up;
    }

    for (const f of imageFiles) {
      const up = await uploadBufferToCloudinary(f.buffer, "facilities/gallery");
      imagesArray.push(up);
    }

    // 6.5) Normalisasi rules (HTML string) opsional
    let rulesHtml = undefined;
    if (rules !== undefined) {
      if (rules === null || rules === "") rulesHtml = null;
      else if (typeof rules === "string") {
        rulesHtml = rules.trim();
        if (rulesHtml.length > 20000) {
          rulesHtml = rulesHtml.slice(0, 20000);
        }
      } else {
        return res.status(400).json({ message: "rules harus string HTML" });
      }
    }

    // 7) Simpan dalam transaksi: Facility + PriceList + BookingRule (opsional) + Audit
    const created = await prisma.$transaction(async (tx) => {
      const facility = await tx.facility.create({
        data: {
          name: String(name).trim(),
          description: description?.trim() || null,
          pricingType: normalizedPricing,
          minDuration: minDurationValue,
          basePrice: basePriceStr,
          // FE fields
          heroImage: heroImageObj, // Json object
          images: imagesArray.length ? imagesArray : null, // Json array
          category: categoryEnum ?? null,
          rating: ratingDec ?? undefined,
          ratingCount: ratingCountInt ?? undefined,
          features: featuresArr,
          capacityLabel: capacityLabel?.trim() || null,
          durationLabel: durationLabel?.trim() || null,
          iconKey: iconKey?.trim() || null,
          availability: "OPEN",
          rules: rulesHtml ?? undefined,
        },
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
          iconKey: true,
          availability: true,
          rules: true,
          createdAt: true,
        },
      });

      // PriceList pertama mengikuti basePrice saat create
      const priceList = await tx.priceList.create({
        data: {
          facilityId: facility.id,
          pricingType: facility.pricingType,
          unitPrice: facility.basePrice,
          minDuration: facility.minDuration,
          effectiveFrom: new Date(),
        },
        select: {
          id: true,
          facilityId: true,
          pricingType: true,
          unitPrice: true,
          minDuration: true,
          effectiveFrom: true,
        },
      });

      // BookingRule (opsional)
      const needRule =
        bookingWindowDays !== undefined ||
        advanceNoticeHours !== undefined ||
        prepBufferBeforeMin !== undefined ||
        prepBufferAfterMin !== undefined ||
        maxParticipants !== undefined;

      let ruleCreated = null;
      if (needRule) {
        const bwDays =
          Number.isInteger(Number(bookingWindowDays)) &&
          Number(bookingWindowDays) > 0
            ? Number(bookingWindowDays)
            : 180;
        const advHours =
          Number.isInteger(Number(advanceNoticeHours)) &&
          Number(advanceNoticeHours) >= 0
            ? Number(advanceNoticeHours)
            : 0;
        const prepBefore =
          Number.isInteger(Number(prepBufferBeforeMin)) &&
          Number(prepBufferBeforeMin) >= 0
            ? Number(prepBufferBeforeMin)
            : 0;
        const prepAfter =
          Number.isInteger(Number(prepBufferAfterMin)) &&
          Number(prepBufferAfterMin) >= 0
            ? Number(prepBufferAfterMin)
            : 0;
        const maxPart =
          Number.isInteger(Number(maxParticipants)) &&
          Number(maxParticipants) > 0
            ? Number(maxParticipants)
            : null;

        ruleCreated = await tx.bookingRule.create({
          data: {
            facilityId: facility.id,
            bookingWindowDays: bwDays,
            advanceNoticeHours: advHours,
            prepBufferBeforeMin: prepBefore,
            prepBufferAfterMin: prepAfter,
            maxParticipants: maxPart,
          },
          select: {
            id: true,
            facilityId: true,
            bookingWindowDays: true,
            advanceNoticeHours: true,
            prepBufferBeforeMin: true,
            prepBufferAfterMin: true,
            maxParticipants: true,
          },
        });
      }

      // AuditLog terstruktur
      await tx.auditLog.create({
        data: {
          actorType: "ADMIN",
          adminId,
          action: "FACILITY_CREATE",
          entity: "facility",
          entityId: facility.id,
          // Tidak ada before pada create
          before: null,
          after: {
            facility: {
              id: facility.id,
              name: facility.name,
              description: facility.description,
              pricingType: facility.pricingType,
              minDuration: facility.minDuration,
              basePrice:
                facility.basePrice?.toString?.() ?? String(facility.basePrice),
              category: facility.category,
              rating: facility.rating,
              ratingCount: facility.ratingCount,
              features: facility.features,
              capacityLabel: facility.capacityLabel,
              durationLabel: facility.durationLabel,
              iconKey: facility.iconKey,
              availability: facility.availability,
              heroImage: facility.heroImage,
              images: facility.images,
              rules: facility.rules,
              createdAt: facility.createdAt,
            },
            initialPriceList: priceList
              ? {
                  id: priceList.id,
                  pricingType: priceList.pricingType,
                  unitPrice:
                    priceList.unitPrice?.toString?.() ??
                    String(priceList.unitPrice),
                  minDuration: priceList.minDuration,
                  effectiveFrom: priceList.effectiveFrom,
                }
              : null,
            initialBookingRule: ruleCreated
              ? {
                  id: ruleCreated.id,
                  bookingWindowDays: ruleCreated.bookingWindowDays,
                  advanceNoticeHours: ruleCreated.advanceNoticeHours,
                  prepBufferBeforeMin: ruleCreated.prepBufferBeforeMin,
                  prepBufferAfterMin: ruleCreated.prepBufferAfterMin,
                  maxParticipants: ruleCreated.maxParticipants,
                }
              : null,
            createdBy: { adminId, adminName },
            createdAt: new Date().toISOString(),
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return facility;
    });

    return res.status(201).json({
      message: "Fasilitas berhasil dibuat",
      data: created,
    });
  } catch (err) {
    console.error("createFacility error:", err);
    if (err?.code === "P2002") {
      return res
        .status(409)
        .json({ message: "Nama fasilitas sudah digunakan" });
    }
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Admin update fasilitas
const updateFacility = async (req, res) => {
  try {
    const facilityId = req.params.id;
    const adminId = req.user?.id || null;
    const adminName = req.user?.username || req.user?.email || null;

    if (!facilityId) {
      return res.status(400).json({ message: "Param id fasilitas wajib" });
    }
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi" });
    }

    // Ambil before untuk audit dan media lama
    const existing = await prisma.facility.findUnique({
      where: { id: facilityId },
      select: {
        id: true,
        isDeleted: true,
        name: true,
        description: true,
        pricingType: true,
        minDuration: true,
        basePrice: true,
        category: true,
        rating: true,
        ratingCount: true,
        features: true,
        capacityLabel: true,
        durationLabel: true,
        iconKey: true,
        heroImage: true, // { image_url, public_id }
        images: true, // [{ image_url, public_id }]
        availability: true,
        rules: true,
      },
    });

    if (!existing || existing.isDeleted) {
      return res.status(404).json({ message: "Fasilitas tidak ditemukan" });
    }

    const {
      name,
      description,
      pricingType,
      basePrice,
      minDuration,
      category,
      rating,
      ratingCount,
      features,
      capacityLabel,
      durationLabel,
      iconKey,
      // booking rules
      bookingWindowDays,
      advanceNoticeHours,
      prepBufferBeforeMin,
      prepBufferAfterMin,
      maxParticipants,
      // image ops
      removeImages, // array/string of public_id
      removeHero, // boolean or "true"/"false"
      availability,
      // rules HTML
      rules,
    } = req.body || {};

    const dataUpdate = {};

    // Validasi dasar
    if (name !== undefined) {
      if (!name || String(name).trim().length < 3) {
        return res.status(400).json({ message: "name minimal 3 karakter" });
      }
      dataUpdate.name = String(name).trim();
    }

    if (availability !== undefined) {
      dataUpdate.availability = availability;
    }

    if (description !== undefined) {
      dataUpdate.description = description ? String(description).trim() : null;
    }

    if (pricingType !== undefined) {
      try {
        dataUpdate.pricingType = validatePricingType(pricingType);
      } catch {
        return res.status(400).json({ message: "pricingType tidak valid" });
      }
    }

    if (basePrice !== undefined) {
      try {
        const bpStr = toDecimalString(basePrice);
        dataUpdate.basePrice = bpStr;
      } catch {
        return res.status(400).json({ message: "basePrice harus angka > 0" });
      }
    }

    // minDuration berdasar pricingType efektif
    const effectivePricing = dataUpdate.pricingType ?? existing.pricingType;
    if (effectivePricing === "PER_DAY") {
      if (
        minDuration === undefined ||
        minDuration === null ||
        minDuration === ""
      ) {
        dataUpdate.minDuration = existing.minDuration ?? 1;
      } else {
        const md = Number(minDuration);
        if (!Number.isInteger(md) || md < 1) {
          return res.status(400).json({
            message: "minDuration untuk PER_DAY harus bilangan bulat >= 1",
          });
        }
        dataUpdate.minDuration = md;
      }
    } else {
      dataUpdate.minDuration = null;
    }

    // Presentasi
    const cat = category !== undefined ? validateCategory(category) : undefined;
    if (cat !== undefined) dataUpdate.category = cat;

    if (features !== undefined)
      dataUpdate.features = normalizeStringArray(features) ?? [];

    if (capacityLabel !== undefined)
      dataUpdate.capacityLabel = capacityLabel
        ? String(capacityLabel).trim()
        : null;

    if (durationLabel !== undefined)
      dataUpdate.durationLabel = durationLabel
        ? String(durationLabel).trim()
        : null;

    if (iconKey !== undefined)
      dataUpdate.iconKey = iconKey ? String(iconKey).trim() : null;

    if (rating !== undefined) {
      if (rating === null || rating === "") dataUpdate.rating = null;
      else {
        const rv = Number(rating);
        if (!Number.isFinite(rv) || rv < 0 || rv > 5) {
          return res.status(400).json({ message: "rating harus 0..5" });
        }
        dataUpdate.rating = Number(rv.toFixed(2));
      }
    }

    if (ratingCount !== undefined) {
      if (ratingCount === null || ratingCount === "")
        dataUpdate.ratingCount = null;
      else {
        const rc = Number(ratingCount);
        if (!Number.isInteger(rc) || rc < 0) {
          return res
            .status(400)
            .json({ message: "ratingCount harus bilangan bulat >= 0" });
        }
        dataUpdate.ratingCount = rc;
      }
    }

    // ---------- FILES (multer.fields) ----------
    const filesObj = req.files || undefined;
    const newHeroFile = filesObj?.heroImage?.[0];
    const newGalleryFiles = filesObj?.images ?? [];

    // Gallery lama
    const currentGallery = Array.isArray(existing.images)
      ? existing.images
      : [];

    // Remove gallery by public_id
    let removeList = [];
    if (removeImages !== undefined) {
      const arr = Array.isArray(removeImages)
        ? removeImages
        : typeof removeImages === "string"
        ? removeImages.startsWith("[")
          ? JSON.parse(removeImages)
          : removeImages.split(",")
        : [];
      removeList = arr.map((s) => String(s).trim()).filter(Boolean);
      if (removeList.length) {
        dataUpdate.images = currentGallery.filter(
          (img) => !removeList.includes(img?.public_id)
        );
      }
    }

    // Remove heroImage jika diminta
    const removeHeroFlag = String(removeHero).toLowerCase() === "true";
    if (removeHeroFlag) {
      dataUpdate.heroImage = null;
    }

    // Upload hero baru (replace)
    let uploadedNewHero = null;
    if (newHeroFile) {
      const up = await uploadBufferToCloudinary(
        newHeroFile.buffer,
        "facilities/hero"
      );
      dataUpdate.heroImage = up;
      uploadedNewHero = up;
    }

    // Upload gallery baru (append)
    const uploadedGallery = [];
    for (const f of newGalleryFiles) {
      const up = await uploadBufferToCloudinary(f.buffer, "facilities/gallery");
      uploadedGallery.push(up);
    }
    if (uploadedGallery.length) {
      const base = dataUpdate.images ?? currentGallery;
      dataUpdate.images = [...base, ...uploadedGallery];
    }

    // ---------- Rules (HTML) ----------
    if (rules !== undefined) {
      if (rules === null || rules === "") {
        dataUpdate.rules = null;
      } else if (typeof rules === "string") {
        let html = rules.trim();
        if (html.length > 20000) {
          html = html.slice(0, 20000);
        }
        dataUpdate.rules = html;
      } else {
        return res.status(400).json({ message: "rules harus string HTML" });
      }
    }

    // ---------- BookingRule upsert ----------
    const ruleUpdate = {};
    const setIfInt = (k, v, min, allowNull = true) => {
      if (v === undefined) return;
      if (v === null || v === "") {
        if (allowNull) ruleUpdate[k] = null;
        return;
      }
      const n = Number(v);
      if (!Number.isInteger(n) || n < min) throw new Error(k);
      ruleUpdate[k] = n;
    };
    try {
      setIfInt("bookingWindowDays", bookingWindowDays, 0);
      setIfInt("advanceNoticeHours", advanceNoticeHours, 0);
      setIfInt("prepBufferBeforeMin", prepBufferBeforeMin, 0);
      setIfInt("prepBufferAfterMin", prepBufferAfterMin, 0);
      if (maxParticipants !== undefined) {
        if (maxParticipants === null || maxParticipants === "")
          ruleUpdate.maxParticipants = null;
        else {
          const n = Number(maxParticipants);
          if (!Number.isInteger(n) || n < 1) throw new Error("maxParticipants");
          ruleUpdate.maxParticipants = n;
        }
      }
    } catch (e) {
      return res.status(400).json({ message: `${e.message} tidak valid` });
    }

    // ---------- Simpan perubahan dalam transaksi ----------
    const updated = await prisma.$transaction(async (db) => {
      // Snapshot before untuk audit (normalize basePrice ke string untuk konsistensi)
      const beforeSnapshot = {
        ...existing,
        basePrice:
          existing.basePrice?.toString?.() ?? String(existing.basePrice ?? ""),
      };

      const facility = await db.facility.update({
        where: { id: facilityId },
        data: dataUpdate,
        select: {
          id: true,
          name: true,
          description: true,
          pricingType: true,
          minDuration: true,
          basePrice: true,
          category: true,
          rating: true,
          ratingCount: true,
          features: true,
          capacityLabel: true,
          durationLabel: true,
          iconKey: true,
          heroImage: true,
          images: true,
          availability: true,
          rules: true,
          updatedAt: true,
        },
      });

      // Upsert BookingRule jika ada field rule
      let bookingRuleChanges = null;
      if (Object.keys(ruleUpdate).length > 0) {
        const existRule = await db.bookingRule.findUnique({
          where: { facilityId },
          select: {
            id: true,
            bookingWindowDays: true,
            advanceNoticeHours: true,
            prepBufferBeforeMin: true,
            prepBufferAfterMin: true,
            maxParticipants: true,
          },
        });
        if (existRule) {
          const updatedRule = await db.bookingRule.update({
            where: { facilityId },
            data: ruleUpdate,
            select: {
              id: true,
              bookingWindowDays: true,
              advanceNoticeHours: true,
              prepBufferBeforeMin: true,
              prepBufferAfterMin: true,
              maxParticipants: true,
            },
          });
          bookingRuleChanges = {
            mode: "UPDATE",
            before: existRule,
            after: updatedRule,
          };
        } else {
          const createdRule = await db.bookingRule.create({
            data: { facilityId, ...ruleUpdate },
            select: {
              id: true,
              bookingWindowDays: true,
              advanceNoticeHours: true,
              prepBufferBeforeMin: true,
              prepBufferAfterMin: true,
              maxParticipants: true,
            },
          });
          bookingRuleChanges = {
            mode: "CREATE",
            before: null,
            after: createdRule,
          };
        }
      }

      // Snapshot PriceList jika harga/tipe/minDuration berubah
      let createdPriceList = null;
      if (
        dataUpdate.basePrice !== undefined ||
        dataUpdate.pricingType !== undefined ||
        dataUpdate.minDuration !== undefined
      ) {
        createdPriceList = await db.priceList.create({
          data: {
            facilityId,
            pricingType: facility.pricingType,
            unitPrice: facility.basePrice,
            minDuration: facility.minDuration,
            effectiveFrom: new Date(),
          },
          select: {
            id: true,
            facilityId: true,
            pricingType: true,
            unitPrice: true,
            minDuration: true,
            effectiveFrom: true,
          },
        });
      }

      // Audit before/after terstruktur
      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          adminId,
          action: "FACILITY_UPDATE",
          entity: "facility",
          entityId: facilityId,
          before: beforeSnapshot,
          after: {
            ...facility,
            basePrice:
              facility.basePrice?.toString?.() ??
              String(facility.basePrice ?? ""),
            bookingRuleChanges,
            createdPriceListWhenApplicable: createdPriceList
              ? {
                  id: createdPriceList.id,
                  pricingType: createdPriceList.pricingType,
                  unitPrice:
                    createdPriceList.unitPrice?.toString?.() ??
                    String(createdPriceList.unitPrice),
                  minDuration: createdPriceList.minDuration,
                  effectiveFrom: createdPriceList.effectiveFrom,
                }
              : null,
            updatedBy: { adminId, adminName },
            updatedAtAudit: new Date().toISOString(),
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return facility;
    });

    // ---------- Cloudinary cleanup setelah berhasil ----------
    for (const pid of removeList) {
      await deleteCloudinaryByPublicId(pid);
    }
    if ((uploadedNewHero || removeHeroFlag) && existing.heroImage?.public_id) {
      await deleteCloudinaryByPublicId(existing.heroImage.public_id);
    }

    return res
      .status(200)
      .json({ message: "Fasilitas berhasil diperbarui", data: updated });
  } catch (err) {
    console.error("updateFacility error:", err);
    if (err?.code === "P2002") {
      return res
        .status(409)
        .json({ message: "Nama fasilitas sudah digunakan" });
    }
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Admin delete fasilitas (soft delete + cleanup media)
const deleteFacility = async (req, res) => {
  try {
    const facilityId = req.params.id;
    const adminId = req.user?.id;

    if (!facilityId) {
      return res.status(400).json({ message: "Param id fasilitas wajib" });
    }
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi." });
    }

    const existing = await prisma.facility.findUnique({
      where: { id: facilityId },
      select: {
        id: true,
        isDeleted: true,
        name: true,
        description: true,
        pricingType: true,
        minDuration: true,
        basePrice: true,
        category: true,
        rating: true,
        ratingCount: true,
        features: true,
        capacityLabel: true,
        durationLabel: true,
        iconKey: true,
        heroImage: true,
        images: true,
        availability: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!existing || existing.isDeleted) {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "FACILITY_DELETE",
          entity: "facility",
          entityId: facilityId,
          bookingId: null,
          before: existing
            ? {
                id: existing.id,
                name: existing.name,
                isDeleted: existing.isDeleted,
                availability: existing.availability,
              }
            : null,
          after: null,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      return res.status(404).json({ message: "Fasilitas tidak ditemukan" });
    }

    const deleted = await prisma.$transaction(async (db) => {
      const facility = await db.facility.update({
        where: { id: facilityId },
        data: { isDeleted: true, availability: "BLOCK" },
      });

      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "FACILITY_DELETE",
          entity: "facility",
          entityId: facilityId,
          bookingId: null,
          before: {
            id: existing.id,
            name: existing.name,
            isDeleted: existing.isDeleted,
            availability: existing.availability,
          },
          after: {
            id: facility.id,
            name: facility.name,
            isDeleted: facility.isDeleted,
            availability: facility.availability,
            timestamp: new Date().toISOString(),
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });

      return facility;
    });

    // Cleanup media di luar transaksi, log peringatan jika gagal (opsional Audit)
    try {
      const heroPid = existing.heroImage?.public_id;
      if (heroPid) await deleteCloudinaryByPublicId(heroPid);
      if (Array.isArray(existing.images)) {
        for (const img of existing.images) {
          if (img?.public_id) await deleteCloudinaryByPublicId(img.public_id);
        }
      }
    } catch (e) {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "FACILITY_MEDIA_CLEANUP",
          entity: "facility",
          entityId: facilityId,
          bookingId: null,
          before: null,
          after: {
            message: "Cloudinary cleanup error",
            details: e?.message || String(e),
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
      console.warn("Cloudinary cleanup error (ignore):", e?.message || e);
    }

    console.info(
      `[AUDIT] Admin ${adminId} menghapus fasilitas ${existing.name} (${existing.id})`
    );
    return res.status(200).json({
      message: "Fasilitas berhasil dihapus",
      data: { id: deleted.id, isDeleted: deleted.isDeleted },
    });
  } catch (err) {
    console.error("deleteFacility error:", err);
    // Catat audit error umum
    try {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: req.user?.id || null,
          adminId: req.user?.id || null,
          action: "FACILITY_DELETE",
          entity: "facility",
          entityId: req.params?.id || "N/A",
          bookingId: null,
          before: null,
          after: { error: err?.message || "Unhandled error" },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (_) {}
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Get All Fasilitas
// Helper format Rupiah
const formatIDR = (amount) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Number(amount)); // [web:500][web:503][web:506]

function pricingUnitLabel(pricingType, durationLabel) {
  if (durationLabel) return durationLabel; // override manual
  if (pricingType === "PER_DAY") return "Per hari";
  if (pricingType === "PER_HOUR") return "Per jam";
  if (pricingType === "PER_TICKET") return "Per tiket";
  return "";
}

function toCardPayload(f) {
  // heroImage dan images disimpan di Json:
  // heroImage: { image_url, public_id }
  // images: [{ image_url, public_id }, ...]
  const hero =
    f.heroImage?.image_url ??
    (Array.isArray(f.images) ? f.images[0]?.image_url : null) ??
    null;
  const gallery = Array.isArray(f.images)
    ? f.images.map((g) => g?.image_url).filter(Boolean)
    : [];

  const unit = pricingUnitLabel(f.pricingType, f.durationLabel);
  const priceString = `${formatIDR(f.basePrice)}${
    unit ? ` / ${unit.replace("Per ", "").toLowerCase()}` : ""
  }`;

  return {
    id: f.id,
    title: f.name,
    desc: f.description || "",
    price: priceString,
    image: hero,
    iconKey: f.iconKey || null,
    category: f.category ? String(f.category).toLowerCase() : null,
    rating: f.rating ? Number(f.rating) : null,
    features: f.features || [],
    capacity: f.capacityLabel || null,
    duration: f.durationLabel || unit || null,
    gallery,
    // raw fields (opsional untuk FE lanjut)
    pricingType: f.pricingType,
    basePrice: f.basePrice,
    availability: f.availability,
  };
}

// Get Facilities for Landing (list)
const getFacilitiesForLanding = async (req, res) => {
  try {
    const { category, search, limit } = req.query;

    const where = { isDeleted: false };
    if (category) where.category = String(category).toUpperCase();
    if (search && String(search).trim().length > 0) {
      where.OR = [
        { name: { contains: String(search).trim(), mode: "insensitive" } },
        {
          description: { contains: String(search).trim(), mode: "insensitive" },
        },
        { features: { hasSome: [String(search).trim()] } }, // match feature sederhana untuk String[] fitur
      ];
    }

    const items = await prisma.facility.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        pricingType: true,
        basePrice: true,
        heroImage: true, // Json { image_url, public_id }
        images: true, // Json array
        category: true,
        rating: true,
        ratingCount: true,
        features: true, // String[]
        capacityLabel: true,
        durationLabel: true,
        iconKey: true,
        availability: true,
        rules: true, // opsional: aktifkan jika ingin bawa rules di list
      },
      orderBy: [
        { rating: "desc" }, // yang rating bagus tampil dulu
        { name: "asc" },
      ],
      take: limit ? Math.max(1, Math.min(50, Number(limit))) : undefined,
    });

    const data = items.map(toCardPayload); // card ringkas; rules tidak dibawa di sini agar ringan

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error("getFacilitiesForLanding error:", err);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
};

// Get Facility Detail by ID + semua relasi utama
const getFacilityDetailById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || String(id).trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Param id wajib" });
    }

    const f = await prisma.facility.findUnique({
      where: { id: String(id) },
      include: {
        // PERBAIKAN 1: Pastikan nama relasi sesuai schema Prisma
        bookingRules: true, // SINGULAR, bukan bookingRules (plural)
        priceLists: {
          orderBy: { effectiveFrom: "desc" },
        },
      },
    });

    if (!f || f.isDeleted) {
      return res
        .status(404)
        .json({ success: false, message: "Fasilitas tidak ditemukan" });
    }

    // Payload ringkas untuk card/landing (konsisten dengan list)
    const card = toCardPayload(f);

    // PERBAIKAN 2: Detail untuk admin/FE dengan mapping yang lebih lengkap
    const detail = {
      id: f.id,
      name: f.name,
      description: f.description,
      pricingType: f.pricingType,
      minDuration: f.minDuration ?? null,
      basePrice: f.basePrice?.toString?.() ?? String(f.basePrice ?? ""),
      category: f.category,
      rating: f.rating ? Number(f.rating) : null,
      ratingCount: f.ratingCount ?? null,
      features: Array.isArray(f.features) ? f.features : [],
      capacityLabel: f.capacityLabel ?? null,
      durationLabel: f.durationLabel ?? null,
      iconKey: f.iconKey ?? null,
      availability: f.availability ?? "OPEN", // Default "OPEN"
      heroImage: f.heroImage ?? null,
      images: Array.isArray(f.images) ? f.images : [],
      rules: f.rules ?? null,

      // PERBAIKAN 3: Tambahkan booking rule langsung ke detail untuk kemudahan akses
      bookingWindowDays: f.bookingRules?.bookingWindowDays ?? null,
      advanceNoticeHours: f.bookingRules?.advanceNoticeHours ?? null,
      prepBufferBeforeMin: f.bookingRules?.prepBufferBeforeMin ?? null,
      prepBufferAfterMin: f.bookingRules?.prepBufferAfterMin ?? null,
      maxParticipants: f.bookingRules?.maxParticipants ?? null,
    };

    // PERBAIKAN 4: Kemas relasi dengan pengecekan null yang lebih robust
    const relations = {
      bookingRule: f.bookingRules
        ? {
            id: f.bookingRules.id, // Tambahkan ID booking rule
            facilityId: f.bookingRules.facilityId,
            bookingWindowDays: f.bookingRules.bookingWindowDays ?? null,
            advanceNoticeHours: f.bookingRules.advanceNoticeHours ?? null,
            prepBufferBeforeMin: f.bookingRules.prepBufferBeforeMin ?? null,
            prepBufferAfterMin: f.bookingRules.prepBufferAfterMin ?? null,
            maxParticipants: f.bookingRules.maxParticipants ?? null,
            createdAt: f.bookingRules.createdAt,
            updatedAt: f.bookingRules.updatedAt,
          }
        : null,
      priceLists: (f.priceLists ?? []).map((p) => ({
        id: p.id,
        facilityId: p.facilityId,
        pricingType: p.pricingType,
        unitPrice: p.unitPrice?.toString?.() ?? String(p.unitPrice ?? ""),
        minDuration: p.minDuration ?? null,
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo ?? null,
        createdAt: p.createdAt,
      })),
    };

    // PERBAIKAN 5: Log untuk debugging
    console.log(`Facility ${id} detail:`, {
      hasBookingRule: !!f.bookingRules,
      bookingRuleData: f.bookingRules
        ? {
            bookingWindowDays: f.bookingRules.bookingWindowDays,
            advanceNoticeHours: f.bookingRules.advanceNoticeHours,
            prepBufferBeforeMin: f.bookingRules.prepBufferBeforeMin,
            prepBufferAfterMin: f.bookingRules.prepBufferAfterMin,
            maxParticipants: f.bookingRules.maxParticipants,
          }
        : null,
      features: f.features,
      images: f.images?.length ?? 0,
    });

    return res.status(200).json({
      success: true,
      data: {
        card,
        detail,
        relations,
      },
    });
  } catch (err) {
    console.error("getFacilityDetailById error:", err);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan server",
    });
  }
};

// Controller: Hapus hero image fasilitas
const deleteFacilityHeroImage = async (req, res) => {
  try {
    const facilityId = req.params.id;
    const adminId = req.user?.id;

    if (!facilityId) {
      return res.status(400).json({ message: "Param id fasilitas wajib" });
    }
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi" });
    }

    // Ambil fasilitas dengan hero image
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
      select: {
        id: true,
        name: true,
        isDeleted: true,
        heroImage: true, // { image_url, public_id }
      },
    });

    if (!facility || facility.isDeleted) {
      try {
        await prisma.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: adminId,
            adminId,
            action: "FACILITY_HERO_IMAGE_DELETE",
            entity: "facility",
            entityId: facilityId,
            bookingId: null,
            before: null,
            after: null,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });
      } catch (_) {}
      return res.status(404).json({ message: "Fasilitas tidak ditemukan" });
    }

    if (!facility.heroImage || !facility.heroImage.public_id) {
      return res.status(404).json({ message: "Hero image tidak ditemukan" });
    }

    const publicId = facility.heroImage.public_id;
    const beforeSnapshot = {
      facilityId: facility.id,
      facilityName: facility.name,
      heroImage: facility.heroImage,
    };

    // Transaksi: hapus dari DB + log audit
    await prisma.$transaction(async (db) => {
      await db.facility.update({
        where: { id: facilityId },
        data: { heroImage: null },
      });

      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "FACILITY_HERO_IMAGE_DELETE",
          entity: "facility",
          entityId: facilityId,
          bookingId: null,
          before: beforeSnapshot,
          after: {
            facilityId: facility.id,
            facilityName: facility.name,
            heroImage: null,
            deletedAt: new Date().toISOString(),
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    });

    // Cleanup Cloudinary (di luar transaksi, jangan gagalkan jika error)
    try {
      await deleteCloudinaryByPublicId(publicId);
    } catch (cloudErr) {
      console.warn(
        `Cloudinary delete failed for ${publicId}:`,
        cloudErr?.message || cloudErr
      );
      // Log warning tetapi tidak gagalkan response
      try {
        await prisma.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: adminId,
            adminId,
            action: "FACILITY_HERO_IMAGE_CLEANUP",
            entity: "facility",
            entityId: facilityId,
            bookingId: null,
            before: null,
            after: {
              publicId,
              error: cloudErr?.message || "Cloudinary cleanup failed",
            },
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });
      } catch (_) {}
    }

    console.info(
      `[AUDIT] Admin ${adminId} menghapus hero image fasilitas ${facility.name} (${facilityId})`
    );

    return res.status(200).json({
      message: "Hero image berhasil dihapus",
      data: { id: facility.id, heroImage: null },
    });
  } catch (err) {
    console.error("deleteFacilityHeroImage error:", err);
    try {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: req.user?.id || null,
          adminId: req.user?.id || null,
          action: "FACILITY_HERO_IMAGE_DELETE",
          entity: "facility",
          entityId: req.params?.id || "N/A",
          bookingId: null,
          before: null,
          after: { error: err?.message || "Unhandled error" },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (_) {}
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Delete gallery image fasilitas
const deleteFacilityGalleryImage = async (req, res) => {
  try {
    const facilityId = req.params.id;
    const { publicId } = req.body; // public_id dari gambar yang ingin dihapus
    const adminId = req.user?.id;

    if (!facilityId) {
      return res.status(400).json({ message: "Param id fasilitas wajib" });
    }
    if (!publicId) {
      return res.status(400).json({ message: "publicId gambar wajib" });
    }
    if (!adminId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin belum terautentikasi" });
    }

    // Ambil fasilitas dengan gallery images
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
      select: {
        id: true,
        name: true,
        isDeleted: true,
        images: true, // [{ image_url, public_id }]
      },
    });

    if (!facility || facility.isDeleted) {
      try {
        await prisma.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: adminId,
            adminId,
            action: "FACILITY_GALLERY_IMAGE_DELETE",
            entity: "facility",
            entityId: facilityId,
            bookingId: null,
            before: null,
            after: null,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });
      } catch (_) {}
      return res.status(404).json({ message: "Fasilitas tidak ditemukan" });
    }

    if (!Array.isArray(facility.images) || facility.images.length === 0) {
      return res.status(404).json({ message: "Tidak ada gambar gallery" });
    }

    // Cari gambar berdasarkan publicId
    const imageToDelete = facility.images.find(
      (img) => img.public_id === publicId
    );
    if (!imageToDelete) {
      return res
        .status(404)
        .json({ message: "Gambar dengan publicId tersebut tidak ditemukan" });
    }

    // Filter images untuk menghapus yang sesuai publicId
    const updatedImages = facility.images.filter(
      (img) => img.public_id !== publicId
    );

    const beforeSnapshot = {
      facilityId: facility.id,
      facilityName: facility.name,
      totalImages: facility.images.length,
      deletedImage: imageToDelete,
    };

    // Transaksi: update DB + audit
    await prisma.$transaction(async (db) => {
      await db.facility.update({
        where: { id: facilityId },
        data: { images: updatedImages },
      });

      await db.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: adminId,
          adminId,
          action: "FACILITY_GALLERY_IMAGE_DELETE",
          entity: "facility",
          entityId: facilityId,
          bookingId: null,
          before: beforeSnapshot,
          after: {
            facilityId: facility.id,
            facilityName: facility.name,
            totalImages: updatedImages.length,
            deletedAt: new Date().toISOString(),
          },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    });

    // Cleanup Cloudinary
    try {
      await deleteCloudinaryByPublicId(publicId);
    } catch (cloudErr) {
      console.warn(
        `Cloudinary delete failed for ${publicId}:`,
        cloudErr?.message || cloudErr
      );
      try {
        await prisma.auditLog.create({
          data: {
            actorType: "ADMIN",
            actorId: adminId,
            adminId,
            action: "FACILITY_GALLERY_IMAGE_CLEANUP",
            entity: "facility",
            entityId: facilityId,
            bookingId: null,
            before: null,
            after: {
              publicId,
              error: cloudErr?.message || "Cloudinary cleanup failed",
            },
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          },
        });
      } catch (_) {}
    }

    console.info(
      `[AUDIT] Admin ${adminId} menghapus gallery image fasilitas ${facility.name} (${facilityId})`
    );

    return res.status(200).json({
      message: "Gambar gallery berhasil dihapus",
      data: { id: facility.id, remainingImages: updatedImages.length },
    });
  } catch (err) {
    console.error("deleteFacilityGalleryImage error:", err);
    try {
      await prisma.auditLog.create({
        data: {
          actorType: "ADMIN",
          actorId: req.user?.id || null,
          adminId: req.user?.id || null,
          action: "FACILITY_GALLERY_IMAGE_DELETE",
          entity: "facility",
          entityId: req.params?.id || "N/A",
          bookingId: null,
          before: null,
          after: { error: err?.message || "Unhandled error" },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (_) {}
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};
module.exports = {
  createFacility,
  updateFacility,
  getFacilitiesForLanding,
  deleteFacility,
  getFacilityDetailById,
  deleteFacilityHeroImage,
  deleteFacilityGalleryImage,
};
