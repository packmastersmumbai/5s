# PackMasters 5S Telegram Bot (@PM5sBot)

Two-way Telegram bot for the 5S system. It **broadcasts** updates to the team
channel **"PM 5s SQDCP"** and sends **personal DM reminders** to zone leaders.
Because Google Apps Script can't run webhooks, the bot **polls** every minute.

---

## For users — how to use it

### Commands (send these to the bot or in the channel)
| Command | What it does |
|---|---|
| `/start` | Welcome + how to enrol |
| `/help` | List all commands |
| `/status` | Today's submitted count, average score, open + overdue NCs |
| `/zones` | Per-zone grid (🟢 submitted / 🔴 not), score, open NCs — each zone is a tappable link |
| `/pending` | Zones that haven't submitted today |
| `/capas` | Open & overdue NCs by zone |
| `/register <ZONE>` | Get personal DM reminders for a zone, e.g. `/register Z-07` |
| `/unregister` | Stop your DM reminders |

Zone names in replies are **tappable** — they open that zone's page in the web app.

### To get personal reminders (one-time)
1. Open **@PM5sBot** in Telegram and tap **Start**.
2. Send **`/register Z-07`** (your zone ID).
3. Done — you'll get a DM when your zone's daily audit is pending or has overdue NCs.

> Telegram rule: a bot can only DM someone **after** they message it. That's why
> step 1–2 are required; there's no way for admins to add you without it.

---

## What the bot sends automatically

**To the channel (everyone):**
- **Daily digest** — 18:30 IST: submitted/avg/overdue + list of zones not submitted + overdue NCs.
- **Per-action posts** — as they happen: 🔴 NC raised · 🟢 NC closed · 🗒️ task created · ✔️ task done · 🏷️ red tag raised · ✔️ red tag closed · ✅ daily audit submitted.

**Individually (DM to enrolled zone leaders):**
- **Reminders** — 10:00 IST: only to zones that are pending today or have overdue NCs.

---

## For admins — setup & configuration

All from the spreadsheet menu **📋 PackMasters Admin → 🤖 Telegram …**:

| Menu item | Function |
|---|---|
| Set Credentials (run once) | `setTelegramCredentials_5s` — paste bot token in the editor first |
| Test Message | `sendTelegramTest_5s` |
| Enable / Disable Bot Commands | starts/stops the 1-min polling trigger |
| Setup Schedules | `setupTelegramSchedules` — installs digest 18:30 + reminders 10:00 |
| Send Digest Now | `sendTelegramDailyDigest` |
| Remind Leaders Now | `remindZoneLeaders` |

### Where things are stored (Project Settings → Script Properties)
| Key | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token (secret — never commit) |
| `TELEGRAM_CHAT_ID` | Channel ID (`-1004336498836` = PM 5s SQDCP) |
| `TG_ZONE_CHATS` | JSON map of `zoneId → chatId` for DM reminders (built by `/register`) |
| `TG_OFFSET` | Polling cursor (managed automatically) |
| `TELEGRAM_ACTIONS_ENABLED` | Set to `false` to mute per-action posts without redeploying |

### Managing enrolments
View/edit **`TG_ZONE_CHATS`** directly in Script Properties to inspect or remove
a leader's binding. Users self-enrol with `/register` and opt out with `/unregister`.

---

## Files
- `29_TelegramLib.js` — transport (send/reply/poll) + command router. Project-agnostic.
- `29b_TelegramCommands.js` — 5S command map + read builders (`_tg5sZoneGrid_`, links).
- `29c_TelegramReminders.js` — digest, DM reminders, enrolment map, schedule triggers.
- Per-action posts live inline at the create/close handlers in `08_CAPAEngine.js`,
  `19_KanbanTaskService.js`, `21_ImprovementEngine.js` (via `tg5sBroadcast_`).
