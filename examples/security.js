import { createServer, helmet } from "../index.js";

const app = createServer();

// Mount Helmet security middleware with some custom overrides
app.use(
  helmet({
    "X-Frame-Options": "DENY", // Override SAMEORIGIN with DENY
    "X-DNS-Prefetch-Control": false // Disable this header completely
  })
);

app.get("/secured", (req, res) => {
  // Set X-Powered-By to demonstrate that the middleware successfully strips it
  res.setHeader("X-Powered-By", "Express-Server");
  res.json({ status: "secured", message: "Essential security headers applied!" });
});

app.runServerOn(3000, async () => {
  console.log("Security example server running at http://localhost:3000");

  console.log("\nQuerying /secured to inspect headers:\n");
  try {
    const res = await fetch("http://localhost:3000/secured");
    console.log("HTTP Status:", res.status);
    
    console.log("\n--- Response Headers ---");
    for (const [key, value] of res.headers.entries()) {
      console.log(`${key}: ${value}`);
    }

    console.log("\n------------------------");
  } catch (err) {
    console.error("Failed to query secured endpoint:", err.message);
  }

  // Exit server after demo
  process.exit(0);
});
