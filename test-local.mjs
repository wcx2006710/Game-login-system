import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
let server;
let baseUrl;
let tempDir;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error(`服务器启动超时：\n${output}`));
    }, 10000);

    function onData(chunk) {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (!match) return;

      clearTimeout(timeout);
      child.stdout.off('data', onData);
      resolve(Number(match[1]));
    }

    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`服务器提前退出，退出码 ${code}：\n${output}`));
    });
  });
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, options);
}

async function json(response) {
  return JSON.parse(await response.text());
}

test.before(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'game-login-system-'));
  server = spawn(process.execPath, [path.join('local', 'server.js')], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: '0',
      DB_PATH: path.join(tempDir, 'users.db'),
      SESSION_SECRET: 'local-test-secret',
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const port = await waitForServer(server);
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => {
      server.once('exit', resolve);
      setTimeout(resolve, 2000).unref();
    });
  }

  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('本地认证流程与接口契约', async (t) => {
  let sessionCookie = '';

  await t.test('静态登录页可以访问', async () => {
    const response = await request('/login.html');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /用户登录/);
  });

  await t.test('缺少凭据返回 400', async () => {
    const response = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '', password: '' })
    });

    assert.equal(response.status, 400);
    assert.equal((await json(response)).success, false);
  });

  await t.test('错误密码返回 401', async () => {
    const response = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'wcx', password: 'wrong-password' })
    });

    assert.equal(response.status, 401);
    const data = await json(response);
    assert.equal(data.success, false);
  });

  await t.test('正确密码建立安全会话', async () => {
    const response = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'wcx', password: 'dashuaige' })
    });

    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    sessionCookie = setCookie.split(';')[0];

    const data = await json(response);
    assert.equal(data.success, true);
    assert.equal(data.redirect, '/success.html');
  });

  await t.test('未登录接口按契约拒绝访问', async () => {
    const currentResponse = await request('/api/current-user');
    assert.deepEqual(await json(currentResponse), { loggedIn: false });

    const usersResponse = await request('/api/users');
    assert.equal(usersResponse.status, 401);
  });

  await t.test('登录后可读取当前用户和用户列表', async () => {
    const headers = { Cookie: sessionCookie };

    const currentResponse = await request('/api/current-user', { headers });
    const current = await json(currentResponse);
    assert.equal(current.loggedIn, true);
    assert.equal(current.user.username, 'wcx');

    const usersResponse = await request('/api/users', { headers });
    assert.equal(usersResponse.status, 200);

    const users = await json(usersResponse);
    assert.equal(users.length, 3);
    assert.ok(users.every((user) => (
      user.id && user.username && Object.hasOwn(user, 'email') && user.created_at
    )));
    assert.ok(users.every((user) => !Object.hasOwn(user, 'password')));
    assert.ok(users.every((user) => !Object.hasOwn(user, 'password_hash')));
  });

  await t.test('登出后会话失效', async () => {
    const headers = { Cookie: sessionCookie };
    const logoutResponse = await request('/logout', { method: 'POST', headers });
    assert.equal(logoutResponse.status, 200);
    assert.equal((await json(logoutResponse)).success, true);

    const currentResponse = await request('/api/current-user', { headers });
    assert.deepEqual(await json(currentResponse), { loggedIn: false });
  });
});

test('连续失败会触发登录限流', async (t) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'rate-limited-user', password: 'wrong' })
    });
    assert.equal(response.status, 401);
  }

  const blockedResponse = await request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'rate-limited-user', password: 'wrong' })
  });
  assert.equal(blockedResponse.status, 429);
});
