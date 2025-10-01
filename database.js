require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database.');
});

const initDb = async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                pet_name TEXT NOT NULL,
                owner_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                service TEXT NOT NULL,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                professional_id INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                reminder_sent BOOLEAN DEFAULT false,
                reminder_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                phone TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id SERIAL PRIMARY KEY,
                phone TEXT NOT NULL UNIQUE,
                state TEXT DEFAULT 'menu',
                temp_data TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                paused_until TIMESTAMP WITH TIME ZONE DEFAULT NULL
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                duration INTEGER NOT NULL DEFAULT 60
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS professionals (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                phone TEXT NOT NULL UNIQUE,
                owner_name TEXT NOT NULL
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS pets (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                FOREIGN KEY (customer_id) REFERENCES customers (id)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS date_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                config JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS time_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                config JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS reminder_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                reminder_interval INTEGER NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const services = [
            { id: 1, name: 'Banho', price: 40, duration: 60 },
            { id: 2, name: 'Banho E Tosa Higiênica', price: 60, duration: 90 },
            { id: 3, name: 'Banho E Tosa Máquina', price: 70, duration: 120 },
            { id: 4, name: 'Banho E Tosa Tesoura', price: 80, duration: 120 },
            { id: 5, name: 'Corte De Unhas', price: 20, duration: 30 },
            { id: 6, name: 'Hidratação Liso Perfeito', price: 100, duration: 60 },
            { id: 7, name: 'Hidratação Termoprotetor', price: 90, duration: 60 }
        ];

        const stmtServices = 'INSERT INTO services (id, name, price, duration) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING';
        for (const service of services) {
            await client.query(stmtServices, [service.id, service.name, service.price, service.duration]);
        }

        const professionals = [
            { id: 1, name: 'Lais' },
            { id: 2, name: 'Bruno' },
            { id: 3, name: 'Carla' }
        ];

        const stmtProfessionals = 'INSERT INTO professionals (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING';
        for (const professional of professionals) {
            await client.query(stmtProfessionals, [professional.id, professional.name]);
        }

        const defaultDateConfig = {
            daysToShow: 5,
            excludeWeekends: true,
            excludedDays: [0],
            startFromTomorrow: true
        };

        await client.query('INSERT INTO date_settings (id, config) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
            [JSON.stringify(defaultDateConfig)]);

        const defaultTimeConfig = {
            "monday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "tuesday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "wednesday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "thursday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "friday": { "startTime": "09:00", "endTime": "17:00", "interval": 60, "lunchBreak": { "start": "12:00", "end": "13:00" } },
            "saturday": { "startTime": "09:00", "endTime": "12:00", "interval": 60, "lunchBreak": null },
            "sunday": null
        };

        await client.query('INSERT INTO time_settings (id, config) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
            [JSON.stringify(defaultTimeConfig)]);

        await client.query('INSERT INTO reminder_settings (id, reminder_interval) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
            [24]);

    } catch (err) {
        console.error('Error initializing database:', err.stack);
    } finally {
        client.release();
    }
};

async function getFutureAppointmentsByPhone(phone) {
    const today = new Date().toISOString().slice(0, 10);
    const query = `
        SELECT id, pet_name, service, date, time
        FROM appointments
        WHERE phone = $1 AND status IN ('pending', 'confirmed') AND date >= $2
        ORDER BY date, time`;
    try {
        const { rows } = await pool.query(query, [phone, today]);
        return rows;
    } catch (err) {
        console.error('Error fetching future appointments:', err.message);
        throw err;
    }
}

// Export the pool for querying and the initDb function
module.exports = { db: pool, initDb, getFutureAppointmentsByPhone };