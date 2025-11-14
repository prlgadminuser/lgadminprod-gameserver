
const SQRT1_2 = Math.SQRT1_2; // precalculate movement vectors

const DIRECTION_VECTORS = {
  [-90]: { x: 0, y: -1 }, // up
  [0]: { x: 1, y: 0 }, // right
  [-270]: { x: 0, y: 1 }, // down
  [180]: { x: -1, y: 0 }, // left
  [-180]: { x: -1, y: 0 }, // same as 180
  [-45]: { x: SQRT1_2, y: -SQRT1_2 }, // up-right
  [-135]: { x: -SQRT1_2, y: -SQRT1_2 }, // up-left
  [45]: { x: SQRT1_2, y: SQRT1_2 }, // down-right
  [-225]: { x: -SQRT1_2, y: SQRT1_2 }, // down-left
};

module.exports = {
  DIRECTION_VECTORS
}