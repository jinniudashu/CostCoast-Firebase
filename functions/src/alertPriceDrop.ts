import {onDocumentUpdated, Change, FirestoreEvent, QueryDocumentSnapshot} from "firebase-functions/v2/firestore";
import axios from "axios"; // 引入 axios 用于 HTTP 请求

export const alertPriceDrop = onDocumentUpdated(
  "ProductList/{itemId}/Profile/latestPrice",
  async (
    event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined,
    {itemId: string}>
  ) => {
    if (event.data) {
      const lastPrice = event.data.before.data().price;
      const newPrice = event.data.after.data().price;
      const itemName = event.data.after.data().name;

      // 如果降价，调用第三方API
      if (Number(newPrice) < Number(lastPrice)) {
        const itemId = event.params.itemId;
        // 把itemId, newPrice转化为整数
        const itemIdInt = Number(itemId);
        const newPriceInt = Number(newPrice);
        
        const apiUrl = "https://www.alexmmd.top/api/price-drop-alert/";
        const postData = {
          good_id: itemIdInt,
          good_name: itemName,
          price: newPriceInt,
          nonce_str: "VpfDR6vFr4bxsOUA",
        };

        try {
          await axios.post(apiUrl, postData, {
            headers: {
              "Content-Type": "application/json",
            },
          });
          console.log("Successfully sent price drop alert for:", itemName);
        } catch (error) {
          console.error("Error sending price drop alert:", error);
        }
      }
    }
    return;
  }
);

/**
 * API 文档：`alertPriceDrop`
curl -X POST -H "Content-Type: application/json" -d '{
  "good_id": 1397329,
  "good_name": "MILAN RUNNER",
  "price": 1200
}' "https://www.alexmmd.top/api/price-drop-alert/"
 */