# DunningEngine ⚡

![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-14%20App%20Router-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-emerald?style=flat-square&logo=supabase)
![Paystack](https://img.shields.io/badge/Paystack-Webhook%20Verified-00C3F7?style=flat-square)
![Resend](https://img.shields.io/badge/Resend-Transactional%20Email-black?style=flat-square)

An automated payment recovery and dunning SaaS platform built for **Wisora Innovations**. DunningEngine catches failed subscription charges in real-time, dispatches secure customer recovery links, and updates billing metrics automatically via high-converting recovery flows.

---

## 🚀 Key Features

* **Real-time Webhook Engine:** Secure HMAC SHA-512 signature verification for Paystack subscription failure events.
* **Automated Dunning Workflows:** Triggers branded transactional emails via Resend with single-use, secure customer recovery tokens.
* **Self-Service Customer Portal:** Embedded token-authenticated payment portal for instant card updates.
* **Founder Metrics Dashboard:** Real-time visibility into active retries, recovered MRR, and failed invoice logs.
* **Enterprise Security:** Row-Level Security (RLS) policies and RPC functions powered by Supabase.

---

## 🛠️ Tech Stack

* **Framework:** [Next.js App Router](https://nextjs.org/) (React 18 / TypeScript)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/)
* **Database & Auth:** [Supabase](https://supabase.com/) (PostgreSQL, Service Role, RPC)
* **Payment Processing:** [Paystack API & Inline SDK](https://paystack.com/)
* **Transactional Email:** [Resend](https://resend.com/)

---

## ⚙️ Environment Configuration

Create a `.env.local` file in the root directory with the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

PAYSTACK_SECRET_KEY=sk_live_...
RESEND_API_KEY=re_...

NEXT_PUBLIC_APP_URL=http://localhost:3000