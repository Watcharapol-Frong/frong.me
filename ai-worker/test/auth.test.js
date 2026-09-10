import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const URL = "https://ai-assistant-worker.example/generate";
const SECRET = "test-secret-value";
const VALID_BODY = {
  task: "auto-excerpt",
  provider: "cloudflare",
  title: "A title",
  description: "A description",
  bodyText: "Article body",
};

function request({ body = VALID_BODY, headers = {}, method = "POST" } = {}) {
  return new Request(URL, {
    method,
    headers: {
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function environment(overrides = {}) {
  let calls = 0;
  return {
    env: {
      AI_WORKER_SECRET: SECRET,
      AI: {
        async run() {
          calls += 1;
          return { response: "stubbed response" };
        },
      },
      ...overrides,
    },
    providerCalls: () => calls,
  };
}

test("fails closed when AI_WORKER_SECRET is missing", async () => {
  const fixture = environment({ AI_WORKER_SECRET: undefined });
  const response = await worker.fetch(request(), fixture.env);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Service unavailable" });
  assert.equal(fixture.providerCalls(), 0);
});

test("rejects a missing authentication header before provider invocation", async () => {
  const fixture = environment();
  const response = await worker.fetch(request(), fixture.env);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(fixture.providerCalls(), 0);
});

test("rejects an incorrect authentication header before provider invocation", async () => {
  const fixture = environment();
  const response = await worker.fetch(request({
    headers: { "X-Auth-Secret": "incorrect" },
  }), fixture.env);

  assert.equal(response.status, 401);
  assert.equal(fixture.providerCalls(), 0);
});

test("rejects browser requests from origins other than frong.me", async () => {
  const fixture = environment();
  const response = await worker.fetch(request({
    headers: {
      Origin: "https://example.com",
      "X-Auth-Secret": SECRET,
    },
  }), fixture.env);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(fixture.providerCalls(), 0);
});

test("allows preflight only from frong.me without allowing the secret header", async () => {
  const allowed = await worker.fetch(request({
    method: "OPTIONS",
    headers: { Origin: "https://frong.me" },
  }), {});
  const denied = await worker.fetch(request({
    method: "OPTIONS",
    headers: { Origin: "https://example.com" },
  }), {});

  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://frong.me");
  assert.equal(allowed.headers.get("Access-Control-Allow-Headers"), "Content-Type");
  assert.equal(denied.status, 403);
});

test("accepts authenticated server-to-server requests using a provider stub", async () => {
  const fixture = environment();
  const response = await worker.fetch(request({
    headers: { "X-Auth-Secret": SECRET },
  }), fixture.env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { result: "stubbed response" });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(fixture.providerCalls(), 1);
});

test("returns strict CORS headers to an authenticated frong.me request", async () => {
  const fixture = environment();
  const response = await worker.fetch(request({
    headers: {
      Origin: "https://frong.me",
      "X-Auth-Secret": SECRET,
    },
  }), fixture.env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://frong.me");
  assert.equal(fixture.providerCalls(), 1);
});

test("rejects unknown tasks and oversized bodies before provider invocation", async () => {
  const invalidFixture = environment();
  const invalid = await worker.fetch(request({
    body: { ...VALID_BODY, task: "not-a-task" },
    headers: { "X-Auth-Secret": SECRET },
  }), invalidFixture.env);
  assert.equal(invalid.status, 400);
  assert.equal(invalidFixture.providerCalls(), 0);

  const oversizedFixture = environment();
  const oversized = await worker.fetch(request({
    body: { ...VALID_BODY, bodyText: "a".repeat(17 * 1024) },
    headers: { "X-Auth-Secret": SECRET },
  }), oversizedFixture.env);
  assert.equal(oversized.status, 413);
  assert.equal(oversizedFixture.providerCalls(), 0);
});
