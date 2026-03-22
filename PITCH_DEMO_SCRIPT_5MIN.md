# EigenState — 5-minute demo pitch script (Hinglish + English)

**Approx. timing:** ~5 minutes at a relaxed pace (~130–140 words/min). Pause after each section for breath or a quick screen share.

---

## 0:00–0:45 — Hook & problem (opening)

“Hi everyone — quick context. Teams ship code fast, but **why** a certain design or refactor happened often lives only in Slack threads, old PRs, or one engineer’s head. Onboarding, audits, and scaling the codebase become painful.

**EigenState** is our answer: an **architectural intelligence layer** on top of your repo — it connects **ingestion**, **lineage**, and **AI-style reasoning** so you can see not just *what* changed, but **why** it changed and **how confident** we are about that story.

Aaj jo demo dikha rahe hain, usme humne **end-to-end UI + Go backend** wire kiya hai — aur jahan live GitHub ingestion rate limits ya empty DB ho, wahan **rich demo seed data** se poora flow dikhta hai, taaki pitch smooth rahe.”

---

## 0:45–2:15 — What we built (product walkthrough)

“Let me walk you through **four pillars** — you can mirror this on screen without a fancy deck.

**1) Control center dashboard**  
Pehle **home / dashboard**: engine health, latency feel, ingestion **feed**, aur high-level **insights** jo lineage se aate hain. Yeh ‘single pane of glass’ hai — ops + leads ko **system alive hai ya nahi** instant dikh jata hai.

**2) Why Explorer**  
Yeh hamara **hero moment** hai. Aap ek **function / symbol** select karte ho — panel me **architectural decision**, **reasoning**, **tradeoffs**, suggested PR narrative, confidence, aur **timeline** dikhti hai. Backend se `/api/v1/why` aata hai jab data indexed ho; demo ke liye humne **pre-seeded decisions** rakhe hain taaki **GitHub token / rate limit** ke bina bhi story clear ho.

**3) History / lineage**  
Yahan **evolution of the codebase** — kaunsi changes kab aayi, kis PR se, kis confidence ke saath. Same idea: **live API** jab data ho, warna **seed lineage** se UI polished rehti hai — judges ya investors ko **empty state** nahi dikhta.

**4) Git Intelligence**  
Stats, ingestions queue, **completed vs pending vs risk** — engineering managers ko **throughput aur backlog** samajhne me help. Phir se: real stats jab backend me activity ho, **otherwise demo numbers** se narrative complete.

Technically: **React + Vite** frontend, **Go** API, normalized DB layer for lineage/decisions, dev me **proxy** se local API — production mindset ke liye **env-based API URL** bhi.”

---

## 2:15–3:30 — Business value & who uses it

“**Why does the business care?**

- **Faster onboarding** — naye engineers ko ‘why this exists’ minutes me, days me nahi.  
- **Safer refactors** — pehle decisions aur tradeoffs visible; fewer accidental regressions.  
- **Compliance & audits** — architectural intent documented and **queryable**, not scattered.  
- **Manager visibility** — ingestion health + signal quality, not just lines of code.

**Kaun use karega?**  
- **Staff / principal engineers** — standards aur reviews.  
- **EMs & TPMs** — risk areas, PR throughput, ‘are we actually analyzing what we merge?’  
- **Platform & security** — sensitive paths ka **decision trail**.  
- **Enterprise eng orgs** — jahan **bus factor** aur **knowledge loss** real cost hai.”

---

## 3:30–4:30 — Scalability (how this grows)

“Scalability do dimensions pe:

**Product scale** — repo count, PR volume, aur **function-level** granularity. Architecture already **API-first** hai: ingest → store → query Why / lineage. Multi-repo, org-wide rollouts ke liye natural extension hai **tenant / org configs**, **queue-backed ingestion**, aur **read replicas** for analytics — yeh standard playbook, hamara surface area clear hai.

**GTM scale** — dev teams se start, phir **team / org** plans: SSO, private cloud, **air-gapped** demos bhi believable kyunki core value **your code + your history**, not a generic chat wrapper.

**Moat** — sirf ‘AI summary’ nahi; **grounded lineage + confidence + staleness** — matlab **trust** ke saath narrative. Wahi repeat usage create karta hai.”

---

## 4:30–5:00 — Close & demo CTA

“To recap: **EigenState** turns messy git history into **explainable architectural memory** — dashboard for health, **Why** for depth, **History** for evolution, **Git Intelligence** for operations.

Aaj ka demo **rate limits / empty DB** ke against bhi **full UX** dikhata hai thanks to **intelligent seeding** — production me wahi screens **live ingestion** se populate honge.

Main ab **30 seconds** me ek symbol select karke **Why panel** dikha deta hoon — yahi slide-less story hai. Questions?”

---

## Optional one-liners (if someone interrupts)

- **“Is this only GitHub?”** — “GitHub-first ingestion; architecture is **provider-shaped** for extension.”  
- **“LLM hallucination?”** — “We anchor on **PRs, lineage, and confidence**; stale signals ko explicitly flag kiya ja sakta hai.”  
- **“Competitor?”** — “Generic code search batata hai *kya* hai; hum *kyun* aur *kis tradeoff* ke saath push hua, woh surface karte hain.”

---

## Speaker notes

- **~5 min:** Agar time kam ho, skip “Scalability” detail — sirf 2 bullets bolo.  
- **Screen order suggestion:** Dashboard → Why (one function) → History row → Git Intelligence stats.  
- **Energy:** Problem 20% / Demo 50% / Business 30% — investors ko **demo** chahiye, managers ko **pain + who pays**.
