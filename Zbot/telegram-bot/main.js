const TelegramBot = require('node-telegram-bot-api');

// 🔐 Bot token (keep private!)
const token = '7608968443:AAFNQpZmrgPhfe5NY7MFuUk5eJl8AI1wmPA';
const bot = new TelegramBot(token, { polling: true });

// 🔒 Private group/channel IDs — must start with -100
const X_CHANNEL_ID = -1002719631252;    // Main group/channel
const ABC_CHANNEL_ID = -1002556455707;  // Secondary group/channel

// 🔗 Invite link to ABC channel
const ABC_LINK = 'https://t.me/+7-KA6bFhBpQ1YTM1';

// 🗂️ Map to store pending join requests in X with timestamps
// Format: userId => { msg, timestamp }
const pendingX = new Map();

console.log('🤖 Bot is running and listening for join requests...');

bot.on('chat_join_request', async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const userName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
  const firstName = msg.from.first_name || 'User';

  console.log(`📥 Join request from user ${userId} (${userName}) to chat ID: ${chatId}`);

  const now = Date.now();

  if (chatId === X_CHANNEL_ID) {
    // Store the join request along with the timestamp
    pendingX.set(userId, { msg, timestamp: now });
    console.log(`⏳ Stored join request in X for user ${userId} at ${new Date(now).toISOString()}`);

    // Send message with ABC invite link
    try {
      await bot.sendMessage(userId,
        `👋 Hello, ${firstName}!\n\nTo complete your request, please also request to join this channel:\n${ABC_LINK}\n\nOnce you’ve requested that, you’ll be approved in this group.`);
      console.log(`📨 Sent instructions to user ${userId}`);
    } catch (err) {
      console.error(`❌ Failed to send message to user ${userId}:`, err.message);
    }

  } else if (chatId === ABC_CHANNEL_ID) {
    // User requested to join ABC, check if user requested X recently (within 1 minute)
    const pending = pendingX.get(userId);

    if (pending) {
      const elapsedMs = now - pending.timestamp;
      if (elapsedMs <= 60 * 5000) { // 1 minute in ms
        try {
          await bot.approveChatJoinRequest(X_CHANNEL_ID, userId);
          console.log(`✅ Approved user ${userId} (${userName}) in X (requested ABC within last minute)`);

          // Remove from pendingX after approval
          pendingX.delete(userId);

        } catch (err) {
          console.error(`❌ Failed to approve user ${userId} in X:`, err.message);
        }
      } else {
        console.log(`⏳ User ${userId} requested ABC but X request was older than 1 minute, no approval.`);
      }
    } else {
      console.log(`⏳ User ${userId} requested ABC but no recent X request found.`);
    }
  }
});
