import fs from "fs";
import path from "path";
import csv from "csv-parser";
import express from "express";
import cors from "cors";
import multer from "multer";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const DATA_PATH = path.join(PUBLIC_DIR, "aqi_data.csv");
const HISTORY_PATH = path.join(PUBLIC_DIR, "history.json");

const upload = multer({ dest: UPLOAD_DIR });

let aqiData = [];
let history = [];

function loadCSV() {
  if (!fs.existsSync(DATA_PATH)) return;
  aqiData = [];
  fs.createReadStream(DATA_PATH)
    .pipe(csv())
    .on("data", (row) => {
      const parsed = {};
      for (let key in row) parsed[key] = Number(row[key]);
      aqiData.push(parsed);
    });
}

function loadHistory() {
  if (fs.existsSync(HISTORY_PATH)) {
    const raw = fs.readFileSync(HISTORY_PATH, "utf-8");
    history = JSON.parse(raw || "[]");
  }
}

function saveHistory() {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

loadCSV();
loadHistory();

function predictAQI(v) {
  const score =
    v.PM2_5 * 0.45 +
    v.PM10 * 0.25 +
    v.NO2 * 0.08 +
    v.SO2 * 0.06 +
    v.CO * 2.5 +
    v.O3 * 0.06 -
    (v.wind_speed * 2 + (50 - v.humidity) * 0.2);

  return Math.min(600, Math.round(Math.max(0, score)));
}

app.get("/", (req, res) => {
  res.send("AQI Backend Running");
});

app.get("/api/csv-rows", (req, res) => {
  res.json(aqiData);
});

app.get("/api/history", (req, res) => {
  res.json(history);
});

app.post("/api/predict", (req, res) => {
  const input = req.body;
  const aqi = predictAQI(input);

  const record = {
    ...input,
    aqi,
    time: new Date().toLocaleString(),
  };

  history.push(record);
  saveHistory();

  res.json({ predictedAQI: aqi });
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  const tempPath = req.file.path;

  fs.rename(tempPath, DATA_PATH, (err) => {
    if (err) return res.status(500).json({ error: "CSV Upload Failed" });

    loadCSV();
    res.json({ message: "CSV Uploaded & Reloaded Successfully" });
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});