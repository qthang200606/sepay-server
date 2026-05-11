const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// 1. Cấu hình Firebase Admin từ Biến môi trường
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountRaw) {
    console.error("LỖI: Chưa cấu hình biến FIREBASE_SERVICE_ACCOUNT!");
    process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountRaw);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

/**
 * HÀM DÙNG CHUNG: Cập nhật trạng thái đơn và trừ kho
 * Đảm bảo tính nguyên tử (Atomic) bằng Batch
 */
async function processOrderConfirmation(orderId, isPaid = false) {
    const orderRef = db.collection("orders").doc(orderId);
    const doc = await orderRef.get();

    if (!doc.exists) throw new Error("Đơn hàng không tồn tại");

    const orderData = doc.data();

    // Nếu đơn hàng đã xác nhận rồi thì không làm gì cả (tránh trừ kho 2 lần)
    if (orderData.status === "Đã xác nhận") {
        return { success: false, message: "Đơn hàng đã được xác nhận trước đó" };
    }

    const batch = db.batch();

    // 1. Cập nhật trạng thái đơn
    const updateData = {
        status: "Đã xác nhận",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (isPaid) updateData.paymentStatus = "PAID";

    batch.update(orderRef, updateData);

    // 2. Trừ tồn kho sản phẩm
    if (orderData.items && Array.isArray(orderData.items)) {
        orderData.items.forEach((item) => {
            if (item.productId) {
                const productRef = db.collection("products").doc(item.productId);
                batch.update(productRef, {
                    stock: admin.firestore.FieldValue.increment(-Math.abs(item.quantity))
                });
            }
        });
    }

    await batch.commit();
    return { success: true, message: "Xác nhận và trừ kho thành công" };
}

// --- ROUTE 1: WEBHOOK SEPAY (Dành cho chuyển khoản) ---
app.post("/sepay-webhook", async (req, res) => {
    try {
        const content = req.body.content || "";
        const match = content.match(/ORDER[_-]?(\d+)/i);

        if (!match) return res.status(400).send("Không tìm thấy mã đơn");

        const orderId = `ORDER_${match[1]}`;
        console.log("==> SePay Webhook cho đơn:", orderId);

        const result = await processOrderConfirmation(orderId, true);
        res.status(200).send(result.message);
    } catch (error) {
        console.error("Lỗi SePay:", error.message);
        res.status(500).send(error.message);
    }
});

// --- ROUTE 2: ADMIN CONFIRM (Dành cho COD hoặc xác nhận thủ công) ---
app.post("/admin/confirm-order", async (req, res) => {
    try {
        const { orderId } = req.body;
        if (!orderId) return res.status(400).send("Thiếu Order ID");

        console.log("==> Admin xác nhận đơn:", orderId);

        const result = await processOrderConfirmation(orderId, false);
        res.status(200).json(result);
    } catch (error) {
        console.error("Lỗi Admin Confirm:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route kiểm tra server
app.get("/", (req, res) => {
    res.send("Hệ thống Webhook & Quản lý kho đang hoạt động!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server chạy tại port ${PORT}`);
});