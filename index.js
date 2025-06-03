import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { getAccountBalance } from './fb.js';
import { sendTelegramMessage } from './utils.js';
import { scheduleJob } from 'node-schedule';
import fs from 'fs';
import path from 'path';
import express from 'express'; // Add this import

dotenv.config();

console.log('Starting Facebook Balance Bot...');
console.log(`Environment PORT: ${process.env.PORT}`);

// Create Express server for keep-alive pings
const app = express();
const PORT = process.env.PORT || 3000;

console.log(`Attempting to bind to port ${PORT}...`);

// Simple route that returns 200 OK for keep-alive services
app.get('/', (req, res) => {
  res.status(200).send('Facebook Balance Bot is running!');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the server - move this UP in your code, before the bot setup
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const STATE_FILE = 'notification_state.json';

// Estado de las notificaciones enviadas
let notificationState = {
    notified50Percent: false,
    notified75Percent: false,
    notified90Percent: false,
    notified100Percent: false
};

// Cargar estado previo si existe
function loadNotificationState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            notificationState = JSON.parse(data);
            console.log('Estado de notificaciones cargado:', notificationState);
        }
    } catch (err) {
        console.error('Error al cargar el estado de notificaciones:', err);
    }
}

// Guardar estado actual
function saveNotificationState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(notificationState), 'utf8');
    } catch (err) {
        console.error('Error al guardar el estado de notificaciones:', err);
    }
}

// Resetear el estado de notificaciones (para el próximo ciclo de facturación)
function resetNotificationState() {
    notificationState = {
        notified50Percent: false,
        notified75Percent: false,
        notified90Percent: false,
        notified100Percent: false
    };
    saveNotificationState();
    console.log('Estado de notificaciones reseteado');
}

// --- Notificación automática según porcentaje del umbral ---
async function checkBalanceAndNotify() {
    try {
        const data = await getAccountBalance();
        const threshold = parseFloat(process.env.THRESHOLD);
        const percentageOfThreshold = (data.dueAmount / threshold) * 100;

        console.log(`Saldo actual: L${data.dueAmount.toFixed(2)}, ${percentageOfThreshold.toFixed(1)}% del umbral ($${threshold})`);

        // Notificación al 50%
        if (percentageOfThreshold >= 50 && percentageOfThreshold < 75 && !notificationState.notified50Percent) {
            await sendTelegramMessage(`⚠️ *Alerta de saldo pendiente: 50% del límite*
El saldo pendiente ha alcanzado $${data.dueAmount.toFixed(2)}, lo que representa el ${percentageOfThreshold.toFixed(1)}% del umbral configurado ($${threshold}).`);
            notificationState.notified50Percent = true;
            saveNotificationState();
        }

        // Notificación al 75%
        if (percentageOfThreshold >= 75 && percentageOfThreshold < 90 && !notificationState.notified75Percent) {
            await sendTelegramMessage(`🔔 *Alerta de saldo pendiente: 75% del límite*
El saldo pendiente ha alcanzado $${data.dueAmount.toFixed(2)}, lo que representa el ${percentageOfThreshold.toFixed(1)}% del umbral configurado ($${threshold}).`);
            notificationState.notified75Percent = true;
            saveNotificationState();
        }

        // Notificación al 90%
        if (percentageOfThreshold >= 90 && percentageOfThreshold < 100 && !notificationState.notified90Percent) {
            await sendTelegramMessage(`🚨 *Alerta de saldo pendiente: 90% del límite*
El saldo pendiente ha alcanzado $${data.dueAmount.toFixed(2)}, lo que representa el ${percentageOfThreshold.toFixed(1)}% del umbral configurado ($${threshold}).
Se recomienda realizar un pago pronto.`);
            notificationState.notified90Percent = true;
            saveNotificationState();
        }

        // Notificación al 100% o más
        if (percentageOfThreshold >= 100 && !notificationState.notified100Percent) {
            await sendTelegramMessage(`🔴 *ALERTA CRÍTICA: Se ha superado el límite*
El saldo pendiente ha alcanzado $${data.dueAmount.toFixed(2)}, lo que supera el umbral configurado ($${threshold}).
Se requiere un pago inmediato.`);
            notificationState.notified100Percent = true;
            saveNotificationState();
        }

    } catch (err) {
        console.error('❌ Error al comprobar saldo automático:', err.message);
    }
}

// --- Respuesta al comando /saldo ---
bot.onText(/\/saldo/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const data = await getAccountBalance();
        const threshold = parseFloat(process.env.THRESHOLD);
        const percentageOfThreshold = (data.dueAmount / threshold) * 100;

        const message = `💰 *Estado de cuenta publicitaria*:
- Saldo pendiente: L${data.dueAmount.toFixed(2)}
- Umbral configurado: L${threshold}
- Porcentaje del umbral: ${percentageOfThreshold.toFixed(1)}%`;

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
        await bot.sendMessage(chatId, '❌ Ocurrió un error al consultar tu saldo.');
        console.error('❌ Error al responder a /saldo:', err.message);
    }
});

// --- Comando para ayuda ---
bot.onText(/\/ayuda/, async (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `🤖 *Facebook Balance Bot - Comandos disponibles*:
    
/saldo - Muestra el estado actual de la cuenta publicitaria
/ayuda - Muestra este mensaje de ayuda
/reset - Reinicia el sistema de alertas (uso administrativo)`;

    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// --- Comando para resetear notificaciones (solo para administradores) ---
bot.onText(/\/reset/, async (msg) => {
    const chatId = msg.chat.id;
    const adminChatId = process.env.ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    console.log(`Comando /reset recibido por el chat ID: ${chatId}`);

    if (chatId.toString() === adminChatId) {
        resetNotificationState();
        await bot.sendMessage(chatId, '✅ Sistema de alertas reiniciado correctamente.');
    } else {
        await bot.sendMessage(chatId, '❌ No tienes permisos para usar este comando.');
    }
});

// --- Comando para probar notificaciones al chat principal ---
bot.onText(/\/testchat/, async (msg) => {
    const chatId = msg.chat.id;
    const adminChatId = process.env.ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    
    if (chatId.toString() === adminChatId) {
        try {
            // Crear un mensaje con información del destino
            const mainChatId = process.env.TELEGRAM_CHAT_ID;
            
            // Enviar mensaje de prueba directamente al chat principal
            await sendTelegramMessage(`🧪 *Prueba de notificación al chat principal*
ID del chat de destino: \`${mainChatId}\`
Este mensaje confirma que el sistema de notificaciones está funcionando correctamente.`);
            
            // Notificar al administrador
            await bot.sendMessage(chatId, `✅ Mensaje de prueba enviado correctamente al chat principal (ID: ${mainChatId}).`);
        } catch (error) {
            await bot.sendMessage(chatId, `❌ Error al enviar mensaje de prueba: ${error.message}`);
            console.error('Error en prueba de notificación al chat principal:', error);
        }
    } else {
        await bot.sendMessage(chatId, '❌ No tienes permisos para usar este comando.');
    }
});
// --- Verificación periódica (cada 2 horas) ---
scheduleJob('0 */2 * * *', () => {
    console.log('🔄 Ejecutando verificación programada de saldo');
    checkBalanceAndNotify();
});

// --- Ejecutar al iniciar ---
console.log('🤖 Facebook Balance Bot iniciado');
loadNotificationState();
checkBalanceAndNotify();