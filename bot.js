const wppconnect = require("@wppconnect-team/wppconnect");
const express = require("express"); // <-- Add this line for keep-alive

const sessions = {}; // Track customer sessions per chat

async function startBot() {
  const client = await wppconnect.create({
    session: "fragrance-bot-session",
    puppeteerOptions: { headless: true },
    catchOwn: false,
  });

  console.log("✅ Fragrance WhatsApp bot ready!");

  const myNumber = "96181278322"; // Your WhatsApp number without +
  const myChatId = myNumber + "@c.us";

  client.onMessage(async (msg) => {
    const chatId = msg.from;
    const text = msg.body ? msg.body.trim() : "";

    // --- Step 0: Handle location pins immediately ---
    if (msg.type === "location") {
      if (!sessions[chatId]) sessions[chatId] = { orders: [] };

      const orders = sessions[chatId].orders;
      if (orders.length === 0 || orders[orders.length - 1].step === "CONFIRMED") {
        orders.push({ step: "WAITING_DETAILS", products: ["Fragrance"], locationPin: msg.location });
      } else {
        orders[orders.length - 1].locationPin = msg.location;
      }

      // Forward location to your number
      await client.sendMessageFromContent(myChatId, {
        locationMessage: {
          degreesLatitude: msg.location.latitude,
          degreesLongitude: msg.location.longitude,
          name: msg.location.name || "Customer Location",
          address: msg.location.address || "",
        },
      });

      await client.sendText(chatId, "📍 Location received! You can now send your order details.");
      return;
    }

    // --- Step 1: Detect new order message ---
    if (text.toLowerCase().includes("order")) {
      const productMatch = text.match(/order[:\- ]\s*(.*)/i);
      const productName = productMatch ? productMatch[1].trim() : "Fragrance";

      if (!sessions[chatId]) sessions[chatId] = { orders: [] };

      sessions[chatId].orders.push({
        step: "WAITING_DETAILS",
        products: [productName],
      });

      await client.sendText(
        chatId,
        `🌸 You want to order "${productName}". Please provide the following details:\n\n` +
        "1️⃣ Quantity:\n2️⃣ Location (text or pin):\n3️⃣ Name:\n4️⃣ Phone\n\nSend your WhatsApp location pin now if possible."
      );
      return;
    }

    // --- Step 2: Process template for the latest pending order ---
    const orders = sessions[chatId]?.orders;
    if (!orders || orders.length === 0) return;

    const session = orders.find(o => o.step === "WAITING_DETAILS");
    if (!session) return;

    if (msg.type === "chat") {
      const quantityMatch = text.match(/quantity:\s*(.*)/i);
      const locationMatch = text.match(/location:\s*(.*)/i);
      const nameMatch = text.match(/name:\s*(.*)/i);
      const phoneMatch = text.match(/phone:\s*(.*)/i);

      if (!quantityMatch || !locationMatch || !nameMatch || !phoneMatch) {
        await client.sendText(
          chatId,
          "⚠️ Please provide all details in the format:\nQuantity:\nLocation:\nName:\nPhone:"
        );
        return;
      }

      session.details = {
        quantity: quantityMatch[1].trim(),
        locationText: locationMatch[1].trim(),
        customerName: nameMatch[1].trim(),
        customerPhone: phoneMatch[1].trim(),
      };
    }

    // --- Step 3: Send summary ---
    if (session.details) {
      const order = session.details;
      const products = session.products.join(", ");

      let summary = `📦 *New Fragrance Order* 📦\n------------------------\n` +
                    `🌸 *Products:* ${products}\n` +
                    `👤 *Customer:* ${order.customerName}\n` +
                    `☎️ *Phone:* ${order.customerPhone}\n` +
                    `📍 *Location:* ${order.locationText}\n` +
                    `🔢 *Quantity:* ${order.quantity}`;

      if (session.locationPin) {
        summary += `\n\n📍 *WhatsApp Location Pin:*\nLatitude: ${session.locationPin.latitude}\nLongitude: ${session.locationPin.longitude}`;
      }

      await client.sendText(myChatId, summary);

      await client.sendText(chatId, "✅ Your fragrance order has been received. Thank you! 🌹");

      session.step = "CONFIRMED";
    }
  });
}

// Start the bot
startBot();

// ------------------- KEEP BOT ALIVE ON REPLIT -------------------
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is alive ✅");
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
