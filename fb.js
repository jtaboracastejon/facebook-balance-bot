import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function getAccountBalance() {
    const { FB_AD_ACCOUNT_ID, FB_ACCESS_TOKEN } = process.env;
    
    if (!FB_AD_ACCOUNT_ID || !FB_ACCESS_TOKEN) {
        throw new Error('Faltan credenciales de Facebook en el archivo .env');
    }

    try {
        const url = `https://graph.facebook.com/v19.0/${FB_AD_ACCOUNT_ID}?fields=amount_spent,balance,spend_cap&access_token=${FB_ACCESS_TOKEN}`;

        const res = await axios.get(url);
        const data = res.data;

        const amountSpent = parseInt(data.amount_spent || 0);
        const balanceDue = parseInt(data.balance || 0);
        const spendCap = parseInt(data.spend_cap || 0);

        const remainingBudget = (spendCap - amountSpent) / 100;
        const dueAmount = balanceDue / 100;

        return {
            amountSpent: amountSpent / 100,
            spendCap: spendCap / 100,
            dueAmount,
            remainingBudget,
        };
    } catch (error) {
        console.error('Error al obtener datos de Facebook:', error.response?.data || error.message);
        throw new Error('No se pudo conectar con la API de Facebook');
    }
}