require('events').EventEmitter.defaultMaxListeners = 20;

// 📦 MODULE IMPORTS
const { Telegraf } = require("telegraf");
const express = require("express");
const fs = require("fs");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isUserSubscribed(ctx) {
  for (const channel of forceSubChannels) {
    try {
      const member = await ctx.telegram.getChatMember(channel, ctx.from.id);
      if (member.status === "left") return false;
    } catch (err) {
      console.log("ForceSub check failed:", err.message);
      return false;
    }
  }
  return true;
}

// 🌐 EXPRESS SETUP
const app = express();
const redirectApp = require("./redirect");
app.use("/", redirectApp);
app.get("/ping", (req, res) => res.send("DD4K Monster Bot is Running..."));
app.listen(3000);

// 🤖 BOT INITIALIZE
const bot = new Telegraf("");

// 🛡️ ADMIN IDs
const forceSubChannels = ["@DD4K_Twins", "@DD4K_5_Wednezday"];
const adminIDs = [1081656301, 1361262107, 6335193759];

// 🧠 TEMP MEMORY
let awaitingStep = {};
let batchSteps = {};
let passwordSessions = {};
let otpSessions = {};
let wrongAttempts = {};


// 🔐 /start with New User + Custom Welcome
bot.start(async (ctx) => {
  const mention = ctx.from.username || ctx.from.first_name;
  const payload = ctx.startPayload;
  const subscribed = await isUserSubscribed(ctx);
  if (!subscribed) {
    return ctx.reply(
      `🛑 To use this bot, please join our channel(s) first:`,
      {
        reply_markup: {
          inline_keyboard: [
            ...forceSubChannels.map(ch => [{ text: `📢 Join ${ch}`, url: `https://t.me/${ch.replace("@", "")}` }]),
            [{ text: "✅ I Joined, Retry", callback_data: `retry_direct_${payload || "none"}` }]
          ]
        }
      }
    );
  }


  try {
    const store = JSON.parse(fs.readFileSync("storage.json"));
    const users = fs.existsSync("users.json") ? JSON.parse(fs.readFileSync("users.json")) : {};
    
    if (!users[ctx.from.id] && store.log_channel) {
      const name = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
      const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });

      await ctx.telegram.sendMessage(
        store.log_channel,
        `🟢 New User Started Bot\n\n👤 Name: ${name}\n🆔 ID: ${ctx.from.id}\n🕒 Time: ${now}`
      );

      users[ctx.from.id] = true;
      fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
    }
  } catch (e) {
    console.log("❌ Log failed:", e.message);
  }

  // No Payload → Normal Welcome
  if (!payload || !payload.startsWith("batch_")) {
    let cap = {};
    try { cap = JSON.parse(fs.readFileSync("captions.json")); } catch {}
    const store = JSON.parse(fs.readFileSync("storage.json"));
    const imageMsgId = cap.start?.message_id;
    const btns = [];

    if (cap.start?.button1?.text && cap.start.button1.link) {
      btns.push([{ text: cap.start.button1.text, url: cap.start.button1.link }]);
    }
    if (cap.start?.button2?.text && cap.start.button2.link) {
      btns.push([{ text: cap.start.button2.text, url: cap.start.button2.link }]);
    }

    const opts = { reply_markup: { inline_keyboard: btns }, parse_mode: "Markdown" };

    if (imageMsgId && store.storage_channel) {
  try {
    await ctx.telegram.copyMessage(ctx.chat.id, store.storage_channel, imageMsgId, opts);
  } catch (e) {
    console.log("❌ Failed to copy start image:", e.message);
    await ctx.reply("👋 Welcome to *DD4K Monster Bot*!", opts);
  }
} else {
  await ctx.reply("👋 Welcome to *DD4K Monster Bot*!", opts);
}

    return;
  }

  // 🔐 OTP-Based Batch Unlock
  const batchKey = payload.replace("batch_", "");
  let batches = {};
  try { batches = JSON.parse(fs.readFileSync("batches.json")); } catch {}
  const b = batches[batchKey];
  if (!b) return ctx.reply("❌ Invalid batch link!");

  otpSessions[ctx.from.id] = {
    type: "batch_otp",
    batch_key: batchKey
  };

  ctx.reply(
  `🔐 Please enter your *valid OTP* to unlock *${batchKey}*`,
  {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🔑 Get OTP via DD4K Bot",
            url: "https://t.me/Dd4kTwins_otp_bot?start=start"
          }
        ]
      ]
    }
  }
);
});

// ⚙️ ADMIN COMMANDS
bot.command("setadmin", (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;
  ctx.reply("📥 Please forward a message from the Storage Channel.");
  awaitingStep[ctx.from.id] = "awaiting_storage";
});

bot.command("setupstart", (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;
  awaitingStep[ctx.from.id] = "awaiting_start_image";
  ctx.reply("🖼 Please send the START PAGE IMAGE now.", { parse_mode: "Markdown" });
});

bot.command("batch", (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;
  batchSteps[ctx.from.id] = { step: "awaiting_first" };
  ctx.reply("📥 Please forward the FIRST message from the storage channel.");
});

bot.command("delete", async (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;

  const parts = ctx.message.text.split(" ");
  const key = parts[1];

  if (!key) return ctx.reply("❌ Usage: /delete <BatchName>");

  let bs = {};
  try { bs = JSON.parse(fs.readFileSync("batches.json")); } catch {}

  if (!bs[key]) return ctx.reply("❌ No batch found with that name.");

  delete bs[key];
  fs.writeFileSync("batches.json", JSON.stringify(bs, null, 2));
  ctx.reply(`✅ Batch ${key} deleted.`);
});

bot.command("batches", (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;

  let bs = {};
  try { bs = JSON.parse(fs.readFileSync("batches.json")); } catch {}

  const keys = Object.keys(bs);
  if (!keys.length) return ctx.reply("⚠️ No batches found.");

  ctx.reply(`📦 Available Batches:\n\n${keys.map(k => `• ${k}`).join("\n")}`);
});

bot.command("backup", async (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;

  const files = ["batches.json", "redirect.json", "storage.json", "captions.json"];
  for (let f of files) {
    if (fs.existsSync(f)) {
      const backupFile = f.replace(".json", "backup.json");
      fs.copyFileSync(f, backupFile);
      await ctx.replyWithDocument({ source: backupFile, filename: backupFile });
    } else {
      ctx.reply(`⚠️ ${f} not found.`);
    }
  }

  ctx.reply("✅ Backup completed!");
});

bot.command("permanentcaption", (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;
  awaitingStep[ctx.from.id] = "awaiting_permanent_caption";
  ctx.reply("🖊️ Send me the permanent caption for *all files*", { parse_mode: "Markdown" });
});

bot.command("custombatchcaption", (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;
  awaitingStep[ctx.from.id] = "awaiting_batch_caption_key";
  ctx.reply("🎬 Send the *batch name* to set a custom caption for it", { parse_mode: "Markdown" });
});

bot.command("setmirror", async (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;
  awaitingStep[ctx.from.id] = "awaiting_mirror_channel";
  ctx.reply("📥 Please forward a message from the *Mirror Channel*", { parse_mode: "Markdown" });
});

bot.command("switchstorage", async (ctx) => {
  if (!adminIDs.includes(ctx.from.id)) return;

  const st = JSON.parse(fs.readFileSync("storage.json", "utf8")) || {};
  const current = st.storage_channel;
  const mirror = st.mirror_channel;

  if (!mirror) return ctx.reply("⚠️ Mirror channel not set.\nUse /setmirror first.");

  const curName = current === mirror ? "Mirror Channel" : "Storage Channel";

  ctx.reply(
    `🛠 *Mirror Control Center*\n\n📤 Current Source: *${curName}*\n\nChoose what you want to do below 👇`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Switch Mirror Channel", callback_data: "switch_mirror" }],
          [{ text: "🔁 Sync Mirror Batches", callback_data: "sync_to_mirror" }]
        ]
      }
    }
  );
});

// 📩 HANDLE MESSAGES & STEPS
bot.on("message", async (ctx) => {
  const uid = ctx.from.id;
  const step = awaitingStep[uid];
  const batchU = batchSteps[uid];
  const fwd = ctx.message.forward_from_chat;

  // 🔧 Admin: Set Storage / Log / Mirror Channels
  if (step && fwd) {
    try {
      const botInfo = await ctx.telegram.getMe();
      const status = (await ctx.telegram.getChatMember(fwd.id, botInfo.id)).status;
      if (status !== "administrator") {
        return ctx.reply("❌ I'm not admin in that channel.");
      }

      let st = JSON.parse(fs.readFileSync("storage.json", "utf8")) || {};

      if (step === "awaiting_mirror_channel") {
        st.mirror_channel = fwd.id;
        fs.writeFileSync("storage.json", JSON.stringify(st, null, 2));
        ctx.reply("✅ Mirror Channel Set Successfully!");
        awaitingStep[uid] = null;
        return;
      }

      if (step === "awaiting_storage") {
        st.storage_channel = fwd.id;
        ctx.reply("✅ Storage channel set!\nNow forward from Log Channel.");
        awaitingStep[uid] = "awaiting_log";
      } else if (step === "awaiting_log") {
        st.log_channel = fwd.id;
        ctx.reply("✅ Log channel set!");
        awaitingStep[uid] = null;
      }

      fs.writeFileSync("storage.json", JSON.stringify(st, null, 2));
    } catch (e) {
      ctx.reply("❌ Failed channel check.");
    }
    return;
  }

  // 🔐 OTP UNLOCK
  if (otpSessions[uid]) {
    const code = ctx.message.text.trim().toUpperCase();
    const session = otpSessions[uid];

    try {
      const res = await fetch("https://plant-marked-property.glitch.me/otp.json");
      const otpData = await res.json();
      const record = otpData[code];

      if (!record) return ctx.reply("❌ Invalid OTP!");
      if (Date.now() > record.expires) return ctx.reply("⏳ OTP expired!");
      if (record.used) return ctx.reply("⛔ OTP already used!");

      await fetch(`https://plant-marked-property.glitch.me/use-otp/${code}`);

      const bs = JSON.parse(fs.readFileSync("batches.json", "utf8"));
      const b = bs[session.batch_key];
      if (!b) return ctx.reply("❌ Batch not found!");

      const verifyingMsg = await ctx.reply(`✅ OTP Verified! Unlocking *${session.batch_key}*...`, { parse_mode: "Markdown" });

      const cap = JSON.parse(fs.readFileSync("captions.json", "utf8")) || {};
      const st = JSON.parse(fs.readFileSync("storage.json", "utf8"));
      const permCap = cap.permanent || "";
      const custCap = cap.custom?.[session.batch_key] || "";
      const finalCap = custCap || permCap || undefined;

      for (let i = b.start; i <= b.end; i++) {
  while (true) {
    try {
      const copied = await ctx.telegram.copyMessage(ctx.chat.id, b.chat_id, i, {
        caption: finalCap,
        parse_mode: "Markdown"
      });

      // Optional: Delete after 15 mins
      setTimeout(() => {
        ctx.telegram.deleteMessage(ctx.chat.id, copied.message_id).catch(() => {});
      }, 15 * 60 * 1000);

      await delay(1000); // 1 sec wait between files
      break; // success - exit while loop
    } catch (e) {
      const msg = e.description?.toLowerCase() || "";

      // 📛 Handle flood wait
      if (msg.includes("retry after")) {
        const wait = e.parameters?.retry_after || 10;
        console.log(`⏳ Telegram flood wait! Waiting ${wait}s...`);
        await delay(wait * 1000); // wait before retry
      } else {
        console.error(`❌ Failed on ${i}:`, e.description);
        break; // skip this file and go to next
      }
    }
  }
}

      try { await ctx.telegram.deleteMessage(ctx.chat.id, verifyingMsg.message_id); } catch {}

      // ⏳ Countdown
      const totalSecs = 15 * 60;
      let timeLeft = totalSecs;
      const countdownMsg = await ctx.reply(`⏳ Deleting in 15:00...\n\n███████████████ 100%`, { parse_mode: "Markdown" });

      const countdownInterval = setInterval(async () => {
        timeLeft--;
        if (timeLeft <= 0) {
          clearInterval(countdownInterval);
          try { await ctx.telegram.deleteMessage(ctx.chat.id, countdownMsg.message_id); } catch {}
          return;
        }
        const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
        const secs = String(timeLeft % 60).padStart(2, "0");
        const percentage = Math.round((timeLeft / totalSecs) * 100);
        const filledBars = Math.round(((totalSecs - timeLeft) / totalSecs) * 15);
        const bar = "█".repeat(15 - filledBars) + "░".repeat(filledBars);

        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            countdownMsg.message_id,
            undefined,
            `⏳ Deleting in ${mins}:${secs}...\n\n${bar} ${percentage}%`,
            { parse_mode: "Markdown" }
          );
        } catch {}
      }, 1000);

      delete otpSessions[uid];
    } catch (e) {
      console.error("OTP Check Error:", e.message);
      ctx.reply("⚠️ OTP Validation Failed.");
    }
    return;
}
  
  // 🧩 Setup Buttons
  if (step === "awaiting_start_image" && ctx.message.photo) {
    try {
      const store = JSON.parse(fs.readFileSync("storage.json"));
      const photo = ctx.message.photo.pop();
      const sent = await ctx.telegram.sendPhoto(store.storage_channel, photo.file_id, {
        caption: "📦 DD4K Start Image"
      });

      let cap = JSON.parse(fs.readFileSync("captions.json", "utf8")) || {};
      cap.start = cap.start || {};
      cap.start.message_id = sent.message_id;
      fs.writeFileSync("captions.json", JSON.stringify(cap, null, 2));

      ctx.reply("✅ Image saved!\n📌 Now send *Button 1 Text*", { parse_mode: "Markdown" });
      awaitingStep[uid] = "awaiting_button1_text";
    } catch (e) {
      console.log(e);
      ctx.reply("❌ Failed saving image.");
    }
    return;
  }

  if (step === "awaiting_button1_text" && ctx.message.text) {
    let cap = JSON.parse(fs.readFileSync("captions.json", "utf8")) || {};
    cap.start = cap.start || {};
    cap.start.button1 = cap.start.button1 || {};
    cap.start.button1.text = ctx.message.text;
    fs.writeFileSync("captions.json", JSON.stringify(cap, null, 2));
    ctx.reply("✅ Button 1 Text saved!\n🔗 Now send *Button 1 Link*", { parse_mode: "Markdown" });
    awaitingStep[uid] = "awaiting_button1_link";
    return;
  }

  if (step === "awaiting_button1_link" && ctx.message.text) {
    let cap = JSON.parse(fs.readFileSync("captions.json", "utf8")) || {};
    cap.start = cap.start || {};
    cap.start.button1 = cap.start.button1 || {};
    cap.start.button1.link = ctx.message.text;
    fs.writeFileSync("captions.json", JSON.stringify(cap, null, 2));
    ctx.reply("✅ Button 1 Link saved!\nSend *Button 2 Text* or type `cancel` to skip.", { parse_mode: "Markdown" });
    awaitingStep[uid] = "awaiting_button2_text";
    return;
  }

  if (step === "awaiting_button2_text" && ctx.message.text) {
    if (ctx.message.text.toLowerCase() === "cancel") {
      ctx.reply("❌ Button 2 skipped!");
      awaitingStep[uid] = null;
      return;
    }
    let cap = JSON.parse(fs.readFileSync("captions.json", "utf8")) || {};
    cap.start = cap.start || {};
    cap.start.button2 = cap.start.button2 || {};
    cap.start.button2.text = ctx.message.text;
    fs.writeFileSync("captions.json", JSON.stringify(cap, null, 2));
    ctx.reply("✅ Button 2 Text saved!\n🔗 Now send Button 2 Link", { parse_mode: "Markdown" });
    awaitingStep[uid] = "awaiting_button2_link";
    return;
  }

  if (step === "awaiting_button2_link" && ctx.message.text) {
    let cap = JSON.parse(fs.readFileSync("captions.json", "utf8")) || {};
    cap.start = cap.start || {};
    cap.start.button2 = cap.start.button2 || {};
    cap.start.button2.link = ctx.message.text;
    fs.writeFileSync("captions.json", JSON.stringify(cap, null, 2));
    ctx.reply("✅ Button 2 Link saved! 🎉");
    awaitingStep[uid] = null;
    return;
  }

  // 🎬 Batch Creation Flow
  if (batchU) {
    if (batchU.step === "awaiting_first" && fwd) {
      batchU.chat_id = fwd.id;
      batchU.start_id = ctx.message.forward_from_message_id;
      batchU.step = "awaiting_last";
      return ctx.reply("📤 Now forward the LAST message.");
    }

    if (batchU.step === "awaiting_last" && fwd) {
      batchU.end_id = ctx.message.forward_from_message_id;
      batchU.step = "awaiting_title";
      return ctx.reply("🎬 Now send *Movie Name*", { parse_mode: "Markdown" });
    }

    if (batchU.step === "awaiting_title" && ctx.message.text) {
      const title = ctx.message.text.trim();
      const code = title.slice(0, 4).toLowerCase() + "1604";

      let bs = JSON.parse(fs.readFileSync("batches.json", "utf8")) || {};
      bs[title] = {
        chat_id: batchU.chat_id,
        start: batchU.start_id,
        end: batchU.end_id,
        code
      };

      fs.writeFileSync("batches.json", JSON.stringify(bs, null, 2));
      const link = `https://${process.env.PROJECT_DOMAIN}.glitch.me/${title}`;
      ctx.reply(`✅ Batch Saved!\n🔗 ${link}\n🔐 ${code}`, { parse_mode: "Markdown" });
      delete batchSteps[uid];
    }

    return;
  }

  // ✏️ Permanent & Custom Captions
  if (step === "awaiting_permanent_caption") {
    let cap = JSON.parse(fs.readFileSync("captions.json", "utf8")) || {};
    cap.permanent = ctx.message.text;
    fs.writeFileSync("captions.json", JSON.stringify(cap, null, 2));
    awaitingStep[uid] = null;
    return ctx.reply("✅ Permanent caption saved!");
  }

  if (step === "awaiting_batch_caption_key") {
    awaitingStep[uid] = { stage: "awaiting_caption_value", batch_key: ctx.message.text.trim() };
    return ctx.reply("✏️ Now send the custom caption for this batch.");
  }

  if (typeof step === "object" && step.stage === "awaiting_caption_value") {
    let cap = JSON.parse(fs.readFileSync("captions.json", "utf8")) || {};
    cap.custom = cap.custom || {};
    cap.custom[step.batch_key] = ctx.message.text;
    fs.writeFileSync("captions.json", JSON.stringify(cap, null, 2));
    awaitingStep[uid] = null;
    return ctx.reply(`✅ Custom caption for *${step.batch_key}* saved!`, { parse_mode: "Markdown" });
  }
});

// 🔁 Callback Handler
bot.on("callback_query", async (ctx) => {
  try {
  const data = ctx.callbackQuery.data;
  const uid = ctx.from.id;

  // ✅ Always check retry first (works for ALL users)
  if (data.startsWith("retry_direct_")) {
    console.log("🔁 Retry button clicked:", data);
    const payload = decodeURIComponent(data.split("retry_direct_")[1]);
    const subscribed = await isUserSubscribed(ctx);

    if (!subscribed) {
      return ctx.answerCbQuery("❗ Still not subscribed!", { show_alert: true });
    }

    if (payload && payload.startsWith("batch_")) {
      const batchKey = payload.replace("batch_", "");
      const batches = JSON.parse(fs.readFileSync("batches.json", "utf8"));
      const b = batches[batchKey];

      if (!b) return ctx.reply("❌ Batch not found!");

      otpSessions[ctx.from.id] = {
        type: "batch_otp",
        batch_key: batchKey
      };

      return ctx.reply(
        `🔐 Please enter your *valid OTP* to unlock *${batchKey}*`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔑 Get OTP via DD4K Bot", url: "https://t.me/Dd4kTwins_otp_bot?start=start" }]
            ]
          }
        }
      );
    } else {
      return ctx.reply("✅ Subscribed! Please /start again or try your action.");
    }
}
  // ✅ After Retry — apply admin check for other buttons only
  if (!adminIDs.includes(uid)) return;

  let st = JSON.parse(fs.readFileSync("storage.json", "utf8")) || {};

if (data === "switch_mirror") {
  if (!st.mirror_channel) return ctx.answerCbQuery("⚠️ Mirror not set.");

  try {
    // 1. BACKUP current batches.json before overwrite
    if (fs.existsSync("batches.json")) {
      fs.copyFileSync("batches.json", "batches_backup_before_switch.json");
    }

    // 2. READ storagemirror.json
    if (!fs.existsSync("storagemirror.json")) {
      return ctx.reply("❌ Mirror batch data not found.");
    }
    const mirrorBatchData = fs.readFileSync("storagemirror.json", "utf8");
    fs.writeFileSync("batches.json", mirrorBatchData); // Replace main batches

    // 3. Promote mirror_channel → storage_channel
    const updatedStorage = {
      ...st, // keep everything
      storage_channel: st.mirror_channel,
      mirror_channel: null // reset mirror for next cycle
    };
    fs.writeFileSync("storage.json", JSON.stringify(updatedStorage, null, 2));

    // 4. Clear storagemirror.json
    fs.writeFileSync("storagemirror.json", "{}");

    // 5. Notify admin
    await ctx.editMessageText(
      "✅ *Mirror Channel promoted to Main Storage!*\n\nAll synced batches are now LIVE 💥\nYou can now use /setmirror to assign a new mirror.",
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("❌ Switch Mirror Error:", e.message);
    await ctx.reply("❌ Switch Failed: " + e.message);
  }

  ctx.answerCbQuery();
}
if (data === "sync_to_mirror") {
  if (!st.mirror_channel || !st.storage_channel) return ctx.answerCbQuery("⚠️ Mirror or Storage not set.");

  try {
    const batches = JSON.parse(fs.readFileSync("batches.json", "utf8"));
const synced = fs.existsSync("syncqueue.json")
  ? JSON.parse(fs.readFileSync("syncqueue.json", "utf8"))
  : {};
const rows = [];

for (const title of Object.keys(batches)) {
  if (!synced[title]) {
    rows.push([{ text: `🔄 Sync ${title}`, callback_data: `sync_batch_${title}` }]);
  }
}

if (!rows.length) {
  return ctx.editMessageText("✅ All batches are already synced!", { parse_mode: "Markdown" });
}

    await ctx.editMessageText(
      `📦 *Sync Mirror Mode*\n\nTap below to manually forward batches to your Mirror Channel.\nEach tap = full message range → forwarded + tracked.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: rows
        }
      }
    );
  } catch (e) {
    console.error("Sync menu error:", e.message);
    await ctx.reply("❌ Failed to load batches: " + e.message);
  }

  ctx.answerCbQuery();
}

if (data.startsWith("sync_batch_")) {
  const title = data.split("sync_batch_")[1];
  const batches = JSON.parse(fs.readFileSync("batches.json", "utf8"));
  const storage = JSON.parse(fs.readFileSync("storage.json", "utf8"));
  const mirror = st.mirror_channel;

  if (!batches[title]) return ctx.answerCbQuery("❌ Batch not found!");
  if (!mirror) return ctx.answerCbQuery("⚠️ Mirror not set!");

  const b = batches[title];
  let mirrorStart = null;
  let mirrorEnd = null;
  let mirrorSuccess = 0;

  // Initialize storage
  let mirrorBatches = fs.existsSync("storagemirror.json")
    ? JSON.parse(fs.readFileSync("storagemirror.json", "utf8"))
    : {};

  await ctx.reply(`🔁 Syncing *${title}* to Mirror...`, { parse_mode: "Markdown" });

  for (let i = b.start; i <= b.end; i++) {
    while (true) {
      try {
        const sent = await ctx.telegram.copyMessage(
          mirror,
          b.chat_id,
          i
        );

        if (!mirrorStart) mirrorStart = sent.message_id;
        mirrorEnd = sent.message_id;
        mirrorSuccess++;

        await delay(1000); // avoid flood wait
        break;
      } catch (e) {
        const msg = e.description?.toLowerCase() || "";
        if (msg.includes("retry after")) {
          const wait = parseInt(msg.match(/retry after (\d+)/)?.[1] || "5");
          console.log(`⏳ Floodwait on ${i}, waiting ${wait}s`);
          await delay(wait * 1000);
        } else {
          console.warn(`⚠️ Failed to forward msg ${i}:`, e.description);
          break;
        }
      }
    }
  }

  // Save mirror batch data
  if (mirrorStart && mirrorEnd) {
    mirrorBatches[title] = {
      chat_id: mirror,
      start: mirrorStart,
      end: mirrorEnd
    };

    fs.writeFileSync("storagemirror.json", JSON.stringify(mirrorBatches, null, 2));
    // ✅ Mark this batch as synced
  const synced = fs.existsSync("syncqueue.json") ? JSON.parse(fs.readFileSync("syncqueue.json", "utf8")) : {};
  synced[title] = true;
  fs.writeFileSync("syncqueue.json", JSON.stringify(synced, null, 2));

    await ctx.reply(`✅ *${title}* synced!\n🔢 Files: ${mirrorSuccess}`, { parse_mode: "Markdown" });
  } else {
    await ctx.reply(`❌ *${title}* failed to sync properly.`, { parse_mode: "Markdown" });
  }

  ctx.answerCbQuery();
}
  
  } catch (err) {
    console.error("❌ Callback Query Error:", err.message);
    ctx.answerCbQuery("⚠️ Something went wrong!");
  }
});

// 🛠️ CLEANUP
bot.telegram.deleteWebhook();
bot.launch();

// 🧾 COMMAND LIST
bot.telegram.setMyCommands([
  { command: "start", description: "😈 Start the Monster" },
  { command: "batch", description: "🎬 Create a new batch" },
  { command: "batches", description: "📂 View all batches" },
  { command: "delete", description: "🗑️ Delete a batch" },
  { command: "setadmin", description: "⚙️ Set Channels" },
  { command: "setupstart", description: "🎨 Customize Start Screen" },
  { command: "backup", description: "💾 Backup JSON files" },
  { command: "permanentcaption", description: "📌 Set Permanent Caption" },
  { command: "custombatchcaption", description: "🎯 Set Caption for Batch" },
  { command: "setmirror", description: "📡 Set Mirror Channel" },
  { command: "switchstorage", description: "🔁 Switch/Sync Storage" },
]);

console.log("🤖 DD4K Monster Bot Live!");
