import { onRequest } from "firebase-functions/v2/https";
import * as admin from 'firebase-admin';

interface ReceiptItem {
    itemId: string;
    name: string;
    price: string;
}

interface CleanedReceipt {
    memberId: string,
    receiptId: string,
    tradeDatetime: string,
    items: [ReceiptItem],
}

export const createProductList = onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }

    const receipt: CleanedReceipt = req.body;

    // 验证数据
    if (!receipt || !receipt.memberId || !receipt.receiptId || !receipt.tradeDatetime || !Array.isArray(receipt.items)) {
        res.status(400).send('Invalid data format');
        return;
    }

    const productListRef = admin.firestore().collection("ProductList");

    for (const item of receipt.items) {
        // 把 itemId 转化为字符串
        const itemId = String(item.itemId);
        const productItemRef = productListRef.doc(itemId);
        const profileRef = productItemRef.collection("Profile");
        
        // 尝试获取文档数据
        try {
            const snapshot = await productItemRef.get();
            if (snapshot.exists) {
                // 获取最新的价格和交易日期
                const docSnapshot = await profileRef.doc("latestPrice").get();
                const tradeDatetime = docSnapshot.data()?.tradeDatetime;

                // 比较交易日期，如果更新更新价格和交易日期
                if (new Date(receipt.tradeDatetime) > new Date(tradeDatetime)) {
                    await profileRef.doc("latestPrice").set({
                        itemId: item.itemId,
                        name: item.name,
                        price: item.price,
                        tradeDatetime: receipt.tradeDatetime,
                    });
                } else {
                    // 如果交易价格高于最新价格，发送即时通知
                    if (Number(item.price) > Number(docSnapshot.data()?.price)) {
                        console.log("最新价格已经低于购买价，考虑发送即时通知");
                    }
                }
            } else {
                // 向 ProductList/itemId/Profile 新增item内容
                await profileRef.doc("latestPrice").set({
                    itemId: item.itemId,
                    name: item.name,
                    price: item.price,
                    tradeDatetime: receipt.tradeDatetime,
                });
                await profileRef.doc("searchable").set({ searchable: null });
                await profileRef.doc("scrapedDatetime").set({ scrapedDatetime: null });
            }

            // 向 ProductList/itemId/Subscriptions 新增item内容
            const subscriptionsDocRef = productItemRef.collection("Subscriptions").doc();
            await subscriptionsDocRef.set(item);
        } catch (error) {
            console.log("处理物品时出错:", error);
            res.status(500).send('Internal server error');
            return;
        }
    }

    res.status(200).send('success');
});


/**
 # API 文档：`createProductList`

## 概述

此 API 允许提交经过清理（计算完折扣）的收据数据，以创建或更新 `ProductList`。它接受 POST 请求并处理传入的收据数据。

## 基础 URL

```
https://<your-cloud-function-endpoint>/createProductList
```

(注意: 请替换 `<your-cloud-function-endpoint>` 为你的 Firebase Cloud Functions 实际的 endpoint.)

## 请求方法

- POST

## 请求头部

- `Content-Type`: `application/json`

## 请求参数

无

## 请求正文

正文应该包含一个 `CleanedReceipt` 对象，其结构如下：

```json
{
  "memberId": "<string>",
  "receiptId": "<string>",
  "tradeDatetime": "<string: yyyy-mm-ddThh:mm:ssZ>",
  "items": [
    {
      "itemId": "<string>",
      "name": "<string>",
      "price": "<string>"
    },
    ... // 更多的 items
  ]
}
```

**字段描述**:

- `memberId`: 用户的唯一 ID。
- `receiptId`: 收据的唯一 ID。
- `tradeDatetime`: 交易日期和时间，格式为 ISO 8601（例如："2023-09-24T12:34:56Z"）。
- `items`: 一个数组，包含已清理的收据上的所有物品。
  - `itemId`: 物品的唯一 ID。
  - `name`: 物品的名称。
  - `price`: 物品的价格。

## 响应

**成功**:

- 状态码: `200`
- 正文: `"success"`

**错误**:

- 状态码: `400`
  - 正文: `"Invalid data format"`
- 状态码: `405`
  - 正文: `"Method not allowed"`
- 状态码: `500`
  - 正文: `"Internal server error"`

## 调用示例

使用 `curl` 命令:

```bash
curl -X POST https://createproductlist-jnvfj7ne2a-uc.a.run.app/createProductList \
     -H "Content-Type: application/json" \
     -d '{
          "memberId": "12345",
          "receiptId": "r7890",
          "tradeDatetime": "2023-09-24T12:34:56Z",
          "items": [
            {
              "itemId": "i001",
              "name": "商品A",
              "price": "10.50"
            },
            {
              "itemId": "i002",
              "name": "商品B",
              "price": "15.75"
            }
          ]
         }'
```

## 注意事项

- 确保在调用此 API 之前，数据已经过折扣计算，给出折扣后的实际价格。
 */
