const express = require('express');
const { db } = require('./database');
const router = express.Router();

// Appointments
router.get('/appointments', async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT a.*, p.name as professional_name, s.duration 
            FROM appointments a
            LEFT JOIN professionals p ON a.professional_id = p.id
            LEFT JOIN services s ON a.service = s.name
            WHERE a.status = $1
            ORDER BY a.date, a.time
        `, ['confirmed']);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/appointments/professional/:id', async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT a.*, p.name as professional_name, s.duration 
            FROM appointments a
            LEFT JOIN professionals p ON a.professional_id = p.id
            LEFT JOIN services s ON a.service = s.name
            WHERE a.status = $1 AND a.professional_id = $2
            ORDER BY a.date, a.time
        `, ['confirmed', req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/appointments/:date', async (req, res) => {
    const { date } = req.params;
    try {
        const { rows } = await db.query('SELECT * FROM appointments WHERE date = $1 AND status = $2', [date, 'confirmed']);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/appointments', async (req, res) => {
    const { pet_name, owner_name, phone, service, date, time, professional_id } = req.body;
    try {
        const { rows } = await db.query(
            `INSERT INTO appointments (pet_name, owner_name, phone, service, date, time, status, professional_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [pet_name, owner_name, phone, service, date, time, 'confirmed', professional_id]
        );
        res.json({ id: rows[0].id, message: 'Appointment created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/appointments/:id', async (req, res) => {
    const { pet_name, owner_name, phone, service, date, time, status, professional_id } = req.body;
    try {
        const result = await db.query(
            `UPDATE appointments 
             SET pet_name = $1, owner_name = $2, phone = $3, service = $4, date = $5, time = $6, status = $7, professional_id = $8
             WHERE id = $9`,
            [pet_name, owner_name, phone, service, date, time, status, professional_id, req.params.id]
        );
        res.json({ changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/appointments/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
        res.json({ changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Services
router.get('/services', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT id, name, price, duration FROM services');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/services', async (req, res) => {
    const { name, price, duration } = req.body;
    try {
        const { rows } = await db.query('INSERT INTO services (name, price, duration) VALUES ($1, $2, $3) RETURNING id', [name, price, duration]);
        res.json({ id: rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/services/:id', async (req, res) => {
    const { name, price, duration } = req.body;
    try {
        const result = await db.query('UPDATE services SET name = $1, price = $2, duration = $3 WHERE id = $4', [name, price, duration, req.params.id]);
        res.json({ changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/services/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM services WHERE id = $1', [req.params.id]);
        res.json({ changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Professionals
router.get('/professionals', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM professionals');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/professionals', async (req, res) => {
    const { name } = req.body;
    try {
        const { rows } = await db.query('INSERT INTO professionals (name) VALUES ($1) RETURNING id', [name]);
        res.json({ id: rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/professionals/:id', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await db.query('UPDATE professionals SET name = $1 WHERE id = $2', [name, req.params.id]);
        res.json({ changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/professionals/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM professionals WHERE id = $1', [req.params.id]);
        res.json({ changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Customers
router.get('/customers', async (req, res) => {
    const query = `
        SELECT 
            c.id, 
            c.phone, 
            c.owner_name, 
            STRING_AGG(p.name, ', ') AS pet_names
        FROM customers c
        LEFT JOIN pets p ON c.id = p.customer_id
        GROUP BY c.id, c.phone, c.owner_name
        ORDER BY c.owner_name
    `;
    try {
        const { rows } = await db.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/customers', async (req, res) => {
    const { owner_name, phone, pet_name } = req.body;
    let fullPhone = phone.startsWith('55') ? phone : `55${phone}`;

    try {
        const { rows: existing } = await db.query('SELECT * FROM customers WHERE phone = $1', [fullPhone]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Este número de telefone já está cadastrado.' });
        }

        const { rows: newCustomer } = await db.query('INSERT INTO customers (owner_name, phone) VALUES ($1, $2) RETURNING id', [owner_name, fullPhone]);
        const customerId = newCustomer[0].id;
        await db.query('INSERT INTO pets (customer_id, name) VALUES ($1, $2)', [customerId, pet_name]);
        res.json({ id: customerId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/customers/:id', async (req, res) => {
    const { owner_name, phone, pet_name } = req.body;
    try {
        await db.query('UPDATE customers SET owner_name = $1, phone = $2 WHERE id = $3', [owner_name, phone, req.params.id]);
        const result = await db.query('UPDATE pets SET name = $1 WHERE customer_id = $2', [pet_name, req.params.id]);
        res.json({ changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/customers/:id', async (req, res) => {
    try {
        // Note: This doesn't delete associated pets, you might want to add that
        const result = await db.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
        res.json({ changes: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Date Settings
router.get('/date-settings', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM date_settings WHERE id = 1');
        if (rows.length > 0) {
            res.json(rows[0]); // config is already JSONB
        } else {
            const defaultConfig = {
                daysToShow: 5,
                excludeWeekends: true,
                excludedDays: [0],
                startFromTomorrow: true
            };
            res.json({ id: 1, config: defaultConfig });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/date-settings', async (req, res) => {
    const { config } = req.body;
    try {
        await db.query(
            `INSERT INTO date_settings (id, config, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = CURRENT_TIMESTAMP`,
            [config]
        );
        res.json({ message: 'Date settings updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Time Settings
router.get('/time-settings', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM time_settings WHERE id = 1');
        if (rows.length > 0) {
            res.json(rows[0]); // config is already JSONB
        } else {
            const defaultConfig = {
                startTime: '09:00',
                endTime: '17:00',
                interval: 60,
                lunchBreak: { start: '12:00', end: '13:00' }
            };
            res.json({ id: 1, config: defaultConfig });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/time-settings', async (req, res) => {
    const { config } = req.body;
    try {
        await db.query(
            `INSERT INTO time_settings (id, config, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = CURRENT_TIMESTAMP`,
            [config]
        );
        res.json({ message: 'Time settings updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reminder Settings
router.get('/reminder-settings', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM reminder_settings WHERE id = 1');
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            const defaultConfig = { reminder_interval: 24 };
            res.json({ id: 1, config: defaultConfig });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/reminder-settings', async (req, res) => {
    const { reminder_interval } = req.body;
    try {
        await db.query(
            `INSERT INTO reminder_settings (id, reminder_interval, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET reminder_interval = $1, updated_at = CURRENT_TIMESTAMP`,
            [reminder_interval]
        );
        res.json({ message: 'Reminder settings updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Stats
router.get('/stats', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    try {
        const { rows } = await db.query(
            `SELECT 
                COUNT(CASE WHEN date = $1 AND status = 'confirmed' THEN 1 END) as today,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as total,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
             FROM appointments`,
            [today]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/webhook', async (req, res) => {
    const { data } = req.body;

    if (data && data.message && data.message.button_reply) {
        const buttonId = data.message.button_reply.id;
        const [action, appointmentId] = buttonId.split('_');

        try {
            if (action === 'confirm') {
                await db.query('UPDATE appointments SET status = $1 WHERE id = $2', ['confirmed', appointmentId]);
                console.log(`Appointment ${appointmentId} confirmed.`);
            } else if (action === 'cancel') {
                await db.query('UPDATE appointments SET status = $1 WHERE id = $2', ['canceled', appointmentId]);
                console.log(`Appointment ${appointmentId} canceled.`);
            }
        } catch (err) {
            console.error(`Error updating appointment ${appointmentId}:`, err.message);
        }
    }

    res.sendStatus(200);
});

module.exports = router;