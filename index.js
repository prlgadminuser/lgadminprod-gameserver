require("dotenv").config();

const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const cron = require("node-cron");
const fs = require("fs").promises;

const {
  specialDateConfig,
  itemPrefixes,
  specialDateTheme,
  UpdateShopOnServerStart,
  discountCounts,
  discountRates,
  getOffersForDate,
  fallback_currency
} = require("./config/shopconfig.js");
const { valid_shopitems } = require("./config/items.js");

const app = express();
const port = process.env.PORT || 3090;


const MONGO_URI = process.env.MONGO_URI

const client = new MongoClient(MONGO_URI, {
   serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("Cluster0");
const shopcollection = db.collection("serverconfig");

const paths = {
  lastUpdate: "./tempdata/last-update-timestamp.txt",
  itemsUsed: "./tempdata/items-used-in-last-days.json"
};

let lastUpdate = 0;
let availableItems = [];
let dailyItems = {};
let itemsUsedInLastDays = new Map();

const readJSONFile = async (path, defaultValue = {}) => {
  try { return JSON.parse(await fs.readFile(path, "utf8")); } 
  catch { return defaultValue; }
};

const writeJSONFile = async (path, data) => {
  try { await fs.writeFile(path, JSON.stringify(data, null, 2)); } 
  catch (err) { console.error("Error writing file:", path, err); }
};

async function loadData() {
  availableItems = Object.keys(valid_shopitems);
  dailyItems = {};
  lastUpdate = parseInt(await fs.readFile(paths.lastUpdate, "utf8").catch(() => "0"), 10);
  itemsUsedInLastDays = new Map(await readJSONFile(paths.itemsUsed, []));
}

const shouldUpdateDailyRotation = () => {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return Date.now() > midnight.getTime() && lastUpdate < midnight.getTime();
};

const getRandomItem = array => array[Math.floor(Math.random() * array.length)];

function applyDiscount(items) {
  const keys = Object.keys(items);
  const numDiscounts = Math.floor(Math.random() * (discountCounts[1] - discountCounts[0] + 1)) + discountCounts[0];
  const discountRate = (Math.floor(Math.random() * (discountRates[1] - discountRates[0] + 1)) + discountRates[0]) / 100;
  keys.sort(() => 0.5 - Math.random()).slice(0, numDiscounts).forEach(key => {
    const item = items[key];
    item.normalprice = item.price;
    item.price = Math.round(item.price * (1 - discountRate));
    item.offertext = "SPECIAL OFFER";
  });
  return items;
}

async function saveDailyRotation() {
  await fs.writeFile(paths.lastUpdate, Date.now().toString());
  await writeJSONFile(paths.itemsUsed, Array.from(itemsUsedInLastDays.entries()));
}

async function selectDailyItems() {
  const selectedItems = new Set();
  const availableSet = new Set(availableItems);

  // Group items by prefix and filter out recently used items
  const itemsByPrefix = {};
  [...new Set(itemPrefixes)].forEach(prefix => {
    itemsByPrefix[prefix] = [...availableSet].filter(
      item => item.startsWith(prefix) && !itemsUsedInLastDays.has(item)
    );
  });

  // Count how many items to select per prefix
  const prefixCounts = {};
  itemPrefixes.forEach(prefix => {
    prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
  });

  // First pass: select unused items per prefix
  const selectedByPrefix = {};
  for (const [prefix, count] of Object.entries(prefixCounts)) {
    selectedByPrefix[prefix] = [];
    for (let i = 0; i < count; i++) {
      const availableForPrefix = itemsByPrefix[prefix].filter(item => !selectedItems.has(item));
      if (!availableForPrefix.length) break;
      const selected = getRandomItem(availableForPrefix);
      selectedByPrefix[prefix].push(selected);
      selectedItems.add(selected);
      itemsUsedInLastDays.set(selected, Date.now());
      availableSet.delete(selected);
    }
  }

   let PrefixHasNotEnoughItems = false

  // Second pass: if any prefix still needs items, allow repeats **within the same prefix**
  for (const [prefix, count] of Object.entries(prefixCounts)) {
    while (selectedByPrefix[prefix].length < count) {
       PrefixHasNotEnoughItems = true
      const fallbackItems = [...availableSet].filter(item => item.startsWith(prefix));
      if (!fallbackItems.length) {
        // If no items left in this prefix, allow any item from that prefix (used previously)
        fallbackItems.push(...availableItems.filter(item => item.startsWith(prefix)));
      }
      const selected = getRandomItem(fallbackItems);
      selectedByPrefix[prefix].push(selected);
      selectedItems.add(selected);
      itemsUsedInLastDays.set(selected, Date.now());
      availableSet.delete(selected);
    }
  }

  if (PrefixHasNotEnoughItems) {
    itemsUsedInLastDays.clear();
    await writeJSONFile(paths.itemsUsed, []);
  }


  // Flatten into dailyItems by position
  dailyItems = {};
  let pos = 1;
  for (const prefix of itemPrefixes) {
    if (selectedByPrefix[prefix]?.length) {
      dailyItems[pos.toString()] = selectedByPrefix[prefix].shift();
      pos++;
    }
  }



  console.log(`Selected ${Object.keys(dailyItems).length} daily items`);
  await saveDailyRotation();
  await processDailyItemsAndSaveToServer();
}


async function processDailyItemsAndSaveToServer() {
  // ------------------ DAILY ITEMS ------------------
  const dailyWithPrices = Object.fromEntries(
    Object.entries(dailyItems).map(([key, itemId]) => {
      const price = valid_shopitems[itemId]?.price;
      if (!price) throw new Error(`No price found for ${itemId}`);

      return [
        key,
        {
          items: [itemId],
          price,
          currency: fallback_currency
        }
      ];
    })
  );

  // ------------------ DATE ------------------
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}-${now.getDate()}`;

  // ------------------ SPECIAL OFFERS (NEW SYSTEM) ------------------
  const { theme, specialoffers } = getOffersForDate(dateStr);

  // ------------------ FINAL ITEM LIST ------------------
  const discountedDaily = applyDiscount(dailyWithPrices);

  const finalItems = {
    ...Object.fromEntries(
      specialoffers.map((items, index) => [index + 1, items])
    ),
    ...Object.fromEntries(
      Object.entries(discountedDaily).map(
        ([_, items], index) => [specialoffers.length + index + 1, items]
      )
    )
  };

const isValid = Object.values(finalItems).every((offer) =>
  Array.isArray(offer.items)
);

if (!isValid) {
  console.error("Validation failed: one or more offers has non-array items");
  return; // do NOT update database
}

  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0); // Reset time to 00:00:00 for consistency
  const t0am = currentDate.getTime();

  // ------------------ SAVE ------------------
  await shopcollection.updateOne(
    { _id: "ItemShop" },
    {
      $set: {
        offers: finalItems,
        shop_background_theme: theme,
        next_shop_update: t0am
      }
    },
    { upsert: true }
  );
}


async function init() {
  await client.connect();
  await loadData();

  if (UpdateShopOnServerStart && shouldUpdateDailyRotation()) await selectDailyItems();

  cron.schedule("0 0 * * *", async () => {
    await selectDailyItems();
    console.log("Daily rotation updated by cron.");
  }, { scheduled: true, timezone: "UTC" });
}

app.use((err, req, res, next) => {
  console.error("An error occurred:", err);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(port, () => console.log(`Server running on port ${port}`));
init().catch(console.error);

module.exports = { shopcollection }