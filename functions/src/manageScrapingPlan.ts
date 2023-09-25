import * as functions from "firebase-functions/v2";
import {onDocumentCreated, FirestoreEvent, QueryDocumentSnapshot}
  from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

import {Plan, Searchable} from "./types";
import {getTodayAsID} from "./getTodayAsID";

/**
 * 创建当天任务计划，Cloud Scheduler每天5:00AM触发
 * 1. 从ProductList/{itemId}/Profile/latestPrice获取
 *    所有商品的itemId、price、tradeDatetime存入数组
 * 2. 对数组排序，按照tradeDatetime从大到小排序，确保最旧的价格在最后面
 * 3. 把数组存入当日任务计划Document "Plans/{planId}"
 * @return {void}
 */
export const createScrapingPlan = functions.scheduler.onSchedule(
  "0 21 * * *", async (event) => {
    const scrapingItems: Plan[] = [];
    const scrapingMemberItems: Plan[] = [];

    const productListRef = admin.firestore().collection("ProductList");
    const itemsRef = await productListRef.listDocuments();
    // 1. 从ProductList/{itemId}/Profile/latestPrice获取
    // 所有商品的itemId、price、tradeDatetime存入数组
    const promises = itemsRef.map(async (doc) => {
      const itemId = doc.id;

      let latestPrice = null;
      let tradeDatetime = "";
      const latestPriceRef = doc.collection("Profile").doc("latestPrice");
      const latestPriceSnapshot = await latestPriceRef.get();
      if (latestPriceSnapshot.exists) {
        const latestPriceData = latestPriceSnapshot.data() as {
          itemId: string,
          price: number,
          tradeDatetime: string,
        };
        latestPrice = latestPriceData.price;
        tradeDatetime = latestPriceData.tradeDatetime;
      }

      const searchableRef = doc.collection("Profile").doc("searchable");
      const searchableSnapshot = await searchableRef.get();
      if (searchableSnapshot.exists) {
        // 用searchable属性（"Yes", "No", "Member", null）判断过滤，用于标记商品是否可搜索
        const searchableData = searchableSnapshot.data() as {
          searchable: Searchable,
        };
        // 添加searchable为"Yes"| null的商品到任务列表
        if (searchableData.searchable == "Yes" ||
          searchableData.searchable == "FoundOneResult" ||
          searchableData.searchable == "StartingBundlePrice" ||
          searchableData.searchable == null) {
          scrapingItems.push({
            itemId: itemId,
            price: latestPrice,
            tradeDatetime: tradeDatetime,
            completed: false,
          });
        } else if (searchableData.searchable == "MemberOnly") {
          // 添加searchable为"MemberOnly"的商品到任务列表
          scrapingMemberItems.push({
            itemId: itemId,
            price: latestPrice,
            tradeDatetime: tradeDatetime,
            completed: false,
          });
        }
      } else {
        scrapingItems.push({
          itemId: itemId,
          price: latestPrice,
          tradeDatetime: tradeDatetime,
          completed: false,
        });
      }
    });

    await Promise.all(promises);

    // 2. 把数组todos存入当日任务计划Document "Plans/{planId}"
    const planId = getTodayAsID(); // 获取当日任务计划的ID
    const planRef = admin.firestore().doc(`Plans/${planId}`);
    await planRef.set({todos: scrapingItems});
    console.log("当日任务计划创建成功:", scrapingItems.length, "个项目");

    const memberItemsPlanRef = admin.firestore()
      .doc(`MemberItemsPlans/${planId}`);
    await memberItemsPlanRef.set({todos: scrapingMemberItems});
    console.log("当日会员商品任务计划创建成功:", scrapingMemberItems.length, "个项目");

    return;
  });

/**
 * ProductList添加新项目时触发, 更新当天任务计划, 向Doc"Plans/{planId}"的数组添加新项目
 * ...
 * @return {void}
 */
export const updateScrapingPlan = onDocumentCreated(
  "ProductList/{itemId}",
  async (event: FirestoreEvent<QueryDocumentSnapshot | undefined,
    {itemId: string}>
  ) => {
    console.log("updateScrapingPlan:", event.params.itemId);
  });
