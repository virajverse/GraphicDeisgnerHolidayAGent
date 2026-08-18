# 📖 TALIYO DESIGNOS & CREATIVE INTELLIGENCE AGENT — OFFICIAL MANUAL

> **Version:** Production Release v2.8 (Cloud Turso & Multi-Agent Mesh)  
> **Bot Username:** [@GraphicDeisgnerHolidayAGent_bot](https://t.me/GraphicDeisgnerHolidayAGent_bot)  
> **Web Studio Dashboard:** `http://localhost:3000`  
> **Super Admin Handle:** Available in System Database  

---

# 👑 PART 1: SUPER ADMIN MASTER MANUAL

The Super Admin has complete operational control over user onboarding approvals, calendar events, client brand profiles, affiliate partner campaigns, and mass multimedia broadcasts.

---

## 1. Admin Authentication & Dashboard Dock
* **Admin Role Detection:** The bot dynamically checks the user's role and Super Admin privileges against the secure Turso Cloud Database (`system_settings` & `users` tables).
* **Admin Master Keypad:** Super Admins receive a dedicated docked keypad on `/start`:
  * `🚀 Trigger Radar Scan` — Instantly runs real-world trend scraping and dispatches morning campaign briefs.
  * `👥 Active Designers` — View list of all active registered graphic designers and agencies.
  * `🔔 Pending Approvals` — View unapproved designer verification requests.
  * `📢 Broadcast Hub` — Send announcements (Text, Photo with CTA Button, or Titled Link).
  * `🔗 Affiliate Hub` — Create and manage custom tracking links for creators and agencies.
  * `🏆 Top Referrers` — Live leaderboard of designers inviting peers.
  * `🛡️ DB Security` — View Turso Cloud SQLite sync status, query shielding, and ban telemetry.
  * `📊 Deep AI Telemetry` — Real-time health metrics of the 27-model AI mesh.

---

## 2. Admin Command Reference Guide

### 📅 Calendar & Event Management
| Command | Format | Example |
| :--- | :--- | :--- |
| **Add Event** | `/addevent Name \| MM-DD \| Category \| Score` | `/addevent Diwali Festival \| 11-01 \| FESTIVAL \| 95` |
| **Delete Event** | `/delevent Event Name` | `/delevent Old Festival Name` |

### 💼 Client Brand Profiles (Isolated Client Guidelines)
| Command | Format | Example |
| :--- | :--- | :--- |
| **Add Client** | `/addclient Name \| Industry \| Tone \| Style` | `/addclient Acme Corp \| SaaS \| Sleek & Bold \| Dark Mode Glassmorphism` |

### 👥 User Access Controls & Approvals
| Command | Action | Description |
| :--- | :--- | :--- |
| **Approve User** | `/approve <CHAT_ID>` | Grants full access to a pending user. |
| **Revoke Access** | `/revoke <CHAT_ID>` | Immediately revokes access and locks user account. |
| **Unban User** | `/unban <CHAT_ID>` | Unbans an account locked due to rapid spam. |
| **Promote Admin** | `/makeadmin <CHAT_ID>` | Promotes a trusted team member to Admin role. |

### 📢 High-Impact Multimedia Broadcasts
| Broadcast Type | Command Syntax | Description |
| :--- | :--- | :--- |
| **Rich Text** | `/broadcast <Message>` | Sends formatted text announcement to all approved designers. |
| **Photo + Button** | `/broadcastphoto PhotoURL \| Caption \| BtnText \| BtnURL` | Sends banner image with a direct 1-tap call-to-action button. |
| **Link Card** | `/broadcastlink Title \| Message \| BtnText \| BtnURL` | Clean titled message card with custom action button. |

### 🔗 Influencer & Affiliate Campaign Generator
Create custom tracking links for creators, YouTube channels, design communities, or partner agencies:
* **Command:** `/createaffiliate <CODE> | <BONUS_CREDITS> | <CAMPAIGN_NAME>`
* **Example:** `/createaffiliate VIPDESIGN | 150 | Top Creator Community`
* **Generated Deep-Link:** `https://t.me/GraphicDeisgnerHolidayAGent_bot?start=aff_VIPDESIGN`
* **Effect:** Anyone joining through this link gets **instant auto-approval** and receives `+150` bonus AI credits!

---

# 🎨 PART 2: GRAPHIC DESIGNER & END-USER MANUAL

This guide covers how graphic designers, branding studios, and creators can register, login, and leverage the AI Agent for daily design workflows.

---

## 1. How Users Register & Login

Users have **3 Secure Methods** to access the Taliyo Creative Intelligence Agent:

```
                      ┌───────────────────────────┐
                      │  User sends /start to Bot │
                      └─────────────┬─────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ Method 1: Free   │      │ Method 2: Direct │      │ Method 3: VIP    │
│ Registration     │      │ Passcode Login   │      │ Affiliate Link   │
│ (Follow Tasks)   │      │ (/register CODE) │      │ (/start aff_CODE)│
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ 5-Step Verified  │      │ Passcode check   │      │ Instant 0-second │
│ Profile Creation │      │ in Cloud DB      │      │ Auto-Approval +  │
│ (Name/Email/No.) │      │ (3-strike shield)│      │ VIP Welcome Pack │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                                   ▼
                 ┌───────────────────────────────────┐
                 │  🎉 Full Access Activated +       │
                 │  VIP Designer Keypad Docked       │
                 └───────────────────────────────────┘
```

---

### 📝 Method 1: Free Registration (Social Follow & 5-Step Verification)

1. Tap **`📝 Free Registration`** on the start gateway.
2. **Social Follow Tasks (To unlock Free Access):**
   * **Task 1:** Tap `📸 Follow @fearless.devx` on Instagram.
   * **Task 2:** Tap `▶️ Subscribe @VirajVerse016` on YouTube.
3. **5-Step Verified Profile Creation:**
   * **Step 1 (Full Name):** Type your full name in chat (e.g. *Viraj Sharma*).
   * **Step 2 (Genuine Email):** Enter your authentic work or personal email address (e.g. *viraj@company.com*).  
     *(⚠️ Note: Temporary / disposable fake email domains are automatically blocked by the validation engine).*
   * **Step 3 (Verified Phone Number):** Tap the native Telegram button:  
     👉 **`[📱 Share Verified Telegram Number]`**  
     *(This cryptographically proves that the number belongs to your actual Telegram account, preventing fake or spoofed numbers).*
   * **Step 4 (Lead Attribution):** Choose where you discovered Taliyo Agent:  
     `[📺 YouTube]  [📸 Instagram]  [👥 Friend Referral]  [💼 LinkedIn]  [🌐 Other]`
   * **Step 5 (Access Passcode / Registration Code):** Enter your authorized invitation code.  
     *(👉 **Code nahi hai toh?** Niche 2 interactive buttons milte hain:*  
     * • `[🎁 Get Free Code (Social Tasks)]` — Instagram follow & YouTube subscribe karke instant free code unlock karein.  
     * • `[💬 Contact Owner (@virajverse)]` — 1-tap direct chat with the Owner to request VIP access).*
4. **Account Activated:** Your verified profile is stored in the cloud database, `+100 VIP AI Credits` are added to your balance, and your interactive designer toolbar is unlocked!  
5. **Smart Single-Registration Memory:** Once registered, the user's Chat ID is permanently remembered in Turso DB. The `📝 Free Registration` button is **never shown again** — future sessions open directly into the active creative studio!

---

### 🔑 Method 2: Direct Passcode Login
* If you already possess an authorized Admin Passcode or Agency License, simply type in chat:
  ```text
  /register YOUR_PASSCODE
  ```
* **Security Protection:** The bot features a 3-strike brute-force lockout. 3 incorrect attempts locks the session for 10 minutes to protect against brute-force attacks.

---

### 💎 Method 3: VIP Partner / Affiliate Link
* If joining via an influencer, agency, or partner link (e.g. `https://t.me/GraphicDeisgnerHolidayAGent_bot?start=aff_VIPCODE`), your account is **automatically approved in 0 seconds** and VIP welcome credits are credited immediately.

---

## 2. Core Creative Capabilities & Commands

### 🖼️ 1. 8K 3D Visual Asset Render (`/render` or `/image`)
Generates isolated, ultra-crisp 3D objects, cultural centerpieces, product stages, and macro textures on dark obsidian backdrops with generous negative space.
* **Commands:**
  * `/render Specialty roasted coffee bean in warm café lighting`
  * `/render Diwali festive royal brass diya with glowing golden flame`
  * `/render Luxury 24k gold filigree necklace with diamond caustics`
  * `/render Minimalist Carrara marble circular podium with halo glow`
* **Designer Pro-Tip:** All rendered assets are **100% clean and zero-text** — drag and drop them directly into **Figma, Photoshop, Illustrator, or Canva** to add your client's typography and logo.

---

### 🤖 2. Autonomous Multi-Agent Campaign Briefing (`/agent`)
Synthesizes a full multi-archetype campaign briefing with live cultural news research, color palettes, and typographic pairings.
* **Command:** `/agent Luxury watch Diwali campaign for high-income professionals`
* **Output Deliverable:**
  1. **6 Non-Redundant Design Archetypes** (Minimalist, Cyber SaaS, Royal Festive, Neo-Brutalist, Swiss Editorial, Organic D2C).
  2. **5-Layer Color Science** (Primary Accent, Secondary Tone, Background Canvas, Surface Tint, Typography).
  3. **Curated Typographic Hierarchy** (Display Headline + Body Pairings).
  4. **Strategic Client Pitch Defense Rationale** (To sell your concept to stakeholders).

---

### 📅 3. Today's Trend & Calendar Briefing (`/today`)
* Automatically fetches the highest-priority holiday, festival, or marketing event for today and generates 6 ready-to-design concepts.

---

### 📆 4. Upcoming Cultural Radar (`/upcoming`)
* Previews the next 7 days of Indian and Global calendar events so you can prepare marketing campaigns well before client deadlines.

---

### 🎨 5. Art Director Co-Pilot (`/copilot`)
* Provides real-time design feedback, layout rules, and contrast-tested palettes.
* **Examples:**
  * `/hex luxury real estate` ➔ Generates 5-layer gold & obsidian hex codes with WCAG 2.2 AAA certification.
  * `/copilot Suggest display font pairing for a fintech cyber SaaS hero banner`

---

### 👥 6. Referral Program & Free AI Credits (`/referral`)
* Generate your personal referral invite link:  
  `https://t.me/GraphicDeisgnerHolidayAGent_bot?start=ref_YOURCHATID`
* Every designer who joins through your link earns you **+50 AI Credits** and unlocks higher VIP tiers (Bronze, Silver, Gold, Diamond).

---

### 🌐 7. Language Switcher (English vs Hinglish)
* Tap `🌐 Language / भाषा` anytime to switch output between **English (Global)** and **Hinglish (Punchy Desi Hooks)**.

---

## 3. Web Studio Dashboard (`http://localhost:3000`)
* **Interactive 3D Prompt Forge:** Open the web app in your browser to type custom design briefs, test 3D physical lighting formulas, and click **"Copy W3C Tokens JSON"** to export design tokens directly into Figma Variables.
* **Minimalist Obsidian Interface:** Built with pure SVG icons and zero clutter for professional studio workflows.

---

## 🔒 Security & Fair-Use Safeguards
* **Anti-Spam Cooldown:** 4-second request buffer to ensure cluster stability.
* **Cryptographic Contact Verification:** Phone numbers are verified directly via Telegram's secure identity protocol.
* **Data Privacy:** Client brand guidelines and designer briefs remain strictly isolated in encrypted cloud storage.
