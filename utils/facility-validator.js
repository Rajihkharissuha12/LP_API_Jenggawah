// libs/facility-validators.ts
const { Prisma, PricingType, FacilityCategory } = require("@prisma/client");

function toDecimalString(n) {
  if (n === null || n === undefined) throw new Error("BASE_PRICE_REQUIRED");
  if (typeof n === "number") {
    if (!Number.isFinite(n) || n <= 0) throw new Error("BASE_PRICE_INVALID");
    return n.toFixed(2);
  }
  if (typeof n === "string") {
    const v = parseFloat(n.replace(/,/g, ""));
    if (!Number.isFinite(v) || v <= 0) throw new Error("BASE_PRICE_INVALID");
    return v.toFixed(2);
  }
  throw new Error("BASE_PRICE_INVALID_TYPE");
} // [web:447][web:449]

function validatePricingType(pt) {
  const up = String(pt || "").toUpperCase();
  if (!["PER_TICKET", "PER_HOUR", "PER_DAY"].includes(up)) {
    throw new Error("PRICING_INVALID");
  }
  return up;
} // [web:453]

function validateCategory(cat) {
  if (cat === undefined) return undefined;
  if (cat === null || cat === "") return null;
  const up = String(cat).toUpperCase();
  if (!Object.values(FacilityCategory).includes(up)) {
    throw new Error("CATEGORY_INVALID");
  }
  return up;
} // [web:120]

function normalizeStringArray(val) {
  if (val === undefined) return undefined;
  if (val === null) return [];
  if (Array.isArray(val)) {
    return val.map((s) => String(s).trim()).filter((s) => s.length > 0);
  }
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter((s) => s.length > 0);
      }
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
} // [web:454]
module.exports = {
  toDecimalString,
  validatePricingType,
  validateCategory,
  normalizeStringArray,
};
