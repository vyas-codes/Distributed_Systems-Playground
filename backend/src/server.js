const express = require("express");
const dotenv = require("dotenv");

const connectDB = require("./config/db");
const taskRoutes = require("./routes/taskRoutes");

dotenv.config();
const INSTANCE_ID = process.env.INSTANCE_ID || "default";
const app = express();

app.use(express.json());
console.log("connectDB val: ",connectDB);
connectDB();

app.use("/api/tasks", taskRoutes);

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        instance: INSTANCE_ID
    });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(
        `${INSTANCE_ID} running on port ${PORT}`
    );
});