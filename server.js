import WebSocket from "ws";
import http from "http";

const FINNHUB_KEY = process.env.FINNHUB_KEY || "d7k24uhr01qnk4odao30d7k24uhr01qnk4odao3g";
const NTFY_TOPIC  = process.env.NTFY_TOPIC  || "medq-tracker-jett42";

const WATCHLIST = ["AAPL", "MSFT", "PG", "JNJ", "KO", "WMT"];
const dayStart  = {};
let totalDayLoss  = 0;
let circuitBroken = false;
const cooldowns   = {};

async function sendAlert(title, message, priority = "default") {
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: { "Title": title, "Priority": priority, "Tags": "chart_increasing" },
      body: message,
    });
    console.log(`[ALERT] ${title}: ${message}`);
  } catch (err) {
    console.error("Alert failed:", err.message);
  }
}

function analyze(symbol, price) {
  if (!dayStart[symbol]) { dayStart[symbol] = price; return; }

  const changePct = ((price - dayStart[symbol]) / dayStart[symbol]) * 100;
  const now = Date.now();

  if (cooldowns[symbol] && now - cooldowns[symbol] < 10 * 60 * 1000) return;
  if (circuitBroken) return;

  if (changePct < -1.5) {
    totalDayLoss += Math.abs(changePct) * 0.01;
    if (totalDayLoss >= 2.0) {
      circuitBroken = true;
      sendAlert("🛑 CIRCUIT BREAKER TRIGGERED",
        `Day loss hit ${totalDayLoss.toFixed(2)}%. Bot halted.`, "urgent");
      return;
    }
  }

  if (changePct > 1.2) {
    cooldowns[symbol] = now;
    sendAlert(`🌟 STRONG BUY · ${symbol}`,
      `$${price.toFixed(2)} · +${changePct.toFixed(2)}% · Bullish momentum`, "high");
  }

  if (changePct < -2.0) {
    cooldowns[symbol] = now;
    sendAlert(`⚠️ SELL SIGNAL · ${symbol}`,
      `$${price.toFixed(2)} · ${changePct.toFixed(2)}% · Bearish move`, "high");
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("MEDQ Bot running");
});
server.listen(process.env.PORT || 3000, () => {
  console.log("HTTP keep-alive server running");
});

function connect() {
  const ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

  ws.on("open", () => {
    console.log("Connected to Finnhub");
    WATCHLIST.forEach(symbol => {
      ws.send(JSON.stringify({ type: "subscribe", symbol }));
    });
  });

  ws.on("message", raw => {
    const msg = JSON.parse(raw);
    if (msg.type === "trade" && msg.data) {
      msg.data.forEach(trade => analyze(trade.s, trade.p));
    }
  });

  ws.on("close", () => {
    console.log("Disconnected. Reconnecting in 5s...");
    setTimeout(connect, 5000);
  });

  ws.on("error", err => console.error("WebSocket error:", err.message));
}

connect();
console.log("MEDQ Bot running — free tier stack active");