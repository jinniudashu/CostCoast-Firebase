import {onDocumentUpdated, Change, FirestoreEvent,
  QueryDocumentSnapshot} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

import {getTodayAsID} from "./getTodayAsID";
import {Notification, Subscription} from "./types";
/**
 * Maintain documents which in collection "ProductList" base on the new document
 */
export const createNotifyPlan = onDocumentUpdated(
  "ProductList/{itemId}/Profile/latestPrice",
  async (
    event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined,
    {itemId: string}>
  ) => {
    if (event.data) {
      const lastPrice = event.data.before.data().price;
      const newPrice = event.data.after.data().price;
      const itemName = event.data.after.data().name;

      // 如果降价，向高于最新价格的订阅者发送通知
      if (Number(newPrice) < Number(lastPrice)) {
        const itemId = event.params.itemId;
        console.log(itemId, "新价格:", newPrice, "上次价格", lastPrice);

        // 获取价格高于最近价格的订阅
        const notifications: Notification[] = [];
        const subscriptionsSnapshot = await admin.firestore()
          .collection(`ProductList/${itemId}/Subscriptions`)
          .get();
        subscriptionsSnapshot.forEach(async (doc) => {
          const subscription = doc.data() as Subscription;
          if (subscription.price > newPrice) {
            const notification = {
              memberId: subscription.memberId,
              receiptId: subscription.receiptId,
              itemId: subscription.itemId,
              name: subscription.name,
              price: subscription.price,
              tradeDatetime: subscription.tradeDatetime,
              newPrice: newPrice,
            };
            notifications.push(notification);
          }
        });
        console.log("subscriptions:", notifications);

        // 把subscriptions添加到DailyNotifications/{today}中
        const dailyNotificationsRef = admin.firestore()
          .collection("DailyNotifications").doc(getTodayAsID());
        const dailyNotificationsSnapshot = await dailyNotificationsRef.get();
        if (dailyNotificationsSnapshot.exists) {
          const dailyNotifications = dailyNotificationsSnapshot.data();
          const newDailyNotifications = {
            ...dailyNotifications,
            notifications: [
              // eslint-disable-next-line no-unsafe-optional-chaining
              ...dailyNotifications?.notifications, ...notifications],
          };
          await dailyNotificationsRef.set(newDailyNotifications);
        } else {
          await dailyNotificationsRef.set({
            notifications: notifications,
          });
        }

        // 按照memberId对subscriptions进行分组，发送通知
        const groupedNotification = notifications.reduce(
          (groups: any, item: any) => {
            const val = item.memberId;
            groups[val] = groups[val] || [];
            groups[val].push(item);
            return groups;
          }, {}) as {[memberId: string]: Notification[]};

        Object.entries(groupedNotification).forEach(
          async ([memberId, notifications]) => {
            // 构造消息内容
            let messageBody = `${itemName} has cut to ${newPrice}:`;
            notifications.forEach((notification: Notification) => {
              // eslint-disable-next-line
              const item: string = `\n${notification.tradeDatetime} 购买价格 ${notification.price}`;
              messageBody += item;
            });

            // Get user's fcmToken from the collection
            // "Members/{memberId}/profile/fcmToken"
            const docData = await admin.firestore()
              .doc(`Members/${memberId}/profile/fcmToken`).get();
            const fcmToken = docData.data();
            const token = fcmToken?.fcmToken;
            // const timestamp = fcmToken?.timestamp;

            const message: admin.messaging.Message = {
              notification: {
                title: "New Price Update",
                body: messageBody,
              },
              data: {
                notifications: JSON.stringify(notifications),
              },
              token: token,
            };
            console.log("发送消息:", message.notification?.body);
            await admin.messaging().send(message);
          });
      }
    }
    return;
  });
