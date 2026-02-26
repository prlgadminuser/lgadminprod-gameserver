const { encodePosition } = require("./game");
const { arraysEqual } = require("./hash");
const msgpack = require("msgpack-lite");

module.exports = {

    compressMessage(msg) {
    return msgpack.encode(msg);
      },
    

SerializePlayerData(p) {
  const arr = p.serializeBuffer;
  arr[0] = p.id;
  arr[1] = encodePosition(p.position.x);
  arr[2] = encodePosition(p.position.y);
  arr[3] = p.direction2;
  arr[4] = p.health;
  arr[5] = Number(p.gun);
  arr[6] = Number(p.emote);
  arr[7] = p.moving ? 1 : 0
  //arr[7] = encodePlayerSpeed(p.speed)
  return arr;
},

BuildSelfData(p) {

  const selfdata = {
    state: p.state,
    s: +p.shooting,
    kil: p.kills,
    dmg: p.damage,
    rwds: p.finalrewards.length > 0 ? p.finalrewards : undefined,
    killer: p.eliminator,
    cg: +p.canusegadget,
    lg: p.gadgetuselimit,
    ag: +p.gadgetactive,
    el: p.eliminations.length > 0 ? p.eliminations : undefined,
    spc: p.spectatingPlayerId,
    guns: p.loadout_formatted,
    ht: p.hitmarkers.length > 0 ? p.hitmarkers : undefined,
  };

  p.lastplayerids = p.nearbyplayersids;

  /*  if (p.allowweridsend) {
        selfdata.x = encodePosition(p.x);
        selfdata.y = encodePosition(p.y);
        selfdata.h = p.health
        selfdata.g = p.gun
        selfdata.em = p.emote
    }
    */

  return selfdata;
}
}