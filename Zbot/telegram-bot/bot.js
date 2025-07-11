const TelegramBot = require('node-telegram-bot-api');

// 🔐 Bot token (keep private!)
const TOKEN = '7608968443:AAFNQpZmrgPhfe5NY7MFuUk5eJl8AI1wmPA';

// 👑 Owner / Super Admin Telegram user ID
const OWNER_ID = 7919627989; // number, not string

// 📦 Initial configuration (start empty, owner must set)
const config = {
  X_CHANNEL_ID: null,     // Main channel ID unset initially
  ABC_CHANNEL_ID: null,   // Sub channel ID unset initially
  ABC_LINK: '',           // Invite link unset initially
};

// ⏳ Track pending join requests to X
const pendingX = new Map();

async function startBot() {
  const bot = new TelegramBot(TOKEN);

  try {
    await bot.deleteWebHook();
    console.log('Webhook deleted (if any).');
  } catch (err) {
    console.error('Failed to delete webhook:', err.message);
  }

  bot.startPolling();
  console.log('🤖 Bot is running with polling...');

  // 📬 Notify owner safely
  async function notifyOwner(text) {
    try {
      await bot.sendMessage(OWNER_ID, text);
    } catch (err) {
      console.error('❌ Failed to notify owner:', err.message);
    }
  }

  // 📥 Handle join requests
  bot.on('chat_join_request', async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    // If config not set, notify owner and ignore requests
    if (!config.X_CHANNEL_ID || !config.ABC_CHANNEL_ID || !config.ABC_LINK) {
      await bot.sendMessage(OWNER_ID,
        `⚠️ Join request from user ${userId} in chat ${chatId}, but configuration is incomplete.\n` +
        `Please set main channel, sub channel, and invite link using /mainChannel, /subChannel, and /link commands.`);
      return;
    }

    if (chatId !== config.X_CHANNEL_ID && chatId !== config.ABC_CHANNEL_ID) {
      console.log(`Ignored join request for unconfigured chat ID: ${chatId}`);
      return;
    }

    const userName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
    const firstName = msg.from.first_name || 'User';
    const now = Date.now();

    if (chatId === config.X_CHANNEL_ID) {
      pendingX.set(userId, { msg, timestamp: now });
      console.log(`⏳ Stored join request in X for user ${userId} at ${new Date(now).toISOString()}`);

      try {
        // Send clickable invite link using Markdown
        await bot.sendMessage(
          userId,
          `👋 Hello, ${firstName}!\n\nTo complete your request, please also request to join this channel:\n[Join here](${config.ABC_LINK})\n\nOnce you’ve requested that, you’ll be approved in this group.`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error(`❌ Failed to message user ${userId}:`, err.message);
      }

    } else if (chatId === config.ABC_CHANNEL_ID) {
      const pending = pendingX.get(userId);
      if (pending) {
        const elapsedMs = now - pending.timestamp;
        if (elapsedMs <= 60 * 1000) {
          try {
            await bot.approveChatJoinRequest(config.X_CHANNEL_ID, userId);
            console.log(`✅ Approved user ${userId} (${userName}) in X`);
            pendingX.delete(userId);
          } catch (err) {
            console.error(`❌ Failed to approve ${userId} in X:`, err.message);
            await notifyOwner(`❗ Failed to approve user ${userId} in X: ${err.message}`);
          }
        } else {
          console.log(`⏳ Request too old for user ${userId}.`);
        }
      } else {
        console.log(`⏳ No pending X request for user ${userId}.`);
      }
    }
  });

  // 📩 Owner commands and user messages
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    const isOwner = userId === OWNER_ID;
    const isPrivateChat = msg.chat.type === 'private';
    const isInConfiguredChannel = chatId === config.X_CHANNEL_ID || chatId === config.ABC_CHANNEL_ID;

    if (!isOwner && !isInConfiguredChannel && !isPrivateChat) return; // Ignore messages outside allowed scope

    console.log(`Message from ${chatId} (${userId}): ${text}`);

    try {
      if (isOwner) {
        if (text.startsWith('/')) {
          const parts = text.trim().split(' ');
          const command = parts[0].toLowerCase();
          const arg = parts.slice(1).join(' ').trim();

          switch (command) {
            case '/ping':
              await bot.sendMessage(chatId, 'Pong! You are the owner.');
              break;

            case '/help':
              await bot.sendMessage(
                chatId,
                `📖 *Owner Commands:*\n` +
                `/ping – Check bot is alive\n` +
                `/help – Show this help message\n` +
                `/mainChannel <id> – Set main channel (must start with -100)\n` +
                `/subChannel <id> – Set sub channel\n` +
                `/link <t.me link> – Set invite link\n` +
                `/reset – Reset all config\n` +
                `/status – View current status`,
                { parse_mode: 'Markdown' }
              );
              break;

            case '/mainchannel':
              if (!arg.startsWith('-100')) {
                await bot.sendMessage(chatId, '❌ Invalid main channel ID. It must start with -100');
              } else {
                config.X_CHANNEL_ID = Number(arg);
                await bot.sendMessage(chatId, `✅ mainChannel set to ${config.X_CHANNEL_ID}`);
              }
              break;

            case '/subchannel':
              if (!arg.startsWith('-100')) {
                await bot.sendMessage(chatId, '❌ Invalid sub channel ID. It must start with -100');
              } else {
                config.ABC_CHANNEL_ID = Number(arg);
                await bot.sendMessage(chatId, `✅ subChannel set to ${config.ABC_CHANNEL_ID}`);
              }
              break;

            case '/link':
              if (!arg.startsWith('https://t.me/')) {
                await bot.sendMessage(chatId, '❌ Invalid invite link. Must be a valid t.me link.');
              } else {
                config.ABC_LINK = arg;
                await bot.sendMessage(chatId, '✅ Invite link updated.');
              }
              break;

            case '/status':
              try {
                const mainInfo = config.X_CHANNEL_ID ? await bot.getChat(config.X_CHANNEL_ID) : null;
                const subInfo = config.ABC_CHANNEL_ID ? await bot.getChat(config.ABC_CHANNEL_ID) : null;

                let statusText = '📊 *Current Configuration:*\n';

                if (config.X_CHANNEL_ID) {
                  const isAdmin = await bot.getChatMember(config.X_CHANNEL_ID, bot.id)
                    .then(res => res.status)
                    .catch(() => 'left');
                  statusText += `\n📌 *Main Channel:*\nName: ${mainInfo?.title || 'N/A'}\nID: \`${config.X_CHANNEL_ID}\`\nBot Status: ${isAdmin}`;
                } else {
                  statusText += '\n📌 *Main Channel:* Not Set';
                }

                if (config.ABC_CHANNEL_ID) {
                  const isAdmin = await bot.getChatMember(config.ABC_CHANNEL_ID, bot.id)
                    .then(res => res.status)
                    .catch(() => 'left');
                  statusText += `\n\n📎 *Sub Channel:*\nName: ${subInfo?.title || 'N/A'}\nID: \`${config.ABC_CHANNEL_ID}\`\nBot Status: ${isAdmin}`;
                } else {
                  statusText += '\n\n📎 *Sub Channel:* Not Set';
                }

                statusText += `\n\n🔗 *Invite Link:*\n${config.ABC_LINK || 'Not Set'}`;

                await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
              } catch (err) {
                await bot.sendMessage(chatId, `❌ Failed to fetch status: ${err.message}`);
              }
              break;

            case '/reset':
              config.X_CHANNEL_ID = null;
              config.ABC_CHANNEL_ID = null;
              config.ABC_LINK = '';
              pendingX.clear();
              await bot.sendMessage(chatId, '✅ Configuration reset.\nYou can now set new values using `/mainChannel`, `/subChannel`, and `/link`.');
              break;

            default:
              await bot.sendMessage(chatId, `❓ Unknown command: ${command}`);
          }
        } else {
          await bot.sendMessage(chatId, `Owner says: ${text}`);
        }
      } else if (isPrivateChat || isInConfiguredChannel) {
        await bot.sendMessage(chatId, '👋 Hello! Only the owner can use special commands.');
      }
    } catch (err) {
      console.error('❌ Error in message handler:', err.message);
      await notifyOwner(`❗ Error from user ${userId}: ${err.message}`);
    }
  });

  // 🚨 Bot added to a group/channel
  bot.on('my_chat_member', async (msg) => {
    const status = msg.new_chat_member?.status;
    const chat = msg.chat;

    if (status === 'member' || status === 'administrator') {
      const chatId = chat.id;
      const title = chat.title || chat.username || 'Unnamed';
      const type = chat.type === 'channel' ? 'Channel' : chat.type;

      const message = `📢 Bot added to new ${type}:\n\n📛 *${title}*\n🆔 \`${chatId}\`\n\nUse:\n` +
        `/mainChannel ${chatId}\n/subChannel ${chatId}`;

      try {
        await bot.sendMessage(OWNER_ID, message, { parse_mode: 'Markdown' });
        console.log(`🔔 Notified owner about new ${type}: ${chatId}`);
      } catch (err) {
        console.error(`❌ Could not notify owner: ${err.message}`);
      }
    }
  });

  // ❌ Polling errors
  bot.on('polling_error', async (error) => {
    console.error('Polling error:', error.message);
    const desc = error.response?.body?.description || error.message;
    const code = error.response?.body?.error_code || 'Unknown';
    await notifyOwner(`⚠️ Polling error ${code}: ${desc}`);
  });

  // 🔥 Fatal errors
  process.on('uncaughtException', async (err) => {
    console.error('❗ Uncaught Exception:', err);
    await notifyOwner(`🚨 Uncaught Exception: ${err.message}`);
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('❗ Unhandled Rejection:', reason);
    await notifyOwner(`🚨 Unhandled Rejection: ${reason}`);
    process.exit(1);
  });

  return bot;
}

startBot().catch((err) => {
  console.error('Failed to start bot:', err);
});
