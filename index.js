require("dotenv").config();
const express = require("express");
const cors = require("cors");
const adminRoutes = require("./routes/adminRoutes");
const facilityRoutes = require("./routes/facilityRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const activitiesRoutes = require("./routes/activitiesRoutes");
const roleRoutes = require("./routes/roleRoutes");
const bahanRoutes = require("./routes/bahanRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const pembelianbahanRoutes = require("./routes/pembelianbahanRoutes");
const mutasiRoutes = require("./routes/mutasiRoutes");
const stokopnameRoutes = require("./routes/opnameRoutes");
const menuRoutes = require("./routes/menuRoutes");
const penjualanRoutes = require("./routes/penjualanRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const cashSessionRoutes = require("./routes/cashSessionRoutes");
const absenRoutes = require("./routes/absenRoutes");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:4000",
  "http://127.0.0.1:4000",
  process.env.BACKEND_URL,
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_1,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow tools like curl/Postman (origin undefined)
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some(
        (allowedOrigin) =>
          origin === allowedOrigin ||
          (allowedOrigin.includes("*") &&
            new RegExp("^" + allowedOrigin.replace(/\*/g, ".*") + "$").test(
              origin,
            )),
      );

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // If needed to send cookies/credentials
  }),
);

app.use(express.json());

app.use("/admin", adminRoutes);
app.use("/facilities", facilityRoutes);
app.use("/booking", bookingRoutes);
app.use("/activities", activitiesRoutes);
app.use("/role", roleRoutes);
app.use("/bahan", bahanRoutes);
app.use("/supplier", supplierRoutes);
app.use("/pembelian-bahan", pembelianbahanRoutes);
app.use("/mutasi", mutasiRoutes);
app.use("/stockopname", stokopnameRoutes);
app.use("/penjualan", penjualanRoutes);
app.use("/menu", menuRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/cashsession", cashSessionRoutes);
app.use("/absen", absenRoutes);

// Route test
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Welcome Event</title>
        <style>
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
            font-family: Arial, sans-serif;
          }
          h1 {
            font-size: 3rem;
            color: #333;
          }
        </style>
      </head>
      <body>
        <h1>Welcome Jenggawah</h1>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
