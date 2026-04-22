import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health', () => {
    it('GET /api/v1/health/ping → should return ok', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ping')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('kalam-backend');
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /api/v1/health → should return all services up', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.info.database.status).toBe('up');
      expect(res.body.info.memory_heap.status).toBe('up');
    });
  });

  describe('Not Found', () => {
    it('GET /api/v1/not-found → should return 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/not-found')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
