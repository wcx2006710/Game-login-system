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

test('注册流程与校验', async (t) => {
  await t.test('用户名不合规返回 400', async () => {
    const response = await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ab', password: 'secret123' })
    });

    assert.equal(response.status, 400);
    assert.equal((await json(response)).success, false);
  });

  await t.test('密码过短返回 400', async () => {
    const response = await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'shortpass', password: '123' })
    });

    assert.equal(response.status, 400);
  });

  await t.test('邮箱格式错误返回 400', async () => {
    const response = await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'badmail', password: 'secret123', email: 'not-an-email' })
    });

    assert.equal(response.status, 400);
  });

  await t.test('注册成功返回 201，角色为普通用户，邮箱统一小写', async () => {
    const response = await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'alice',
        password: 'alice-pass-123',
        email: 'Alice@Example.com'
      })
    });

    assert.equal(response.status, 201);
    const data = await json(response);
    assert.equal(data.success, true);
    assert.equal(data.user.username, 'alice');
    assert.equal(data.user.role, 'user');
    assert.equal(data.user.email, 'alice@example.com');
  });

  await t.test('重复用户名返回 409', async () => {
    const response = await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'another-pass-123' })
    });

    assert.equal(response.status, 409);
  });

  await t.test('重复邮箱返回 409', async () => {
    const response = await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'alice2',
        password: 'another-pass-123',
        email: 'alice@example.com'
      })
    });

    assert.equal(response.status, 409);
  });

  await t.test('新注册账号可以登录', async () => {
    const response = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'alice-pass-123' })
    });

    assert.equal(response.status, 200);
    assert.equal((await json(response)).success, true);
  });
});

test('用户管理接口权限与操作', async (t) => {
  let memberCookie = '';
  let adminCookie = '';
  let createdUserId = null;

  await t.test('普通用户与管理员分别登录', async () => {
    const memberResponse = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'alice-pass-123' })
    });
    assert.equal(memberResponse.status, 200);
    memberCookie = memberResponse.headers.get('set-cookie').split(';')[0];

    const adminResponse = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: '123456' })
    });
    assert.equal(adminResponse.status, 200);
    adminCookie = adminResponse.headers.get('set-cookie').split(';')[0];
  });

  await t.test('默认 admin 账号角色为 admin', async () => {
    const response = await request('/api/current-user', { headers: { Cookie: adminCookie } });
    const data = await json(response);

    assert.equal(data.loggedIn, true);
    assert.equal(data.user.role, 'admin');
  });

  await t.test('未登录访问管理接口返回 401', async () => {
    const response = await request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nobody', password: 'secret123' })
    });

    assert.equal(response.status, 401);
  });

  await t.test('普通用户访问管理接口返回 403', async () => {
    const response = await request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
      body: JSON.stringify({ username: 'nobody', password: 'secret123' })
    });

    assert.equal(response.status, 403);
  });

  await t.test('管理员新增用户返回 201', async () => {
    const response = await request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        username: 'bob',
        password: 'bob-pass-123',
        email: 'bob@example.com',
        role: 'user'
      })
    });

    assert.equal(response.status, 201);
    const data = await json(response);
    assert.equal(data.username, 'bob');
    assert.equal(data.role, 'user');
    assert.ok(data.id);
    createdUserId = data.id;
  });

  await t.test('管理员修改用户角色与邮箱', async () => {
    const response = await request(`/api/users/${createdUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ role: 'admin', email: 'bob.admin@example.com' })
    });

    assert.equal(response.status, 200);
    const data = await json(response);
    assert.equal(data.role, 'admin');
    assert.equal(data.email, 'bob.admin@example.com');
  });

  await t.test('管理员重置密码后新密码可登录、旧密码失效', async () => {
    const resetResponse = await request(`/api/users/${createdUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ password: 'new-bob-pass' })
    });
    assert.equal(resetResponse.status, 200);

    const newPasswordLogin = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob', password: 'new-bob-pass' })
    });
    assert.equal(newPasswordLogin.status, 200);

    const oldPasswordLogin = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob', password: 'bob-pass-123' })
    });
    assert.equal(oldPasswordLogin.status, 401);
  });

  await t.test('管理员不能取消自己的管理员权限', async () => {
    const meResponse = await request('/api/current-user', { headers: { Cookie: adminCookie } });
    const me = await json(meResponse);

    const response = await request(`/api/users/${me.user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ role: 'user' })
    });

    assert.equal(response.status, 400);
  });

  await t.test('管理员不能删除当前登录账号', async () => {
    const meResponse = await request('/api/current-user', { headers: { Cookie: adminCookie } });
    const me = await json(meResponse);

    const response = await request(`/api/users/${me.user.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });

    assert.equal(response.status, 400);
  });

  await t.test('默认 admin 账号不可删除', async () => {
    const usersResponse = await request('/api/users', { headers: { Cookie: adminCookie } });
    const users = await json(usersResponse);
    const adminUser = users.find((user) => user.username === 'admin');

    const response = await request(`/api/users/${adminUser.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });

    assert.equal(response.status, 400);
  });

  await t.test('管理员删除用户', async () => {
    const response = await request(`/api/users/${createdUserId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });

    assert.equal(response.status, 200);
    assert.equal((await json(response)).success, true);

    const usersResponse = await request('/api/users', { headers: { Cookie: adminCookie } });
    const users = await json(usersResponse);
    assert.ok(!users.some((user) => user.id === createdUserId));
  });

  await t.test('删除不存在的用户返回 404', async () => {
    const response = await request('/api/users/99999', {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });

    assert.equal(response.status, 404);
  });

  await t.test('用户列表不返回密码字段', async () => {
    const response = await request('/api/users', { headers: { Cookie: adminCookie } });
    const users = await json(response);

    assert.ok(users.length >= 3);
    assert.ok(users.every((user) => !Object.hasOwn(user, 'password')));
    assert.ok(users.every((user) => !Object.hasOwn(user, 'password_hash')));
    assert.ok(users.every((user) => user.role === 'user' || user.role === 'admin'));
  });
});

test('个人中心接口', async (t) => {
  let cookie = '';

  await t.test('准备一个专用账号并登录', async () => {
    const registerResponse = await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'profileuser',
        password: 'profile-pass-1',
        email: 'profile@example.com'
      })
    });
    assert.equal(registerResponse.status, 201);

    const loginResponse = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'profileuser', password: 'profile-pass-1' })
    });
    assert.equal(loginResponse.status, 200);
    cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  });

  await t.test('未登录访问个人中心接口返回 401', async () => {
    const profileResponse = await request('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.com' })
    });
    assert.equal(profileResponse.status, 401);

    const passwordResponse = await request('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'a', newPassword: 'bbbbbb' })
    });
    assert.equal(passwordResponse.status, 401);
  });

  await t.test('邮箱格式错误返回 400', async () => {
    const response = await request('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'not-an-email' })
    });

    assert.equal(response.status, 400);
  });

  await t.test('邮箱被其他账号占用返回 409', async () => {
    const response = await request('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'admin@example.com' })
    });

    assert.equal(response.status, 409);
  });

  await t.test('修改自己的邮箱成功且小写归一', async () => {
    const response = await request('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'ProfileNew@Example.com' })
    });

    assert.equal(response.status, 200);
    const data = await json(response);
    assert.equal(data.success, true);
    assert.equal(data.user.email, 'profilenew@example.com');
    assert.equal(data.user.role, 'user');
  });

  await t.test('当前密码错误返回 400', async () => {
    const response = await request('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: 'wrong-pass', newPassword: 'brand-new-pass' })
    });

    assert.equal(response.status, 400);
  });

  await t.test('新密码过短返回 400', async () => {
    const response = await request('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: 'profile-pass-1', newPassword: '123' })
    });

    assert.equal(response.status, 400);
  });

  await t.test('新密码与当前密码相同返回 400', async () => {
    const response = await request('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: 'profile-pass-1', newPassword: 'profile-pass-1' })
    });

    assert.equal(response.status, 400);
  });

  await t.test('修改密码成功后旧密码失效、新密码可登录', async () => {
    const changeResponse = await request('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: 'profile-pass-1', newPassword: 'profile-pass-2' })
    });
    assert.equal(changeResponse.status, 200);
    assert.equal((await json(changeResponse)).success, true);

    const oldPasswordResponse = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'profileuser', password: 'profile-pass-1' })
    });
    assert.equal(oldPasswordResponse.status, 401);

    const newPasswordResponse = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'profileuser', password: 'profile-pass-2' })
    });
    assert.equal(newPasswordResponse.status, 200);
  });

  await t.test('当前用户接口返回角色且不泄露密码字段', async () => {
    const response = await request('/api/current-user', { headers: { Cookie: cookie } });
    const data = await json(response);

    assert.equal(data.loggedIn, true);
    assert.equal(data.user.role, 'user');
    assert.ok(!Object.hasOwn(data.user, 'password'));
    assert.ok(!Object.hasOwn(data.user, 'password_hash'));
  });
});
