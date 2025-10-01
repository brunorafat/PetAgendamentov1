const cron = require('node-cron');
const { db } = require('./database');
const { sendReminderMessage } = require('./whatsapp');

// Set timezone
process.env.TZ = 'America/Sao_Paulo';

// Cache for reminder interval to avoid querying every minute
let cachedReminderInterval = null;
let lastIntervalCheck = 0;

module.exports = (bot) => {
    // Schedule a task to run every minute
    cron.schedule('* * * * *', async () => {
        console.log('Running a task every minute to check for appointment reminders.');

        try {
            const reminderInterval = await getReminderInterval();
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            
            console.log(`Checking appointments for ${today} at ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

            const appointments = await getAppointmentsForDay(today);
            
            for (const appointment of appointments) {
                await processAppointmentReminder(appointment, reminderInterval, now, bot);
            }
            
        } catch (error) {
            console.error('Error in cron task:', error);
        }
    });
};

async function getReminderInterval() {
    const now = Date.now();
    
    if (cachedReminderInterval && (now - lastIntervalCheck) < 3600000) { // 1 hour cache
        return cachedReminderInterval;
    }
    
    try {
        const { rows } = await db.query('SELECT reminder_interval FROM reminder_settings WHERE id = 1');
        cachedReminderInterval = rows.length > 0 ? rows[0].reminder_interval : 24; // Default to 24 hours
        lastIntervalCheck = now;
        return cachedReminderInterval;
    } catch (err) {
        console.error('Error getting reminder interval:', err);
        return 24; // Return default on error
    }
}

async function processAppointmentReminder(appointment, reminderInterval, now, bot) {
    try {
        const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}:00-03:00`);
        const reminderTime = new Date(appointmentDateTime.getTime() - reminderInterval * 60 * 60 * 1000);
        
        console.log(`Appointment ${appointment.id}: ${appointmentDateTime.toLocaleString('pt-BR')} | Reminder time: ${reminderTime.toLocaleString('pt-BR')}`);
        
        const shouldSendReminder = now >= reminderTime && 
                                 now <= appointmentDateTime &&
                                 !appointment.reminder_sent;
        
        if (shouldSendReminder) {
            console.log(`Sending reminder for appointment ${appointment.id}`);
            
            await sendReminderMessage(appointment);
            await markReminderAsSent(appointment.id);
            
            console.log(`Reminder sent for appointment ${appointment.id}`);

            let session = await bot.getSession(appointment.phone);
            session.state = 'awaiting_reminder_response';
            session.tempData = session.tempData || {};
            session.tempData.appointmentId = appointment.id;
            session.tempData.reminderSentAt = now.toISOString();
            
            await bot.saveSession(appointment.phone, session);
            console.log(`Session state for ${appointment.phone} set to awaiting_reminder_response`);
        }
        
    } catch (error) {
        console.error(`Failed to process reminder for appointment ${appointment.id}:`, error);
    }
}

async function getAppointmentsForDay(date) {
    try {
        const { rows } = await db.query(
            `SELECT * FROM appointments 
             WHERE date = $1 AND status = 'confirmed' AND reminder_sent = false
             ORDER BY time ASC`,
            [date]
        );
        return rows || [];
    } catch (err) {
        console.error('Database error getting appointments:', err);
        return [];
    }
}

async function markReminderAsSent(appointmentId) {
    try {
        await db.query(
            'UPDATE appointments SET reminder_sent = true, reminder_sent_at = CURRENT_TIMESTAMP WHERE id = $1',
            [appointmentId]
        );
        console.log(`Appointment ${appointmentId} marked as reminder sent`);
    } catch (err) {
        console.error(`Database error marking reminder as sent for appointment ${appointmentId}:`, err);
        throw err;
    }
}