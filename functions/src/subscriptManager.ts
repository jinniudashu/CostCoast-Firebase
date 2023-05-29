import {onDocumentCreated, FirestoreEvent,
  QueryDocumentSnapshot} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

import {ReceiptItem, Subscription} from "./types";
/**
 * Cloud Function to process new documents added to subcollection "receipts"
 * of document with ID "receiptId", which is a child of document with ID
 * "memberId", in collection "Members". This function will take the newly
 * added document data, process it, and add the processed data to subcollection
 * "ProductList/{itemId}/Subscriptions" and "ProductList/{itemId}/Profile".
 *
 * @param {FirestoreEvent} event The snapshot of the newly added document.
 * @return {string} Indicate the new data is added to which collection.
 */
export const subscriptionsManager = onDocumentCreated(
  "Members/{memberId}/receipts/{receiptId}",
  async (
    event: FirestoreEvent<QueryDocumentSnapshot | undefined,
    { memberId: string; receiptId: string; }>
  ) => {
    if (event.data) {
      const newData = event.data.data();
      const memberId = event.params.memberId;
      const receiptId = event.params.receiptId;

      // Clean the data
      const [subscriptions, unmatchData]: [Subscription[], ReceiptItem[]] =
        cleanData(newData, memberId, receiptId);

      // Add cleaned item to the ProductList.
      const productListRef = admin.firestore().collection("ProductList");

      subscriptions.forEach(async (item: Subscription) => {
        // 获取item引用
        const productItemRef = productListRef.doc(item.itemId);
        const profileRef = productItemRef.collection("Profile");
        // 获取文档数据并检查是否存在
        productItemRef.get()
          .then(async (snapshot) => {
            if (snapshot.exists) {
              // 获取最新的价格和交易日期
              const docSnapshot = await profileRef.doc("latestPrice").get();
              const tradeDatetime = docSnapshot.data()?.tradeDatetime;
              // 比较交易日期，如果更新更新价格和交易日期
              if ((new Date(item.tradeDatetime) > new Date(tradeDatetime))) {
                console.log("更新最新价格和交易日期", item.tradeDatetime, item.price);
                profileRef.doc("latestPrice").set({
                  itemId: item.itemId,
                  name: item.name,
                  price: item.price,
                  tradeDatetime: item.tradeDatetime,
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
                tradeDatetime: item.tradeDatetime,
              });
              await profileRef.doc("searchable").set({searchable: null});
              await profileRef.doc("scrapedDatetime")
                .set({scrapedDatetime: null});
            }
            return;
          })
          .catch((error) => {
            console.log("获取文档数据时出错:", error);
          });

        // 向 ProductList/itemId/Subscriptions 新增item内容
        const subscriptionsDocRef = productItemRef.collection("Subscriptions")
          .doc();
        await subscriptionsDocRef.set(item);
      });

      // Add unmatched item to the UnmatchData.
      if (unmatchData.length > 0) {
        const unmatchDataRef = admin.firestore().collection("UnmatchData")
          .doc(memberId + "-" + receiptId);
        await unmatchDataRef.set({unmatchData: unmatchData});
      }

      return "success";
    }
    return;
  });

/**
 * Processes the data from a newly added receipt document.
 * Calculate the exact item price and filter the useless item.
 * @param {admin.firestore.DocumentData} data The data to process.
 * @param {string} memberId The user member ID.
 * @param {string} receiptId The receipt ID.
 * @return {[Subscription[], ReceiptItem[]]} The processed data.
 */
function cleanData(
  data: admin.firestore.DocumentData,
  memberId: string,
  receiptId: string): [Subscription[], ReceiptItem[]] {
  const receiptItems = data.items;
  const tradeDatetime = data.tradeDatetime;

  const receiptItemsCleaned: ReceiptItem[] = [];

  // 1. 区分折扣项目和普通商品项目
  const normalItems: ReceiptItem[] = [];
  const discountItems: ReceiptItem[] = [];
  for (const item of receiptItems) {
    const priceString = item.price.trim();
    if (priceString.endsWith("-")) {
      item.price = extractNumericPrice(priceString);
      discountItems.push(item);
    } else {
      item.price = extractNumericPrice(priceString);
      normalItems.push(item);
    }
  }

  // 2. 对齐折扣项目数组中itemId相同的项目名称, 以第一个itemId出现的名称为准
  for (let i = 0; i < discountItems.length - 1; i++) {
    const currentItem = discountItems[i];
    const nextItem = discountItems[i + 1];
    if (currentItem.itemId === nextItem.itemId) {
      nextItem.name = currentItem.name;
    }
  }
  console.log("Aligned discountItems:", discountItems);
  // 3. 构造实际价格项目数组。遍历普通商品项目，如果在折扣项目中存在同名商品，则该项目价格核减
  for (const normalItem of normalItems) {
    const discountItemIndex = discountItems.findIndex(
      (item) => item.name === normalItem.name);
    if (discountItemIndex !== -1) {
      const discountItem = discountItems[discountItemIndex];
      normalItem.price = (parseFloat(normalItem.price) -
        parseFloat(discountItem.price)).toFixed(2);
      discountItems.splice(discountItemIndex, 1);
    }
    // 过滤掉价格为0的项目
    if (Number(normalItem.price) > 0) {
      receiptItemsCleaned.push(normalItem);
    }
  }
  console.log("未匹配折扣项目，需检查:", discountItems);

  // 4. 扁平化数据，将数据转换为数组
  const subscriptions: Subscription[] = receiptItemsCleaned
    .map((item: ReceiptItem) => {
      return {
        memberId: memberId,
        receiptId: receiptId,
        itemId: item["itemId"],
        name: item["name"],
        price: item["price"],
        tradeDatetime: tradeDatetime,
      };
    });
  return [subscriptions, discountItems];
}

/**
 * Check if the price is a valid number, if not
 * extract the valid number as string.
 * @param {string} price The price to check.
 * @return {string} A valid number string.
 */
function extractNumericPrice(price: string): string {
  const regex = /^(\d+(\.\d{1,2})?)/;
  const match = regex.exec(price);
  if (match) {
    return match[1];
  } else {
    return price.trim();
  }
}
