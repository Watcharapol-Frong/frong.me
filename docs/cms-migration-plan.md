# frong.me — แผนพัฒนาระบบเว็บไซต์ (ฉบับที่ 2)

> เอกสารข้อกำหนดและแผนการพัฒนา · อัปเดต 2026-09-09
> Repo: `Watcharapol-Frong/portfolio` · Site: https://frong.me
> **ผู้พัฒนา: เจ้าของเว็บเอง โดยมี AI ช่วย · เวลาที่มี 5-10 ชม./สัปดาห์**

> **ฉบับที่ 2 เขียนใหม่ทั้งหมด** หลังการสัมภาษณ์เก็บความต้องการ ฉบับแรกตั้งสมมติฐานผิดหลายจุด
> (ไม่รู้เรื่องโปรเจกต์ interactive viz, การทำสองภาษา, newsletter และข้อจำกัดด้านเวลา)

---

## สารบัญ

1. [สรุปความเข้าใจร่วมกัน](#1-สรุปความเข้าใจร่วมกัน)
2. [เป้าหมายทางธุรกิจและกลยุทธ์เนื้อหา](#2-เป้าหมายทางธุรกิจและกลยุทธ์เนื้อหา)
3. [ขอบเขต — สิ่งที่ทำและไม่ทำ](#3-ขอบเขต--สิ่งที่ทำและไม่ทำ)
4. [ข้อจำกัดด้านเวลาและผลต่อการวางแผน](#4-ข้อจำกัดด้านเวลาและผลต่อการวางแผน)
5. [สถานะปัจจุบัน](#5-สถานะปัจจุบัน)
6. [สถาปัตยกรรมเป้าหมาย](#6-สถาปัตยกรรมเป้าหมาย)
7. [ข้อจำกัดทางเทคนิคที่ต้องรู้ก่อนเริ่ม](#7-ข้อจำกัดทางเทคนิคที่ต้องรู้ก่อนเริ่ม)
8. [ประเด็นความปลอดภัย](#8-ประเด็นความปลอดภัย)
9. [Database Schema](#9-database-schema)
10. [Route Map](#10-route-map)
11. [SEO](#11-seo)
12. [แผนการพัฒนาแบ่งตาม Phase](#12-แผนการพัฒนาแบ่งตาม-phase)
13. [ประเด็นที่ยังไม่ตัดสินใจ](#13-ประเด็นที่ยังไม่ตัดสินใจ)
14. [ความเสี่ยง](#14-ความเสี่ยง)

---

## 1. สรุปความเข้าใจร่วมกัน

*(ส่วนนี้มีไว้ให้ตรวจสอบว่าเข้าใจตรงกัน — ถ้าข้อไหนผิดให้แก้ก่อนเริ่มลงมือ)*

| # | หัวข้อ | ข้อสรุป |
|---|---|---|
| 1 | เป้าหมายหลัก | สร้าง personal brand และฐานผู้ติดตาม |
| 2 | ตัวตนที่ต้องการสื่อสาร | นักวิเคราะห์ข้อมูลที่เล่าเรื่องผ่าน interactive data visualization + เป็นนักพัฒนาและนักเขียน เข้าใจเทคโนโลยีและ AI |
| 3 | ประเภทเนื้อหา | **บทความ** (Markdown) และ **โปรเจกต์ data viz** (MDX + interactive component) — แยกกันคนละประเภท |
| 4 | ที่เก็บเนื้อหา | Cloudflare D1 ทั้งหมด **รวมถึงไฟล์ MDX ของโปรเจกต์** (ไม่เก็บใน GitHub) |
| 5 | ภาษา | สองภาษา — ไทยเป็นหลัก (`/articles/x`) อังกฤษเป็นรอง (`/en/articles/x`) |
| 6 | หน้าแรก | ฟีดรวมบทความ + โปรเจกต์ เรียงตามเวลา |
| 7 | ความถี่เผยแพร่ | บทความสัปดาห์ละ 1 · โปรเจกต์เดือนละ 1-2 |
| 8 | เสาหลักเนื้อหา (SEO) | 1) วิเคราะห์ข้อมูลเศรษฐกิจ/สังคมไทย 2) สอนเครื่องมือ/เทคนิค data 3) เส้นทางการเรียนรู้และเปลี่ยนสายงาน |
| 9 | ช่องทางติดตาม | Email newsletter + RSS |
| 10 | การยืนยันตัวตนหลังบ้าน | Cloudflare Access (ไม่เขียนโค้ด auth เอง) |
| 11 | AI Assistant | BYOK — เพิ่ม provider/API key/model ได้จากหน้าตั้งค่า |
| 12 | ผู้พัฒนา | เจ้าของเว็บเอง + AI ช่วย · 5-10 ชม./สัปดาห์ |
| 13 | ลำดับความสำคัญ | **MVP ให้เขียนและเผยแพร่ได้ก่อน** แล้วค่อยเติมทีละอย่างระหว่างทาง |

---

## 2. เป้าหมายทางธุรกิจและกลยุทธ์เนื้อหา

### 2.1 เป้าหมาย

สร้างการจดจำในฐานะ **"คนที่วิเคราะห์ข้อมูลเศรษฐกิจ/สังคมไทยแล้วเล่าออกมาให้เข้าใจง่ายผ่านภาพที่โต้ตอบได้"**

เว็บนี้ทำหน้าที่เป็นหลักฐานของความสามารถโดยตรง (ตัวเว็บและงานในเว็บคือ portfolio ไม่ต้องมีเรซูเม่แยก)

### 2.2 เสาหลักเนื้อหา 3 เสา

| ลำดับ | เสา | บทบาท | รูปแบบเนื้อหาที่เหมาะ |
|---|---|---|---|
| 1 | วิเคราะห์ข้อมูลเศรษฐกิจ/สังคมไทย | **จุดแข็งเฉพาะตัว** — พื้นฐานเศรษฐศาสตร์ + บริบทไทย + ทำ viz เองได้ | โปรเจกต์ interactive เป็นหลัก + บทความประกอบ |
| 2 | สอนเครื่องมือ/เทคนิค data | **ดึง traffic** — คนค้นหาเยอะ สม่ำเสมอ | บทความ how-to |
| 3 | เส้นทางการเรียนรู้/เปลี่ยนสายงาน | **สร้างความผูกพัน** — คนที่กำลังเปลี่ยนสายจะติดตาม | บทความบันทึกประสบการณ์ |

### 2.3 ตัวชี้วัดที่ควรติดตาม

เนื่องจากเป้าหมายคือผู้ติดตาม ไม่ใช่ยอดขาย ตัวชี้วัดที่มีความหมายคือ:

1. **จำนวนสมาชิก newsletter** — ตัวชี้วัดหลัก (เป็นผู้ติดตามที่เราเป็นเจ้าของ ไม่ขึ้นกับ algorithm ใคร)
2. จำนวนบทความที่เผยแพร่ต่อเดือน (วัดความสม่ำเสมอของตัวเอง)
3. ผู้เข้าชมจาก organic search (วัดผล SEO)
4. หน้าที่มีคนอ่านมากที่สุด (บอกว่าเสาไหนได้ผล)

> ใช้ Cloudflare Web Analytics ที่ติดตั้งอยู่แล้วได้เลย ไม่ต้องเพิ่มเครื่องมือใหม่

---

## 3. ขอบเขต — สิ่งที่ทำและไม่ทำ

### 3.1 อยู่ในขอบเขต

- ระบบ CMS ที่เขียนเองบน Cloudflare (D1 + R2 + Access + Pages)
- เนื้อหา 2 ประเภท: บทความ (Markdown) และโปรเจกต์ (MDX + interactive component)
- รองรับสองภาษา ไทย/อังกฤษ
- Email newsletter + RSS
- AI Assistant แบบ BYOK
- หน้า public คงดีไซน์และ UX เดิมทั้งหมด

### 3.2 **ไม่**อยู่ในขอบเขต (ตัดสินใจแล้ว — ไม่ต้องทำ)

| สิ่งที่ตัดออก | เหตุผล |
|---|---|
| ย้ายบทความเก่าจาก Sanity | เป็นเนื้อหา demo ทิ้งได้ |
| หน้ารวมโปรเจกต์แยก (`/work` index) | หน้าแรกทำหน้าที่นี้อยู่แล้ว (ฟีดรวม) |
| หน้า CV/Resume + ดาวน์โหลด PDF | หน้า About ทำหน้าที่นี้ — ตัวเว็บคือผลงาน |
| หน้าเผยแพร่ dataset แยก | ส่วน Sources ท้ายบทความลิงก์ไปแหล่งข้อมูลอยู่แล้ว |
| หน้า hub ของ 3 เสาหลัก (`/category/...`) | **ตัดสินใจตัดออก** — ยอมรับข้อแลกเปลี่ยนว่าจะเสียโอกาสให้ Google จัดกลุ่มหัวข้อ (topic cluster) ยังใช้การกรองด้วยแท็ก `/?tag=` แบบเดิม |
| ระบบคอมเมนต์ | เลื่อนไปอนาคต ดูข้อ 3.3 |
| ระบบ multi-user | ใช้คนเดียว |

### 3.3 เลื่อนไปอนาคต — ระบบคอมเมนต์

**ยังไม่ทำ** เพราะ:
- ช่วงที่ยังไม่มีผู้อ่าน ช่องคอมเมนต์ว่างเปล่าให้ผลลบมากกว่าบวก
- ไม่ช่วย SEO อย่างมีนัยสำคัญ
- เพิ่มภาระดูแล spam, ความรับผิดทางกฎหมายต่อเนื้อหาที่ผู้อื่นโพสต์ และช่องโหว่ XSS
- Newsletter ตอบเป้าหมาย "ผู้ติดตาม" ได้ตรงกว่ามาก

**เงื่อนไขที่ควรกลับมาพิจารณา:** เมื่อมีสมาชิก newsletter เกินหลักร้อย หรือเริ่มมีคนส่งอีเมล/ทักมาคุยเรื่องบทความอย่างสม่ำเสมอ

---

## 4. ข้อจำกัดด้านเวลาและผลต่อการวางแผน

### 4.1 ตัวเลขที่ต้องยอมรับ

| รายการ | ประมาณการ |
|---|---|
| เวลาที่มี | 5-10 ชม./สัปดาห์ (ใช้ 7 ชม. เป็นค่ากลาง) |
| งานเขียนเนื้อหาตามเป้า (บทความ 1/สัปดาห์ + โปรเจกต์ 1-2/เดือน) | ~10 ชม./สัปดาห์ |
| ระบบทั้งหมดตามแผน (Phase 1-7) | ~110-160 ชม. |

**ข้อสรุป: เวลาที่มีไม่พอทำทั้งสองอย่างพร้อมกัน** ต้องเลือกว่าช่วงไหนทำอะไร

### 4.2 หลักการวางแผนที่ใช้

> **ความเสี่ยงที่ใหญ่ที่สุดของโปรเจกต์นี้ไม่ใช่เรื่องเทคนิค แต่คือการใช้เวลา 5 เดือนสร้างระบบแล้วยังไม่ได้เผยแพร่อะไรเลย**
> ผู้ติดตามมาจากเนื้อหา ไม่ได้มาจาก CMS

ดังนั้นแผนนี้จัดลำดับตามหลัก:

1. **ไปให้ถึงจุดที่ "เขียนและเผยแพร่ได้" เร็วที่สุด** แล้วเริ่มเขียนทันที
2. หลังจากนั้นสลับโหมด — สัปดาห์ไหนเขียนเนื้อหา สัปดาห์ไหนพัฒนาระบบ ไม่ทำพร้อมกัน
3. ทุก Phase หลัง MVP ต้อง**ใช้งานได้จริงเมื่อจบ Phase** ไม่มี Phase ที่ทำครึ่งๆ กลางๆ แล้วต้องรอ Phase ถัดไป
4. ออกแบบ schema เผื่ออนาคตตั้งแต่แรก (เช่น ใส่คอลัมน์ `lang`, `type` ตั้งแต่ Phase 1 แม้ยังไม่ใช้) เพื่อไม่ต้อง migrate ข้อมูลทีหลัง

---

## 5. สถานะปัจจุบัน

**Stack:** Astro 7.2.2 · React 19 · Tailwind CSS 4 · Node ≥22.12.0
**Output:** `static` (ค่า default — ไม่มี adapter)
**CMS:** Sanity (`@sanity/astro` ^3.5.1) — Studio ที่ `/admin` · เนื้อหาเป็น Portable Text

### 5.1 โครงสร้าง `src/`

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

### 5.2 ของที่มีอยู่แล้วและใช้ต่อได้

**`ai-worker/`** — Cloudflare Worker ชื่อ `ai-assistant-worker` (deploy แล้ว)

```jsonc
{ "name": "ai-assistant-worker", "main": "src/index.js",
  "compatibility_date": "2026-08-01", "ai": { "binding": "AI" } }
```

| Provider | Default model | วิธีเรียก |
|---|---|---|
| `cloudflare` | `@cf/meta/llama-3.1-8b-instruct-fp8` | AI binding (ฟรี) |
| `gemini` | `gemini-3.5-flash-lite` | REST + `GEMINI_API_KEY` |
| `openrouter` | `openai/gpt-4o-mini` | REST + `OPENROUTER_API_KEY` |

Tasks ที่มี: `title-suggestions` · `auto-excerpt` · `generate-outline` · `seo-optimizer`

**`sanity/components/AIAssistantView.tsx`** — UI React เรียก worker พร้อม dropdown เลือก provider/model (ต้องย้ายออกมาก่อนลบ Sanity)

---

## 6. สถาปัตยกรรมเป้าหมาย

```
                     ┌──────────────────────────────────────┐
    ผู้เข้าชมทั่วไป ───→ │  Static HTML บน Cloudflare CDN        │
                     │  /                    ฟีดรวม          │
                     │  /articles/[slug]     บทความ (ไทย)     │
                     │  /en/articles/[slug]  บทความ (อังกฤษ)  │
                     │  /work/[slug]         โปรเจกต์ viz     │
                     │  /about  /404  /rss.xml               │
                     └──────────────────────────────────────┘
                            ↑ build time            ↓ client-side
                            │ (D1 HTTP API)         │
                            │                  POST /api/subscribe
                            │                  (public + Turnstile)
    ──────────────────────────────────────────────────────────────
                            │
    เจ้าของเว็บ ──→ [Cloudflare Access] ──→ /earth/*  (prerender = false)
                                             ├── /earth           Portal
                                             ├── /earth/editor    Editor
                                             ├── /earth/settings  ตั้งค่า
                                             └── /earth/api/*     REST API
                                                    │
                              ┌─────────────────────┼──────────────────┐
                              ↓                     ↓                  ↓
                           [D1]                  [R2]        [ai-assistant-worker]
                    posts (บทความ+โปรเจกต์)      รูปภาพ       → Cloudflare AI
                    subscribers                              → Gemini
                    ai_providers / ai_models                 → OpenRouter
                    images                                   → (เพิ่มได้อีก)
                              │
                    กด Publish → ยิง Deploy Hook
                              ↓
                    Cloudflare Pages rebuild (~30-60 วินาที)
```

### 6.1 Output mode

> ตรวจสอบกับเอกสาร Astro แล้ว: **`output: 'hybrid'` ถูกยกเลิกไปแล้ว**
> อ้างอิง: https://docs.astro.build/en/guides/on-demand-rendering/

**คงค่า `output: 'static'` (ค่า default) ไว้** แล้วเพิ่ม adapter `@astrojs/cloudflare` จากนั้น opt-in เฉพาะหน้าที่ต้อง dynamic:

```js
// เฉพาะไฟล์ใน src/pages/earth/** และ src/pages/api/** เท่านั้น
export const prerender = false;
```

**ผลลัพธ์:** หน้า public เดิมทุกหน้า**ไม่ต้องแก้ config การ render เลย** ยังคง build เป็น static เหมือนเดิม

### 6.2 เนื้อหา 2 ประเภท

| | บทความ (article) | โปรเจกต์ (project) |
|---|---|---|
| รูปแบบเนื้อหา | Markdown | **MDX** (Markdown + import component ได้) |
| Interactive viz | ไม่มี | **มี — คือหัวใจของประเภทนี้** |
| URL | `/articles/[slug]` | `/work/[slug]` |
| เขียนที่ไหน | Editor ใน `/earth` | Editor ใน `/earth` (โหมด MDX) |
| เก็บที่ไหน | D1 คอลัมน์ `body` | D1 คอลัมน์ `body` |
| Component กราฟ | — | อยู่ใน repo (`src/components/viz/`) — เป็นโค้ด ไม่ใช่เนื้อหา |
| ความถี่ | สัปดาห์ละ 1 | เดือนละ 1-2 |

**ทั้งสองประเภทอยู่ในตาราง `posts` ตารางเดียวกัน** แยกด้วยคอลัมน์ `type` เพื่อให้หน้าแรกดึงมาแสดงรวมกันได้ด้วย query เดียว

---

## 7. ข้อจำกัดทางเทคนิคที่ต้องรู้ก่อนเริ่ม

### 7.1 D1 binding ใช้ไม่ได้ตอน build

Cloudflare Pages build container **ไม่มี D1 binding** — binding มีเฉพาะตอน runtime เท่านั้น
แต่ `getStaticPaths()` ต้องอ่านข้อมูลตอน build

**ทางแก้:** แยกวิธีเข้าถึงตามบริบท

| บริบท | วิธีเข้าถึง D1 |
|---|---|
| Build time (`getStaticPaths`, prebuild script) | **HTTP API** + API Token<br>`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query` |
| Runtime (`/earth/*`, `/api/*`) | **Binding** — `Astro.locals.runtime.env.DB` |

เขียน `src/lib/db.ts` ห่อทั้งสองวิธีไว้ใน interface เดียว โค้ดหน้าเว็บจะได้ไม่ต้องรู้ว่าอยู่บริบทไหน

### 7.2 MDX ที่เก็บใน D1 — จุดที่ต้องระวังที่สุด

Astro คอมไพล์ MDX ตอน build จากไฟล์ในดิสก์ แต่เนื้อหาเราอยู่ใน D1

**ขั้นตอนที่ต้องทำ (prebuild script):**

```
1. อ่านโปรเจกต์ที่ status='published' จาก D1 ผ่าน HTTP API
2. เขียนแต่ละชิ้นลง src/content/projects/{lang}/{slug}.mdx   ← ใส่ .gitignore
3. astro build ทำงานตามปกติ (Content Collections เจอไฟล์เอง)
```

> ⚠️ **ความเสี่ยงร้ายแรง:** MDX ที่ผิดไวยากรณ์ **ทำให้ build ล้มทั้งเว็บ** ไม่ใช่แค่หน้าเดียว
> แปลว่าพิมพ์ MDX ผิดตัวเดียวแล้วกด Publish = เว็บทั้งเว็บอัปเดตไม่ได้
>
> **มาตรการที่ต้องมี (บังคับ):**
> 1. ตอนกด Publish → API ลองคอมไพล์ MDX ก่อน ถ้าไม่ผ่านให้ปฏิเสธพร้อมแสดง error ไม่บันทึกเป็น published
> 2. prebuild script → ถ้าชิ้นไหนคอมไพล์ไม่ผ่าน ให้**ข้ามชิ้นนั้นพร้อมเตือน** ไม่ใช่ให้ build ล้มทั้งหมด

**ข้อจำกัดที่ต้องยอมรับ:** MDX import component ได้เฉพาะที่มีอยู่ใน repo แล้วเท่านั้น — โปรเจกต์ที่ต้องใช้กราฟชนิดใหม่ยังต้องเขียน component ใหม่แล้ว push ขึ้น GitHub (แต่นั่นคือ**โค้ด** ไม่ใช่**เนื้อหา** ซึ่งตรงกับความต้องการที่ว่า "ไม่อยากให้เนื้อหาอยู่บน GitHub")

### 7.3 Portable Text → Markdown

เนื้อหาเดิมเป็น Portable Text ระบบใหม่ใช้ Markdown — render ตอน build ด้วย `marked` ได้ HTML static ไม่ต้องโหลด JS เพิ่มฝั่ง client

---

## 8. ประเด็นความปลอดภัย

### 8.1 🔴 AI Worker เปิดให้ทุกคนเรียกได้ (ต้องแก้ก่อนใช้งานจริง)

`ai-worker/src/index.js:1-5`

```js
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",   // ← ใครก็เรียกได้
};
```

Worker ไม่มีการตรวจสอบสิทธิ์เลย — ใครที่รู้ URL `ai-assistant-worker.frongbook.workers.dev/generate` ยิง request ไม่จำกัดจนเผา credit Gemini/OpenRouter ได้

**ทางแก้:**
1. Browser ไม่เรียก worker ตรงๆ → เรียกผ่าน `/earth/api/ai/*` ซึ่งอยู่หลัง Access
2. Pages Function เรียก worker ต่อพร้อม header `X-Auth-Secret: {AI_WORKER_SECRET}`
3. Worker ปฏิเสธ request ที่ไม่มี secret
4. จำกัด CORS เหลือเฉพาะ `https://frong.me`

### 8.2 🔴 การเก็บ API Key ของ BYOK

เมื่อย้าย key มาเก็บใน D1 ต้องทำ 3 ข้อนี้ **ห้ามข้าม**

1. **เข้ารหัสก่อนเก็บ** — Web Crypto AES-GCM โดย master key เป็น secret (`ENCRYPTION_KEY`) → D1 เก็บเฉพาะ ciphertext
2. **ห้ามส่ง key กลับมาที่ browser** — หน้า Settings แสดงแบบ mask (`AIza••••4f2c`) เป็น write-only
3. **ถอดรหัสฝั่ง server ตอนจะยิง request เท่านั้น**

### 8.3 🔴 Endpoint สาธารณะ (`/api/subscribe`)

เป็นจุดแรกที่เปิดรับ request จากคนภายนอก (ต่างจาก `/earth/*` ที่อยู่หลัง Access) ต้องมี:

- **Cloudflare Turnstile** ยืนยันว่าไม่ใช่ bot
- **Rate limit** ต่อ IP
- **Double opt-in** — ส่งอีเมลยืนยันก่อนบันทึกเป็นสมาชิกจริง (กันคนกรอกอีเมลคนอื่น)
- **ลิงก์ยกเลิกการสมัคร** ในทุกอีเมลที่ส่ง (จำเป็นตามกฎหมาย PDPA/GDPR)
- เก็บ **เวลาและ IP ที่ยินยอม** เป็นหลักฐานการขอความยินยอม (PDPA)

### 8.4 การ validate ทั่วไป

- Upload รูป: ตรวจ MIME type + ขนาดไฟล์ **ฝั่ง server** เสมอ ห้ามเชื่อการเช็คฝั่ง client
- Markdown/MDX ที่เขียนเอง: sanitize ด้วย DOMPurify ก่อน render ใน preview
- `base_url` ของ custom AI provider: ต้องเป็น HTTPS และไม่ใช่ internal address (กัน SSRF)

---

## 9. Database Schema

> **ออกแบบเผื่ออนาคตตั้งแต่ Phase 1** — คอลัมน์ `type`, `lang`, `translation_group_id` ใส่ตั้งแต่แรก
> แม้ Phase 1 จะใช้แค่ `type='article'`, `lang='th'` เพื่อไม่ต้อง migrate ข้อมูลทีหลัง

```sql
-- ═══════════════════ เนื้อหา (บทความ + โปรเจกต์) ═══════════════════
CREATE TABLE posts (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL DEFAULT 'article',  -- article | project
  lang                 TEXT NOT NULL DEFAULT 'th',       -- th | en
  translation_group_id TEXT NOT NULL,        -- ผูกเวอร์ชันภาษาเข้าด้วยกัน
  slug                 TEXT NOT NULL,
  title                TEXT NOT NULL,
  body                 TEXT NOT NULL,        -- Markdown (article) | MDX (project)
  excerpt              TEXT,
  cover_image          TEXT,                 -- R2 URL หรือ external URL
  cover_position       TEXT,                 -- JSON {"x":50,"y":50,"zoom":1.0}
  tags                 TEXT,                 -- JSON array
  font                 TEXT DEFAULT 'sans',  -- sans | serif | google-sans
  status               TEXT NOT NULL DEFAULT 'draft',    -- draft | published
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  published_at         INTEGER
);
CREATE UNIQUE INDEX idx_posts_slug_lang ON posts(slug, lang);
CREATE INDEX idx_posts_feed  ON posts(status, published_at DESC);
CREATE INDEX idx_posts_group ON posts(translation_group_id);
CREATE INDEX idx_posts_type  ON posts(type, status, published_at DESC);

-- ═══════════════════════════ รูปภาพ ═══════════════════════════
CREATE TABLE images (
  id         TEXT PRIMARY KEY,
  post_id    TEXT,
  r2_key     TEXT NOT NULL,
  size       INTEGER,
  created_at INTEGER NOT NULL
);

-- ═══════════════════ สมาชิก newsletter ═══════════════════
CREATE TABLE subscribers (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | unsubscribed
  lang              TEXT NOT NULL DEFAULT 'th',       -- ภาษาที่ต้องการรับ
  confirm_token     TEXT,
  unsubscribe_token TEXT NOT NULL,
  consent_ip        TEXT,             -- หลักฐานการยินยอมตาม PDPA
  created_at        INTEGER NOT NULL,
  confirmed_at      INTEGER
);
CREATE INDEX idx_subscribers_status ON subscribers(status);

-- ═══════════════════ BYOK: AI Providers ═══════════════════
CREATE TABLE ai_providers (
  id                TEXT PRIMARY KEY,   -- gemini, openrouter, groq, my-ollama
  label             TEXT NOT NULL,
  kind              TEXT NOT NULL,      -- openai-compatible | gemini | anthropic | cloudflare
  base_url          TEXT,
  api_key_encrypted TEXT,               -- AES-GCM ciphertext (NULL สำหรับ cloudflare)
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- ═══════════════ BYOK: Model ที่เลือกไว้ใช้งาน ═══════════════
CREATE TABLE ai_models (
  id          TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model_id    TEXT NOT NULL,           -- เช่น gemini-3.6-flash
  label       TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_models_unique ON ai_models(provider_id, model_id);
```

**หมายเหตุ:** `ai_models` เก็บเฉพาะ model ที่เลือกไว้ใช้ ไม่ใช่ catalog ทั้งหมดของ provider

---

## 10. Route Map

| Route | Render | Access | หน้าที่ | Phase |
|---|---|---|---|---|
| `/` | static | public | ฟีดรวมบทความ + โปรเจกต์ | 1 |
| `/articles/[slug]` | static | public | บทความ (ไทย) — canonical | 1 |
| `/en/articles/[slug]` | static | public | บทความ (อังกฤษ) | 5 |
| `/work/[slug]` | static | public | โปรเจกต์ data viz | 2 |
| `/about` | static | public | เกี่ยวกับ (ทำหน้าที่เรซูเม่) | มีแล้ว |
| `/404` | static | public | Not found | มีแล้ว |
| `/rss.xml` | static | public | RSS feed | 1 |
| `POST /api/subscribe` | endpoint | **public** | สมัคร newsletter (+Turnstile) | 1 |
| `GET /api/confirm` | endpoint | **public** | ยืนยันอีเมล (double opt-in) | 4 |
| `GET /api/unsubscribe` | endpoint | **public** | ยกเลิกการสมัคร | 4 |
| `/earth` | `prerender=false` | 🔒 Access | Portal — รายการ draft/published |1|
| `/earth/editor` | `prerender=false` | 🔒 Access | Editor เขียน/แก้ | 1 |
| `/earth/settings` | `prerender=false` | 🔒 Access | ตั้งค่า (หลายแท็บ) | 6 |
| `POST /earth/api/draft` | endpoint | 🔒 Access | บันทึกฉบับร่าง | 1 |
| `POST /earth/api/publish` | endpoint | 🔒 Access | เผยแพร่ + ยิง Deploy Hook | 1 |
| `POST /earth/api/update` | endpoint | 🔒 Access | แก้ที่เผยแพร่แล้ว | 1 |
| `DELETE /earth/api/post/[id]` | endpoint | 🔒 Access | ลบ | 1 |
| `POST /earth/api/upload-image` | endpoint | 🔒 Access | อัปโหลดรูปไป R2 | 3 |
| `POST /earth/api/send-newsletter` | endpoint | 🔒 Access | ส่งจดหมายข่าว | 4 |
| `GET/POST/DELETE /earth/api/providers` | endpoint | 🔒 Access | จัดการ AI providers | 6 |
| `POST /earth/api/ai/[task]` | endpoint | 🔒 Access | Proxy ไป ai-assistant-worker | 6 |

---

## 11. SEO

### 11.1 พื้นฐานที่ต้องมีตั้งแต่ Phase 1

- `<title>` และ `<meta name="description">` จาก title/excerpt ของแต่ละหน้า
- **Canonical URL** ทุกหน้า
- **Open Graph + Twitter Card** (มีอยู่แล้วบางส่วน — `ogImage` ใน `Layout.astro`)
- **JSON-LD `Article`** — headline, datePublished, dateModified, author, image
- **Sitemap** — มี `@astrojs/sitemap` อยู่แล้ว ต้องให้ครอบคลุมทั้ง `/articles/*` และ `/work/*`
- URL slug เป็นภาษาอังกฤษ ตัวพิมพ์เล็ก คั่นด้วย `-` (โค้ด `generateSlug()` เดิมตัดอักษรไทยทิ้ง — **ต้องแก้** ดูข้อ 13)

### 11.2 เมื่อทำสองภาษา (Phase 5)

- **`hreflang`** ในทุกหน้าที่มี 2 เวอร์ชัน:
  ```html
  <link rel="alternate" hreflang="th" href="https://frong.me/articles/x">
  <link rel="alternate" hreflang="en" href="https://frong.me/en/articles/x">
  <link rel="alternate" hreflang="x-default" href="https://frong.me/articles/x">
  ```
- canonical ของแต่ละเวอร์ชันชี้ที่ตัวเอง (ไม่ใช่ชี้ข้ามภาษา)
- `<html lang="th">` / `<html lang="en">` ให้ถูกต้อง

### 11.3 ข้อแลกเปลี่ยนที่ยอมรับแล้ว

**ไม่มีหน้า hub ของ 3 เสาหลัก** — Google จะไม่มีหน้าศูนย์กลางให้เข้าใจว่าเว็บนี้เชี่ยวชาญด้านไหน ทำให้การสร้าง topical authority ช้ากว่าที่ควร

*ชดเชยได้บางส่วนด้วย:* การใส่ internal link ระหว่างบทความในหัวข้อเดียวกันให้แน่น และเขียน About ให้ระบุความเชี่ยวชาญ 3 ด้านนี้ชัดเจน

---

## 12. แผนการพัฒนาแบ่งตาม Phase

> ประมาณการชั่วโมงเป็นค่าคร่าวๆ สำหรับคนทำเองโดยมี AI ช่วย
> สัปดาห์ = 7 ชม. โดยประมาณ

### สรุปภาพรวม

| Phase | ชื่อ | ชม. | ~สัปดาห์ | จบแล้วทำอะไรได้ |
|---|---|---|---|---|
| 0 | เตรียม Infrastructure | 2-3 | 0.5 | — |
| **1** | **MVP — เขียนและเผยแพร่ได้** | **30-45** | **5-6** | **เริ่มเขียนบทความได้จริง** |
| 2 | โปรเจกต์ MDX + interactive viz | 15-22 | 2-3 | เผยแพร่งาน data viz ได้ |
| 3 | อัปโหลดรูปไป R2 | 6-10 | 1-1.5 | ใส่รูปเองได้ ไม่ต้องพึ่ง URL ภายนอก |
| 4 | ส่ง Newsletter | 10-15 | 1.5-2 | ส่งจดหมายข่าวถึงสมาชิกได้ |
| 5 | ภาษาอังกฤษ | 10-15 | 1.5-2 | เว็บสองภาษาสมบูรณ์ |
| 6 | AI Assistant + BYOK | 20-30 | 3-4 | มีผู้ช่วย AI ในหน้าเขียน |
| 7 | ค้นหา + แบ่งหน้า | 8-12 | 1-1.5 | รองรับเนื้อหาจำนวนมาก |
| — | รวม | **~100-150** | **~15-21** | |

---

### Phase 0 — เตรียม Infrastructure *(ทำใน Cloudflare Dashboard)*

| # | งาน | ผลลัพธ์ |
|---|---|---|
| 1 | สร้าง D1 database `portfolio-db` | `database_id` |
| 2 | สร้าง R2 bucket `portfolio-images` + public domain | Public URL |
| 3 | Zero Trust → Access → Applications → Self-hosted<br>Domain `frong.me` path `/earth*` · Policy: allow เฉพาะอีเมลตัวเอง | `/earth` ต้อง login ก่อนเข้า |
| 4 | สร้าง Deploy Hook (Pages → Settings → Builds) | Hook URL |
| 5 | สร้าง API Token สิทธิ์ `D1:Edit` | Token สำหรับ build-time |
| 6 | สร้าง Turnstile site key/secret | สำหรับฟอร์มสมัคร |

**Environment variables ที่ต้องตั้งใน Pages:**

```
CF_ACCOUNT_ID           # สำหรับ D1 HTTP API ตอน build
CF_D1_DATABASE_ID
CF_API_TOKEN            # สิทธิ์ D1:Edit
DEPLOY_HOOK_URL         # ยิงตอน publish
TURNSTILE_SECRET_KEY    # ตรวจ token ฝั่ง server
PUBLIC_TURNSTILE_SITE_KEY
AI_WORKER_URL           # Phase 6
AI_WORKER_SECRET        # Phase 6
ENCRYPTION_KEY          # Phase 6 — master key เข้ารหัส API key
RESEND_API_KEY          # Phase 4
```

---

### Phase 1 — MVP: เขียนและเผยแพร่ได้ ⭐

> **เป้าหมายเดียวของ Phase นี้: ไปให้ถึงจุดที่เขียนบทความแล้วกด Publish แล้วมันขึ้นเว็บจริง**
> ทุกอย่างที่ไม่จำเป็นต่อเป้าหมายนี้ถูกตัดออกหมด

**ขอบเขต:**

1. ติดตั้ง `@astrojs/cloudflare` adapter (คง `output: 'static'`)
2. สร้าง D1 schema **ทั้งหมดตามข้อ 9** (สร้างครบทุกตารางเลย แม้ยังไม่ใช้ — จะได้ไม่ต้อง migrate)
3. เขียน `src/lib/db.ts` — ห่อ HTTP API (build) + binding (runtime)
4. เขียน `MarkdownBody.astro` แทน `ArticleBody.astro` — **ใช้ CSS/typography เดิมทุกคลาส**
5. แก้ `extractHeadings()` ให้ parse heading จาก Markdown
6. เปลี่ยน `index.astro` + `articles/[slug].astro` ให้ดึงจาก D1
7. ถอด Sanity ออกทั้งหมด (config, dependencies, โฟลเดอร์ `sanity/`)
   - ⚠️ **ก่อนลบ** — คัดลอก logic ของ `AIAssistantView.tsx` เก็บไว้ก่อน จะใช้ใน Phase 6
8. Portal `/earth` — รายการ draft/published แบบเรียบง่าย
9. Editor `/earth/editor` — title, slug, body (Markdown), excerpt, cover URL (**พิมพ์ URL เท่านั้น ยังไม่มี upload**), tags, บันทึกร่าง, เผยแพร่
10. Auto-save: localStorage (1 วิ) + server (30 วิ) + `sendBeacon` ตอนปิดหน้า
11. Publish → ยิง Deploy Hook
12. **RSS feed** (`@astrojs/rss` — ~1 ชม. แต่เริ่มเก็บผู้ติดตามได้ทันที)
13. **ฟอร์มสมัคร newsletter + `POST /api/subscribe`** — เก็บอีเมลลง D1 พร้อม Turnstile
    (**ยังไม่ต้องส่งอีเมล** — แค่เก็บไว้ก่อน จะได้ไม่เสียผู้อ่านช่วงแรกไป)

**ตัดออกจาก Phase นี้ (อย่าเผลอทำ):**
AI panel · BYOK settings · ภาษาอังกฤษ · โปรเจกต์ MDX · อัปโหลดรูป · ส่งอีเมลจริง · ค้นหา · แบ่งหน้า · คอมเมนต์ · เอฟเฟกต์ต่างๆ ใน editor (emoji, slash command, zen mode)

**เกณฑ์ตรวจรับ:**

- [ ] `npm run build` ผ่าน ไม่มี error
- [ ] เข้า `/earth` โดยไม่ login → ถูกปฏิเสธที่ edge (ทดสอบด้วย incognito)
- [ ] เขียนบทความใหม่ → กด Publish → ภายใน ~60 วินาที บทความขึ้นที่ `/articles/[slug]` จริง
- [ ] **หน้าบทความหน้าตาเหมือนเดิมทุกจุด** — เทียบกับ screenshot ที่เก็บไว้ก่อนเริ่มแก้
      (ฟอนต์ · TOC · รูปปก · tags · related · sources · CTA)
- [ ] ปิดเบราว์เซอร์กลางคันขณะเขียน → เปิดใหม่แล้วข้อมูลยังอยู่
- [ ] `/rss.xml` เปิดได้และมีบทความ
- [ ] กรอกอีเมลในฟอร์มสมัคร → มีแถวใหม่ในตาราง `subscribers`
- [ ] ไม่มี dependency ของ Sanity เหลือใน `package.json`

> 🎯 **จบ Phase 1 = เริ่มเขียนบทความสัปดาห์ละชิ้นได้ทันที** อย่ารอ Phase อื่น

---

### Phase 2 — โปรเจกต์ MDX + Interactive Viz

**เหตุผลที่มาก่อน AI และ newsletter:** โปรเจกต์ interactive คือตัวตนของแบรนด์ ถ้าไม่มีก็เป็นแค่บล็อกทั่วไป

**ขอบเขต:**

1. Astro Content Collection `projects` + ตั้ง `src/content/projects/` ใน `.gitignore`
2. **prebuild script** — ดึงโปรเจกต์จาก D1 เขียนเป็นไฟล์ `.mdx` ก่อน `astro build`
3. หน้า `/work/[slug]`
4. Editor รองรับ `type='project'` — สลับโหมด Markdown/MDX
5. **ตรวจสอบการคอมไพล์ MDX ตอน Publish** (บังคับ — ดูข้อ 7.2)
6. prebuild ข้ามชิ้นที่คอมไพล์ไม่ผ่านพร้อมเตือน ไม่ให้ build ล้มทั้งเว็บ
7. สร้าง component กราฟชุดแรกใน `src/components/viz/` (เริ่มจากที่ใช้บ่อย เช่น bar, line)
8. โปรเจกต์แสดงในฟีดหน้าแรกร่วมกับบทความ + banner สำหรับชิ้นเด่น

**เกณฑ์ตรวจรับ:**
- [ ] เขียน MDX ที่ import component กราฟ → publish → หน้า `/work/[slug]` แสดงกราฟที่โต้ตอบได้จริง
- [ ] จงใจพิมพ์ MDX ผิด → กด Publish → **ถูกปฏิเสธพร้อมข้อความ error** และเว็บเดิมไม่พัง
- [ ] ฟีดหน้าแรกแสดงทั้งบทความและโปรเจกต์เรียงตามเวลาถูกต้อง

---

### Phase 3 — อัปโหลดรูปไป R2

1. `POST /earth/api/upload-image` — validate MIME + ขนาด **ฝั่ง server**
2. เก็บลง R2 + บันทึก metadata ลงตาราง `images`
3. Editor: drag & drop + แทรก Markdown อัตโนมัติ
4. ปรับตำแหน่ง/zoom รูปปก (ใช้ `cover_position` ที่มีในตารางแล้ว)

**เกณฑ์ตรวจรับ:** ลากรูปลงใน editor → อัปโหลดสำเร็จ → แสดงในบทความที่ publish แล้ว · อัปโหลดไฟล์ 10MB หรือไฟล์ `.exe` เปลี่ยนนามสกุล → ถูกปฏิเสธ

---

### Phase 4 — ส่ง Newsletter

1. เลือกและต่อบริการส่งอีเมล (Resend หรือเทียบเท่า)
2. Double opt-in — `GET /api/confirm`
3. `GET /api/unsubscribe`
4. `POST /earth/api/send-newsletter` — **กดส่งเองจาก Portal ไม่ใช่ส่งอัตโนมัติตอน publish**
   (กันพลาดจากการพิมพ์ผิด — อีเมลที่ส่งไปแล้วเรียกคืนไม่ได้)
5. Template อีเมล: หัวข้อ + เกริ่นนำ + ลิงก์อ่านต่อ (ไม่ส่งเนื้อหาเต็ม — ดึงคนกลับมาที่เว็บ)

**เกณฑ์ตรวจรับ:** สมัคร → ได้อีเมลยืนยัน → กดยืนยัน → สถานะเป็น `confirmed` · กดส่งจดหมายข่าว → ได้รับจริง · กดลิงก์ยกเลิก → ไม่ได้รับอีกต่อไป

---

### Phase 5 — ภาษาอังกฤษ

1. Astro i18n routing — `/en/*`
2. Editor: แท็บสลับ ไทย/อังกฤษ ผูกกันด้วย `translation_group_id`
3. **เผยแพร่ภาษาเดียวก่อนได้** ไม่ต้องรอครบสองภาษา
4. `hreflang` + `<html lang>` + canonical (ดูข้อ 11.2)
5. ตัวสลับภาษาใน Navbar — แสดงเฉพาะเมื่อมีอีกภาษาจริง

**เกณฑ์ตรวจรับ:** บทความที่มีทั้งสองภาษา → สลับไปมาได้ · บทความที่มีภาษาเดียว → ไม่แสดงปุ่มสลับและไม่มี hreflang ชี้ไปหน้าที่ไม่มีอยู่ · ตรวจ hreflang ด้วยเครื่องมือของ Google

---

### Phase 6 — AI Assistant + BYOK

1. หน้า `/earth/settings` พร้อมระบบแท็บ
   - **แท็บ Profile** — อีเมลจาก Cloudflare Access (`Cf-Access-Jwt-Assertion` หรือ `/cdn-cgi/access/get-identity`), สรุปสถิติ
   - **แท็บ AI Models** — จัดการ provider
2. เพิ่ม provider: กรอก label / kind / base URL / API key → ปุ่ม **"โหลดรายชื่อ Model"** (ตรวจ key + ดึง catalog พร้อมกัน) → ติ๊กเลือก model ที่ต้องการ → บันทึก
3. เข้ารหัส API key ก่อนเก็บ (ข้อ 8.2)
4. Refactor `ai-worker/` เป็น adapter registry:
   ```js
   const ADAPTERS = {
     "openai-compatible": runOpenAICompatible,  // OpenRouter, Groq, Together,
                                                // DeepSeek, Mistral, Ollama ฯลฯ
     "gemini":            runGemini,
     "anthropic":         runAnthropic,
     "cloudflare":        runCloudflare,
   };
   ```
5. **ปิดช่องโหว่ตามข้อ 8.1**
6. AI panel ในหน้า editor — เลือก provider → เห็นเฉพาะ model ที่ตั้งค่าไว้ → เลือก → ใช้เครื่องมือ
7. **เพิ่ม task `translate`** — แปลร่างแรกไทย↔อังกฤษ (ทำให้ Phase 5 เป็นไปได้จริงในทางปฏิบัติ)

**Endpoint ดึงรายชื่อ model แต่ละประเภท:**

| `kind` | Endpoint |
|---|---|
| `openai-compatible` | `GET {base_url}/models` + `Authorization: Bearer` |
| `gemini` | `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` |
| `openrouter` | `GET https://openrouter.ai/api/v1/models` (ไม่ต้องใช้ key) |
| `cloudflare` | Cloudflare REST API หรือ hardcode |

> ⚠️ ยืนยันกับเอกสารของแต่ละเจ้าอีกครั้งตอน implement — API เปลี่ยนได้

**เกณฑ์ตรวจรับ:** เพิ่ม provider ใหม่ที่เป็น OpenAI-compatible ได้จากหน้าเว็บโดยไม่แก้โค้ด · เรียก worker ตรงๆ จากภายนอกโดยไม่มี secret → ถูกปฏิเสธ · API key ใน D1 เป็น ciphertext · หน้า settings ไม่เคยส่ง key กลับมาที่ browser

---

### Phase 7 — ค้นหา + แบ่งหน้า

**ทำเมื่อ:** มีเนื้อหาเกิน ~30 ชิ้น (ประมาณ 7-8 เดือนหลังเริ่มเขียน)

1. แบ่งหน้าในฟีด
2. ค้นหา — สร้าง index ตอน build (เช่น Pagefind หรือ JSON index + fuzzy search ฝั่ง client) ไม่ต้องใช้ server
3. หน้า archive รวมทั้งหมด

---

### อนาคต (ยังไม่กำหนดเวลา)

ระบบคอมเมนต์ · Slash command แทรกลิงก์ · Emoji picker · YouTube embed · Zen mode · Export JSON/Markdown · JSON-LD generator อัตโนมัติ

---

## 13. ประเด็นที่ยังไม่ตัดสินใจ

| # | ประเด็น | ตัวเลือก | ค่าเริ่มต้นที่จะใช้ถ้าไม่ตัดสินใจ |
|---|---|---|---|
| 1 | URL prefix ของโปรเจกต์ | `/work/` · `/projects/` · `/viz/` | `/work/` |
| 2 | **slug ภาษาไทย** — `generateSlug()` เดิมตัดอักษรไทยทิ้งหมด ทำให้ได้ slug ว่าง | ก) พิมพ์ slug อังกฤษเองทุกครั้ง<br>ข) ทับศัพท์อัตโนมัติ (transliterate)<br>ค) ให้ AI ตั้ง slug จากหัวข้อ | **ก)** — ง่ายและควบคุมได้ แต่ต้องพิมพ์เองทุกบทความ |
| 3 | บริการส่งอีเมล | Resend · Buttondown · MailerSend | Resend (ต้องเช็คราคาปัจจุบันเอง) |
| 4 | เนื้อหาในจดหมายข่าว | เกริ่นนำ + ลิงก์ · เนื้อหาเต็ม | เกริ่นนำ + ลิงก์ |
| 5 | Editor รองรับมือถือ | รองรับ · desktop-only | desktop-only (เขียนบนมือถือไม่สะดวกอยู่แล้ว) |
| 6 | ไลบรารีกราฟที่จะใช้ | D3 · Observable Plot · Recharts · เขียน SVG เอง | ยังไม่ตัดสินใจ — เลือกตอน Phase 2 |
| 7 | จำกัดจำนวน draft/published | จำกัด · ไม่จำกัด | ไม่จำกัด (ใช้คนเดียว) |
| 8 | License ของเนื้อหา | All rights reserved · CC BY-NC | ยังไม่ตัดสินใจ — เกี่ยวกับความกังวลเรื่องคนคัดลอกงาน |

---

## 14. ความเสี่ยง

| ความเสี่ยง | ระดับ | การรับมือ |
|---|---|---|
| **ใช้เวลาสร้างระบบนานจนไม่ได้เผยแพร่อะไรเลย** | 🔴 สูงสุด | Phase 1 ตัดทุกอย่างที่ไม่จำเป็นออก · จบ Phase 1 ต้องเริ่มเขียนทันทีไม่รอ Phase อื่น |
| MDX ผิดไวยากรณ์ทำ build ล้มทั้งเว็บ | 🔴 สูง | ตรวจคอมไพล์ตอน Publish + prebuild ข้ามชิ้นที่พังแทนที่จะล้มทั้ง build (ข้อ 7.2) |
| หน้าบทความหน้าตาเพี้ยนหลังเปลี่ยนเป็น Markdown | 🟠 กลาง | Screenshot เทียบก่อน/หลัง · ทำ Phase 1 ให้จบสมบูรณ์ก่อนไปต่อ |
| **ทำสองภาษาไม่ไหว เขียนไทยแล้วไม่ได้แปล** | 🟠 กลาง | เผยแพร่ภาษาเดียวได้ · เลื่อนภาษาอังกฤษไป Phase 5 · ใช้ AI แปลร่างแรก (task `translate`) |
| เขียนไม่ทันสัปดาห์ละชิ้นตามที่ตั้งเป้า | 🟠 กลาง | ยอมรับว่าความสม่ำเสมอสำคัญกว่าความถี่ — เขียน 2 สัปดาห์/ชิ้นอย่างต่อเนื่องดีกว่าสัปดาห์ละชิ้นแล้วหยุดไป 2 เดือน |
| API key รั่วจาก D1 | 🔴 สูง | เข้ารหัส AES-GCM + ไม่ส่ง key กลับ browser (ข้อ 8.2) |
| AI worker ถูกยิงจนเผา credit | 🔴 สูง | ปิดตามข้อ 8.1 **ก่อน** เริ่มใช้งานจริง |
| Bot spam ฟอร์มสมัครสมาชิก | 🟠 กลาง | Turnstile + rate limit + double opt-in |
| Deploy Hook ยิงถี่จนชน build limit | 🟢 ต่ำ | ที่ความถี่ 1-2 ครั้ง/สัปดาห์ไม่น่ามีปัญหา · ตรวจ quota ของ plan ที่ใช้ |
| Cloudflare Access ล่ม เข้า `/earth` ไม่ได้ | 🟢 ต่ำ | ยอมรับได้ — หน้า public ยังทำงานปกติเพราะเป็น static |

---

## ภาคผนวก — คำถามที่ควรถามตัวเองก่อนเริ่มแต่ละ Phase

1. Phase ที่แล้วจบสมบูรณ์และใช้งานได้จริงหรือยัง
2. ตั้งแต่จบ Phase 1 มาแล้ว ได้เผยแพร่เนื้อหาไปกี่ชิ้น — ถ้าคำตอบคือ 0 ให้**หยุดพัฒนาระบบแล้วกลับไปเขียน**
3. สิ่งที่กำลังจะทำนี้ช่วยให้เผยแพร่เนื้อหาได้ดีขึ้น/เร็วขึ้นจริงไหม หรือแค่อยากทำ
