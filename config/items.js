//const { shopcollection } = require("..");



const validItemTypes = ["HAT", "TOP", "BANNER", "POSE"];

// ======================================================
// ❌ NOT ALLOWED (exclusive / paid / special)
// ======================================================
const not_allowed_specialitems = {
  "HAT:santa": { rarity: "legendary" },
  "TOP:santa": { rarity: "legendary" },
  "HAT:new_year": { rarity: "rare" },
  "HAT:explorer": { rarity: "common" },
  "HAT:weird_mask": { rarity: "uncommon" },
  "HAT:chrono": { rarity: "legendary" },
  "HAT:netjump": { rarity: "uncommon" },
  "TOP:netjump": { rarity: "uncommon" },
  "BANNER:pinball": { rarity: "uncommon" },
  "BANNER:music": { rarity: "rare" },
  "BANNER:og": { rarity: "epic" },
  "BANNER:storm": { rarity: "legendary" },
  "BANNER:chrono": { rarity: "epic" },
  "POSE:enchanted": { rarity: "legendary" },
  "HAT:pumpkin": { rarity: "epic" },
  "TOP:pumpkin": { rarity: "epic" },
  "BANNER:halloween1": { rarity: "rare" },
};

// ======================================================
// ✅ VALID SHOP ITEMS
// ======================================================
const valid_shopitems = {
  // ================= HATS =================
  "HAT:gang_mask": { rarity: "uncommon" },
  "HAT:hot_angel": { rarity: "epic" },
  "HAT:gang_mask_glow": { rarity: "rare" },
  "HAT:factory": { rarity: "common" },
  "HAT:star_grey": { rarity: "common" },
  "HAT:star_purple": { rarity: "uncommon" },
  "HAT:star_bw": { rarity: "uncommon" },
  "HAT:star_multi": { rarity: "rare" },
  "HAT:twists": { rarity: "common" },
  "HAT:sunny_fire": { rarity: "rare" },
  "HAT:hot_cheeto": { rarity: "rare" },
  "HAT:fuzzy_heart": { rarity: "uncommon" },
  "HAT:cyber": { rarity: "epic" },
  "HAT:clown": { rarity: "common" },
  "HAT:dirtypixels": { rarity: "rare" },
  "HAT:magic": { rarity: "epic" },
  "HAT:glow_hero": { rarity: "epic" },
  "HAT:chiller": { rarity: "rare" },
  "HAT:tropical": { rarity: "epic" },
  "HAT:dream_guard": { rarity: "legendary" },
  "HAT:pixel_glasses": { rarity: "uncommon" },
  "HAT:wizard": { rarity: "epic" },
  "HAT:lucky_plucky": { rarity: "rare" },
  "HAT:astro": { rarity: "epic" },
  "HAT:diver": { rarity: "uncommon" },
  "HAT:mod_cut": { rarity: "common" },
  "HAT:arcade": { rarity: "rare" },
  "HAT:chef": { rarity: "rare" },
  "HAT:robot": { rarity: "legendary" },
  "HAT:cracker": { rarity: "uncommon" },
  "HAT:magicstone": { rarity: "epic" },

  // ================= TOPS =================
  "TOP:gang": { rarity: "uncommon" },
  "TOP:hot_angel": { rarity: "epic" },
  "TOP:factory": { rarity: "common" },
  "TOP:star_grey": { rarity: "common" },
  "TOP:star_purple": { rarity: "uncommon" },
  "TOP:star_bw": { rarity: "uncommon" },
  "TOP:star_multi": { rarity: "rare" },
  "TOP:basic": { rarity: "common" },
  "TOP:sunny_fire": { rarity: "rare" },
  "TOP:hot_cheeto": { rarity: "rare" },
  "TOP:fuzzy_heart": { rarity: "uncommon" },
  "TOP:cyber": { rarity: "epic" },
  "TOP:clown": { rarity: "common" },
  "TOP:pixel_nthing": { rarity: "rare" },
  "TOP:magic": { rarity: "epic" },
  "TOP:glow_hero": { rarity: "epic" },
  "TOP:chiller": { rarity: "rare" },
  "TOP:tropical": { rarity: "epic" },
  "TOP:dream_guard": { rarity: "legendary" },
  "TOP:wizard": { rarity: "epic" },
  "TOP:astro": { rarity: "epic" },
  "TOP:random": { rarity: "common" },
  "TOP:chef": { rarity: "rare" },
  "TOP:robot": { rarity: "legendary" },
  "TOP:cracker": { rarity: "uncommon" },
  "TOP:magicstone": { rarity: "epic" },

  // ================= BANNERS =================
  "BANNER:broken_dream": { rarity: "common" },
  "BANNER:beam": { rarity: "uncommon" },
  "BANNER:dark": { rarity: "uncommon" },
  "BANNER:fire": { rarity: "rare" },
  "BANNER:gears": { rarity: "common" },
  "BANNER:ninja": { rarity: "rare" },
  "BANNER:island": { rarity: "common" },
  "BANNER:spectra": { rarity: "rare" },
  "BANNER:chemical": { rarity: "rare" },
  "BANNER:sea": { rarity: "common" },

  // ================= POSES =================
  "POSE:rush": { rarity: "common" },
  "POSE:mind": { rarity: "common" },
  "POSE:ninja": { rarity: "rare" },
  "POSE:itch": { rarity: "common" },
  "POSE:jump": { rarity: "common" },
  "POSE:rocket": { rarity: "epic" },
  "POSE:space": { rarity: "rare" },
  "POSE:losingIt": { rarity: "rare" },
};


const rarityPrices = {
  common: 50,
  uncommon: 90,
  rare: 120,
  epic: 150,
  legendary: 200,
};



// Assign prices automatically based on rarity and validate items before start of server
for (const itemId in valid_shopitems) {
  const item = valid_shopitems[itemId];
  const itemType = itemId.split(":")[0];
   // get the prefix before the underscore
  if (!validItemTypes.includes(itemType))
    throw new Error(`Item type for ${itemId} is not valid`);

  if (not_allowed_specialitems[itemId])
    throw new Error(
      `critical error: special itemid ${itemId} is present in valid shopitems `
    );

  if (!item.rarity) throw new Error(`Item ${itemId} has no rarity set`);

  item.price = rarityPrices[item.rarity]; // default undefined if rarity unknown
  if (!item.price)
    throw new Error(`Item rarity of ${itemId} not set or not valid`);
}

for (const itemId in not_allowed_specialitems) {
  const item = not_allowed_specialitems[itemId];
  const itemType = itemId.split(":")[0]; // get the prefix before the underscore
  if (!validItemTypes.includes(itemType))
    throw new Error(`Item type for ${itemId} is not valid`);

  if (!item.rarity) throw new Error(`Item ${itemId} has no rarity set`);

  item.price = rarityPrices[item.rarity]; // default undefined if rarity unknown
  if (!item.price)
    throw new Error(`Item rarity of ${itemId} not set or not valid`);
}

function IsItemValid(itemId) {

  return valid_shopitems[itemId]  || not_allowed_specialitems[itemId]

}

function IsItemTypeValid(itemType) {

  return validItemTypes.includes(itemType)

}

function getItemPrice(itemId) {
  const item = valid_shopitems[itemId] || not_allowed_specialitems[itemId];
  if (!item?.price) throw new Error(`Price not found for ${itemId}`);
  return item.price;
}

function newOffer(entry, range, normalprice) {

 const offer = {
          items: entry.id,
          price: entry.price ?? normalprice,
          normalprice: entry.price ? entry.price : normalprice,
          quantity: entry.quantity ?? 1,
          currency: entry.currency ?? "coins",
          offertext: entry.offertext ?? "NEW ITEM",
          expires_in: range.expires_in,
          ...(entry.theme && { theme: entry.theme })
        }

}

module.exports = {
  valid_shopitems,
  not_allowed_specialitems,
  IsItemValid,
  IsItemTypeValid,
  getItemPrice,
};
