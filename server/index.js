import "dotenv/config";
import express from "express";

const PORT = process.env.PORT || 8787;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/api/messages", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key." });
    return;
  }
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach the Anthropic API" });
  }
});

app.listen(PORT, () => {
  console.log(`Recomp Ledger API proxy listening on http://localhost:${PORT}`);
});
