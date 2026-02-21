



  // info all players under the first value here are all matched together players that have more
//  than that will be between the first and second value and so on
const matchmakingBuckets = [0, 1000, 2000]

.sort((a, b) => a - b);

const SkillbasedMatchmakingEnabled = false;

function roundSkillpointsToFloorBucket(target) {
  if (!matchmakingBuckets.length) return 0;

  let result = matchmakingBuckets[0];

  for (let i = 0; i < matchmakingBuckets.length; i++) {
    if (target >= matchmakingBuckets[i]) {
      result = matchmakingBuckets[i];
    } else {
      break;
    }
  }

  return result;
}



 // console.log(matchmakingsp("999"))
  
module.exports = {
    roundSkillpointsToFloorBucket,
    SkillbasedMatchmakingEnabled,
}