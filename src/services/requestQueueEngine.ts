/**
 * Request Queue Engine (TypeScript)
 * Concurrent task queue with worker limits for scaling up to 100+ designers
 */

export interface QueuedJob {
  id: string;
  taskFn: () => Promise<any>;
  onQueueUpdate?: (position: number) => void;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  enqueuedAt: number;
}

export class RequestQueueEngine {
  private maxConcurrency: number;
  private runningWorkers: number;
  private queue: QueuedJob[];

  constructor(maxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
    this.runningWorkers = 0;
    this.queue = [];
  }

  enqueue<T = any>(
    taskFn: () => Promise<T>,
    onQueueUpdate?: (position: number) => void
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: QueuedJob = {
        id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        taskFn,
        onQueueUpdate,
        resolve,
        reject,
        enqueuedAt: Date.now()
      };

      if (this.runningWorkers < this.maxConcurrency) {
        this.runJob(job);
      } else {
        this.queue.push(job);
        const position = this.queue.length;
        if (onQueueUpdate) onQueueUpdate(position);
        console.log(`[QueueEngine] ⏳ Job ${job.id} queued at position #${position} (Active workers: ${this.runningWorkers}/${this.maxConcurrency})`);
      }
    });
  }

  private async runJob(job: QueuedJob) {
    this.runningWorkers++;
    console.log(`[QueueEngine] 🚀 Processing Job ${job.id} (Active workers: ${this.runningWorkers}/${this.maxConcurrency})`);

    try {
      const result = await job.taskFn();
      job.resolve(result);
    } catch (err) {
      job.reject(err);
    } finally {
      this.runningWorkers--;
      this.processNext();
    }
  }

  private processNext() {
    if (this.queue.length > 0 && this.runningWorkers < this.maxConcurrency) {
      const nextJob = this.queue.shift();
      if (nextJob) {
        this.notifyQueuePositions();
        this.runJob(nextJob);
      }
    }
  }

  private notifyQueuePositions() {
    this.queue.forEach((job, idx) => {
      if (job.onQueueUpdate) {
        job.onQueueUpdate(idx + 1);
      }
    });
  }

  getStats() {
    return {
      activeWorkers: this.runningWorkers,
      maxConcurrency: this.maxConcurrency,
      queuedJobs: this.queue.length
    };
  }
}

export const agentQueue = new RequestQueueEngine(3);
