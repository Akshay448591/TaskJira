import { beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_jwt_access_secret_super_secure_key_123';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_jwt_refresh_secret_super_secure_key_456';

let mongod = null;

beforeAll(async () => {
  // If local mongo is available, use test database for fast startup; otherwise start memory server
  try {
    const testUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/taskjira_test';
    await mongoose.connect(testUri, { serverSelectionTimeoutMS: 2000 });
  } catch {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
  }
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
});
