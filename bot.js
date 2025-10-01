const { db } = require('./database');

const { getServicesMessage, handleServiceSelection, handlePetNameSelection, handleOwnerNameSelection, getProfessionalsMessage, handleProfessionalSelection, getAvailableDatesMessage, handleDateSelection, getAvailableTimesMessage, handleTimeSelection, getConfirmationMessage, confirmBooking, getPetsMessage, handlePetSelection, handleAddPet, handleNewCustomer } = require('./handlers/bookingHandler');
const { listAppointmentsForCancellation, handleCancellationChoice, cancelAppointment } = require('./handlers/cancelHandler');
const { getMenuMessage, capitalizeFirstLetter } = require('./utils');
const { getIntent } = require('./nlu');

class PetGroomingBot {
    constructor() {
        this.sessions = new Map();
        this.services = [];
        this.professionals = [];
        this.loadInitialData();
    }

    async loadInitialData() {
        await this.loadServices();
        await this.loadProfessionals();
    }

    async loadServices() {
        try {
            const { rows } = await db.query('SELECT * FROM services');
            this.services = rows;
        } catch (err) {
            console.error('Error loading services:', err);
        }
    }

    async loadProfessionals() {
        try {
            const { rows } = await db.query('SELECT * FROM professionals');
            this.professionals = rows;
        } catch (err) {
            console.error('Error loading professionals:', err);
        }
    }

    async getCustomerByPhone(phone) {
        try {
            const { rows } = await db.query('SELECT * FROM customers WHERE phone = $1', [phone]);
            return rows[0];
        } catch (err) {
            console.error('Error getting customer:', err);
        }
    }

    async getPetsByCustomerId(customerId) {
        try {
            const { rows } = await db.query('SELECT * FROM pets WHERE customer_id = $1', [customerId]);
            return rows;
        } catch (err) {
            console.error('Error getting pets:', err);
        }
    }

    async processMessage(phone, message, userName) {
        let session = await this.getSession(phone);

        if (session.paused_until && new Date(session.paused_until) > new Date()) {
            return '';
        }
        
        const cleanMessage = message.toLowerCase().trim();
        let response = '';

        if (cleanMessage === 'voltar') {
            session.state = 'menu';
            session.tempData = {};
            this.saveSession(phone, session);
            const customer = await this.getCustomerByPhone(phone);
            return getMenuMessage(customer);
        }

        console.log(`Current session state for ${phone}: ${session.state}`);
        console.log(`Current session tempData for ${phone}: ${JSON.stringify(session.tempData)}`);

        if (session.state === 'menu') {
            switch (cleanMessage) {
                case '1':
                    await this.loadServices();
                    await this.loadProfessionals();
                    const customer = await this.getCustomerByPhone(phone);
                    if (customer) {
                        session.tempData.customerId = customer.id;
                        session.tempData.ownerName = customer.owner_name;
                        const pets = await this.getPetsByCustomerId(customer.id);
                        if (pets && pets.length > 0) {
                            session.state = 'select_pet';
                            return getPetsMessage(pets);
                        }
 else {
                            session.state = 'add_pet';
                            return 'Você não tem pets cadastrados. Qual o nome do seu pet?';
                        }
                    } else {
                        session.state = 'new_customer';
                        return 'Olá! Para começar, qual o seu nome?';
                    }
                case '2':
                    session.state = 'cancel_appointment';
                    return listAppointmentsForCancellation(phone, session);
                case '3':
                    const pausedUntil = new Date(Date.now() + 60 * 60 * 1000);
                    session.paused_until = pausedUntil.toISOString();
                    this.saveSession(phone, session);
                    return '📞 Um atendente entrará em contato em breve!\n\nNosso horário de atendimento:\n🕐 Seg-Sex: 8h às 18h\n🕐 Sábado: 8h às 12h\n\nO atendimento automático será pausado por 60 minutos.';
                default:
                    const defaultCustomer = await this.getCustomerByPhone(phone);
                    return getMenuMessage(defaultCustomer);
            }
        } else {
            switch (session.state) {
                case 'new_customer':
                    session.tempData.ownerName = capitalizeFirstLetter(cleanMessage);
                    session.state = 'add_pet';
                    response = 'Ótimo! Agora, qual o nome do seu pet?';
                    break;
                case 'add_pet':
                    session.tempData.petName = capitalizeFirstLetter(cleanMessage);
                    if (!session.tempData.customerId) {
                        const customerId = await this.saveCustomer(phone, session.tempData.ownerName);
                        session.tempData.customerId = customerId;
                    }
                    await this.savePet(session.tempData.customerId, session.tempData.petName);
                    session.state = 'booking_service';
                    response = getServicesMessage(this.services);
                    break;
                case 'select_pet':
                    const pets = await this.getPetsByCustomerId(session.tempData.customerId);
                    const selection = parseInt(cleanMessage);
                    if (selection === 0) {
                        session.state = 'add_pet';
                        response = 'Qual o nome do novo pet?';
                    } else {
                        const pet = pets[selection - 1];
                        if (pet) {
                            session.tempData.petName = capitalizeFirstLetter(pet.name);
                            session.state = 'booking_service';
                            response = getServicesMessage(this.services);
                        } else {
                            response = 'Por favor, digite um número válido da lista de pets.';
                        }
                    }
                    break;
                case 'booking_service':
                    response = await handleServiceSelection(session, cleanMessage, this.services, this.professionals);
                    break;
                case 'booking_pet_name':
                    response = await handlePetNameSelection(session, cleanMessage);
                    break;
                case 'booking_owner_name':
                    response = await handleOwnerNameSelection(session, cleanMessage, this.professionals);
                    break;
                case 'booking_professional':
                    response = await handleProfessionalSelection(session, cleanMessage, this.professionals);
                    break;
                case 'booking_date':
                    response = await handleDateSelection(session, cleanMessage);
                    break;
                case 'booking_time':
                    response = await handleTimeSelection(session, cleanMessage);
                    break;
                case 'booking_confirm':
                    response = await confirmBooking(session, cleanMessage, phone);
                    break;
                case 'cancel_code':
                    response = await cancelAppointment(session, cleanMessage);
                    break;
                case 'awaiting_cancellation_choice':
                    response = await handleCancellationChoice(phone, session, cleanMessage);
                    break;
                case 'awaiting_cancellation_confirmation':
                    response = await cancelAppointment(phone, session, cleanMessage);
                    break;
                case 'awaiting_reminder_response':
                    const appointmentId = session.tempData.appointmentId;
                    if (cleanMessage === '1') {
                        response = 'Obrigado pela confirmação!';
                        session.state = 'menu';
                        session.tempData = {};
                    } else if (cleanMessage === '2') {
                        response = await cancelAppointment(session, appointmentId);
                        session.state = 'menu';
                        session.tempData = {};
                    } else {
                        response = 'Por favor, digite 1 para confirmar ou 2 para cancelar o agendamento.';
                    }
                    break;
                default:
                    const defaultCustomer = await this.getCustomerByPhone(phone);
                    response = getMenuMessage(defaultCustomer);
                    session.state = 'menu';
            }
        }

        this.saveSession(phone, session);
        return response;
    }

    async getSession(phone) {
        if (!this.sessions.has(phone)) {
            try {
                const { rows } = await db.query('SELECT * FROM chat_sessions WHERE phone = $1', [phone]);
                const sessionData = rows[0];

                if (sessionData) {
                    this.sessions.set(phone, {
                        state: sessionData.state,
                        tempData: JSON.parse(sessionData.temp_data || '{}'),
                        paused_until: sessionData.paused_until
                    });
                } else {
                    this.sessions.set(phone, {
                        state: 'menu',
                        tempData: {},
                        paused_until: null
                    });
                }
            } catch (err) {
                console.error('Error loading session:', err);
                this.sessions.set(phone, { state: 'menu', tempData: {}, paused_until: null });
            }
        }
        return this.sessions.get(phone);
    }

    async saveSession(phone, session) {
        this.sessions.set(phone, session);
        try {
            await db.query(
                `INSERT INTO chat_sessions (phone, state, temp_data, updated_at, paused_until) 
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
                 ON CONFLICT (phone) DO UPDATE SET state = $2, temp_data = $3, updated_at = CURRENT_TIMESTAMP, paused_until = $4`,
                [phone, session.state, JSON.stringify(session.tempData), session.paused_until]
            );
        } catch (err) {
            console.error('Error saving session:', err);
        }
    }

    async saveCustomer(phone, ownerName) {
        try {
            const { rows } = await db.query('INSERT INTO customers (phone, owner_name) VALUES ($1, $2) RETURNING id', [phone, ownerName]);
            console.log(`New customer saved: ${ownerName}`);
            return rows[0].id;
        } catch (err) {
            console.error('Error saving customer:', err);
            // Handle case where customer might already exist due to a race condition
            const { rows } = await db.query('SELECT id FROM customers WHERE phone = $1', [phone]);
            return rows[0]?.id;
        }
    }

    async savePet(customerId, petName) {
        try {
            const { rows } = await db.query('INSERT INTO pets (customer_id, name) VALUES ($1, $2) RETURNING id', [customerId, petName]);
            console.log(`New pet saved: ${petName}`);
            return rows[0].id;
        } catch (err) {
            console.error('Error saving pet:', err);
        }
    }
}

module.exports = PetGroomingBot;
