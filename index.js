require("dotenv").config();
const express = require("express");
const cors = require("cors");
const adminRoutes = require("./routes/adminRoutes");
const facilityRoutes = require("./routes/facilityRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const activitiesRoutes = require("./routes/activitiesRoutes");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4000",
  "http://127.0.0.1:4000",

  process.env.FRONTEND_URL, // set di .env untuk produksi, mis. https://app.domain.com
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
              origin
            ))
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
  })
);

app.use(express.json());

app.use("/admin", adminRoutes);
app.use("/facilities", facilityRoutes);
app.use("/booking", bookingRoutes);
app.use("/activities", activitiesRoutes);

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
