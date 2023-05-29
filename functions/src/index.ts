import * as admin from "firebase-admin";
import {subscriptionsManager} from "./subscriptManager";
import {createNotifyPlan} from "./manageNotifyPlan";
import {createScrapingPlan} from "./manageScrapingPlan";
import {scraper} from "./scraper";
import {notifyManager} from "./notifyManager";

admin.initializeApp();

exports.subscriptionsManager = subscriptionsManager;
exports.createNotifyPlan = createNotifyPlan;
exports.createScrapingPlan = createScrapingPlan;
exports.scraper = scraper;
exports.notifyManager = notifyManager;
