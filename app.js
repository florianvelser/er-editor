const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Statischer Ordner "public" (per STATIC_DIR überschreibbar, z.B. für Tests)
app.use(express.static(path.resolve(__dirname, process.env.STATIC_DIR || "dist")));

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server läuft auf http://localhost:${PORT}`);
    });
}

module.exports = app;
