# frong.me — แผนพัฒนาระบบเว็บไซต์ (ฉบับที่ 4)

> เอกสารข้อกำหนดและแผนการพัฒนา · อัปเดต 2026-09-09
> Repo: `Watcharapol-Frong/portfolio` · Site: https://frong.me
> **ผู้พัฒนา: เจ้าของเว็บเอง โดยมี AI ช่วย · เวลาที่มี 5-10 ชม./สัปดาห์**

**การเปลี่ยนแปลงในฉบับที่ 4 — แก้หลังการรีวิว 6 ข้อ:**

| # | สิ่งที่แก้ | สถานะเดิม |
|---|---|---|
| 1 | **Deploy ไป Cloudflare Workers ไม่ใช่ Pages** · เพิ่ม Phase 0.5 ทำต้นแบบก่อน | ❌ ผิดข้อเท็จจริง |
| 2 | **เพิ่ม `post_revisions` แยกร่างออกจากฉบับเผยแพร่** + สถานะ deploy | 🐛 บั๊กในดีไซน์ |
| 3 | **build ล้ม = คงเว็บฉบับล่าสุดไว้** ไม่ข้ามชิ้นที่พังแล้ว deploy ต่อ | ❌ ดีไซน์ผิด |
| 4 | **อนุญาตกราฟ static ในบทความ** · ขยับบทวิเคราะห์จริงมาก่อน | ⚠️ ขัดกันเอง |
| 5 | **สำรองข้อมูลเร็วขึ้น · newsletter ครบชุด · ปิด AI worker ทันที** | ⚠️ ลำดับผิด |
| 6 | **แก้ข้ออ้างเรื่อง `lang` กับ Google** · ระบุตัวเลขเป็นเป้าที่ต้องวัด | ❌ ผิดข้อเท็จจริง |

### เกณฑ์การอ้างอิงในเอกสารนี้

| สัญลักษณ์ | ความหมาย |
|---|---|
| ✅ **ตรวจแล้ว** | ยืนยันกับเอกสารทางการหรือรันจริง มีที่มากำกับ |
| 🎯 **เป้าที่ต้องวัด** | ตัวเลขคาดการณ์ ต้องวัดกับระบบและไฟล์จริงแล้วแก้ให้ตรง |
| ❓ **ต้องตรวจเอง** | ผมไม่ทราบ ต้องหาข้อมูลก่อนตัดสินใจ |

---

## สารบัญ

| # | หัวข้อ | |
|---|---|---|
| 1 | [สรุปความเข้าใจร่วมกัน](#1-สรุปความเข้าใจร่วมกัน) | |
| 2 | [เป้าหมายและกลยุทธ์เนื้อหา](#2-เป้าหมายและกลยุทธ์เนื้อหา) | |
| 3 | [ขอบเขต](#3-ขอบเขต) | |
| 4 | [ข้อจำกัดด้านเวลา](#4-ข้อจำกัดด้านเวลา) | |
| 5 | [สถานะปัจจุบัน](#5-สถานะปัจจุบัน) | |
| 6 | [สถาปัตยกรรมเป้าหมาย](#6-สถาปัตยกรรมเป้าหมาย) | |
| 7 | [ข้อจำกัดทางเทคนิค](#7-ข้อจำกัดทางเทคนิค) | |
| 8 | [ความปลอดภัย](#8-ความปลอดภัย) | |
| 9 | [Database Schema](#9-database-schema) | |
| 10 | [Route Map](#10-route-map) | |
| 11 | [ระบบฟอนต์](#11-ระบบฟอนต์) | ⭐ ใหม่ |
| 12 | [ระบบรูปภาพ](#12-ระบบรูปภาพ) | ⭐ ใหม่ |
| 13 | [ระบบกราฟและ data visualization](#13-ระบบกราฟและ-data-visualization) | ⭐ ใหม่ |
| 14 | [SEO](#14-seo) | |
| 15 | [ความเร็วเว็บไซต์](#15-ความเร็วเว็บไซต์) | |
| 16 | [แผนการพัฒนาแบ่งตาม Phase](#16-แผนการพัฒนาแบ่งตาม-phase) | |
| 17 | [ประเด็นที่ยังไม่ตัดสินใจ](#17-ประเด็นที่ยังไม่ตัดสินใจ) | |
| 18 | [ความเสี่ยง](#18-ความเสี่ยง) | |
| 19 | [เรื่อง slug และ id ของหัวข้อ](#19-เรื่อง-slug-และ-id-ของหัวข้อ-แก้แล้ว-2026-09-09) | ⭐ ใหม่ |

---

## 1. สรุปความเข้าใจร่วมกัน

*(ตรวจสอบว่าเข้าใจตรงกัน — ถ้าข้อไหนผิดให้แก้ก่อนเริ่มลงมือ)*

| # | หัวข้อ | ข้อสรุป |
|---|---|---|
| 1 | เป้าหมายหลัก | สร้าง personal brand และฐานผู้ติดตาม |
| 2 | ตัวตนที่ต้องการสื่อสาร | นักวิเคราะห์ข้อมูลที่เล่าเรื่องผ่าน interactive data visualization + เป็นนักพัฒนาและนักเขียน เข้าใจเทคโนโลยีและ AI |
| 3 | ประเภทเนื้อหา | **บทความ** (Markdown) และ **โปรเจกต์ data viz** (MDX + interactive component) |
| 4 | ที่เก็บเนื้อหา | Cloudflare D1 ทั้งหมด รวมถึงไฟล์ MDX ของโปรเจกต์ (ไม่เก็บใน GitHub) |
| 5 | ภาษา | **ผสมกัน** — แต่ละชิ้นมีภาษาเดียว ไทย `/articles/x` · อังกฤษ `/en/articles/x` ไม่บังคับว่าต้องมีคู่แปล |
| 6 | หน้าแรก | ฟีดรวมบทความ + โปรเจกต์ เรียงตามเวลา |
| 7 | ความถี่เผยแพร่ | บทความสัปดาห์ละ 1 · โปรเจกต์เดือนละ 1-2 |
| 8 | เสาหลักเนื้อหา | 1) วิเคราะห์ข้อมูลเศรษฐกิจ/สังคมไทย 2) สอนเครื่องมือ/เทคนิค data 3) เส้นทางการเรียนรู้และเปลี่ยนสายงาน |
| 9 | ช่องทางติดตาม | Email newsletter + RSS |
| 10 | ยืนยันตัวตนหลังบ้าน | Cloudflare Access |
| 11 | AI Assistant | BYOK — เพิ่ม provider/API key/model ได้จากหน้าตั้งค่า |
| 12 | **ฟอนต์** | **Google Sans ตัวเดียวทั้งไทยและอังกฤษ** (ตรวจแล้วว่ามี subset ไทย) |
| 13 | **กราฟ** | **3 ระดับ — เริ่มจาก SVG ตอน build ที่ส่ง JS 0 ไบต์** |
| 14 | ผู้พัฒนา | เจ้าของเว็บเอง + AI ช่วย · 5-10 ชม./สัปดาห์ |
| 15 | ลำดับความสำคัญ | **MVP ให้เขียนและเผยแพร่ได้ก่อน** |

---

## 2. เป้าหมายและกลยุทธ์เนื้อหา

สร้างการจดจำในฐานะ **"คนที่วิเคราะห์ข้อมูลเศรษฐกิจ/สังคมไทยแล้วเล่าออกมาให้เข้าใจง่ายผ่านภาพที่โต้ตอบได้"**

ตัวเว็บและงานในเว็บคือ portfolio โดยตรง — ไม่ต้องมีเรซูเม่แยก

### เสาหลักเนื้อหา

| ลำดับ | เสา | บทบาท | รูปแบบที่เหมาะ |
|---|---|---|---|
| 1 | วิเคราะห์ข้อมูลเศรษฐกิจ/สังคมไทย | **จุดแข็งเฉพาะตัว** — พื้นฐานเศรษฐศาสตร์ + บริบทไทย + ทำ viz เองได้ | โปรเจกต์ interactive + บทความประกอบ |
| 2 | สอนเครื่องมือ/เทคนิค data | **ดึง traffic** | บทความ how-to |
| 3 | เส้นทางการเรียนรู้/เปลี่ยนสายงาน | **สร้างความผูกพัน** | บทความบันทึกประสบการณ์ |

### ตัวชี้วัด

1. **จำนวนสมาชิก newsletter** — ตัวชี้วัดหลัก (ผู้ติดตามที่เราเป็นเจ้าของ)
2. จำนวนชิ้นงานที่เผยแพร่ต่อเดือน (วัดความสม่ำเสมอ)
3. ผู้เข้าชมจาก organic search
4. หน้าที่มีคนอ่านมากที่สุด (บอกว่าเสาไหนได้ผล)

> ใช้ Cloudflare Web Analytics ที่ติดตั้งอยู่แล้ว

---

## 3. ขอบเขต

### อยู่ในขอบเขต

ระบบ CMS เขียนเองบน Cloudflare · เนื้อหา 2 ประเภท · สองภาษาแบบผสม · Newsletter + RSS · AI Assistant BYOK · ระบบกราฟ · หน้า public คงดีไซน์เดิม

### **ไม่**อยู่ในขอบเขต (ตัดสินใจแล้ว)

| ตัดออก | เหตุผล |
|---|---|
| ย้ายบทความเก่าจาก Sanity | เป็น demo ทิ้งได้ |
| หน้ารวมโปรเจกต์แยก (`/work` index) | หน้าแรกทำหน้าที่นี้แล้ว |
| หน้า CV/Resume | About ทำหน้าที่นี้ — ตัวเว็บคือผลงาน |
| หน้าเผยแพร่ dataset แยก | Sources ท้ายบทความลิงก์ไปแหล่งข้อมูลแล้ว |
| หน้า hub 3 เสาหลัก (`/category/...`) | ตัดออก — ยอมรับว่าเสียโอกาส topic cluster |
| ระบบคอมเมนต์ | ดูด้านล่าง |
| ระบบ multi-user | ใช้คนเดียว |

**ระบบคอมเมนต์ — ไม่ทำ** เพราะช่องคอมเมนต์ว่างเปล่าให้ผลลบ · ไม่ช่วย SEO · เพิ่มภาระ spam และความรับผิดทางกฎหมาย · newsletter ตอบเป้าหมายตรงกว่า

*ทดแทนด้วย:* บรรทัดท้ายบทความ "พบข้อผิดพลาดหรือมีข้อมูลเพิ่มเติม → อีเมลหาผม" — สำคัญมากสำหรับความน่าเชื่อถือของงานวิเคราะห์ข้อมูล

*กลับมาพิจารณาเมื่อ:* สมาชิก newsletter เกินหลักร้อย หรือมีคนอีเมลมาถกบ่อย

---

## 4. ข้อจำกัดด้านเวลา

| รายการ | ประมาณการ |
|---|---|
| เวลาที่มี | 5-10 ชม./สัปดาห์ (ใช้ 7 เป็นค่ากลาง) |
| งานเขียนเนื้อหาตามเป้า | ~10 ชม./สัปดาห์ |
| ระบบทั้งหมด | ~110-165 ชม. |

**เวลาไม่พอทำทั้งสองอย่างพร้อมกัน** ต้องสลับโหมด

### หลักการวางแผน

> **ความเสี่ยงที่ใหญ่ที่สุดไม่ใช่เรื่องเทคนิค แต่คือใช้เวลา 5 เดือนสร้างระบบแล้วยังไม่ได้เผยแพร่อะไรเลย**

1. ไปให้ถึงจุดที่ "เขียนและเผยแพร่ได้" เร็วที่สุด แล้วเริ่มเขียนทันที
2. หลังจากนั้นสลับโหมด — สัปดาห์ไหนเขียน สัปดาห์ไหนพัฒนา ไม่ทำพร้อมกัน
3. ทุก Phase ต้องใช้งานได้จริงเมื่อจบ ไม่มี Phase ที่ค้างครึ่งๆ
4. ออกแบบ schema เผื่ออนาคตตั้งแต่แรก เพื่อไม่ต้อง migrate

---

## 5. สถานะปัจจุบัน

**Stack:** Astro 7.2.2 · React 19 · Tailwind CSS 4 · Node ≥22.12.0
**Output:** `static` · **CMS:** Sanity (Portable Text, Studio ที่ `/admin`)

```
src/
├── components/
│   ├── portabletext/          ← ผูกกับ Sanity (ต้องรื้อ)
│   │   ├── ArticleBody.astro  PortableTextHeading.astro  PortableTextImage.astro
│   ├── AboutIsland.tsx  AnnouncementBanner.tsx  FloatingNav.tsx
│   ├── HomeIsland.tsx   Navbar.tsx  ScrollRevealText.tsx
│   ├── ShareButton.tsx  TableOfContents.astro
│   └── ui/popover.tsx
├── layouts/Layout.astro       ← โหลดฟอนต์ 3 families (ดูข้อ 11)
├── lib/
│   ├── sanityImage.ts         ← ผูกกับ Sanity (ต้องรื้อ)
│   ├── slugify.ts             ← extractHeadings() อ่าน Portable Text
│   └── utils.ts
├── pages/  index.astro  about.astro  articles/[slug].astro  404.astro
└── styles/global.css          ← token สี/ฟอนต์
```

### ของที่มีอยู่และใช้ต่อได้

**`ai-worker/`** — Worker ชื่อ `ai-assistant-worker` (deploy แล้ว) รองรับ 3 providers:

| Provider | Default model | วิธีเรียก |
|---|---|---|
| `cloudflare` | `@cf/meta/llama-3.1-8b-instruct-fp8` | AI binding (ฟรี) |
| `gemini` | `gemini-3.5-flash-lite` | REST + `GEMINI_API_KEY` |
| `openrouter` | `openai/gpt-4o-mini` | REST + `OPENROUTER_API_KEY` |

Tasks: `title-suggestions` · `auto-excerpt` · `generate-outline` · `seo-optimizer`

**`sanity/components/AIAssistantView.tsx`** — UI เรียก worker (ต้องย้ายออกก่อนลบ Sanity)

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
                            │ (D1 HTTP API)    POST /api/subscribe
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
                   posts / subscribers      รูป + dataset    → Cloudflare AI / Gemini
                   ai_providers / ai_models                  → OpenRouter / เพิ่มได้อีก
                   images
                             │
                   กด Publish → trigger build (ข้อ 6.4) → rebuild (🎯 ยังไม่วัด)
```

### 6.1 แพลตฟอร์ม — Workers ไม่ใช่ Pages

> ✅ **ตรวจแล้ว** กับเอกสาร adapter — https://docs.astro.build/en/guides/integrations-guide/cloudflare/
>
> > "The Astro Cloudflare adapter **no longer supports deployment on Cloudflare Pages**.
> > For the best experience and feature support, you should migrate to Cloudflare Workers."

**เป้าหมาย deployment คือ Cloudflare Workers** (Workers Static Assets เสิร์ฟไฟล์ static)

### 6.2 การเข้าถึง binding ตอน runtime

> ✅ **ตรวจแล้ว: `Astro.locals.runtime` ถูกถอดออกแล้ว**

```js
// ❌ ใช้ไม่ได้แล้ว
const db = Astro.locals.runtime.env.DB;

// ✅ วิธีปัจจุบัน
import { env } from "cloudflare:workers";
const db = env.DB;

// ExecutionContext (เดิม Astro.locals.runtime.ctx)
const ctx = Astro.locals.cfContext;
```

### 6.3 Output mode

> ✅ **ตรวจแล้ว: `output: 'hybrid'` ถูกยกเลิกไปแล้ว**
> https://docs.astro.build/en/guides/on-demand-rendering/

**คง `output: 'static'`** แล้วเพิ่ม adapter `@astrojs/cloudflare` จากนั้น opt-in เฉพาะหน้าที่ต้อง dynamic:

```js
// เฉพาะ src/pages/earth/** และ src/pages/api/** เท่านั้น
export const prerender = false;
```

หน้า public เดิมทุกหน้า**ไม่ต้องแก้ config การ render เลย**

### 6.4 🔴 กลไก trigger build — ต้องออกแบบใหม่

**Deploy Hook เป็นฟีเจอร์ของ Cloudflare Pages** เมื่อย้ายไป Workers กลไก "publish แล้ว rebuild" ทั้งกลไกใช้ไม่ได้

| ทางเลือก | ความมั่นใจ |
|---|---|
| **GitHub Actions + `repository_dispatch`** — `/earth/api/publish` ยิง POST ไป GitHub API → workflow รัน build + `wrangler deploy` | ✅ กลไกมาตรฐาน ใช้ได้แน่ |
| Workers Builds trigger จากภายนอก | ❓ **ต้องตรวจเอง** — ผมไม่ทราบว่ามีกลไกเทียบเท่า Deploy Hook หรือไม่ |

**ข้อนี้ต้องพิสูจน์ใน Phase 0.5 ก่อนเขียนอย่างอื่น** — ถ้า trigger deploy จากภายนอกไม่ได้ สถาปัตยกรรม "static + rebuild-on-publish" ทั้งหมดใช้ไม่ได้

### 6.5 เนื้อหา 2 ประเภท

> **แก้ในฉบับที่ 4:** เดิมห้ามบทความมีกราฟ ซึ่ง**ขัดกับสถาปัตยกรรมของตัวเอง** —
> เหตุผลที่ห้ามคือกลัวหน้าบทความโหลด JS ของกราฟ แต่กราฟระดับ 1 ส่ง JS **0 ไบต์**
> เหตุผลจึงไม่มีอยู่จริง และบทความเศรษฐกิจย่อมได้ประโยชน์จากกราฟประกอบ

| | บทความ (article) | โปรเจกต์ (project) |
|---|---|---|
| รูปแบบ | Markdown **+ กราฟ static ได้** | **MDX** (import component ได้) |
| กราฟ static (ระดับ 1) | ✅ **ได้** | ✅ ได้ |
| กราฟ interactive (ระดับ 2-3) | ❌ ไม่ | **✅ คือหัวใจ** |
| URL | `/articles/[slug]` · `/en/articles/[slug]` | `/work/[slug]` |
| เก็บที่ | D1 คอลัมน์ `body` | D1 คอลัมน์ `body` |
| Component กราฟ | — | อยู่ใน repo (`src/components/viz/`) เป็น**โค้ด** ไม่ใช่**เนื้อหา** |
| ความถี่ | สัปดาห์ละ 1 | เดือนละ 1-2 |

อยู่ในตาราง `posts` เดียวกัน แยกด้วยคอลัมน์ `type` เพื่อให้หน้าแรกดึงมารวมกันได้ด้วย query เดียว

---

## 7. ข้อจำกัดทางเทคนิค

### 7.1 D1 binding ใช้ไม่ได้ตอน build

build container ไม่มี D1 binding — มีเฉพาะ runtime แต่ `getStaticPaths()` ต้องอ่านข้อมูลตอน build

| บริบท | วิธีเข้าถึง |
|---|---|
| Build time | **HTTP API** + API Token — `POST https://api.cloudflare.com/client/v4/accounts/{id}/d1/database/{db}/query` |
| Runtime (`/earth/*`, `/api/*`) | **Binding** — `import { env } from "cloudflare:workers"` แล้วใช้ `env.DB` (ดูข้อ 6.2) |

เขียน `src/lib/db.ts` ห่อทั้งสองไว้ใน interface เดียว

### 7.2 MDX ที่เก็บใน D1 — จุดที่ต้องระวังที่สุด

```
prebuild script:
1. อ่านโปรเจกต์ status='published' จาก D1 ผ่าน HTTP API
2. เขียนลง src/content/projects/{lang}/{slug}.mdx   ← ใส่ .gitignore
3. astro build ทำงานตามปกติ
```

#### นโยบายเมื่อ MDX พัง *(แก้ในฉบับที่ 4 — ดีไซน์เดิมผิด)*

> ❌ **ดีไซน์เดิม: "ข้ามชิ้นที่พังแล้ว deploy ต่อ" — ผิด**
> ถ้าโปรเจกต์ที่**เคยเผยแพร่แล้ว**คอมไพล์ไม่ผ่านในการ build ครั้งถัดไป การข้ามมันหมายความว่า
> หน้านั้น**หายไปจาก deployment ใหม่** → URL ที่เคยใช้ได้กลายเป็น **404** ต่อหน้าผู้อ่านและ Google

> ✅ **นโยบายที่ถูกต้อง: build ล้ม = คงเว็บฉบับที่ใช้งานได้ล่าสุดไว้**
> เมื่อ build ล้ม deployment เดิมยังเสิร์ฟอยู่ ผู้อ่านไม่รู้สึกอะไรเลย — ปลอดภัยกว่าการข้าม

**ด่านป้องกัน 2 ชั้น:**

| ชั้น | ทำอะไร | ขอบเขต |
|---|---|---|
| 1. ตอนกด Publish | ลองคอมไพล์ MDX ก่อน ไม่ผ่าน = ปฏิเสธพร้อมแสดง error | **ด่านช่วยจับปัญหาเบื้องต้นเท่านั้น** — ตรวจไวยากรณ์ได้ แต่ยังไม่รู้ว่า import ครบไหม component มีจริงไหม ข้อมูลใช้ได้ไหม |
| 2. full build | ตรวจ imports · components · ข้อมูลจริง ครบทั้งหมด | **ด่านจริง** — ถ้าไม่ผ่าน หยุด deploy คงของเดิมไว้ แล้วรายงานข้อผิดพลาดให้เห็นใน Portal |

**เกณฑ์ตรวจรับที่ต้องมี:**
- [ ] **จงใจทำโปรเจกต์ที่เผยแพร่แล้วพัง → build ใหม่ล้ม → URL เดิมยังเปิดได้ตามปกติ**
- [ ] Portal แสดงสถานะว่า deploy ล่าสุดล้มเหลว พร้อมข้อความ error

**ข้อจำกัดที่ยอมรับ:** MDX import ได้เฉพาะ component ที่มีใน repo แล้ว — กราฟชนิดใหม่ต้องเขียนโค้ดแล้ว push (แต่นั่นคือ**โค้ด** ไม่ใช่**เนื้อหา** ตรงกับความต้องการ)

### 7.3 Markdown ที่ render ด้วย `marked` — Astro optimize ให้ไม่ได้

`marked` คืน HTML string → ได้ `<img>` ธรรมดา → **Astro image optimization ไม่แตะเลย**
(Astro optimize เฉพาะ `<Image>` component และรูปใน `src/`)

→ การจัดการรูปต้องทำเองทั้งหมด ดูข้อ 12

---

## 8. ความปลอดภัย

### 8.1 🔴 AI Worker เปิดให้ทุกคนเรียกได้

`ai-worker/src/index.js:1-5` ตั้ง `Access-Control-Allow-Origin: "*"` และไม่มี auth — ใครรู้ URL ก็ยิงจนเผา credit ได้

**แก้:** browser เรียกผ่าน `/earth/api/ai/*` (หลัง Access) → server-side endpoint เรียก worker ต่อพร้อม `X-Auth-Secret` → worker ปฏิเสธถ้าไม่มี secret → จำกัด CORS เหลือ `https://frong.me`

### 8.2 🔴 การเก็บ API Key ของ BYOK

1. **เข้ารหัสก่อนเก็บ** — Web Crypto AES-GCM, master key เป็น secret (`ENCRYPTION_KEY`), D1 เก็บแค่ ciphertext
2. **ห้ามส่ง key กลับ browser** — หน้า Settings แสดง mask (`AIza••••4f2c`) write-only
3. **ถอดรหัสฝั่ง server ตอนยิง request เท่านั้น**

### 8.3 🔴 Endpoint สาธารณะ (`/api/subscribe`)

Turnstile · rate limit ต่อ IP · double opt-in · ลิงก์ยกเลิกในทุกอีเมล (PDPA/GDPR) · เก็บเวลาและ IP ที่ยินยอมเป็นหลักฐาน

### 8.4 ทั่วไป

- Upload: ตรวจ MIME + ขนาด **ฝั่ง server** เสมอ ห้ามเชื่อ client
- Markdown/MDX: sanitize ด้วย DOMPurify ก่อน render preview
- `base_url` ของ custom AI provider: ต้องเป็น HTTPS ไม่ใช่ internal address (กัน SSRF)

---

## 9. Database Schema

> ใส่คอลัมน์ `type`, `lang`, `translation_group_id` **ตั้งแต่ Phase 1** แม้ยังไม่ใช้ เพื่อไม่ต้อง migrate

### 🔴 ปัญหาที่ schema เดิมมี *(พบจากการรีวิว — แก้ในฉบับที่ 4)*

Schema เดิมมี `body` เดียวต่อบทความ ขณะที่ editor มี autosave ทุก 30 วินาที เกิดสถานการณ์นี้ได้จริง:

```
1. บทความ A เผยแพร่แล้ว
2. เปิด A มาแก้ → autosave เขียนทับ posts.body ทุก 30 วินาที
3. ยังเขียนไม่เสร็จ แต่กด publish บทความ B
4. Deploy trigger → build อ่าน D1
5. ❌ ได้ร่างครึ่งๆ ของ A ขึ้นเว็บ
```

**ทางแก้: แยก "ฉบับที่กำลังแก้" ออกจาก "ฉบับที่เผยแพร่"** — `posts.body` คือฉบับกำลังแก้
ส่วน build อ่านจาก `post_revisions` ที่ถูก freeze ไว้เท่านั้น ผลพลอยได้คือ **ย้อนเวอร์ชันได้**

```sql
-- ═══════════════════ เนื้อหา (บทความ + โปรเจกต์) ═══════════════════
CREATE TABLE posts (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL DEFAULT 'article',  -- article | project
  lang                 TEXT NOT NULL DEFAULT 'th',       -- th | en
  translation_group_id TEXT,                 -- NULL = ชิ้นเดี่ยว (กรณีปกติ)
  slug                 TEXT NOT NULL,
  -- ── ฉบับกำลังแก้ (autosave เขียนตรงนี้ · build ไม่เคยอ่าน) ──
  title                TEXT NOT NULL,
  body                 TEXT NOT NULL,        -- Markdown (article) | MDX (project)
  excerpt              TEXT,
  cover_image          TEXT,
  cover_position       TEXT,                 -- JSON {"x":50,"y":50,"zoom":1.0}
  tags                 TEXT,                 -- JSON array
  font                 TEXT DEFAULT 'sans',
  -- ── ฉบับที่เผยแพร่ (build อ่านผ่าน id นี้เท่านั้น) ──
  published_revision_id TEXT,                -- NULL = ยังไม่เคยเผยแพร่
  status               TEXT NOT NULL DEFAULT 'draft',    -- draft | published
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  published_at         INTEGER
);
CREATE UNIQUE INDEX idx_posts_slug_lang ON posts(slug, lang);
CREATE INDEX idx_posts_feed  ON posts(status, published_at DESC);
CREATE INDEX idx_posts_group ON posts(translation_group_id);
CREATE INDEX idx_posts_type  ON posts(type, status, published_at DESC);

-- ═════════ ฉบับที่ freeze ไว้ — build อ่านจากตารางนี้เท่านั้น ═════════
CREATE TABLE post_revisions (
  id             TEXT PRIMARY KEY,
  post_id        TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  excerpt        TEXT,
  cover_image    TEXT,
  cover_position TEXT,
  tags           TEXT,
  font           TEXT,
  created_at     INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX idx_revisions_post ON post_revisions(post_id, created_at DESC);

-- ═══════════ สถานะการ deploy — บันทึกลง D1 ≠ ขึ้นเว็บแล้ว ═══════════
CREATE TABLE deployments (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL,   -- queued | building | live | failed
  trigger_post  TEXT,            -- publish ของชิ้นไหนที่ trigger
  error_message TEXT,            -- ข้อความ error เมื่อ failed
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX idx_deployments_time ON deployments(started_at DESC);

-- ═══════════════════════════ รูปภาพ ═══════════════════════════
CREATE TABLE images (
  id         TEXT PRIMARY KEY,
  post_id    TEXT,
  r2_key     TEXT NOT NULL,          -- images/2026/09/01H....webp
  url        TEXT NOT NULL,          -- URL เต็มที่ใช้ใน markdown
  width      INTEGER NOT NULL,       -- ★ จำเป็นสำหรับกัน layout shift
  height     INTEGER NOT NULL,       -- ★
  size       INTEGER,
  format     TEXT DEFAULT 'webp',
  alt        TEXT,                   -- ★ accessibility + SEO
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_images_url ON images(url);

-- ═══════════════════ ชุดข้อมูลสำหรับกราฟ ═══════════════════
CREATE TABLE datasets (
  id          TEXT PRIMARY KEY,
  post_id     TEXT,
  r2_key      TEXT NOT NULL,          -- datasets/2026/09/thai-export.json
  url         TEXT NOT NULL,
  label       TEXT,
  source_url  TEXT,                   -- แหล่งที่มาของข้อมูล (ต้องอ้างอิงเสมอ)
  row_count   INTEGER,
  created_at  INTEGER NOT NULL
);

-- ═══════════════════ สมาชิก newsletter ═══════════════════
CREATE TABLE subscribers (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending|confirmed|unsubscribed
  lang              TEXT NOT NULL DEFAULT 'th',
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
  kind              TEXT NOT NULL,      -- openai-compatible|gemini|anthropic|cloudflare
  base_url          TEXT,
  api_key_encrypted TEXT,               -- AES-GCM ciphertext
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE ai_models (
  id          TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  label       TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_models_unique ON ai_models(provider_id, model_id);
```

---

## 10. Route Map

| Route | Render | Access | หน้าที่ | Phase |
|---|---|---|---|---|
| `/` | static | public | ฟีดรวม | 1 |
| `/articles/[slug]` | static | public | บทความไทย | 1 |
| `/en/articles/[slug]` | static | public | บทความอังกฤษ | 1 |
| `/work/[slug]` | static | public | โปรเจกต์ data viz | 3 |
| `/about` `/404` | static | public | — | มีแล้ว |
| `/rss.xml` | static | public | RSS feed | 1 |
| `POST /api/subscribe` | endpoint | **public** | สมัคร newsletter (+Turnstile) | 4 |
| `GET /api/confirm` · `/api/unsubscribe` | endpoint | **public** | double opt-in / ยกเลิก | 4 |
| `/earth` | `prerender=false` | 🔒 | Portal | 1 |
| `/earth/editor` | `prerender=false` | 🔒 | Editor | 1 |
| `/earth/settings` | `prerender=false` | 🔒 | ตั้งค่า | 5 |
| `POST /earth/api/draft` · `/publish` · `/update` | endpoint | 🔒 | บันทึก/เผยแพร่ | 1 |
| `DELETE /earth/api/post/[id]` | endpoint | 🔒 | ลบ | 1 |
| `POST /earth/api/upload-image` | endpoint | 🔒 | อัปโหลดรูป → R2 | 2 |
| `GET /earth/api/deploy-status` | endpoint | 🔒 | สถานะ deploy ล่าสุด | 1 |
| `POST /earth/api/upload-dataset` | endpoint | 🔒 | อัปโหลดชุดข้อมูล → R2 | 3 |
| `POST /earth/api/send-newsletter` | endpoint | 🔒 | ส่งจดหมายข่าว | 4 |
| `GET/POST/DELETE /earth/api/providers` | endpoint | 🔒 | จัดการ AI providers | 5 |
| `POST /earth/api/ai/[task]` | endpoint | 🔒 | Proxy → ai-assistant-worker | 5 |

---

## 11. ระบบฟอนต์

### 11.1 ผลการตรวจสอบ Google Sans *(ตรวจจริงเมื่อ 2026-09-09)*

| สิ่งที่ตรวจ | ผล |
|---|---|
| มีให้ใช้ผ่าน Google Fonts | ✅ HTTP 200 เสิร์ฟ woff2 จริง |
| **มี subset ภาษาไทย** | ✅ **มี** — 25 subsets รวม `thai` (75 `@font-face` ที่ 3 weights) |
| ขนาด latin subset | **~36 KB** ต่อ weight |
| ขนาด thai subset | **~17 KB** ต่อ weight |

> **ข้อสรุปสำคัญ: ใช้ Google Sans ตัวเดียวได้ทั้งไทยและอังกฤษ**
> ไม่ต้องหาฟอนต์ไทยแยก (เว็บต้นแบบ midgardisnotaplace ต้องโหลด IBM Plex Sans Thai เพิ่มเพราะเลือกฟอนต์อื่น)

### 11.2 ปัญหาในโค้ดปัจจุบัน

`src/layouts/Layout.astro:70` โหลด **3 families พร้อมกัน**

```
Cormorant Garamond (6 weights) + Inter (4) + Google Sans (4)
→ @font-face รวม 158 รายการ · CSS 64.5 KB (ยังไม่นับไฟล์ฟอนต์)
```

`src/styles/global.css:12-14`

```css
--font-serif:       "Cormorant Garamond", Georgia, serif;
--font-sans:        "Inter", system-ui, sans-serif;        /* ← ซ้ำซ้อน */
--font-google-sans: "Google Sans", system-ui, sans-serif;
```

**Inter กับ Google Sans เป็น sans-serif ทั้งคู่ ทำหน้าที่ทับกัน**

### 11.3 แผนที่จะทำ

| การกระทำ | ผล |
|---|---|
| **ตัด Inter ออก** ให้ `--font-sans` ชี้ Google Sans | ลดไป 1 family เต็ม |
| **ลด weight เหลือ 400 / 500 / 700** | ทุก weight คือไฟล์แยกต่อ subset |
| **Cormorant Garamond — ตัดสินใจ** | ถ้ายังใช้ตัวเลือก serif ต่อ เก็บไว้แค่ 400 + 400italic · ถ้าไม่ใช้ ตัดทิ้ง |
| `&display=swap` | มีอยู่แล้ว ✅ |
| `preconnect` ไป gstatic | มีอยู่แล้ว ✅ (`Layout.astro:67-68`) |

**ประมาณการหลังปรับ** (หน้าบทความภาษาไทย):

```
Google Sans thai  ~17 KB × 3 weights = ~51 KB
Google Sans latin ~36 KB × 3 weights = ~108 KB   (เลข ศัพท์อังกฤษ ชื่อเฉพาะ)
─────────────────────────────────────────────
รวมประมาณ ~159 KB  (จากเดิมที่โหลด 3 families)
```

> เบราว์เซอร์โหลดเฉพาะ subset ที่หน้านั้นใช้จริงผ่าน `unicode-range` — หน้าภาษาอังกฤษล้วนจะไม่โหลด subset ไทยเลย

### 11.4 ทางเลือกที่เร็วกว่า — self-host *(ยังไม่ตัดสินใจ)*

ดาวน์โหลด woff2 เฉพาะ subset latin + thai มาไว้ที่ R2 หรือ `public/`

**ข้อดี:** ตัด DNS + TLS handshake ไป `fonts.gstatic.com` ออก 1 hop · คุม cache header เอง · ไม่ขึ้นกับบริการภายนอก
**ข้อเสีย:** ต้องอัปเดตเองเมื่อฟอนต์มีเวอร์ชันใหม่

> ⚠️ **ต้องตรวจ license ของ Google Sans ก่อน self-host** — ผมไม่ทราบเงื่อนไข license ปัจจุบันของฟอนต์ตัวนี้
> การเสิร์ฟผ่าน Google Fonts API เป็นการใช้งานที่ Google เปิดให้ แต่การดาวน์โหลดมาโฮสต์เองเป็นคนละเรื่อง **ต้องอ่าน license เองก่อนทำ**

---

## 12. ระบบรูปภาพ

### 12.1 ข้อจำกัดที่กำหนดทางเลือก

**Astro optimize รูปในบทความให้ไม่ได้** (ข้อ 7.3) เพราะ `marked` คืน HTML string ไม่ใช่ Astro component
→ ต้องจัดการเองทั้งหมด ตั้งแต่แปลงไฟล์ ขนาด จนถึง attribute

**Workers ไม่มี Sharp** — แปลงรูปฝั่ง server ต้องใช้ WASM หรือบริการเสียเงิน

### 12.2 ทางออก — แปลงฝั่งเบราว์เซอร์ก่อนอัปโหลด

Editor ทำงานในเบราว์เซอร์อยู่แล้ว ใช้ Canvas API แปลงก่อนส่ง:

```
ผู้ใช้ลากรูปลง editor
        ↓
1. อ่านไฟล์ → วาดลง <canvas>
2. ย่อให้กว้างสุด 1600px (รักษาสัดส่วน)
3. canvas.toBlob(blob => ..., 'image/webp', 0.82)
4. อัปโหลด blob (WebP แล้ว) → POST /earth/api/upload-image
5. Worker: ตรวจ MIME + ขนาด (ฝั่ง server อีกชั้น) → เก็บ R2
6. บันทึกลง images: url, width, height, alt
7. แทรก ![alt](url) ลง markdown
```

**ข้อดี:** ต้นทุน 0 บาท · ไม่ต้องใช้ WASM หรือบริการเสียเงิน
🎯 **เป้า:** JPEG ขนาดใหญ่ควรเหลือ ~150-250 KB — **ยังไม่ได้วัดกับไฟล์จริง ต้องวัดใน Phase 2 แล้วบันทึกตัวเลขจริงกลับมา**
**ข้อเสีย:** ขึ้นกับเบราว์เซอร์ (Chrome/Edge/Firefox รุ่นใหม่รองรับ WebP encode) · คุมคุณภาพเอง

### 12.3 การจัดระเบียบใน R2

```
images/{ปี}/{เดือน}/{ulid}.webp      เช่น images/2026/09/01HQ8F....webp
datasets/{ปี}/{เดือน}/{ulid}.json
```

จัดกลุ่มตามเวลา · ULID เรียงตามเวลาโดยธรรมชาติและไม่ชนกัน · ไม่ใช้ชื่อไฟล์เดิมของผู้ใช้ (กันอักขระแปลกและชื่อซ้ำ)

### 12.4 เติม attribute ตอน build — กัน layout shift

หลัง `marked` render เสร็จ ทำ post-process:

```
1. ตอน build: query images ทั้งหมด → สร้าง Map<url, {width, height, alt}>
2. หา <img src="..."> ใน HTML ที่ได้
3. เติม width / height / loading / decoding
```

| Attribute | ค่า | เหตุผล |
|---|---|---|
| `width` `height` | จาก DB | **กัน CLS** — เบราว์เซอร์จองพื้นที่ได้ก่อนรูปโหลด |
| `loading` | `lazy` | ยกเว้นรูปปก |
| `decoding` | `async` | ไม่บล็อกการ render |
| `alt` | จาก DB | accessibility + SEO |

**รูปปก (LCP element) ต่างออกไป:**

```html
<img loading="eager" fetchpriority="high" decoding="sync" ...>
```

> ❌ **ห้าม `loading="lazy"` กับรูปปก** — เป็นความผิดพลาดที่ทำให้คะแนน LCP แย่ลงอย่างชัดเจน

### 12.5 บังคับกรอก alt text

Editor ต้องเตือนถ้าแทรกรูปโดยไม่มี alt — มีผลทั้งกับ:
- ผู้ใช้ screen reader
- SEO (Google ใช้ alt เข้าใจเนื้อหารูป)
- กรณีรูปโหลดไม่ขึ้น

### 12.6 ยังไม่ทำตอนนี้ — `srcset`

รูปเดียวขนาด 1600px WebP เพียงพอสำหรับช่วงแรก · ถ้าวัดแล้วมือถือช้าค่อยเพิ่มทีหลัง (อัปโหลด 3 ขนาด: 640 / 1280 / 1920 แล้วใส่ `srcset`)

**ทางเลือกที่ต้องตรวจสอบเอง:** Cloudflare Image Resizing / Cloudflare Images แปลงขนาดผ่าน URL ได้โดยไม่ต้องเก็บหลายไฟล์ — แต่**ผมไม่ทราบว่าต้องใช้ plan ระดับไหนและราคาปัจจุบันเท่าไร ต้องเช็คเอง**

---

## 13. ระบบกราฟและ data visualization

> ส่วนนี้คือหัวใจของแบรนด์ — สิ่งที่ทำให้เว็บนี้ต่างจากบล็อกทั่วไป

### 13.1 หลักการ — 3 ระดับ

**กฎการเลือกระดับ:** ถามว่า *"ผู้อ่านต้องคลิก ลาก หรือเลือกอะไรไหม"* ถ้าตอบว่าไม่ → ใช้ระดับ 1 เสมอ

| ระดับ | วิธี | JS ที่ส่งให้เบราว์เซอร์ | ใช้เมื่อ |
|---|---|---|---|
| **1** | **SVG สร้างตอน build** | **0 ไบต์** | กราฟส่วนใหญ่ (~80%) |
| 2 | Island + `client:visible` | เฉพาะตอน scroll ถึง | ต้อง filter / zoom / สลับข้อมูล |
| 3 | Scrollytelling | เฉพาะตอน scroll ถึง | เล่าเรื่องยาวที่กราฟเปลี่ยนตามเนื้อหา |

### 13.2 ระดับ 1 — SVG ตอน build *(ค่าเริ่มต้น)*

Astro component (`.astro`) รันตอน build แล้ว output inline SVG ลง HTML ตรงๆ

```
ใช้ d3-scale + d3-shape + d3-array   ← import เฉพาะ module ที่ใช้
    ↓ (รันตอน build เท่านั้น)
inline <svg> ใน HTML                 ← ผู้อ่านไม่ต้องโหลด JS เลย
```

**ข้อดีที่ได้ทั้งหมด:**

| ผลดี | รายละเอียด |
|---|---|
| เร็วที่สุด | ไม่มี JS ให้ดาวน์โหลด parse หรือ execute |
| CLS = 0 | SVG มีขนาดแน่นอนตั้งแต่ HTML มาถึง |
| ทำงานแม้ปิด JS | กราฟยังแสดงผลปกติ |
| **⭐ SEO** | **ข้อความใน inline SVG เป็นข้อความจริง Google อ่านและ index ได้** — label ในกราฟกลายเป็นเนื้อหาที่ค้นเจอ |
| พิมพ์/บันทึกได้ | หน้าพิมพ์ออกมาแล้วกราฟยังอยู่ |

**Interactivity ที่ยังทำได้โดยไม่ใช้ JS:**
- hover เน้นแท่ง/เส้น → CSS `:hover`
- tooltip พื้นฐาน → `<title>` ใน SVG (เบราว์เซอร์แสดงเอง)

### 13.3 ระดับ 2 — Island เมื่อจำเป็นจริง

```astro
<InteractiveChart data={data} client:visible />
```

`client:visible` ทำให้ hydrate เมื่อ scroll มาถึงเท่านั้น

> ❌ **ห้ามใช้ `client:load` กับกราฟ** — จะโหลดไลบรารีทันทีที่เปิดหน้า แม้กราฟอยู่ท้ายบทความ

**ห้ามหน้าบทความโหลดไลบรารีกราฟ** — บทความไม่มีกราฟตามที่ตกลงกัน ต้องตรวจว่า bundle ของหน้าบทความไม่มีโค้ดกราฟติดไปด้วย

### 13.4 ข้อมูลอยู่ที่ไหน

| ขนาด | เก็บที่ | ดึงเมื่อไร |
|---|---|---|
| เล็ก (< ~500 แถว) | ฝังใน MDX ตรงๆ | — |
| ใหญ่ | JSON/CSV ใน R2 (ตาราง `datasets`) | **ตอน build** ไม่ใช่ runtime |

> ❌ **ห้าม fetch ข้อมูลตอน runtime สำหรับกราฟที่ต้องแสดงทันที** — ทำให้กราฟกระพริบและเกิด layout shift

**ต้องบันทึก `source_url` ของทุก dataset เสมอ** — งานวิเคราะห์ข้อมูลที่ไม่อ้างแหล่งที่มาไม่มีความน่าเชื่อถือ และการอ้างอิงชัดเจนคือสิ่งที่แยกงานคุณออกจากกราฟลอยๆ ในโซเชียล

### 13.5 ชุด component ที่ควรสร้าง (ตามลำดับ)

| ลำดับ | Component | เหตุผล |
|---|---|---|
| 1 | **BarChart** (แนวนอน/ตั้ง) | ใช้บ่อยที่สุด เปรียบเทียบขนาด |
| 2 | **LineChart** | ข้อมูลตามเวลา |
| 3 | **StatTile / hero number** | บางครั้งตัวเลขเดียวสื่อสารดีกว่ากราฟ |
| 4 | **DataTable** | ข้อมูลดิบ + **เป็น accessibility fallback ของทุกกราฟ** |
| 5 | **ChoroplethMap ประเทศไทย** | ⭐ **จุดต่างที่ชัดที่สุดของเสาที่ 1** — ต้องใช้ TopoJSON ขอบเขตจังหวัด |
| 6 | ScatterPlot | หาความสัมพันธ์ |
| 7 | AreaChart / stacked | องค์ประกอบที่เปลี่ยนตามเวลา |

> แผนที่จังหวัดไทยคือสิ่งที่ทำให้คนจำได้ว่า "เว็บนี้ทำข้อมูลไทย" — ควรทำให้ดีและใช้ซ้ำได้

### 13.6 มาตรฐานการออกแบบกราฟ *(ทำให้งานทุกชิ้นดูเป็นชุดเดียวกัน)*

ความสม่ำเสมอของภาพคือสิ่งที่ทำให้คนจำแบรนด์ได้ กฎเหล่านี้ใช้กับกราฟทุกชิ้น:

**เรื่องสี**

| กฎ | รายละเอียด |
|---|---|
| ลำดับสีเชิงหมวดหมู่**ตายตัว ห้ามวนซ้ำ** | series ที่ 9 ต้องยุบเป็น "อื่นๆ" หรือแยกกราฟ ไม่ใช่สร้างสีใหม่ |
| **สีผูกกับตัวตนของข้อมูล ไม่ใช่อันดับ** | กรองข้อมูลแล้วสีของ series ที่เหลือต้องไม่เปลี่ยน |
| sequential (ปริมาณ) | **สีเดียว อ่อน→เข้ม** ห้ามรุ้ง |
| diverging (สองขั้ว) | **2 สี + เทากลาง** ห้ามใช้สีสดตรงกลาง |
| สีสถานะ (ดี/เตือน/วิกฤต) | สงวนไว้ ห้ามเอามาใช้เป็น "series ที่ 4" และต้องมีไอคอน+ข้อความกำกับ ไม่ใช้สีอย่างเดียว |
| ข้อความ | ใช้สีข้อความ (primary/secondary/muted) **ไม่ใช่สีของ series** |
| **ตรวจด้วยสคริปต์ ไม่ใช่กะเอา** | ต้องรัน validator ตรวจว่าคนตาบอดสีแยกออก — มีสคริปต์ให้ในชุดแนวทาง dataviz |

**เรื่องรูปแบบ**

- **ห้ามกราฟ 2 แกน y เด็ดขาด** — เป็นความผิดพลาดอันดับ 1 ของการทำกราฟ ถ้ามี 2 หน่วยที่สเกลต่างกัน ให้แยกเป็น 2 กราฟ หรือ index ให้ฐานเดียวกัน
- เส้นบาง · grid และแกนสีจาง · ไม่เด่นกว่าข้อมูล
- legend เมื่อมี ≥2 series · ถ้า ≤4 series ให้ label ตรงที่เส้น/แท่งด้วย (ไม่พึ่งสีอย่างเดียว)
- ไม่ใส่ตัวเลขบนทุกจุด — เลือกเฉพาะจุดที่มีความหมาย
- **dark mode ต้องเลือกสีใหม่ ไม่ใช่กลับสีอัตโนมัติ**
- ทุกกราฟควรมีทางเลือกดูเป็นตาราง (accessibility)

**palette ควรต่อยอดจาก token ที่มีอยู่แล้วใน `src/styles/global.css`** เพื่อให้กราฟดูเป็นส่วนหนึ่งของเว็บ ไม่ใช่ของแปลกปลอม

### 13.7 การเลือกไลบรารี — ความเห็นและเหตุผล

| ตัวเลือก | ขนาด | ข้อดี | ข้อเสีย |
|---|---|---|---|
| **d3-scale + d3-shape** *(แนะนำ)* | เล็กมาก และ**เป็น 0 เมื่อรันตอน build** | ควบคุมรูปแบบได้ 100% · เรียนรู้พื้นฐานจริง · เข้ากับระดับ 1 พอดี | เขียนเองมากกว่าตอนแรก |
| Observable Plot | กลาง | เขียนเร็ว API สั้น | ต้องมี DOM — ถ้าจะ render ตอน build ต้องใช้ jsdom เพิ่มความซับซ้อน |
| Recharts | ใหญ่ | ใช้ง่ายถ้าคุ้น React | ต้องมี React ทำงานฝั่ง client เสมอ = ใช้ระดับ 1 ไม่ได้ |
| ECharts / Chart.js | ใหญ่มาก | ครบเครื่อง | หนัก · หน้าตาเป็นสไตล์ของไลบรารี ไม่ใช่ของคุณ |

**แนะนำ: `d3-scale` + `d3-shape` เขียน component เอง** เพราะ

1. เข้ากับสถาปัตยกรรมระดับ 1 (build-time SVG) ได้พอดี — ไลบรารีตัวอื่นบังคับให้รันฝั่ง client
2. **หน้าตากราฟคือแบรนด์ของคุณ** — ใช้ไลบรารีสำเร็จรูปแล้วกราฟจะหน้าตาเหมือนคนอื่นทั้งอินเทอร์เน็ต
3. คุณกำลังจะเรียน ป.โท ด้าน Data Science — การเข้าใจว่า scale/axis/path ทำงานยังไงเป็นทักษะที่ใช้ได้ตลอด
4. ลงแรงมากในกราฟ 2-3 ตัวแรก หลังจากนั้นกลายเป็นชุด component ที่ใช้ซ้ำได้

**ยอมรับตามตรง:** ตัวเลือกนี้ใช้เวลาต่อกราฟมากกว่าในช่วงแรก ถ้าเป้าหมายคือออกงานให้เร็วที่สุดโดยไม่สนหน้าตา Observable Plot จะเร็วกว่า

---

## 14. SEO

### 14.1 พื้นฐานที่ต้องมีตั้งแต่ Phase 1

- `<title>` + `<meta name="description">` จาก title/excerpt
- **Canonical URL** ทุกหน้า
- **Open Graph + Twitter Card** (มีบางส่วนแล้วใน `Layout.astro`) — OG image ควรขนาด 1200×630 และเป็น absolute URL
- **JSON-LD `Article`** — headline, datePublished, dateModified, author, image
- **Sitemap** — มี `@astrojs/sitemap` แล้ว ต้องครอบคลุมทั้ง `/articles/*` และ `/work/*`
- URL slug อังกฤษ ตัวพิมพ์เล็ก คั่นด้วย `-`

### 14.2 ภาษาแบบผสม

| กรณี | สิ่งที่ต้องทำ |
|---|---|
| ทุกหน้า | `<html lang="th">` หรือ `"en"` ให้ตรงเนื้อหา — **เพื่อ screen reader** (ดูหมายเหตุด้านล่าง) |
| ทุกหน้า | canonical ชี้ที่ตัวเอง |
| ชิ้นเดี่ยว (ปกติ) | **ไม่ต้องใส่ `hreflang` เลย** |
| มีคู่แปล (ยกเว้น) | ใส่ `hreflang` ทั้งคู่ + `x-default` ชี้เวอร์ชันไทย |

> ⚠️ **ห้ามใส่ `hreflang` ชี้หน้าที่ไม่มีอยู่** — Search Console จะรายงานเป็น error
> ต้องเช็คว่าคู่แปล `status='published'` จริง

#### 🔴 แก้ข้อมูลผิดจากฉบับก่อน — Google ไม่ได้ใช้ `lang` หรือ URL

ฉบับที่ 3 เขียนว่า `<html lang>` เป็น "สัญญาณหลักที่ Google ใช้ระบุภาษา สำคัญกว่า URL" — **ผิด**

> ✅ **ตรวจแล้ว** กับเอกสาร Google Search Central:
> https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
>
> > "Google uses the **visible content** of your page to determine its language.
> > **We don't use any code-level language information such as `lang` attributes, or the URL.**"

**สิ่งที่เปลี่ยนไปจากข้อเท็จจริงนี้:**

| ประเด็น | เดิมเข้าใจว่า | ความจริง |
|---|---|---|
| `<html lang>` | สัญญาณหลักต่อ Google | Google ไม่ใช้เลย — **แต่ยังต้องใส่ให้ถูกเพราะ screen reader ใช้ออกเสียงตามภาษา** |
| `/en/` prefix | ช่วย SEO ระบุภาษา | **ไม่มีคุณค่าทาง SEO สำหรับระบุภาษา** — คุณค่าจริงคือความชัดเจนเชิงโครงสร้าง และใช้อ้างใน `hreflang` |
| `hreflang` | — | ยังมีประโยชน์จริง แต่เป็น**การประกาศความสัมพันธ์ระหว่างเวอร์ชัน** คนละเรื่องกับการที่ Google *ระบุ* ภาษาของหน้า |

**ข้อสรุปเชิงปฏิบัติ:** ทำเหมือนเดิมทุกอย่าง แต่**อย่าคาดหวังผล SEO จาก `lang` หรือโครงสร้าง URL** — สิ่งที่กำหนดว่า Google เข้าใจว่าหน้าเป็นภาษาอะไรคือเนื้อหาที่มองเห็นเท่านั้น

**ผลดีของภาษาแบบผสม:** ไม่มีหน้าที่แปลลวกๆ มาฉุดคุณภาพเฉลี่ยของเว็บ

### 14.3 ข้อได้เปรียบจากการเลือก SVG ตอน build

ข้อความในกราฟ (หัวข้อ label แกน ชื่อจังหวัด ตัวเลข) เป็นข้อความจริงใน HTML → **Google index ได้** ซึ่งเป็นข้อได้เปรียบที่กราฟแบบ canvas หรือรูปภาพไม่มี

### 14.4 ข้อแลกเปลี่ยนที่ยอมรับแล้ว

**ไม่มีหน้า hub 3 เสาหลัก** — Google จะไม่มีหน้าศูนย์กลางให้เข้าใจความเชี่ยวชาญ ทำให้สร้าง topical authority ช้ากว่าที่ควร

*ชดเชยด้วย:* internal link ระหว่างบทความหัวข้อเดียวกันให้แน่น + เขียน About ระบุความเชี่ยวชาญ 3 ด้านชัดเจน

---

## 15. ความเร็วเว็บไซต์

พื้นฐานดีอยู่แล้ว (static + CDN) จุดที่จะทำให้ช้ามี 3 จุด เรียงตามผลกระทบ

| # | จุด | มาตรการ | อ้างอิง |
|---|---|---|---|
| 1 | **ฟอนต์** | ใช้ Google Sans ตัวเดียว · ตัด Inter · ลดเหลือ 3 weights · `display=swap` · `preconnect` | ข้อ 11 |
| 2 | **รูปภาพ** | WebP แปลงฝั่ง browser · ระบุ width/height ทุกรูป · lazy ยกเว้นรูปปก | ข้อ 12 |
| 3 | **JS ของกราฟ** | ระดับ 1 ส่ง JS 0 ไบต์ · ระดับ 2 ใช้ `client:visible` · หน้าบทความไม่โหลดไลบรารีกราฟ | ข้อ 13 |

### เกณฑ์ที่ควรตั้งไว้

| ตัวชี้วัด | เป้า | จุดที่มักพัง |
|---|---|---|
| **LCP** | < 2.5 วินาที | รูปปก — ต้อง `fetchpriority="high"` ห้าม lazy |
| **CLS** | < 0.1 | รูปไม่มี width/height · ฟอนต์สลับแล้วข้อความขยับ |
| **INP** | < 200 มิลลิวินาที | กราฟ interactive ที่ hydrate หนักเกิน |

**วัดผล:** Cloudflare Web Analytics (ติดตั้งแล้ว) ดู Core Web Vitals แยกตามหน้า → เทียบหน้าโปรเจกต์กับหน้าบทความ ถ้าต่างกันมากแปลว่ากราฟหนักเกินไป

---

## 16. แผนการพัฒนาแบ่งตาม Phase

### สรุปภาพรวม

> 🎯 ชั่วโมงทั้งหมดเป็น**ค่าคาดการณ์** ยังไม่ได้วัดจากงานจริง — ปรับตามความเป็นจริงเมื่อจบแต่ละ Phase

| Phase | ชื่อ | ชม. | ~สัปดาห์ | จบแล้วทำอะไรได้ |
|---|---|---|---|---|
| **0** | **ปิดช่องโหว่ + เตรียม Infrastructure** | **4-6** | **1** | **AI worker ปลอดภัย** |
| **0.5** | **ต้นแบบพิสูจน์สถาปัตยกรรม** ⭐ | **6-10** | **1-1.5** | **รู้ว่าสถาปัตยกรรมใช้ได้จริงหรือไม่** |
| 1 | MVP — เขียนและเผยแพร่บทความได้ | 32-46 | 5-6.5 | **เริ่มเขียนบทความได้จริง** |
| **2** | **รูปภาพ + ฟอนต์ + บทวิเคราะห์จริงชิ้นแรก** ⭐ | **16-24** | **2.5-3.5** | **มีผลงานที่เป็นจุดขายขึ้นเว็บแล้ว** |
| 3 | โปรเจกต์ MDX + กราฟ interactive | 20-28 | 3-4 | เผยแพร่งาน scrollytelling ได้ |
| 4 | Newsletter (ครบชุดในทีเดียว) | 14-20 | 2-3 | รับสมัคร–ยืนยัน–ส่ง–ยกเลิก ครบ |
| 5 | AI Assistant + BYOK | 18-26 | 2.5-4 | มีผู้ช่วย AI ในหน้าเขียน |
| 6 | ค้นหา + แบ่งหน้า | 8-12 | 1-1.5 | รองรับเนื้อหาจำนวนมาก |
| — | **รวม** | **~118-172** | **~18-25** | |

**การเปลี่ยนลำดับในฉบับที่ 4:**

| เปลี่ยน | เหตุผล |
|---|---|
| เพิ่ม **Phase 0.5 ต้นแบบ** | สถาปัตยกรรมเปลี่ยนไป Workers และกลไก trigger build ยังไม่ยืนยัน — ต้องพิสูจน์ก่อนลงแรง 40 ชม. |
| **ปิดช่องโหว่ AI worker → Phase 0** | มันเปิดอยู่จริงตอนนี้ ไม่ควรรอ Phase 5 |
| **บทวิเคราะห์จริง → Phase 2** | เดิมงานที่เป็นจุดขายอยู่ปลาย Phase 3 (~71-102 ชม.) นานเกินไป |
| **Newsletter → ครบชุดใน Phase 4** | เดิมเปิดฟอร์ม Phase 1 แต่ยกเลิกไม่ได้จนถึง Phase 4 — เป็นปัญหาทั้ง UX และ PDPA |
| **สำรองข้อมูล → Phase 1** | เนื้อหาทั้งหมดอยู่ D1 ที่เดียว ไม่มี export = จุดล้มเหลวจุดเดียว |

---

### Phase 0 — ปิดช่องโหว่ + เตรียม Infrastructure

#### 0A. 🔴 ปิดช่องโหว่ AI Worker — ทำก่อนอย่างอื่นทั้งหมด

Worker เปิดให้ใครก็เรียกได้อยู่**ตอนนี้** ไม่ควรรอ Phase 5

1. เพิ่มตรวจ header `X-Auth-Secret` ใน `ai-worker/src/index.js` — ไม่ตรง = ปฏิเสธ
2. จำกัด CORS จาก `*` เหลือ `https://frong.me`
3. `wrangler secret put AI_WORKER_SECRET` แล้ว `wrangler deploy`
4. แก้ `AIAssistantView.tsx` ให้ส่ง header (หรือปิดการใช้งานไปเลยถ้าจะลบ Sanity อยู่แล้ว)

**เกณฑ์ตรวจรับ:** `curl` ไปที่ worker โดยไม่มี secret → ถูกปฏิเสธ

#### 0B. เตรียม Infrastructure *(ทำใน Dashboard)*

| # | งาน | ผลลัพธ์ |
|---|---|---|
| 1 | D1 database `portfolio-db` | `database_id` |
| 2 | R2 bucket `portfolio-images` + public domain | Public URL |
| 3 | Zero Trust → Access → Applications → Self-hosted<br>`frong.me` path `/earth*` · allow เฉพาะอีเมลตัวเอง | `/earth` ต้อง login |
| 4 | **GitHub token สำหรับ `repository_dispatch`** (แทน Deploy Hook เดิม) | Token trigger build |
| 5 | API Token สิทธิ์ `D1:Edit` | Token สำหรับ build-time |
| 6 | Turnstile site key/secret | ใช้ตอน Phase 4 |

```
# Environment variables
CF_ACCOUNT_ID · CF_D1_DATABASE_ID · CF_API_TOKEN
GITHUB_DISPATCH_TOKEN · GITHUB_REPO       # trigger build (แทน DEPLOY_HOOK_URL)
AI_WORKER_URL · AI_WORKER_SECRET          # Phase 0A
ENCRYPTION_KEY                            # Phase 5
TURNSTILE_SECRET_KEY · PUBLIC_TURNSTILE_SITE_KEY · RESEND_API_KEY   # Phase 4
```

---

### Phase 0.5 — ต้นแบบพิสูจน์สถาปัตยกรรม ⭐

> **เหตุผล:** สถาปัตยกรรมเปลี่ยนจาก Pages เป็น Workers และกลไก trigger build ยัง ❓ ไม่ยืนยัน
> ถ้าข้อใดข้อหนึ่งใน 5 ข้อนี้ทำไม่ได้ แผนทั้งหมดต้องเปลี่ยน — **ต้องรู้ก่อนลงแรง 40 ชั่วโมงใน Phase 1**

ทำเป็นโปรเจกต์เล็กแยกหรือ branch ทดลอง ไม่ต้องสวย ไม่ต้องมี CMS

**5 ข้อที่ต้องพิสูจน์:**

- [ ] 1. หน้า static (`prerender = true`) build แล้ว deploy ขึ้น **Workers** ได้จริง
- [ ] 2. หน้า dynamic (`prerender = false`) อ่าน D1 ได้ผ่าน `import { env } from "cloudflare:workers"`
- [ ] 3. **Cloudflare Access กัน path `/earth*` ได้จริงบน Workers** (ไม่ใช่แค่บน Pages)
- [ ] 4. build script อ่าน D1 ผ่าน **HTTP API** ได้ (จำลอง `getStaticPaths`)
- [ ] 5. 🔴 **trigger deploy จากภายนอกได้จริง** — ยิง `repository_dispatch` แล้ว build+deploy ทำงานอัตโนมัติ

**ข้อ 5 สำคัญที่สุด** — ถ้าทำไม่ได้ สถาปัตยกรรม "static + rebuild-on-publish" ทั้งหมดใช้ไม่ได้ ต้องกลับไปพิจารณา SSR

**บันทึกผลลัพธ์กลับเข้าเอกสารนี้** โดยเฉพาะ:
- เวลา build จริง (แทนที่ตัวเลข 🎯 30-60 วินาที)
- คำสั่งและ config ที่ใช้ได้จริง

---

### Phase 1 — MVP: เขียนและเผยแพร่ได้ ⭐

> **เป้าหมายเดียว: ไปให้ถึงจุดที่เขียนบทความแล้วกด Publish แล้วขึ้นเว็บจริง**

1. ติดตั้ง `@astrojs/cloudflare` (คง `output: 'static'`)
2. สร้าง D1 schema **ครบทุกตารางตามข้อ 9** แม้ยังไม่ใช้
3. `src/lib/db.ts` — ห่อ HTTP API (build) + binding (runtime)
4. `MarkdownBody.astro` แทน `ArticleBody.astro` — **ใช้ CSS/typography เดิมทุกคลาส**
5. แก้ `extractHeadings()` ให้ parse heading จาก Markdown — **ดูกฎในข้อ 19.3 ก่อนเขียน** (บั๊กเดิมจะกลับมาถ้าไม่ระวัง)
6. `index.astro` + `articles/[slug].astro` ดึงจาก D1
7. ถอด Sanity ออกทั้งหมด
   - ⚠️ **ก่อนลบ** คัดลอก logic ของ `AIAssistantView.tsx` เก็บไว้ (ใช้ Phase 5)
8. Portal `/earth` — รายการ draft/published แบบเรียบง่าย
9. Editor `/earth/editor` — title, slug, body, excerpt, cover URL (**พิมพ์ URL เท่านั้น**), tags, บันทึกร่าง, เผยแพร่
10. Auto-save: localStorage (1 วิ) + server (30 วิ) + `sendBeacon` ตอนปิดหน้า
    → **เขียนลง `posts` (ฉบับกำลังแก้) เท่านั้น ห้ามแตะ `post_revisions`**
11. **Publish = สร้าง revision ใหม่ + ชี้ `published_revision_id` + trigger build** (ดูข้อ 9)
12. **แสดงสถานะ deploy ใน Portal** — `queued / building / live / failed` พร้อมข้อความ error
13. **RSS feed** (`@astrojs/rss` — ~1 ชม.)
14. **สองภาษาแบบผสม (~4 ชม.)** — dropdown เลือกภาษา · route `/en/articles/[slug]` · `<html lang>` · ป้าย `EN` ในฟีด
15. **SEO พื้นฐาน** — canonical, OG, JSON-LD Article, sitemap ครอบคลุม
16. **🔴 สำรองข้อมูล + ทดลองกู้คืน** *(ย้ายขึ้นมาจากอนาคต)*
    - สคริปต์ export ทุกตารางจาก D1 เป็น JSON + รายการไฟล์ใน R2
    - **ต้องทดลองกู้คืนจริงหนึ่งครั้ง** ไม่ใช่แค่เขียนสคริปต์ไว้ — export ที่กู้ไม่ได้ไม่ใช่ backup
    - รันเก็บไว้ทุกครั้งที่เผยแพร่บทความใหม่ (หรือทุกสัปดาห์)

**ตัดออก (อย่าเผลอทำ):** AI panel · BYOK · จับคู่คำแปล · โปรเจกต์ MDX · กราฟ · อัปโหลดรูป · **ฟอร์มสมัคร newsletter** · ค้นหา · แบ่งหน้า · คอมเมนต์ · emoji/slash command/zen mode

> **ทำไมตัดฟอร์ม newsletter ออกจาก Phase 1:** เดิมวางไว้ว่า "เก็บอีเมลก่อน ค่อยส่งทีหลัง"
> แต่ PDPA ให้สิทธิ์ถอนความยินยอม — เก็บอีเมลโดยยังไม่มีปุ่มยกเลิกคือรับข้อมูลไว้โดยไม่มีช่องทางให้ถอนตัว
> **ทำครบชุดใน Phase 4 หรือยังไม่เปิดฟอร์ม**

**เกณฑ์ตรวจรับ:**

- [ ] `npm run build` ผ่าน
- [ ] เข้า `/earth` โดยไม่ login (incognito) → ถูกปฏิเสธที่ edge
- [ ] เขียนบทความ → Publish → ภายใน ~60 วินาที ขึ้นที่ `/articles/[slug]`
- [ ] **หน้าบทความเหมือนเดิมทุกจุด** เทียบกับ screenshot ก่อนแก้
- [ ] ปิดเบราว์เซอร์กลางคัน → เปิดใหม่ข้อมูลยังอยู่
- [ ] `/rss.xml` เปิดได้และมีบทความ
- [ ] บทความอังกฤษขึ้นที่ `/en/articles/[slug]` และ `<html lang="en">` ถูกต้อง
- [ ] ไม่มี dependency ของ Sanity เหลือ
- [ ] **🔴 ทดสอบร่างไม่รั่ว:** เผยแพร่บทความ A → เปิด A มาแก้ทิ้งไว้ให้ autosave ทำงาน → เผยแพร่บทความ B → **หน้า A บนเว็บต้องยังเป็นฉบับเดิม ไม่ใช่ร่างที่กำลังแก้**
- [ ] Portal แสดงสถานะ deploy ได้ถูกต้องทั้งกรณีสำเร็จและล้มเหลว
- [ ] **กู้คืนจาก backup สำเร็จจริง 1 ครั้ง** (ลองสร้าง D1 เปล่าแล้ว restore เข้าไป)

> 🎯 **จบ Phase 1 = เริ่มเขียนสัปดาห์ละชิ้นทันที อย่ารอ Phase อื่น**

---

### Phase 2 — รูปภาพ + ฟอนต์ + บทวิเคราะห์จริงชิ้นแรก ⭐

> **เป้าหมายของ Phase นี้ไม่ใช่ "ระบบเสร็จ" แต่คือ "มีบทวิเคราะห์จริงที่มีกราฟขึ้นเว็บแล้ว 1 ชิ้น"**
>
> เดิมงานที่เป็นจุดขายอยู่ปลาย Phase 3 (~71-102 ชม. หรือ 10-15 สัปดาห์) ซึ่งนานเกินไปสำหรับ
> เป้าหมาย personal brand — คนจะจำคุณจากงานวิเคราะห์ ไม่ใช่จากบทความตัวหนังสือล้วน

**สร้างเฉพาะ component ที่บทความชิ้นแรกใช้จริง** ไม่ต้องสร้างชุดกราฟให้ครบ

**ฟอนต์ (~2 ชม.)**
1. ตัด Inter ออกจาก `Layout.astro:70` และ `global.css`
2. `--font-sans` ชี้ Google Sans
3. ลด weight เหลือ 400/500/700
4. ตัดสินใจเรื่อง Cormorant Garamond (เก็บ 400+italic หรือตัดทิ้ง)

**รูปภาพ (~8-12 ชม.)**
1. Editor: แปลง WebP + ย่อ 1600px ฝั่ง browser ก่อนอัปโหลด (ข้อ 12.2)
2. `POST /earth/api/upload-image` → validate ฝั่ง server → R2 → บันทึก `images`
3. Drag & drop + แทรก markdown อัตโนมัติ + **บังคับกรอก alt**
4. Post-process ตอน build เติม `width`/`height`/`loading`/`decoding` (ข้อ 12.4)
5. รูปปก: `fetchpriority="high"` ห้าม lazy
6. ปรับตำแหน่ง/zoom รูปปก

**กราฟชุดขั้นต่ำ (~6-10 ชม.)**
1. **ตัดสินใจ palette ก่อนเขียนกราฟตัวแรก** แล้วรัน validator ตรวจ (ข้อ 13.6)
   → แม้จะสร้างแค่กราฟเดียว ก็ต้องกำหนด palette ก่อน ไม่งั้นกราฟชิ้นที่ 2 จะสีไม่เข้ากันแล้วต้องกลับมาแก้ทั้งหมด
2. สร้าง**เฉพาะ component ที่บทความชิ้นแรกต้องใช้** (น่าจะเป็น BarChart หรือ LineChart อย่างใดอย่างหนึ่ง)
3. ทำให้ Markdown ของบทความ import component กราฟได้ (บทความมีกราฟ static ได้ตามข้อ 6.5)

**เขียนและเผยแพร่บทวิเคราะห์จริง 1 ชิ้น** — งานเขียน ไม่ใช่งานโค้ด แต่เป็นผลลัพธ์ที่วัดความสำเร็จของ Phase นี้

**เกณฑ์ตรวจรับ:**
- [ ] ลากรูป JPEG ขนาดใหญ่ลง editor → กลายเป็น WebP อัตโนมัติ (🎯 เป้า < 300KB — **วัดกับไฟล์จริงแล้วบันทึกตัวเลขที่ได้**)
- [ ] รูปในบทความมี `width`/`height` ครบทุกรูป
- [ ] วัด CLS จริงแล้ว < 0.1
- [ ] อัปโหลดไฟล์ `.exe` เปลี่ยนนามสกุลเป็น `.webp` → ถูกปฏิเสธฝั่ง server
- [ ] **🎯 มีบทวิเคราะห์จริงที่มีกราฟเผยแพร่บนเว็บแล้ว 1 ชิ้น**
- [ ] View source แล้วข้อความในกราฟเป็นข้อความจริง (ไม่ใช่รูป)
- [ ] หน้าบทความนั้นส่ง JS เพิ่ม 0 ไบต์จากกราฟ

---

### Phase 3 — โปรเจกต์ MDX + กราฟ interactive

*(กราฟ static และ palette ทำไปแล้วใน Phase 2 — Phase นี้เพิ่มเฉพาะส่วน interactive และรูปแบบโปรเจกต์)*

**โครงสร้าง MDX (~12-15 ชม.)**
1. Content Collection `projects` + `src/content/projects/` ใน `.gitignore`
2. prebuild script ดึงจาก D1 เขียนเป็น `.mdx`
3. หน้า `/work/[slug]`
4. Editor รองรับ `type='project'`
5. **ตรวจคอมไพล์ MDX ตอน Publish** (บังคับ — ข้อ 7.2)
6. prebuild ข้ามชิ้นที่พังพร้อมเตือน
7. โปรเจกต์แสดงในฟีดหน้าแรก + banner สำหรับชิ้นเด่น
8. `POST /earth/api/upload-dataset` → R2 + ตาราง `datasets`

**กราฟเพิ่มเติม (~8-13 ชม.)**
1. ขยายชุด component ตามที่งานต้องการ: DataTable → StatTile → ชนิดอื่น
2. **กราฟ interactive ระดับ 2** — island + `client:visible`
3. ถ้าเวลาเหลือ: ChoroplethMap ประเทศไทย

**เกณฑ์ตรวจรับ:**
- [ ] เขียน MDX import กราฟ → publish → หน้า `/work/[slug]` แสดงกราฟจริง
- [ ] **🔴 จงใจทำโปรเจกต์ที่เผยแพร่แล้วพัง → build ใหม่ล้ม → URL เดิมยังเปิดได้ตามปกติ** (ข้อ 7.2)
- [ ] จงใจพิมพ์ MDX ผิดตอน Publish → ถูกปฏิเสธพร้อม error
- [ ] กราฟ interactive ไม่โหลด JS จนกว่าจะ scroll ถึง (ตรวจใน Network tab)
- [ ] palette ผ่าน validator ทั้ง light และ dark mode
- [ ] ฟีดหน้าแรกแสดงบทความ + โปรเจกต์เรียงเวลาถูกต้อง

---

### Phase 4 — Newsletter (ครบชุดในทีเดียว)

> **ทำทั้ง 4 ส่วนพร้อมกัน ไม่แยกปล่อย** — เปิดฟอร์มรับสมัครโดยยังยกเลิกไม่ได้
> เป็นทั้งประสบการณ์ที่ไม่สมบูรณ์และปัญหาตาม PDPA (สิทธิ์ถอนความยินยอม)

1. **ฟอร์มสมัคร** ท้ายบทความ + `POST /api/subscribe` + Turnstile + rate limit
2. **ยืนยันอีเมล** — `GET /api/confirm` (double opt-in)
3. **ยกเลิก** — `GET /api/unsubscribe` + ลิงก์ในทุกอีเมลที่ส่ง
4. **ส่ง** — `POST /earth/api/send-newsletter` ต่อบริการส่งอีเมล (Resend หรือเทียบเท่า)
   **กดส่งเองจาก Portal ไม่ใช่อัตโนมัติตอน publish** — อีเมลที่ส่งไปแล้วเรียกคืนไม่ได้
5. Template: หัวข้อ + เกริ่นนำ + ลิงก์อ่านต่อ (ไม่ส่งเนื้อหาเต็ม — ดึงคนกลับมาที่เว็บ)
6. เก็บ `consent_ip` + เวลาที่ยินยอมเป็นหลักฐานตาม PDPA

**เกณฑ์ตรวจรับ (ต้องผ่านครบทั้งวงจรก่อนเปิดใช้จริง):**
- [ ] สมัคร → ได้อีเมลยืนยัน → กดยืนยัน → สถานะเป็น `confirmed`
- [ ] ไม่กดยืนยัน → **ไม่ได้รับจดหมายข่าว** (ยังเป็น `pending`)
- [ ] ส่งจดหมายข่าว → ได้รับจริงในกล่องขาเข้า
- [ ] กดลิงก์ยกเลิกในอีเมล → สถานะ `unsubscribed` → ส่งรอบถัดไปไม่ได้รับ
- [ ] กรอกอีเมลคนอื่น → เจ้าของอีเมลไม่กดยืนยัน → ไม่มีใครถูกเพิ่มเข้าระบบ

---

### Phase 5 — AI Assistant + BYOK

1. `/earth/settings` พร้อมระบบแท็บ
   - **Profile** — อีเมลจาก Cloudflare Access (`Cf-Access-Jwt-Assertion` / `/cdn-cgi/access/get-identity`)
   - **AI Models** — จัดการ provider
2. เพิ่ม provider: label / kind / base URL / API key → **"โหลดรายชื่อ Model"** (ตรวจ key + ดึง catalog พร้อมกัน) → ติ๊กเลือก → บันทึก
3. เข้ารหัส API key (ข้อ 8.2)
4. Refactor `ai-worker/` เป็น adapter registry:
   ```js
   const ADAPTERS = {
     "openai-compatible": runOpenAICompatible,  // OpenRouter, Groq, Together,
                                                // DeepSeek, Mistral, Ollama ฯลฯ
     "gemini": runGemini, "anthropic": runAnthropic, "cloudflare": runCloudflare,
   };
   ```
5. ~~ปิดช่องโหว่ตามข้อ 8.1~~ → **ย้ายไป Phase 0A ทำไปแล้ว**
6. AI panel ในหน้า editor
7. เพิ่ม task `translate` — สำหรับชิ้นที่อยากทำคู่แปลเป็นกรณีพิเศษ
8. เพิ่ม task `suggest-slug` — เสนอ slug อังกฤษจากหัวข้อไทย (ข้อ 19.4)

**Endpoint ดึงรายชื่อ model:**

| `kind` | Endpoint |
|---|---|
| `openai-compatible` | `GET {base_url}/models` + `Authorization: Bearer` |
| `gemini` | `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` |
| `openrouter` | `GET https://openrouter.ai/api/v1/models` (ไม่ต้องใช้ key) |
| `cloudflare` | Cloudflare REST API หรือ hardcode |

> ⚠️ ยืนยันกับเอกสารของแต่ละเจ้าตอน implement — API เปลี่ยนได้

**เกณฑ์ตรวจรับ:** เพิ่ม provider OpenAI-compatible ใหม่จากหน้าเว็บโดยไม่แก้โค้ด · เรียก worker ตรงๆ ไม่มี secret → ถูกปฏิเสธ · API key ใน D1 เป็น ciphertext · หน้า settings ไม่เคยส่ง key กลับ browser

---

### Phase 6 — ค้นหา + แบ่งหน้า

**ทำเมื่อ:** มีเนื้อหาเกิน ~30 ชิ้น

1. แบ่งหน้าในฟีด
2. ค้นหา — สร้าง index ตอน build (Pagefind หรือ JSON index + fuzzy search ฝั่ง client) ไม่ต้องใช้ server
3. หน้า archive

---

### อนาคต

Scrollytelling (ระดับ 3) · ระบบคอมเมนต์ · `srcset` · Slash command · Emoji picker · YouTube embed · Zen mode

*(export/backup ย้ายขึ้นไป Phase 1 แล้ว — ไม่ใช่งานอนาคตอีกต่อไป)*

---

## 17. ประเด็นที่ยังไม่ตัดสินใจ

| # | ประเด็น | ค่าเริ่มต้นถ้าไม่ตัดสินใจ |
|---|---|---|
| 0 | 🔴 **กลไก trigger build บน Workers** | **GitHub Actions + `repository_dispatch`** — ❓ Workers Builds มีกลไกเทียบเท่า Deploy Hook หรือไม่ ต้องตรวจใน Phase 0.5 |
| 1 | URL prefix ของโปรเจกต์ | `/work/` |
| 2 | ~~slug ภาษาไทย~~ | ✅ **ตัดสินใจและแก้แล้ว** — ดูข้อ 19 |
| 3 | **Cormorant Garamond เก็บหรือตัด** | เก็บ 400 + 400italic ถ้ายังใช้ตัวเลือก serif |
| 4 | **Self-host ฟอนต์** | ยังไม่ทำ — **ต้องตรวจ license ของ Google Sans ก่อน** |
| 5 | บริการส่งอีเมล | Resend (ตรวจราคาปัจจุบันเอง) |
| 6 | เนื้อหาในจดหมายข่าว | เกริ่นนำ + ลิงก์ |
| 7 | Editor รองรับมือถือ | desktop-only |
| 8 | **ไลบรารีกราฟ** | **d3-scale + d3-shape เขียนเอง** (ข้อ 13.7) |
| 9 | แหล่ง TopoJSON แผนที่จังหวัดไทย | ยังไม่เลือก — ต้องตรวจ license ของข้อมูลด้วย |
| 10 | Cloudflare Image Resizing | ยังไม่ใช้ — ต้องตรวจ plan และราคาเอง |
| 11 | เกณฑ์ว่าชิ้นไหนควรทำคู่แปล | แปลเฉพาะชิ้นที่พิสูจน์แล้วว่ามีคนอ่าน |
| 12 | License ของเนื้อหา | ยังไม่ตัดสินใจ — เกี่ยวกับความกังวลเรื่องคนคัดลอกงาน |

---

## 18. ความเสี่ยง

| ความเสี่ยง | ระดับ | การรับมือ |
|---|---|---|
| **🔴 trigger deploy จากภายนอกทำไม่ได้บน Workers** | 🔴 สูงสุด | **พิสูจน์ใน Phase 0.5 ก่อนลงแรงอย่างอื่น** — ถ้าทำไม่ได้ ต้องกลับไปพิจารณา SSR ทั้งสถาปัตยกรรม |
| **ใช้เวลาสร้างระบบนานจนไม่ได้เผยแพร่อะไรเลย** | 🔴 สูงสุด | Phase 1 ตัดทุกอย่างที่ไม่จำเป็น · **บทวิเคราะห์จริงชิ้นแรกอยู่ใน Phase 2 ไม่ใช่ Phase 3** |
| **ร่างที่ยังเขียนไม่เสร็จหลุดขึ้นเว็บ** | 🔴 สูง | `post_revisions` + `published_revision_id` — build อ่านเฉพาะฉบับ freeze (ข้อ 9) |
| **หน้าที่เคยเผยแพร่หายไปหลัง deploy ใหม่** | 🔴 สูง | build ล้ม = คงเว็บฉบับล่าสุด ไม่ข้ามชิ้นที่พัง (ข้อ 7.2) |
| **เนื้อหาทั้งหมดอยู่ D1 ที่เดียว** | 🔴 สูง | export + **ทดลองกู้คืนจริง** ตั้งแต่ Phase 1 |
| API key รั่วจาก D1 | 🔴 สูง | AES-GCM + ไม่ส่ง key กลับ browser (ข้อ 8.2) |
| AI worker ถูกยิงจนเผา credit | 🔴 สูง | **ปิดใน Phase 0A ทันที ไม่รอ Phase 5** — มันเปิดอยู่จริงตอนนี้ |
| เก็บอีเมลโดยยังยกเลิกไม่ได้ (PDPA) | 🟠 กลาง | ทำ newsletter ครบชุดใน Phase 4 หรือยังไม่เปิดฟอร์ม |
| หน้าบทความหน้าตาเพี้ยนหลังเปลี่ยนเป็น Markdown | 🟠 กลาง | Screenshot เทียบก่อน/หลัง · ทำ Phase 1 ให้จบก่อนไปต่อ |
| **หน้าโปรเจกต์ช้าเพราะกราฟ** | 🟠 กลาง | ระดับ 1 เป็นค่าเริ่มต้น (JS 0 ไบต์) · `client:visible` เท่านั้น · วัด INP แยกตามหน้า |
| ฟอนต์ทำให้โหลดช้า | 🟠 กลาง | Google Sans ตัวเดียว · 3 weights · ตัด Inter (ข้อ 11) |
| รูปทำให้ CLS แย่ | 🟠 กลาง | บังคับมี width/height ทุกรูปจาก DB (ข้อ 12.4) |
| เขียนไม่ทันสัปดาห์ละชิ้น | 🟠 กลาง | ความสม่ำเสมอสำคัญกว่าความถี่ — 2 สัปดาห์/ชิ้นต่อเนื่อง ดีกว่าสัปดาห์ละชิ้นแล้วหยุด 2 เดือน |
| Bot spam ฟอร์มสมัคร | 🟠 กลาง | Turnstile + rate limit + double opt-in |
| ~~ทำสองภาษาไม่ไหว~~ | 🟢 แก้แล้ว | เปลี่ยนเป็นภาษาผสม — ไม่มีภาระคู่แปลค้างคา |
| build ถูก trigger ถี่จนชน limit | 🟢 ต่ำ | 1-2 ครั้ง/สัปดาห์ไม่น่ามีปัญหา · ❓ ตรวจ quota ของ Workers Builds เอง |
| Cloudflare Access ล่ม | 🟢 ต่ำ | หน้า public ยังทำงานปกติเพราะเป็น static |

---

## 19. เรื่อง slug และ id ของหัวข้อ *(แก้แล้ว 2026-09-09)*

### 19.1 ปัญหาที่พบ

`src/lib/slugify.ts` ตัดอักขระที่ไม่ใช่ `a-z0-9` ทิ้งทั้งหมด ทำให้หัวข้อภาษาไทยได้ slug ว่างเปล่า

```
"เศรษฐกิจไทยกำลังจะไปทางไหน"   →  ""      ← id ว่าง
"ค่าครองชีพ กับ ค่าแรงขั้นต่ำ"   →  "-"     ← เหลือแค่ขีด
"ส่งออกไทยปี 2569"            →  "-2569"
```

**ระหว่างตรวจสอบพบบั๊กตัวที่สองซึ่งร้ายแรงกว่าและไม่เกี่ยวกับภาษาไทยเลย**

หัวข้อที่จัดรูปแบบ (ตัวหนา ลิงก์ เอียง) มีโครงสร้างซ้อนชั้น:

```json
children: [ { _type: "@span", markType: "strong",
              children: [ { _type: "@text", text: "Objective" } ] } ]
```

โค้ดเดิมอ่านแค่ `child.text` ชั้นบนสุด → เจอ `@span` ที่ไม่มี `text` → ได้ค่าว่าง

ผลคือบทความ `stock-inventory-line-bot` ซึ่งใช้หัวข้อตัวหนา มี `id` ของหัวข้อว่างทั้งหมด ขณะที่สารบัญลิงก์ไป `#objective` → **คลิกสารบัญแล้วไม่กระโดดไปไหน แม้เป็นบทความภาษาอังกฤษ**

ต้นเหตุคือสองฝั่งอ่านข้อมูลคนละรูปแบบ:

| ฝั่ง | อ่านจาก | โครงสร้าง |
|---|---|---|
| `extractHeadings()` → สารบัญ | Portable Text ดิบจาก Sanity | แบน — `text` อยู่ชั้นบน |
| `PortableTextHeading.astro` → `id` | โครงสร้างที่ astro-portabletext แปลงแล้ว | ซ้อนชั้น — `@span` → `@text` |

### 19.2 สิ่งที่แก้ไปแล้ว

1. **เก็บอักขระไทยไว้ใน slug** — `/[^a-z0-9฀-๿\s-]/g` (HTML5 อนุญาตให้ `id` เป็น Unicode)
2. **ตัดขีดหน้า-หลังทิ้ง** — `"-2569"` กลายเป็น `"2569"`
3. **fallback เมื่อได้ค่าว่าง** — ใช้ hash ของข้อความ (`section-iccyxh`) ซึ่งให้ผลเหมือนเดิมทุกครั้ง ทั้งสองฝั่งจึงคำนวณได้ค่าตรงกันโดยไม่ต้องแชร์ state
4. **เพิ่ม `nodeText()` เดินโครงสร้างแบบ recursive** — ดึงข้อความจากหัวข้อที่จัดรูปแบบได้ถูกต้อง ใช้ร่วมกันทั้งสองฝั่ง

ผลหลังแก้ — ทั้ง 3 บทความมี `id` ตรงกับลิงก์สารบัญครบ

### 19.3 กฎที่ต้องใช้ต่อใน Phase 1

> ⚠️ **Phase 1 ต้องเขียน `extractHeadings()` ใหม่สำหรับ Markdown — บั๊กเดียวกันจะกลับมาถ้าไม่ระวัง**

หัวข้อ Markdown อย่าง `## **Objective**` หรือ `## [ลิงก์](url)` ก็มีโครงสร้างซ้อนชั้นเหมือนกัน ต้อง:

1. ดึงข้อความจากหัวข้อโดย**ตัดการจัดรูปแบบออกให้หมด** ไม่ใช่อ่านแค่ node ชั้นบน
2. ให้ฝั่งที่สร้าง `id` กับฝั่งที่สร้างสารบัญ **ใช้ฟังก์ชันเดียวกัน** ไม่ใช่ต่างคนต่างคำนวณ
3. `MarkdownBody.astro` render ทั้งบทความในที่เดียว → **กันหัวข้อชื่อซ้ำได้ด้วยการเติมเลขต่อท้าย** ซึ่งโครงสร้างเดิมทำไม่ได้

**เกณฑ์ตรวจรับที่ต้องเพิ่มใน Phase 1:**

- [ ] บทความที่มีหัวข้อภาษาไทย → คลิกสารบัญแล้วกระโดดถูกตำแหน่ง
- [ ] บทความที่มีหัวข้อตัวหนา/มีลิงก์ → `id` ตรงกับลิงก์สารบัญ
- [ ] บทความที่มีหัวข้อชื่อซ้ำกัน 2 อัน → ได้ `id` ต่างกัน ไม่ชนกัน

### 19.4 URL ของบทความ — ยังพิมพ์เอง

ต่างจาก `id` ของหัวข้อ เพราะ URL คือสิ่งที่คนเห็นตอนแชร์

- **พิมพ์ slug อังกฤษเองทุกครั้ง** — `frong.me/articles/thai-export-2026` ดูน่าเชื่อถือกว่า `frong.me/articles/%E0%B8%AA%E0%B9%88...`
- ใช้เวลา 10 วินาทีต่อบทความ ไม่ใช่ภาระ
- **Phase 5: เพิ่ม AI task `suggest-slug`** ให้เสนอ slug อังกฤษจากหัวข้อไทย แล้วกดเลือก

**ทางเลือกที่พิจารณาแล้วไม่เลือก**

| ทางเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| ทับศัพท์อัตโนมัติ (ไทย→โรมัน) | ภาษาไทยไม่เว้นวรรคระหว่างคำ ต้องตัดคำก่อนซึ่งเป็นปัญหา NLP จริงจัง · ไลบรารี JS คุณภาพไม่แน่ · ผลลัพธ์มักอ่านไม่รู้เรื่อง |
| ใช้ไทยใน URL ตรงๆ | Google index ได้จริง แต่ copy-paste แล้วกลายเป็น `%E0%B8...` ยาวมาก ดูไม่ดีเวลาแชร์ |

---

## ภาคผนวก — คำถามก่อนเริ่มแต่ละ Phase

1. Phase ที่แล้วจบสมบูรณ์และใช้งานได้จริงหรือยัง
2. ตั้งแต่จบ Phase 1 มา เผยแพร่ไปกี่ชิ้น — **ถ้าตอบ 0 ให้หยุดพัฒนาระบบแล้วกลับไปเขียน**
3. สิ่งที่กำลังจะทำช่วยให้เผยแพร่ได้ดีขึ้น/เร็วขึ้นจริงไหม หรือแค่อยากทำ
