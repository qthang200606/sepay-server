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
        console.log("==> Webhook nhận dữ liệu:", req.body);
        const content = req.body.content || "";
        
        // RegEx bóc tách mã ORDER (Ví dụ: ORDER_17783...)
        const match = content.match(/ORDER[_-]?(\d+)/i);

        if (!match) {
            console.log("❌ Không tìm thấy mã ORDER trong nội dung:", content);
            return res.status(400).send("Order ID not found");
        }

        const orderId = `ORDER_${match[1]}`; 
        console.log("🔍 Đang xử lý đơn hàng:", orderId);

        const orderRef = db.collection("orders").doc(orderId);
        const doc = await orderRef.get();

        if (!doc.exists) {
            console.log("❌ LỖI: ID không tồn tại trong Firestore:", orderId);
            return res.status(404).send("Document not found");
        }

        const orderData = doc.data();

        // Kiểm tra tránh trừ kho 2 lần nếu SePay bắn webhook trùng
        if (orderData.paymentStatus === "PAID") {
            console.log("⚠️ Đơn hàng đã được xử lý thanh toán trước đó.");
            return res.status(200).send("Already processed");
        }

        // --- BẮT ĐẦU LOGIC CẬP NHẬT TRẠNG THÁI VÀ TRỪ KHO ---
        const batch = db.batch();

        // 1. Cập nhật trạng thái Đơn hàng
        batch.update(orderRef, {
            paymentStatus: "PAID",
            status: "Đã xác nhận", // Admin nhận đơn này là "Đã xác nhận" luôn
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Trừ tồn kho sản phẩm (Dựa trên mảng items trong Order)
        if (orderData.items && Array.isArray(orderData.items)) {
            orderData.items.forEach((item) => {
                if (item.productId) {
                    const productRef = db.collection("products").doc(item.productId);
                    batch.update(productRef, {
                        // Trừ stock đi số lượng quantity đã mua
                        stock: admin.firestore.FieldValue.increment(-Math.abs(item.quantity))
                    });
                    console.log(`- Sẽ trừ kho sản phẩm: ${item.productId} số lượng: ${item.quantity}`);
                }
            });
        }

        // Thực thi tất cả các thay đổi đồng thời
        await batch.commit();

        console.log("✅ THÀNH CÔNG: Đã thanh toán và cập nhật kho cho đơn:", orderId);
        res.status(200).send("OK");

    } catch (error) {
        console.error("🔥 Lỗi xử lý:", error);
        res.status(500).send(error.message);
    }
});

app.get("/", (req, res) => {
    res.send("SePay webhook running and ready for stock management!");
});

// 4. Khởi chạy Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});