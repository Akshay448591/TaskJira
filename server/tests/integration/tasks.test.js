import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Tasks & Projects API Integration', () => {
  let cookies;
  let workspaceId;
  let projectId;

  beforeEach(async () => {
    const unique = Math.random().toString(36).substring(7);
    const signupRes = await request(app).post('/api/auth/signup').send({
      name: 'Task Tester',
      email: `tester_${unique}@example.com`,
      password: 'Password123!',
    });
    cookies = signupRes.headers['set-cookie'];

    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Cookie', cookies)
      .send({ name: `Workspace ${unique}` });
    workspaceId = wsRes.body.workspace._id;

    const projectRes = await request(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Cookie', cookies)
      .send({ name: 'Backend Revamp', priority: 'high', status: 'active' });
    projectId = projectRes.body.project._id;
  });

  it('creates a project successfully in workspace', async () => {
    expect(projectId).toBeDefined();
    expect(workspaceId).toBeDefined();
  });

  it('creates and retrieves a task with default workflow status', async () => {
    const taskRes = await request(app)
      .post(`/api/workspaces/${workspaceId}/tasks`)
      .set('Cookie', cookies)
      .send({
        project: projectId,
        title: 'Implement unit testing suite',
        description: 'Add vitest test suites for all core routes',
        priority: 'urgent',
        labels: ['testing', 'backend'],
      });

    expect(taskRes.status).toBe(201);
    expect(taskRes.body.task).toBeDefined();
    expect(taskRes.body.task.title).toBe('Implement unit testing suite');
    expect(taskRes.body.task.status).toBe('todo');
    expect(taskRes.body.task.priority).toBe('urgent');
    expect(taskRes.body.task.number).toBe(1);

    const taskId = taskRes.body.task._id;

    const getRes = await request(app)
      .get(`/api/workspaces/${workspaceId}/tasks/${taskId}`)
      .set('Cookie', cookies);

    expect(getRes.status).toBe(200);
    expect(getRes.body.task._id).toBe(taskId);
    expect(getRes.body.task.labels).toEqual(['testing', 'backend']);
  });

  it('updates task status and adds a comment', async () => {
    const taskRes = await request(app)
      .post(`/api/workspaces/${workspaceId}/tasks`)
      .set('Cookie', cookies)
      .send({
        project: projectId,
        title: 'Task for status update',
        priority: 'medium',
      });

    const taskId = taskRes.body.task._id;

    const patchRes = await request(app)
      .patch(`/api/workspaces/${workspaceId}/tasks/${taskId}`)
      .set('Cookie', cookies)
      .send({ status: 'in_progress' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.task.status).toBe('in_progress');

    const commentRes = await request(app)
      .post(`/api/workspaces/${workspaceId}/tasks/${taskId}/comments`)
      .set('Cookie', cookies)
      .send({ body: 'Working on this now! PR coming shortly.' });

    expect(commentRes.status).toBe(201);
    expect(commentRes.body.comment.body).toBe('Working on this now! PR coming shortly.');
  });
});
