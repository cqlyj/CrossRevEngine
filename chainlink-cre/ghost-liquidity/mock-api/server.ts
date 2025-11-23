import http from "http";
import fs from "fs";
import path from "path";

const PORT = 8000;

const routes: Record<string, string> = {
  "/events.json": "./events.json",
  "/events": "./events.json",
  "/twitter-alerts.json": "./twitter-alerts.json",
  "/twitter": "./twitter-alerts.json",
  "/onchain-events.json": "./onchain-events.json",
  "/onchain": "./onchain-events.json",
  "/price-feeds.json": "./price-feeds.json",
  "/prices": "./price-feeds.json",
  "/aggregated-feed.json": "./aggregated-feed.json",
  "/aggregated": "./aggregated-feed.json",
  "/idle-feed.json": "./idle-feed.json",
  "/idle": "./idle-feed.json",
  "/": "./aggregated-feed.json",
};

const server = http.createServer((req, res) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const filePath = routes[url.pathname];

  if (filePath) {
    const fullPath = path.join(__dirname, filePath);
    fs.readFile(fullPath, "utf8", (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Internal Server Error" }));
        return;
      }
      res.writeHead(200);
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end(
      JSON.stringify({
        error: "Not Found",
        available_endpoints: Object.keys(routes),
      })
    );
  }
});

server.listen(PORT, () => {
  console.log(`\nCrossRevEngine Mock API Server`);
  console.log(`Running at: http://localhost:${PORT}`);
  console.log(`\nAvailable Endpoints:`);
  console.log(
    `   Crisis Feed (chance):  http://localhost:${PORT}/aggregated-feed.json`
  );
  console.log(
    `   Idle Feed (idle):      http://localhost:${PORT}/idle-feed.json`
  );
  console.log(
    `   Twitter Alerts:        http://localhost:${PORT}/twitter-alerts.json`
  );
  console.log(
    `   On-Chain Events:       http://localhost:${PORT}/onchain-events.json`
  );
  console.log(
    `   Price Feeds:           http://localhost:${PORT}/price-feeds.json`
  );
  console.log(`\nScenario: Curve Finance Vyper Exploit (July 30, 2023)`);
  console.log(`Toggle between crisis/idle by changing config.staging.json\n`);
});
