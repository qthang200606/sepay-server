const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// 1. Đọc cấu hình từ biến môi trường
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountRaw) {
    console.error("LỖI: Chưa cấu hình biến FIREBASE_SERVICE_ACCOUNT trên Render!");
    process.exit(1); 
}

const serviceAccount = JSON.parse(serviceAccountRaw);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

// 2. Khởi tạo Firebase
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

// 3. WEBHOOK SEPAY
app.post("/sepay-webhook", async (req, res) => {
    try {
        console.log("Webhook received:", req.body);
        const content = req.body.content || "";
        const match = content.match(/ORDER[_-]?(\d+)/i);

        if (!match) {
            return res.status(400).send("Order ID not found");
        }

        const orderId = match[0];

        await db.collection("orders")
            .doc(orderId)
            .update({
                paymentStatus: "PAID"
            });

        console.log("Payment success:", orderId);
        res.status(200).send("OK");
    } catch (error) {
        console.error(error);
        res.status(500).send(error.message);
    }
});

app.get("/", (req, res) => {
    res.send("SePay webhook running");
});

// 4. Khởi chạy Server (CHỈ KHAI BÁO 1 LẦN)
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});