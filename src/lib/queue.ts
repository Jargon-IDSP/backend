import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import 'dotenv/config'; // Ensure environment variables are loaded

// Filter out Redis eviction policy warnings
const originalWarn = console.warn;
console.warn = function(...args: any[]) {
  const message = args[0];
  if (typeof message === 'string' && message.includes('Eviction policy')) {
    return; // Suppress eviction policy warnings
  }
  originalWarn.apply(console, args);
};

// Create connection lazily - only when queues are actually used
let connection: IORedis | null = null;
let connectionAttempted = false;

function getConnection(): IORedis {
  if (!connection && !connectionAttempted) {
    connectionAttempted = true;
    
    try {
      // Support both REDIS_URL (same as main app) and individual HOST/PORT/PASSWORD
      const redisUrl = process.env.REDIS_URL;
      
      console.log(`🔍 BullMQ connecting to Redis: ${redisUrl ? 'Using REDIS_URL' : 'Using localhost'}`);
      
      if (redisUrl) {
        // Use REDIS_URL if available (e.g., Redis Cloud URL)
        connection = new IORedis(redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          showFriendlyErrorStack: false,
          // Don't use lazyConnect for BullMQ workers - they need immediate connection
          retryStrategy: (times) => {
            if (times > 10) {
              console.warn('⚠️  BullMQ Redis unavailable - background jobs disabled');
              return null;
            }
            const delay = Math.min(times * 1000, 5000);
            return delay;
          },
        });
        
        console.log(`✅ IORedis client created with REDIS_URL`);
      } else {
        // Fall back to individual configuration
        connection = new IORedis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          showFriendlyErrorStack: false,
          retryStrategy: (times) => {
            if (times > 10) {
              console.warn('⚠️  BullMQ Redis unavailable - background jobs disabled');
              return null;
            }
            const delay = Math.min(times * 1000, 5000);
            return delay;
          },
        });
        
        console.log(`⚠️  IORedis client created with localhost (REDIS_URL not found)`);
      }

      connection.on('error', (err) => {
        console.error('❌ BullMQ Redis error:', err.message);
      });

      connection.on('connect', () => {
        console.log('✅ BullMQ Redis connected successfully!');
      });

      connection.on('ready', () => {
        console.log('✅ BullMQ Redis ready to process jobs');
      });
    } catch (err) {
      console.error('❌ Could not initialize BullMQ connection:', err);
    }
  }
  
  return connection!;
}

// Job data interfaces
export interface OCRJobData {
  documentId: string;
  userId: string;
  fileKey: string;
  filename: string;
  categoryId?: number | null;
}

export interface TranslationJobData {
  documentId: string;
  userId: string;
  extractedText: string;
}

export interface FlashcardJobData {
  documentId: string;
  userId: string;
  categoryId?: number | null;
  userLanguage?: string; // Preloaded user language (optional, for optimization)
}

// Create queues lazily
let _ocrQueue: Queue<OCRJobData> | null = null;
let _translationQueue: Queue<TranslationJobData> | null = null;
let _flashcardQueue: Queue<FlashcardJobData> | null = null;

export const ocrQueue = {
  add: async (...args: Parameters<Queue<OCRJobData>['add']>) => {
    try {
      if (!_ocrQueue) {
        _ocrQueue = new Queue<OCRJobData>('document-ocr', { connection: getConnection() });
      }
      return await _ocrQueue.add(...args);
    } catch (error) {
      console.warn('⚠️  Failed to add job to OCR queue:', error.message);
      throw error;
    }
  },
  getJob: async (jobId: string) => {
    try {
      if (!_ocrQueue) {
        _ocrQueue = new Queue<OCRJobData>('document-ocr', { connection: getConnection() });
      }
      return await _ocrQueue.getJob(jobId);
    } catch (error) {
      console.warn('⚠️  Failed to get job from OCR queue - Redis unavailable');
      return null;
    }
  },
} as Queue<OCRJobData>;

export const translationQueue = {
  add: async (...args: Parameters<Queue<TranslationJobData>['add']>) => {
    try {
      if (!_translationQueue) {
        _translationQueue = new Queue<TranslationJobData>('document-translation', { connection: getConnection() });
      }
      return await _translationQueue.add(...args);
    } catch (error) {
      console.warn('⚠️  Failed to add job to translation queue:', error.message);
      throw error;
    }
  },
  getJob: async (jobId: string) => {
    try {
      if (!_translationQueue) {
        _translationQueue = new Queue<TranslationJobData>('document-translation', { connection: getConnection() });
      }
      return await _translationQueue.getJob(jobId);
    } catch (error) {
      console.warn('⚠️  Failed to get job from translation queue - Redis unavailable');
      return null;
    }
  },
} as Queue<TranslationJobData>;

export const flashcardQueue = {
  add: async (...args: Parameters<Queue<FlashcardJobData>['add']>) => {
    try {
      if (!_flashcardQueue) {
        _flashcardQueue = new Queue<FlashcardJobData>('document-flashcards', { connection: getConnection() });
      }
      return await _flashcardQueue.add(...args);
    } catch (error) {
      console.warn('⚠️  Failed to add job to flashcard queue:', error.message);
      throw error;
    }
  },
  getJob: async (jobId: string) => {
    try {
      if (!_flashcardQueue) {
        _flashcardQueue = new Queue<FlashcardJobData>('document-flashcards', { connection: getConnection() });
      }
      return await _flashcardQueue.getJob(jobId);
    } catch (error) {
      console.warn('⚠️  Failed to get job from flashcard queue - Redis unavailable');
      return null;
    }
  },
} as Queue<FlashcardJobData>;

// Export actual queues for workers
export function getActualQueues() {
  return {
    ocrQueue: _ocrQueue || new Queue<OCRJobData>('document-ocr', { connection: getConnection() }),
    translationQueue: _translationQueue || new Queue<TranslationJobData>('document-translation', { connection: getConnection() }),
    flashcardQueue: _flashcardQueue || new Queue<FlashcardJobData>('document-flashcards', { connection: getConnection() }),
  };
}

// Job options with retry configuration
export const jobOptions = {
  attempts: 3, // Retry 3 times
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // Start with 2 second delay
  },
  removeOnComplete: {
    age: 86400, // Keep completed jobs for 24 hours
    count: 1000, // Keep last 1000 completed jobs
  },
  removeOnFail: {
    age: 604800, // Keep failed jobs for 7 days
  },
};

// For workers, return the connection (it will auto-connect)
export function queueConnection(): IORedis {
  return getConnection();
}

