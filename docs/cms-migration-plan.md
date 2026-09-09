# แผนพัฒนา: Self-hosted CMS บน Cloudflare (โครงการ "Earth")

> เอกสารสำหรับให้ Developer ตรวจสอบก่อนเริ่ม implement
> อัปเดตล่าสุด: 2026-09-09 · Repo: `watcharapol-frong/portfolio` · Site: https://frong.me

---

## 1. เป้าหมาย

แทนที่ Sanity CMS ด้วยระบบ CMS ที่เขียนเอง โดยเก็บข้อมูลและรันทุกอย่างบน Cloudflare infrastructure

| หัวข้อ | รายละเอียด |
|---|---|
| **หน้า public** | คงดีไซน์/UX เดิมทั้งหมด 100% และยังเป็น static site เหมือนเดิม |
| **หน้าจัดการ (`/earth`)** | Portal แสดงสถิติ + Editor เขียนบทความ (ใช้คนเดียว) |
| **ที่เก็บข้อมูล** | Cloudflare D1 (ข้อมูล) + R2 (รูปภาพ) |
| **การยืนยันตัวตน** | Cloudflare Access (ไม่เขียนโค้ด auth เอง) |
| **AI Assistant** | BYOK — ผู้ใช้เพิ่ม provider/API key/model ได้เองจากหน้าเว็บ |
| **การอัปเดตหน้า public** | Static + rebuild-on-publish ผ่าน Deploy Hook |

**ไม่อยู่ในขอบเขต:** ย้ายบทความเก่าจาก Sanity (ถือเป็น demo ทิ้งได้), ระบบ multi-user, ระบบ comment

---

## 2. สถานะปัจจุบัน (As-is)

**Stack:** Astro 7.2.2 · React 19 · Tailwind CSS 4 · Node ≥22.12.0
**Output:** `static` (ค่า default — ไม่มี adapter, ไม่มี SSR)
**CMS:** Sanity (`@sanity/astro` ^3.5.1) — Studio ฝังที่ `/admin`
**เนื้อหา:** Portable Text ดึงมาตอน build ผ่าน `getStaticPaths()`

### โครงสร้าง `src/`

```
src/
├── components/
│   ├── portabletext/          ← ผูกกับ Sanity (ต้องรื้อ)
│   │   ├── ArticleBody.astro
│   │   ├── PortableTextHeading.astro
│   │   └── PortableTextImage.astro
│   ├── AboutIsland.tsx  AnnouncementBanner.tsx  FloatingNav.tsx
│   ├── HomeIsland.tsx   Navbar.tsx  ScrollRevealText.tsx
│   ├── ShareButton.tsx  TableOfContents.astro
│   └── ui/popover.tsx
├── layouts/Layout.astro
├── lib/
│   ├── sanityImage.ts         ← ผูกกับ Sanity (ต้องรื้อ)
│   ├── slugify.ts             ← extractHeadings() อ่าน Portable Text
│   └── utils.ts
├── pages/
│   ├── index.astro            ← query Sanity
│   ├── about.astro
│   ├── articles/[slug].astro  ← query Sanity
│   └── 404.astro
└── styles/global.css
```

### ของที่มีอยู่แล้วและใช้ต่อได้

**`ai-worker/`** — Cloudflare Worker ชื่อ `ai-assistant-worker` (deploy แล้ว)

```jsonc
// ai-worker/wrangler.jsonc
{ "name": "ai-assistant-worker", "main": "src/index.js",
  "compatibility_date": "2026-08-01", "ai": { "binding": "AI" } }
```

รองรับ 3 providers และ 4 tasks:

| Provider | Default model | วิธีเรียก |
|---|---|---|
| `cloudflare` | `@cf/meta/llama-3.1-8b-instruct-fp8` | AI binding (ฟรี) |
| `gemini` | `gemini-3.5-flash-lite` | REST + `GEMINI_API_KEY` |
| `openrouter` | `openai/gpt-4o-mini` | REST + `OPENROUTER_API_KEY` |

Tasks: `title-suggestions` · `auto-excerpt` · `generate-outline` · `seo-optimizer`

**`sanity/components/AIAssistantView.tsx`** — UI React ที่เรียก worker พร้อม dropdown เลือก provider/model (ต้องย้ายออกจาก Sanity มาไว้ในหน้า editor ใหม่)

---

## 3. สถาปัตยกรรมเป้าหมาย (To-be)

```
                    ┌─────────────────────────────┐
   ผู้เข้าชมทั่วไป ──→ │  Static HTML (Cloudflare CDN) │
                    │  /  /about  /articles/[slug] │
                    └─────────────────────────────┘
                                  ↑ build time
                                  │ (D1 HTTP API)
   ─────────────────────────────────────────────────────────
                                  │
   เจ้าของเว็บ ──→ [Cloudflare Access] ──→ /earth/*  (prerender = false)
                                            ├── /earth            Portal
                                            ├── /earth/editor     Editor
                                            ├── /earth/settings   Settings
                                            └── /earth/api/*      REST API
                                                   │
                                    ┌──────────────┼──────────────┐
                                    ↓              ↓              ↓
                                 [D1]           [R2]      [ai-assistant-worker]
                              posts, drafts,   รูปภาพ      → Cloudflare AI / Gemini
                              providers, models             → OpenRouter / อื่นๆ
                                    │
                          กด Publish → ยิง Deploy Hook
                                    ↓
                          Cloudflare Pages rebuild (~30-60 วิ)
```

### Output mode — สำคัญ

> ตรวจสอบกับเอกสาร Astro แล้ว: **`output: 'hybrid'` ถูกยกเลิกไปแล้ว** ใน Astro รุ่นปัจจุบัน

**คงค่า `output: 'static'` (ค่า default) ไว้ตามเดิม** แล้วเพิ่ม adapter `@astrojs/cloudflare` จากนั้น opt-in เฉพาะหน้าที่ต้องการ dynamic:

```js
// เฉพาะไฟล์ใน src/pages/earth/** เท่านั้น
export const prerender = false;
```

**ผลลัพธ์:** ไฟล์หน้า public เดิม (`index.astro`, `about.astro`, `articles/[slug].astro`, `404.astro`) **ไม่ต้องแก้ config การ render เลยแม้แต่บรรทัดเดียว** ยังคง build เป็น static เหมือนเดิม

เอกสารอ้างอิง: https://docs.astro.build/en/guides/on-demand-rendering/

---

## 4. ข้อจำกัดทางเทคนิคที่ต้องรู้ก่อนเริ่ม

### 4.1 D1 binding ใช้ไม่ได้ตอน build

Cloudflare Pages build container **ไม่มี D1 binding** — binding มีเฉพาะตอน runtime (Functions) เท่านั้น
แต่ `getStaticPaths()` ของหน้าบทความต้องอ่านข้อมูลตอน build

**ทางแก้:** แยกวิธีเข้าถึง D1 เป็น 2 แบบตามบริบท

| บริบท | วิธีเข้าถึง D1 |
|---|---|
| Build time (`getStaticPaths`) | D1 **HTTP API** + API Token<br>`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query` |
| Runtime (`/earth/*`) | **Binding** — `Astro.locals.runtime.env.DB` (เร็วกว่า ไม่ต้องใช้ token) |

แนะนำให้เขียน `src/lib/db.ts` ที่ห่อทั้งสองวิธีไว้ใน interface เดียว เพื่อไม่ให้โค้ดหน้าเว็บต้องรู้ว่าตอนนั้นอยู่บริบทไหน

### 4.2 Portable Text → Markdown

เนื้อหาเดิมเป็น Portable Text (โครงสร้าง JSON ของ Sanity) ระบบใหม่ใช้ Markdown
Render ตอน **build time** ด้วย `marked` → ได้ HTML static ไม่ต้องโหลด JS เพิ่มฝั่ง client (หน้า public ยังเร็วเท่าเดิม)

---

## 5. ประเด็นความปลอดภัย

### 5.1 🔴 AI Worker เปิดให้ทุกคนเรียกได้ (ต้องแก้)

`ai-worker/src/index.js:1-5`

```js
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",   // ← ใครก็เรียกได้
  ...
};
```

Worker ไม่มีการตรวจสอบสิทธิ์ใดๆ — ใครก็ตามที่รู้ URL `ai-assistant-worker.frongbook.workers.dev/generate` สามารถยิง request ไม่จำกัดจนเผา credit ของ Gemini/OpenRouter ได้

**ทางแก้:**
1. Browser **ไม่เรียก worker ตรงๆ อีกต่อไป** → เรียกผ่าน `/earth/api/ai/*` ซึ่งอยู่หลัง Cloudflare Access
2. Pages Function เรียก worker ต่อพร้อม header `X-Auth-Secret: {AI_WORKER_SECRET}`
3. Worker ปฏิเสธ request ที่ไม่มี secret ตรงกัน
4. จำกัด CORS เหลือเฉพาะ `https://frong.me`

### 5.2 🔴 การเก็บ API Key ของ BYOK

เมื่อย้าย key จาก Worker secret มาเก็บใน D1 (เพื่อให้แก้จากหน้าเว็บได้) ต้องทำ 3 ข้อนี้ **ห้ามข้าม**

1. **เข้ารหัสก่อนเก็บ** — ใช้ Web Crypto AES-GCM โดย master key เก็บเป็น Worker/Pages secret (`ENCRYPTION_KEY`) → D1 เก็บเฉพาะ ciphertext ถ้าฐานข้อมูลรั่ว key ยังใช้งานไม่ได้
2. **ห้ามส่ง key กลับมาที่ browser เด็ดขาด** — หน้า Settings แสดงแบบ mask เท่านั้น (`AIza••••••4f2c`) เป็น write-only field
3. **ถอดรหัสเฉพาะฝั่ง server ตอนจะยิง request** เท่านั้น

> Cloudflare Access เป็นด่านแรกอยู่แล้ว แต่ 3 ข้อบนยังจำเป็นในฐานะ defense-in-depth

### 5.3 การ validate ทั่วไป

- Upload รูป: ตรวจ MIME type + ขนาดไฟล์ **ฝั่ง server** ด้วยเสมอ (ห้ามเชื่อการเช็คฝั่ง client เพียงอย่างเดียว)
- Markdown ที่ผู้ใช้เขียน: sanitize ด้วย DOMPurify ก่อน render ทั้งใน preview และตอน build
- `base_url` ของ custom provider: validate ว่าเป็น HTTPS และไม่ใช่ internal address (กัน SSRF)

---

## 6. การถอด Sanity ออก

มี 5 ไฟล์ที่อ้างถึง Sanity โดยตรง แต่ผลกระทบจริงกว้างกว่านั้นเพราะต้องเปลี่ยนวิธี render เนื้อหา

| ไฟล์ / ส่วน | สิ่งที่ต้องทำ |
|---|---|
| `src/lib/sanityImage.ts` | ลบ → เขียน helper สร้าง R2 URL แทน |
| `src/components/portabletext/ArticleBody.astro` | ลบ → เขียน `MarkdownBody.astro` ใหม่ **โดยใช้ CSS class และ typography เดิมทุกตัว** |
| `src/components/portabletext/PortableTextHeading.astro` | ลบ (ย้าย logic anchor id ไปไว้ใน markdown renderer) |
| `src/components/portabletext/PortableTextImage.astro` | ลบ |
| `src/lib/slugify.ts` → `extractHeadings()` | เปลี่ยนจากอ่าน Portable Text blocks เป็น parse heading จาก Markdown (TOC ต้องทำงานเหมือนเดิม) |
| `src/pages/index.astro` | เปลี่ยนแหล่งข้อมูล Sanity → D1 |
| `src/pages/articles/[slug].astro` | เปลี่ยนแหล่งข้อมูล + เปลี่ยน `ArticleBody` → `MarkdownBody` |
| `src/env.d.ts` | ถอด type ของ Sanity |
| `astro.config.mjs` | ถอด `sanity()` integration + `studioBasePath: '/admin'` เพิ่ม `cloudflare()` adapter |
| `package.json` | ถอด `@sanity/astro`, `@sanity/image-url`, `astro-portabletext` เพิ่ม `marked`, `dompurify` |
| `sanity/` (ทั้งโฟลเดอร์) | ลบ — ย้าย logic ของ `AIAssistantView.tsx` ไปหน้า editor ใหม่ก่อน |

### ⚠️ เกณฑ์ตรวจรับที่สำคัญที่สุดของงานส่วนนี้

หลังเปลี่ยนจาก Portable Text เป็น Markdown แล้ว หน้าบทความต้องมีหน้าตา **เหมือนเดิมทุกจุด**:
ฟอนต์ (sans/serif/google-sans) · ขนาดและระยะห่างหัวข้อ · Table of Contents · รูปปก · tags · related articles · sources · CTA

แนะนำให้ screenshot หน้าบทความปัจจุบันเก็บไว้ก่อนเริ่มแก้ เพื่อเทียบทีหลัง

---

## 7. Database Schema (D1)

```sql
-- ───────────────────────── บทความ ─────────────────────────
CREATE TABLE posts (
  id             TEXT PRIMARY KEY,
  slug           TEXT UNIQUE NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,                  -- Markdown
  excerpt        TEXT,
  cover_image    TEXT,                           -- R2 URL หรือ external URL
  cover_position TEXT,                           -- JSON {"x":50,"y":50,"zoom":1.0}
  tags           TEXT,                           -- JSON array
  font           TEXT DEFAULT 'sans',            -- sans | serif | google-sans
  status         TEXT NOT NULL DEFAULT 'draft',  -- draft | published
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  published_at   INTEGER
);
CREATE INDEX idx_posts_status ON posts(status, published_at DESC);
CREATE INDEX idx_posts_slug   ON posts(slug);

-- ───────────────────────── รูปภาพ ─────────────────────────
CREATE TABLE images (
  id         TEXT PRIMARY KEY,
  post_id    TEXT,
  r2_key     TEXT NOT NULL,
  size       INTEGER,
  created_at INTEGER NOT NULL
);

-- ─────────────────── BYOK: AI Providers ───────────────────
CREATE TABLE ai_providers (
  id                TEXT PRIMARY KEY,      -- gemini, openrouter, groq, my-ollama
  label             TEXT NOT NULL,         -- ชื่อที่แสดงใน UI
  kind              TEXT NOT NULL,         -- openai-compatible | gemini | anthropic | cloudflare
  base_url          TEXT,                  -- เช่น https://api.groq.com/openai/v1
  api_key_encrypted TEXT,                  -- AES-GCM ciphertext (NULL สำหรับ cloudflare)
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- ──────────────── BYOK: Models ที่เลือกไว้ ────────────────
CREATE TABLE ai_models (
  id          TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model_id    TEXT NOT NULL,               -- เช่น gemini-3.6-flash
  label       TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_models_unique ON ai_models(provider_id, model_id);
```

**หมายเหตุ:** ตาราง `ai_models` เก็บเฉพาะ model ที่ผู้ใช้ **เลือกไว้ใช้งาน** เท่านั้น ไม่ใช่ catalog ทั้งหมดของ provider

---

## 8. Route Map

| Route | Render | Access | หน้าที่ |
|---|---|---|---|
| `/` | static | public | หน้าแรก + รายการบทความ |
| `/about` | static | public | เกี่ยวกับ |
| `/articles/[slug]` | static | public | หน้าบทความ |
| `/404` | static | public | Not found |
| `/earth` | `prerender=false` | 🔒 Access | Portal — สถิติ, drafts, published, streak |
| `/earth/editor` | `prerender=false` | 🔒 Access | Editor เขียน/แก้บทความ |
| `/earth/settings` | `prerender=false` | 🔒 Access | ตั้งค่า (หลายแท็บ) |
| `POST /earth/api/draft` | endpoint | 🔒 Access | บันทึกฉบับร่าง |
| `POST /earth/api/publish` | endpoint | 🔒 Access | เผยแพร่ + ยิง Deploy Hook |
| `POST /earth/api/update` | endpoint | 🔒 Access | แก้บทความที่เผยแพร่แล้ว |
| `DELETE /earth/api/post/[id]` | endpoint | 🔒 Access | ลบ |
| `POST /earth/api/upload-image` | endpoint | 🔒 Access | อัปโหลดรูปไป R2 |
| `GET /earth/api/posts` | endpoint | 🔒 Access | รายการบทความ (ใช้กับ slash command) |
| `GET/POST/DELETE /earth/api/providers` | endpoint | 🔒 Access | จัดการ AI providers |
| `POST /earth/api/providers/[id]/models` | endpoint | 🔒 Access | ดึงรายชื่อ model จาก provider + บันทึกที่เลือก |
| `POST /earth/api/ai/[task]` | endpoint | 🔒 Access | Proxy ไป ai-assistant-worker |
| `GET /earth/api/export` | endpoint | 🔒 Access | Export JSON / Markdown |

> `/earth*` ถูกป้องกันโดย Cloudflare Access ที่ระดับ edge — request ที่ไม่ผ่าน auth จะไม่มีทางไปถึง application code เลย

---

## 9. หน้า Settings (`/earth/settings`)

### โครงสร้างแท็บ

| แท็บ | เนื้อหา |
|---|---|
| **Profile** | Email (อ่านจาก Cloudflare Access identity), วันที่เริ่มใช้งาน, สรุปสถิติ |
| **AI Models** | จัดการ provider + API key + model (BYOK) |
| **Site** *(อนาคต)* | ชื่อเว็บ, tagline, social links, ฟอนต์ default |

> Email ไม่ต้องเก็บใน D1 — ดึงจาก Cloudflare Access ได้โดยตรงผ่าน header `Cf-Access-Jwt-Assertion` หรือ endpoint `/cdn-cgi/access/get-identity`

### แท็บ AI Models — หน้าตา

```
┌──────────────────────────────────────────────────┐
│  Profile  │ ▸AI Models◂ │  Site                  │
├──────────────────────────────────────────────────┤
│                                                  │
│  ✓ Cloudflare Workers AI        ฟรี         ⚙   │
│      └ llama-3.1-8b-instruct-fp8  (default)      │
│                                                  │
│  ✓ Gemini              AIza••••••4f2c       ⚙   │
│      └ gemini-3.6-flash                          │
│      └ gemini-3.1-pro-preview                    │
│                                                  │
│  ✓ OpenRouter          sk-or••••••9a1b      ⚙   │
│      └ openai/gpt-4o-mini                        │
│                                                  │
│  ○ Groq                (ปิดใช้งาน)          ⚙   │
│                                                  │
│              [ + เพิ่ม Provider ]                 │
└──────────────────────────────────────────────────┘
```

### ขั้นตอนการเพิ่ม Provider

```
[+ เพิ่ม Provider]
        ↓
┌────────────────────────────────────────┐
│  ชื่อที่แสดง   [ Groq              ]   │
│  ประเภท       [ OpenAI-compatible ▾]   │
│  Base URL     [ https://api.groq... ]  │
│  API Key      [ ••••••••••••••••   ]   │
│                                        │
│         [ โหลดรายชื่อ Model ]           │  ← ตรวจสอบ key + ดึง catalog พร้อมกัน
└────────────────────────────────────────┘
        ↓ (ดึงสำเร็จ)
┌────────────────────────────────────────┐
│  เลือก model ที่ต้องการใช้:              │
│    ☑ llama-3.3-70b-versatile           │
│    ☑ llama-3.1-8b-instant              │
│    ☐ mixtral-8x7b-32768                │
│    ☐ gemma2-9b-it                      │
│         ... (อีก 20 รายการ)             │
│                                        │
│    หรือพิมพ์ model id เอง: [        ]   │
│                                        │
│              [ บันทึก ]                 │
└────────────────────────────────────────┘
```

**จุดสำคัญ:** ปุ่ม "โหลดรายชื่อ Model" ทำ 2 หน้าที่ในคลิกเดียว — ยืนยันว่า API key ใช้ได้จริง และดึง catalog ล่าสุดจาก provider มาให้เลือก (ไม่ต้อง hardcode รายชื่อ model ในโค้ด และไม่ตกรุ่น)

### Endpoint สำหรับดึงรายชื่อ model แต่ละประเภท

| `kind` | Endpoint | หมายเหตุ |
|---|---|---|
| `openai-compatible` | `GET {base_url}/models` + `Authorization: Bearer` | มาตรฐาน OpenAI |
| `gemini` | `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` | |
| `openrouter` | `GET https://openrouter.ai/api/v1/models` | เรียกได้โดยไม่ต้องใช้ key |
| `cloudflare` | Cloudflare REST API (`/accounts/{id}/ai/models/search`) | หรือ hardcode ก็ได้เพราะเปลี่ยนไม่บ่อย |

> ⚠️ Endpoint เหล่านี้ควรยืนยันอีกครั้งกับเอกสารของแต่ละเจ้าตอน implement เพราะอาจมีการเปลี่ยนแปลง

### การใช้งานจริงในหน้า Editor

```
AI Assistant (panel ขวา)
┌─────────────────────────────┐
│ Provider  [ Gemini       ▾] │  ← แสดงเฉพาะ provider ที่ตั้งค่าไว้แล้ว
│ Model     [ gemini-3.6-f ▾] │  ← แสดงเฉพาะ model ที่เลือกไว้ของ provider นั้น
├─────────────────────────────┤
│ ✨ Title Suggestions        │
│ 📝 Auto Excerpt             │
│ 📋 Generate Outline         │
│ 📊 SEO Optimizer            │
└─────────────────────────────┘
```

### สิ่งที่ต้อง refactor ใน `ai-worker/`

เปลี่ยนจาก hardcode dispatcher:

```js
// ปัจจุบัน — ai-worker/src/index.js:84-92
if (provider === "cloudflare")      { ... }
else if (provider === "gemini")     { ... }
else if (provider === "openrouter") { ... }
```

เป็น **adapter registry** ที่ dispatch ตาม `kind` และรับ `base_url` + `api_key` เข้ามาจาก caller:

```js
const ADAPTERS = {
  "openai-compatible": runOpenAICompatible,  // ครอบคลุม OpenRouter, Groq, Together,
                                             // DeepSeek, Mistral, Ollama, LM Studio ฯลฯ
  "gemini":            runGemini,
  "anthropic":         runAnthropic,
  "cloudflare":        runCloudflare,        // ใช้ AI binding ไม่ต้องใช้ key
};
```

**เหตุผลที่ออกแบบแบบนี้:** provider ส่วนใหญ่ในตลาดพูด OpenAI-compatible API เหมือนกันหมด ต่างแค่ `base_url` กับ key — ดังนั้นการเพิ่ม provider ใหม่ในอนาคตทำได้จากหน้าเว็บโดย**ไม่ต้องแก้โค้ดและไม่ต้อง deploy**

---

## 10. แผนการทำงานแบ่งตาม Phase

### Phase 0 — เตรียม Infrastructure *(ทำใน Cloudflare Dashboard)*

| # | งาน | ผลลัพธ์ที่ต้องได้ |
|---|---|---|
| 1 | สร้าง D1 database `portfolio-db` | `database_id` |
| 2 | สร้าง R2 bucket `portfolio-images` + ตั้ง public domain | Public URL |
| 3 | ตั้ง Cloudflare Access: Zero Trust → Access → Applications → Self-hosted<br>Domain `frong.me` path `/earth*` · Policy: allow เฉพาะ email เจ้าของ | หน้า `/earth` ต้อง login ก่อนเข้า |
| 4 | สร้าง Deploy Hook (Pages → Settings → Builds) | Hook URL |
| 5 | สร้าง API Token สิทธิ์ `D1:Edit` | Token สำหรับ build-time query |
| 6 | สร้าง secret `AI_WORKER_SECRET` และ `ENCRYPTION_KEY` | ตั้งทั้งใน Pages env และ ai-worker |

**Environment variables ที่ต้องตั้งใน Pages:**

```
CF_ACCOUNT_ID          # สำหรับ D1 HTTP API ตอน build
CF_D1_DATABASE_ID
CF_API_TOKEN           # สิทธิ์ D1:Edit
DEPLOY_HOOK_URL        # ยิงตอน publish
AI_WORKER_URL
AI_WORKER_SECRET       # shared secret กับ worker
ENCRYPTION_KEY         # master key สำหรับเข้ารหัส API key ใน D1
```

---

### Phase 1 — วางฐาน + พิสูจน์ pipeline ⭐ *(สำคัญที่สุด)*

1. ติดตั้ง `@astrojs/cloudflare` adapter (คง `output: 'static'`)
2. สร้าง D1 schema + seed บทความ demo 2 ชิ้น
3. เขียน `src/lib/db.ts` (ห่อ HTTP API + binding ไว้ใน interface เดียว)
4. เขียน `MarkdownBody.astro` แทน Portable Text — **ใช้ CSS/typography เดิมทั้งหมด**
5. แก้ `extractHeadings()` ให้ parse heading จาก Markdown
6. เปลี่ยน `index.astro` และ `articles/[slug].astro` ให้ดึงจาก D1
7. ถอด Sanity ออกจาก config และ dependencies

**เกณฑ์ตรวจรับ:**
- [ ] `npm run build` ผ่าน ไม่มี error
- [ ] หน้าบทความ demo แสดงผล**เหมือนเดิมทุกจุด** (เทียบกับ screenshot ก่อนแก้)
- [ ] TOC, รูปปก, tags, related articles, sources, CTA ทำงานครบ
- [ ] ไม่มี dependency ของ Sanity หลงเหลือใน `package.json`

---

### Phase 2 — Portal (`/earth`)

Dashboard 3 คอลัมน์: Identity+สถิติ / Drafts / Published + streak calendar 60 วัน
อ่าน D1 ผ่าน binding ตอน runtime

**เกณฑ์ตรวจรับ:** เข้า `/earth` ต้องผ่าน Cloudflare Access ก่อน · ตัวเลขสถิติตรงกับข้อมูลใน D1 · เข้าโดยไม่ login แล้วต้องถูกปฏิเสธที่ edge

---

### Phase 3 — Editor + Publish flow

- Markdown textarea + preview + word/char count + title/excerpt length limit
- Auto-save 3 ชั้น: localStorage (1 วิ) → server (30 วิ) → `sendBeacon` ตอนปิดหน้า
- Draft → Publish → Unpublish
- **Publish สำเร็จ → ยิง Deploy Hook → rebuild → บทความขึ้นหน้า public**

**เกณฑ์ตรวจรับ:** เขียนบทความใหม่ → publish → ภายใน ~60 วินาที บทความปรากฏบนหน้า public ด้วยดีไซน์เดิม · ปิดเบราว์เซอร์กลางคันแล้วเปิดใหม่ ข้อมูลไม่หาย

---

### Phase 4 — อัปโหลดรูปไป R2

`POST /earth/api/upload-image` → validate (JPEG/PNG/WebP, ≤500KB) **ฝั่ง server** → เก็บ R2 → คืน URL → แทรก Markdown
รองรับ drag & drop + ปรับตำแหน่ง/zoom รูปปก

---

### Phase 5 — BYOK + AI Assistant

1. สร้างหน้า `/earth/settings` พร้อมระบบแท็บ
2. แท็บ Profile — ดึง email จาก Cloudflare Access
3. แท็บ AI Models — CRUD provider + เข้ารหัส key + โหลดรายชื่อ model + เลือกหลาย model
4. Refactor `ai-worker/` เป็น adapter registry
5. **ปิดช่องโหว่ security ตามข้อ 5.1** (secret + จำกัด CORS)
6. ย้าย AI panel จาก `AIAssistantView.tsx` มาไว้ในหน้า editor

**เกณฑ์ตรวจรับ:** เพิ่ม provider ใหม่ที่เป็น OpenAI-compatible ได้จากหน้าเว็บโดยไม่ต้องแก้โค้ด · เรียก worker ตรงๆ จากภายนอกโดยไม่มี secret ต้องถูกปฏิเสธ · API key ที่เก็บใน D1 ต้องเป็น ciphertext

---

### Phase 6 — ของเสริม *(ทำทีหลังได้)*

Slash command แทรกลิงก์ภายใน · Emoji picker · YouTube embed · Zen mode · Keyboard shortcuts · Export JSON/Markdown · JSON-LD schema generator

---

## 11. ประเด็นที่ยังต้องตัดสินใจ

| # | ประเด็น | สถานะ |
|---|---|---|
| 1 | โครงสร้าง URL บทความ — คง `/articles/[slug]` เดิมไว้หรือเปลี่ยน | **ยังไม่ตัดสินใจ** (ค่า default: คงเดิม) |
| 2 | จำกัดจำนวน draft/published หรือไม่ (ตัวอย่างอ้างอิงจำกัด 3/50) | **ยังไม่ตัดสินใจ** (ค่า default: ไม่จำกัด เพราะใช้คนเดียว) |
| 3 | Editor รองรับมือถือหรือ desktop-only | **ยังไม่ตัดสินใจ** (ตัวอย่างอ้างอิงเป็น desktop-only ที่ ≤900px) |
| 4 | เก็บสถิติยอดวิวหรือไม่ (ต้องต่อ Cloudflare Web Analytics API) | **ยังไม่ตัดสินใจ** |
| 5 | ต้องมีระบบ backup/export อัตโนมัติหรือไม่ | **ยังไม่ตัดสินใจ** |

---

## 12. ความเสี่ยงที่ประเมินไว้

| ความเสี่ยง | ผลกระทบ | การรับมือ |
|---|---|---|
| หน้าบทความหน้าตาเพี้ยนหลังเปลี่ยนเป็น Markdown | สูง | Screenshot เทียบก่อน/หลัง · ทำ Phase 1 ให้จบสมบูรณ์ก่อนไปต่อ |
| Deploy Hook ยิงถี่เกินจนชน build limit ของ Cloudflare Pages | กลาง | Debounce การยิง hook · ตรวจสอบ quota ของ plan ที่ใช้อยู่ |
| D1 HTTP API ช้าตอน build เมื่อบทความเยอะขึ้น | ต่ำ | Query เฉพาะ field ที่จำเป็นใน `getStaticPaths` |
| API key รั่วจาก D1 | สูง | เข้ารหัส AES-GCM + ไม่ส่ง key กลับ browser (ข้อ 5.2) |
| Cloudflare Access ล่ม = เข้า `/earth` ไม่ได้ | ต่ำ | ยอมรับได้ — หน้า public ยังทำงานปกติเพราะเป็น static |

---

## 13. สรุปสำหรับผู้ตรวจ

**สิ่งที่อยากให้ช่วยตรวจเป็นพิเศษ:**

1. วิธีแก้ปัญหา D1 build-time (ข้อ 4.1) — มีวิธีที่ดีกว่านี้หรือไม่
2. การออกแบบเข้ารหัส API key (ข้อ 5.2) — เพียงพอหรือยัง
3. Adapter registry pattern (ข้อ 9) — ครอบคลุม provider ในตลาดจริงหรือไม่
4. การแบ่ง Phase — ลำดับเหมาะสมหรือควรสลับ
5. ประเด็นที่ยังไม่ตัดสินใจ (ข้อ 11) — มีข้อเสนอแนะหรือไม่
