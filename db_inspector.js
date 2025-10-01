require('dotenv').config();
const { db } = require('./database');

async function inspectDb() {
    try {
        console.log('--- Inspecting Database ---');

        const appointments = await db.query('SELECT * FROM appointments');
        console.log('Appointments:', appointments.rows);

        const reminderSettings = await db.query('SELECT * FROM reminder_settings');
        console.log('Reminder Settings:', reminderSettings.rows);

        // Add other tables you want to inspect
        const services = await db.query('SELECT * FROM services');
        console.log('Services:', services.rows);

        const sessions = await db.query('SELECT * FROM chat_sessions');
        console.log('Chat Sessions:', sessions.rows);

        console.log('--- Inspection Complete ---');
    } catch (err) {
        console.error('Error inspecting database:', err);
    } finally {
        await db.end(); // Close the connection pool
    }
}

inspectDb();