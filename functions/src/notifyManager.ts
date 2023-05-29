import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import {Notification} from "./types";
import {getTodayAsID} from "./getTodayAsID";
// import {sendSMS} from "./sendSMS";

/**
 * 通知管理器
 * 1.根据DailyNotificationss的当日内容，整理出通知消息，按照memberId分组。
 * 2.获取相应memberId的邮件地址和手机号码。
 * 3.发送邮件/短信
 * 触发方式：每日定时触发
 * 测试方式：http手动触发
 */
export const notifyManager = functions.scheduler.onSchedule(
  "0 13 * * *", async (event) => {
    const subSnapshot = await admin.firestore()
      .doc(`DailyNotifications/${getTodayAsID()}`).get();
    const notifications: Notification[] = subSnapshot.data()?.notifications;

    // 按照memberId对subscriptions进行分组，发送通知
    const groupedNotifications = notifications.reduce(
      (groups: {[memberId: string]: Notification[]}, item: Notification) => {
        const val = item.memberId;
        groups[val] = groups[val] || [];
        groups[val].push(item);
        return groups;
      }, {});

    const sendPromises = Object.entries(groupedNotifications).map(
      async ([memberId, notifications]) => {
        // 构造消息内容
        let messageBody = "已购买商品价格变化：";
        notifications.forEach((notification: Notification) => {
          // eslint-disable-next-line
          const item = `\n${notification.name} 购于 ${notification.tradeDatetime} 价格 ${notification.price} 现价 ${notification.newPrice}`;
          messageBody += item;
        });

        // const {email, phoneNumber} = getCustomerContactInfo(memberId);
        // await sendSMS(messageBody, "");
        console.log("send:", messageBody);
      });

    await Promise.all(sendPromises);
  });
