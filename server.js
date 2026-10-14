
const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;
const PAYLOR_URL = "https://api.paylorke.com/api/v1/merchants/payments";

// Temporary tracking for transactions while this server is running.
// A database is needed for reliable tracking across restarts.
const transactions = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "NYOTA Funds server is running"
  });
});

// Start an STK Push using Paylor's documented API.
app.post("/stk-push", async (req, res) => {
  const { phone, amount } = req.body;

  if (!/^254[17]\d{8}$/.test(String(phone || ""))) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid Kenyan phone number starting with 254."
    });
  }

  const paymentAmount = Number(amount);

  if (!Number.isFinite(paymentAmount) ||
      !Number.isInteger(paymentAmount) ||
      paymentAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid whole-number payment amount."
    });
  }

  const apiKey = process.env.PAYLOR_API_KEY;
  const channelId = process.env.PAYLOR_CHANNEL_ID;
  const callbackUrl = process.env.CALLBACK_URL;

  if (!apiKey) {
    return res.status(503).json({
      success: false,
      message: "Payment configuration is incomplete."
    });
  }

  const reference = "NYOTA-" + crypto.randomUUID();

  const payload = {
    phone: String(phone),
    amount: paymentAmount,
    reference,
    description: "NYOTA Funds payment"
  };

  // Paylor documents channelId as optional.
  if (channelId) payload.channelId = channelId;
  if (callbackUrl) payload.callbackUrl = callbackUrl;

  try {
    const response = await fetch(
      `${PAYLOR_URL}/stk-push`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": reference
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.transactionId) {
      console.error("Paylor STK Push failed:", response.status);

      return res.status(response.ok ? 502 : response.status).json({
        success: false,
        message: data.message || "Paylor could not start the payment. Please try again."
      });
    }

    transactions.set(data.transactionId, {
      amount: paymentAmount,
      reference
    });

    return res.json({
      success: true,
      transactionId: data.transactionId,
      status: data.status || "SENT",
      message: "Payment prompt requested. Approve it on your phone if it arrives."
    });
  } catch (error) {
    console.error("Paylor connection failed:", error.message);

    return res.status(502).json({
      success: false,
      message: "Could not connect to Paylor. Please try again."
    });
  }
});

// Check the transaction directly with Paylor.
app.post("/payment-status", async (req, res) => {
  const { transactionId } = req.body;

  if (!transactionId || typeof transactionId !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid transaction ID is required."
    });
  }

  const apiKey = process.env.PAYLOR_API_KEY;
  const saved = transactions.get(transactionId);

  if (!apiKey || !saved) {
    return res.status(404).json({
      success: false,
      message: "Transaction not found in this server session. Please start again or contact support."
    });
  }

  try {
    const response = await fetch(
      `${PAYLOR_URL}/transactions/${encodeURIComponent(transactionId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: "Could not verify payment with Paylor."
      });
    }

    const status = String(data.status || "PENDING").toUpperCase();
    const amountMatches = Number(data.amount) === saved.amount;
    const referenceMatches = data.reference === saved.reference;
    const verified = status === "COMPLETED" &&
      amountMatches &&
      referenceMatches;

    return res.json({
      success: true,
      status: verified ? "COMPLETED" : status,
      verified,
      message: verified
        ? "Payment verified with Paylor."
        : "Payment is not yet verified as completed."
    });
  } catch (error) {
    console.error("Paylor status check failed:", error.message);

    return res.status(502).json({
      success: false,
      message: "Could not check payment status. Please try again."
    });
  }
});

// Do not treat a callback as proof of payment until its
// signature is verified using Paylor's official webhook rules.
app.post("/callback", (req, res) => {
  console.log("Paylor callback received; signature verification is not configured.");
  res.status(200).json({ received: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NYOTA Funds server listening on port ${PORT}`);
});
