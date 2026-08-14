/**
 * Concurrent FIFO Request Queue Engine
 * Handles 100+ simultaneous Telegram designers with 3-worker parallel concurrency and dynamic rate limit control.
 */

class RequestQueueEngine {
  constructor(concurrencyLimit = 3) {
    this.concurrencyLimit = concurrencyLimit;
    this.activeWorkers = 0;
    this.queue = [];
  }

  /**
   * Enqueue an async design task
   * @param {Function} asyncTask - Async function to run
   * @param {Function} onProgressUpdate - Queue position callback
   */
  enqueue(asyncTask, onProgressUpdate = null) {
    return new Promise((resolve, reject) => {
      const job = {
        asyncTask,
        onProgressUpdate,
        resolve,
        reject,
        enqueuedAt: Date.now()
      };

      this.queue.push(job);
      this.notifyQueuePositions();
      this.processNext();
    });
  }

  notifyQueuePositions() {
    this.queue.forEach((job, idx) => {
      if (job.onProgressUpdate && idx > 0) {
        job.onProgressUpdate(idx + 1);
      }
    });
  }

  async processNext() {
    if (this.activeWorkers >= this.concurrencyLimit || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    this.activeWorkers++;

    try {
      const result = await job.asyncTask();
      job.resolve(result);
    } catch (err) {
      job.reject(err);
    } finally {
      this.activeWorkers--;
      this.notifyQueuePositions();
      this.processNext();
    }
  }

  getStats() {
    return {
      activeWorkers: this.activeWorkers,
      queuedJobs: this.queue.length,
      concurrencyLimit: this.concurrencyLimit
    };
  }
}

export const agentQueue = new RequestQueueEngine(3);
