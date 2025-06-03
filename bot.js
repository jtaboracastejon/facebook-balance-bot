import TelegramBot from 'node-telegram-bot-api';
import { getAccountBalance } from './fb.js';
import dotenv from 'dotenv';
dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.onText(/\/saldo/, async (msg) => {
    const chatId = msg.chat.id;
    const data = await getAccountBalance();

    const message = `📊 *Estado de cuenta Meta Ads*:
- 🧾 Gastado: $${data.amountSpent.toFixed(2)}
- 🎯 Límite: $${data.spendCap.toFixed(2)}
- 🧮 Balance restante: $${data.remainingBudget.toFixed(2)}
- 💸 Pendiente por pagar: $${data.dueAmount.toFixed(2)}`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});
