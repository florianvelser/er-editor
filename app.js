const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Statischer Ordner "public"
app.use(express.static(path.join(__dirname, "dist")));

app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
