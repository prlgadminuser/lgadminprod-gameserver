const { valid_shopitems, not_allowed_specialitems, getItemPrice, IsItemValid, IsItemTypeValid } = require("./items");

const UpdateShopOnServerStart = false
const discountCounts = [1, 2];
const discountRates = [40, 50];

const itemPrefixes = ["HAT", "TOP", "HAT", "TOP", "HAT", "TOP", "BANNER", "POSE"];

 for (const itemType of itemPrefixes) {
  if (!IsItemTypeValid(itemType)) throw new Error(`itemtype ${itemType} is not existing/ not valid`);

 }

const fallback_currency = "coins"

// ------------------ ITEM PRICE ------------------


// ------------------ DATE PARSER ------------------
const monthMap = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12
};

function parseDayMonth(str) {
  const [day, monthName] = str.trim().toLowerCase().split(" ");
  const month = monthMap[monthName];
  if (!month) throw new Error(`Unknown month: ${monthName}`);
  return { month, day: Number(day) };
}

function parseUserDateRange(input) {
  input = input.toLowerCase().trim();

  if (!input.includes("-")) {
    const d = parseDayMonth(input);
    return { start: d, end: d };
  }

  const [start, end] = input.split("-").map(s => parseDayMonth(s));
  return { start, end };
}

function toComparable({ month, day }) {
  return month * 100 + day;
}

function getExpirationTimestamp({ month, day }) {
  const year = new Date().getUTCFullYear();
  return Date.UTC(year, month - 1, day, 23, 59, 59)
}

// ------------------ CONFIG ------------------
const rawConfig = [
  {
    dates: "1 january - 31 december",
    offers: [
      { items: ["HAT:explorer", "HAT:weird_mask"], price: 0, offertext: "STARTER PACK", normalprice: 350, theme: "2" }
    ],
    theme: "default"
  },
  {
    dates: "14 february - 15 february",
    offers: [
      { items: ["BANNER:ninja", "BANNER:dark"], price: 1, offertext: "VALENTINE OFFER ❤️", theme: "4" }
    ],
    theme: "default"
  },
  {
    dates: "19 december - 24 december",
    offers: [
      { items: ["BANNER:storm", "BANNER:pinball"], price: 400, offertext: "VAULTED BANNERS OFFER", theme: "5" }
    ],
    theme: "default"
  },
  {
    dates: "22 december - 27 december",
    offers: [
      { items: ["HAT:santa"], offertext: "WINTER FEST!", theme: "2" }
    ],
    theme: "default"
  },
  {
    dates: "1 january",
    offers: [
      { items: ["HAT:new_year"], price: 90, offertext: "2026 NEW YEAR OFFER!", theme: "2" }
    ],
    theme: "default"
  }
];

// ------------------ PREPROCESS ------------------
const specialDateRanges = rawConfig.map(({ dates, offers, theme }) => {
  const range = parseUserDateRange(dates);

  return {
    start: toComparable(range.start),
    end: toComparable(range.end),
    expires_in: getExpirationTimestamp(range.end),
    theme,
    offers
  };
});

for (const dateData of specialDateRanges) {
  for (const offer of dateData.offers) {
    for (const item of offer.items) {
      if (!IsItemValid(item)) {
        throw new Error(`itemid ${item} is not existing`);
      }
    }
  }
}



// ------------------ LOOKUP FUNCTION ------------------
function getOffersForDate(dateStr) {
  // dateStr = "12-24"
  const [month, day] = dateStr.split("-").map(Number);
  const value = month * 100 + day;

  const specialoffers = [];
  let theme = "default";

  for (const range of specialDateRanges) {
    if (value >= range.start && value <= range.end) {
      theme = range.theme;

      for (const entry of range.offers) {

        const items = Array.isArray(entry.items) ? entry.items : [entry.items]

        const normalprice = items.reduce((t, items) => t + getItemPrice(items), 0);

        specialoffers.push({
          items: items,
          price: entry.price ?? normalprice,
          normalprice: entry.price ? entry.price : normalprice,
          quantity: entry.quantity ?? 1,
          currency: entry.currency ?? fallback_currency,
          offertext: entry.offertext ?? "NEW ITEM",
          expires_in: range.expires_in,
          ...(entry.theme && { theme: entry.theme })
        });
      }
    }
  }

  return { theme, specialoffers };
}

// ------------------ EXPORT ------------------
module.exports = {
  itemPrefixes,
  getOffersForDate,
  UpdateShopOnServerStart,
  discountCounts,
  discountRates,
  fallback_currency
};
