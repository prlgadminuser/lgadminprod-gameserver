class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.maxRequests - Max requests allowed
   * @param {number} options.interval - Time window in seconds
   */
  constructor({ maxRequests, interval }) {
    if (maxRequests <= 0 || interval <= 0) {
      throw new Error("maxRequests and interval must be positive");
    }

    this.maxRequests = maxRequests;
    this.intervalMs = interval * 1000;

    this.count = 0;
    this.windowStart = Date.now();
  }

  /**
   * Allow 1 request
   */
  allow() {
    return this.consume(1);
  }

  /**
   * Attempt to consume n requests
   * @param {number} n
   * @returns {boolean}
   */
  consume(n = 1) {
    if (n <= 0) return true;

    const now = Date.now();

    // Reset window if expired
    if (now - this.windowStart >= this.intervalMs) {
      this.windowStart = now;
      this.count = 0;
    }

    if (this.count + n <= this.maxRequests) {
      this.count += n;
      return true;
    }

    return false;
  }

  /**
   * Remaining requests in current window
   */
  remaining() {
    const now = Date.now();

    if (now - this.windowStart >= this.intervalMs) {
      return this.maxRequests;
    }

    return Math.max(0, this.maxRequests - this.count);
  }

  /**
   * Time until window resets (ms)
   */
  timeUntilReset() {
    const now = Date.now();
    return Math.max(0, this.intervalMs - (now - this.windowStart));
  }
}

module.exports = RateLimiter;
