import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

import puppeteer from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(stealthPlugin());
import {Browser} from "puppeteer";

import {PriceInfo, Plan, Result} from "./types";

import {getTodayAsID} from "./getTodayAsID";

functions.setGlobalOptions({timeoutSeconds: 300, memory: "2GiB"});

const scrapeAction = async (browser: Browser, item: string):
  Promise<PriceInfo> => {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(90000);
  // 非会员搜索
  page.goto("https://www.costcoast.com", {waitUntil: "networkidle0"});
  await page.waitForSelector("#search-field");
  await page.click("#search-field", {clickCount: 3});
  await page.type("#search-field", item);
  await page.keyboard.press("Enter");
  // await new Promise(r => setTimeout(r, 3000))
  await page.waitForNavigation({waitUntil: "networkidle0"});

  const noResultsPromise = page.waitForSelector("#no-results")
    .then(async () => {
      const priceInfo: PriceInfo = {price: null, searchable: "No"};
      console.log("found #no-results");
      return priceInfo;
    });

  const warehouseOnlyPromise = page
    .waitForSelector("a.pill-style-warehouse-only")
    .then(async () => {
      const priceInfo: PriceInfo = {price: null, searchable: "WarehouseOnly"};
      console.log("found #warehouse-only");
      return priceInfo;
    });

  const foundOneResultPromise = page
    .waitForSelector("[automation-id='itemPriceOutput_0']")
    .then(async () => {
      console.log("Found 1 Result for this item");
      const priceInfo: PriceInfo = {price: null, searchable: "FoundOneResult"};
      const priceElement = await page.$("[automation-id='itemPriceOutput_0']");
      const price = await page.evaluate((element) =>
        element?.textContent, priceElement
      );
      if (price) {
        priceInfo.price = price.replace("$", "").trim();
      }
      return priceInfo;
    });

  const startingBundlePricePromise = page
    .waitForSelector("#starting-bundle-price")
    .then(async () => {
      console.log("found #starting-bundle-price");
      const priceInfo: PriceInfo = {price: null,
        searchable: "StartingBundlePrice"};
      const priceElement = await page.$("#starting-bundle-price");
      const price = await page.evaluate((element) =>
        element?.textContent, priceElement
      );
      if (price) {
        priceInfo.price = price.replace("$", "").trim();
      }
      return priceInfo;
    });

  const pricePromise = page
    .waitForSelector("#pull-right-price span.value")
    .then(async () => {
      console.log("found #pull-right-price span.value:");
      const priceInfo: PriceInfo = {price: null, searchable: null};
      // 会员搜索
      const memberOnlyElement = await page
        .$("p.member-only[automation-id='memberOnly']");
      if (memberOnlyElement !== null) {
        priceInfo.searchable = "MemberOnly";
        console.log("found .member-only");
        return priceInfo;
      }
      // 非会员状态确认
      await page.waitForFunction(() => {
        const element = document.querySelector("#pull-right-price span.value");
        return element &&
          element.textContent !== "- -.- -" &&
          element.textContent !== "--";
      });
      const priceValue = await page
        .$eval("#pull-right-price span.value",
          (element) => element.textContent);
      priceInfo.searchable = "Yes";
      priceInfo.price = priceValue;
      return priceInfo;
    });

  let priceElementResult: PriceInfo | undefined | void;
  let noResultsElementResult: PriceInfo | undefined | void;
  let warehouseOnlyElementResult: PriceInfo | undefined | void;
  let foundOneResultElementResult: PriceInfo | undefined | void;
  let startingBundlePriceElementResult: PriceInfo | undefined | void;

  await Promise.race([
    noResultsPromise.then((result) => {
      noResultsElementResult = result;
    }),
    pricePromise.then((result) => {
      priceElementResult = result;
    }),
    warehouseOnlyPromise.then((result) => {
      warehouseOnlyElementResult = result;
    }),
    foundOneResultPromise.then((result) => {
      foundOneResultElementResult = result;
    }),
    startingBundlePricePromise.then((result) => {
      startingBundlePriceElementResult = result;
    }),
  ]);

  page.close();

  // 确保返回有效的 PriceInfo 对象，而不是 undefined 或 void
  if (priceElementResult) {
    return priceElementResult;
  } else if (noResultsElementResult) {
    return noResultsElementResult;
  } else if (foundOneResultElementResult) {
    return foundOneResultElementResult;
  } else if (startingBundlePriceElementResult) {
    return startingBundlePriceElementResult;
  } else if (warehouseOnlyElementResult) {
    return warehouseOnlyElementResult;
  } else {
    throw new Error("No valid result found");
  }
};

const scraping = async (items: string[]): Promise<Result[] | string> => {
  console.log("执行任务：", items);

  const results: Result[] = [];
  let itemId = "";
  let priceInfo: PriceInfo = {price: null, searchable: null};

  // 开始计时
  const startTime = performance.now();
  const executeablePath = puppeteer.executablePath();
  const browser: Browser = await puppeteer.launch({
    executablePath: executeablePath,
    userDataDir: "/root/.cache/puppeteer",
  });

  while (items.length > 0) {
    try {
      itemId = items.pop() as string;
      priceInfo = await scrapeAction(browser, itemId);
      console.log(`${itemId}结果：`, priceInfo);
      results.push({
        itemId: itemId,
        newPrice: priceInfo.price,
        searchable: priceInfo.searchable,
        scrapedDatetime: new Date(),
        executionTime: performance.now() - startTime,
      });
      // 取一个随机时间间隔2.8～3.5秒, 取整
      const interval = Math.floor(Math.random() * 700 + 2800);
      await new Promise((r) => setTimeout(r, interval));
    } catch (error: any) {
      console.log(error);
    }
  }

  await browser.close();
  return results;
};

const getTodayPlan = async ():
  Promise<{todos: Plan[], completedItems: Result[]}> => {
  let todos: Plan[] = [];
  let completedItems: Result[] = [];
  const planId = getTodayAsID();
  const planRef = admin.firestore().collection("Plans").doc(planId);
  const planDoc = await planRef.get();
  if (planDoc.exists) {
    todos = planDoc.data()?.todos;
    completedItems = planDoc.data()?.done || [];
  } else {
    console.log("没有发现当天任务文档");
  }
  return {todos: todos, completedItems: completedItems};
};

const getScrapingTasks = async (maxTaskItems: number)
  : Promise<string[]> => {
  let tasks: string[] = [];
  // 获取当天任务列表
  const {todos, completedItems} = await getTodayPlan();
  const getIncompleteItems = (todos: Plan[], completedItems: Result[]) => {
    const incompleteItems = todos.filter((todo) => {
      // 检查是否存在于 completed 数组中
      const isCompleted = completedItems
        .some((item) => item.itemId === todo.itemId);
      return !isCompleted;
    });
    return incompleteItems;
  };
  const incompleteItems = getIncompleteItems(todos, completedItems);

  if (incompleteItems.length > 0) {
    // 从未完成任务列表尾部取出最多maxTaskItems个任务, 取出其中的itemId构造tasks数组
    tasks = incompleteItems.slice(-maxTaskItems).map((item) => item.itemId);
    console.log("任务项目列表：", tasks);
  } else {
    console.log("当天任务已完成");
  }
  return tasks;
};

const saveResult = async (results: Result[]): Promise<void> => {
  const {todos, completedItems} = await getTodayPlan();

  // 循环遍历 results 数组, 更新ProductList/{itemId}/Profile/latestPrice
  // /searchable /scrapedDatetime文档内容
  const productListRef = admin.firestore().collection("ProductList");
  const batchSearchable = admin.firestore().batch();
  const batchScrapedDatetime = admin.firestore().batch();
  const batchLatestPrice = admin.firestore().batch();
  results.forEach((result) => {
    const searchableRef = productListRef.doc(result.itemId)
      .collection("Profile").doc("searchable");
    const scrapedDatetimeRef = productListRef.doc(result.itemId)
      .collection("Profile").doc("scrapedDatetime");
    const latestPriceRef = productListRef.doc(result.itemId)
      .collection("Profile").doc("latestPrice");

    // 找出对应itemId的todos数组中的Plan对象
    const todo = todos.find((item) => item.itemId === result.itemId);

    batchSearchable.set(searchableRef, {searchable: result.searchable});
    batchScrapedDatetime.set(scrapedDatetimeRef,
      {scrapedDatetime: result.scrapedDatetime});

    // 如果newPrice不为null且与todos中的item.price不同，则更新price字段
    if (result.newPrice && result.newPrice !== todo?.price) {
      batchLatestPrice.update(latestPriceRef, {price: result.newPrice});
    }
  });

  await batchLatestPrice.commit();
  await batchSearchable.commit();
  await batchScrapedDatetime.commit();
  console.log("任务结果保存到ProductList");

  // 把结果更新到当天的任务文档中的任务数组中对应itemId的Plan对象中
  const planId = getTodayAsID();
  const planRef = admin.firestore().collection("Plans").doc(planId);
  // 把results添加到completed数组中
  const updatedCompleted = [...completedItems, ...results];
  await planRef.update({done: updatedCompleted});
  console.log("任务结果保存到Plans/{planId}.done");

  return;
};

export const scraper = functions.scheduler.onSchedule(
  "*/8 0-11 * * *", async (event) => {
    // 每次任务最多爬取的项目数
    const maxTaskItems = 3;

    // 获取爬取项目列表
    const items = await getScrapingTasks(maxTaskItems);

    if (items.length > 0) {
      // 执行爬取任务
      const results = await scraping(items);
      if (typeof results === "string") {
        console.log("任务失败：", results);
      } else {
        // 保存结果到数据库
        await saveResult(results);
      }
    }

    return;
  });
