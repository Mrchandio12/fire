const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORT ALL PANELS ---
const fire = require("./api/fire");



// --- ROUTES ---
app.use("/api/fire", fire);



// --- HEALTH CHECK ---
app.get("/", (req,res)=> res.send("API RUNNING ✅"));

// --- START SERVER ---
app.listen(PORT, "0.0.0.0", ()=>console.log(`🚀 Server running on port ${PORT}`));
