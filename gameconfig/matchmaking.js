

const matchmaking = {
  1: {
    1: 1000,
    2: 2000,
  }
}

function matchmakingsp(target) {
    // Convert the nested object into an array of values and sort them
    const values = Object.values(matchmaking[1]).sort((a, b) => a - b);
    
    let higherBound = values[values.length - 1]; // Start with the last value
    
    for (let i = 0; i < values.length; i++) {
      if (target < values[i]) {
        higherBound = values[i];
        break;
      }
    }
  
    return higherBound;
  }


 // console.log(matchmakingsp("999"))
  
module.exports = {
    matchmaking,
    matchmakingsp
}