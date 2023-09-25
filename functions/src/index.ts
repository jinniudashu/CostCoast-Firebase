import * as admin from "firebase-admin";
// import {subscriptionsManager} from "./subscriptManager";
// import {createNotifyPlan} from "./manageNotifyPlan";
import {createScrapingPlan} from "./manageScrapingPlan";
import {scraper} from "./scraper";
// import {notifyManager} from "./notifyManager";
import { createProductList } from "./createProductList";
import { alertPriceDrop } from "./alertPriceDrop";

admin.initializeApp();

// exports.subscriptionsManager = subscriptionsManager;
// exports.createNotifyPlan = createNotifyPlan;
exports.createScrapingPlan = createScrapingPlan;
exports.scraper = scraper;
// exports.notifyManager = notifyManager;
exports.createProductList = createProductList;
exports.alertPriceDrop = alertPriceDrop;
// exports.testScraper = testScraper;
