import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import pool from "./config/db.js"; // Import database
import authRoutes from "./routes/authRoutes.js";  // Import authentication routes
import itemsRoutes from "./routes/itemsRoutes.js";  // Import items routes
import borrowRoutes from "./routes/borrowRoutes.js";



dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// Default Route
app.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW();");
        res.send(`BorrowBuddy API is running... DB Time: ${result.rows[0].now}`);
    } catch (error) {
        res.status(500).send("Database connection failed.");
    }
});

// Authentication Routes
app.use("/api/auth", authRoutes);
app.use("/api/items", itemsRoutes); // Register items routes
app.use("/api/borrow", borrowRoutes);

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
