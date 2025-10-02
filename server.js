require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { initDb, db } = require('./database');
const apiRoutes = require('./routes');
const PetGroomingBot = require('./bot');
const { initializeWhatsAppService, sendWhatsAppMessage, checkWhatsAppService } = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 3333;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Inicializar bot DEPOIS que o banco estiver pronto
let bot;

// In-memory store for notifications
let notifications = [];

// API Routes
app.use('/api', apiRoutes);

app.get('/api/status', async (req, res) => {
    const status = await checkWhatsAppService();
    res.json(status);
});

app.get('/api/notifications', (req, res) => {
    res.json(notifications);
    notifications = []; // Clear notifications after they are sent
});

// Webhook Evolution API - Recebe mensagens
app.post('/webhook/evolution', async (req, res) => {
    try {
        const { event, instance, data } = req.body;

        if (event === 'messages.upsert') {
            const message = data.message;
            const phone = data.key.remoteJid.split('@')[0];
            const text = message.conversation || message.extendedTextMessage?.text || '';
            const userName = data.pushName || 'Cliente';

            if (text && !data.key.fromMe) {
                const response = await bot.processMessage(phone, text, userName);
                
                await sendWhatsAppMessage(phone, response);
                
                await saveMessage(phone, text, 'user');
                await saveMessage(phone, response, 'bot');
            }
        }

        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook interno - Recebe eventos do frontend
app.post('/webhook/pet-grooming', (req, res) => {
    const { type, booking, timestamp } = req.body;
    
    if (type === 'new_booking') {
        const message = `✅ Novo agendamento recebido!\n\nPet: ${booking.petName}\nTutor: ${booking.ownerName}\nServiço: ${booking.service}\nData: ${booking.date}\nHorário: ${booking.time}`;
        
        if (booking.phone) {
            sendWhatsAppMessage(booking.phone, message);
        }
    }
    
    res.json({ status: 'received' });
});

app.post('/webhook/internal', (req, res) => {
    const notification = req.body;
    notifications.push(notification);
    res.json({ status: 'ok' });
});

// Salvar mensagem no banco
async function saveMessage(phone, message, type) {
    try {
        await db.query(
            'INSERT INTO messages (phone, message, type) VALUES ($1, $2, $3)',
            [phone, message, type]
        );
    } catch (err) {
        console.error('Error saving message:', err);
    }
}

// Servir o frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Função de inicialização
async function startServer() {
    try {
        console.log('🔄 Inicializando banco de dados...');
        await initDb();
        console.log('✅ Banco de dados inicializado!');
        
        console.log('🔄 Inicializando bot...');
        bot = new PetGroomingBot();
        await bot.loadInitialData();
        console.log('✅ Bot inicializado!');
        
        console.log('🔄 Inicializando serviço WhatsApp...');
        await initializeWhatsAppService();
        console.log('✅ Serviço WhatsApp inicializado!');
        
        console.log('🔄 Inicializando scheduler...');
        require('./scheduler')(bot);
        console.log('✅ Scheduler inicializado!');
        
        app.listen(PORT, () => {
            console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
            console.log(`📱 Webhook Evolution API: http://localhost:${PORT}/webhook/evolution`);
            console.log(`🔗 Webhook interno: http://localhost:${PORT}/webhook/pet-grooming`);
        });
        
    } catch (error) {
        console.error('❌ Erro ao inicializar o servidor:', error);
        process.exit(1);
    }
}

// Iniciar servidor
startServer();