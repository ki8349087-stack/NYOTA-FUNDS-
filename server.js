
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve website files from the repository folder.
app.use(express.static(path.join(__dirname)));

// Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "NYOTA Funds server is running"
  });
});

// Start a Paylor payment.
// Configure the API URL and payload according to Paylor's
// official documentation before enabling real payments.
app.post("/stk-push", async (req, res) => {
  const { phone, amount } = req.body;

  if (!/^254[17]\d{8}$/.test(String(phone || ""))) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid Kenyan phone number starting with 254."
    });
  }

  const paymentAmount = Number(amount);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid payment amount."
    });
  }

  const apiKey = process.env.PAYLOR_API_KEY;
  const channelId = process.env.PAYLOR_CHANNEL_ID;
  const callbackUrl = process.env.CALLBACK_URL;

  if (!apiKey || !channelId || !callbackUrl) {
    return res.status(503).json({
      success: false,
      message: "Payment configuration is incomplete."
    });
  }

  // Do not guess Paylor's request format. Configure this
  // integration using their current official API example.
  return res.status(503).json({
    success: false,
    message: "Paylor integration needs its official API request format."
  });
});

// Receive provider callbacks. This endpoint does not itself
// verify or confirm that a payment has been completed.
app.post("/callback", (req, res) => {
  console.log("Payment callback received.");
  res.status(200).json({ received: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NYOTA Funds server listening on port ${PORT}`);
});
