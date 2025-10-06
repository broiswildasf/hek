const wppconnect = require("@wppconnect-team/wppconnect");

const sessions = {}; // Track customer sessions per chat

async function startBot() {
  const sessionId = `fragrance-bot-session-${Date.now()}`; // unique session

  const client = await wppconnect.create({
    session: sessionId,
    puppeteerOptions: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-gpu"
      ]
    },
    catchOwn: false
  });

  console.log("✅ Fragrance WhatsApp bot ready!");

  const myNumber = process.env.WHATSAPP_NUMBER || "96181343983";
  const myChatId = myNumber + "@c.us";

  client.onMessage(async (msg) => {
    const chatId = msg.from;
    const text = msg.body ? msg.body.trim() : "";

    // Handle location messages
    if (msg.type === "location") {
      if (!sessions[chatId]) sessions[chatId] = { orders: [] };
      const orders = sessions[chatId].orders;

      if (orders.length === 0 || orders[orders.length - 1].step === "CONFIRMED") {
        orders.push({ step: "WAITING_DETAILS", products: ["Fragrance"], locationPin: msg.location });
      } else {
        orders[orders.length - 1].locationPin = msg.location;
      }

      await client.sendMessageFromContent(myChatId, {
        locationMessage: {
          degreesLatitude: msg.location.latitude,
          degreesLongitude: msg.location.longitude,
          name: msg.location.name || "Customer Location",
          address: msg.location.address || ""
        }
      });

      await client.sendText(chatId, "📍 Location received! You can now send your order details.");
      return;
    }

    // Handle order messages
    if (text.toLowerCase().includes("order")) {
      const productMatch = text.match(/order[:\- ]\s*(.*)/i);
      const productName = productMatch ? productMatch[1].trim() : "Fragrance";

      if (!sessions[chatId]) sessions[chatId] = { orders: [] };
      sessions[chatId].orders.push({ step: "WAITING_DETAILS", products: [productName] });

      await client.sendText(
        chatId,
        `📦 You want to order "${productName}". Please provide the following details:\n\n` +
        "1️⃣ Quantity:\n2️⃣ Location (text or pin):\n3️⃣ Name:\n4️⃣ Phone\n\nSend your WhatsApp location pin now if possible."
      );
      return;
    }

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
        await client.sendText(chatId, "⚠️ Please provide all details in the format:\nQuantity:\nLocation:\nName:\nPhone:");
        return;
      }

      session.details = {
        quantity: quantityMatch[1].trim(),
        locationText: locationMatch[1].trim(),
        customerName: nameMatch[1].trim(),
        customerPhone: phoneMatch[1].trim()
      };
    }

    if (session.details) {
      const order = session.details;
      const products = session.products.join(", ");

      let summary = `📦 *New Fragrance Order* 📦\n------------------------\n` +
                    `📦 *Products:* ${products}\n` +
                    `👤 *Customer:* ${order.customerName}\n` +
                    `☎️ *Phone:* ${order.customerPhone}\n` +
                    `📍 *Location:* ${order.locationText}\n` +
                    `🔢 *Quantity:* ${order.quantity}`;

      if (session.locationPin) {
        summary += `\n\n📍 *WhatsApp Location Pin:*\nLatitude: ${session.locationPin.latitude}\nLongitude: ${session.locationPin.longitude}`;
      }

      await client.sendText(myChatId, summary);
      await client.sendText(chatId, "✅ Your fragrance order has been received. Thank you! ❤️");

      session.step = "CONFIRMED";
    }
  });
}

startBot().catch(err => console.error("Bot failed to start:", err));
