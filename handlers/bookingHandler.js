const { db } = require('../database');
const { getMenuMessage: utilsGetMenuMessage } = require('../utils');

// --- Timezone-Safe Date/Time Helpers ---

const TZ = 'America/Sao_Paulo';

// Gets the day of the week (0=Sun, 1=Mon, ...) for a given Date object, reliably in the SP timezone.
function getSaoPauloDay(date) {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
    const dayAbbr = formatter.format(date).toLowerCase();
    const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    return map[dayAbbr];
}

// Gets the day of the week (0=Sun, 1=Mon, ...) for a given "YYYY-MM-DD" string.
function getSaoPauloDayFromString(dateString) {
    const utcDate = new Date(dateString + 'T12:00:00Z'); // Use noon UTC to avoid DST issues
    return getSaoPauloDay(utcDate);
}

// Gets today's date as a reliable Date object (set to midnight in SP timezone, but interpreted in server's local time)
function getTodayInSaoPaulo() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    const isoDateString = formatter.format(now);
    return new Date(isoDateString + 'T00:00:00');
}

// --- Bot Message Generation ---

function getServicesMessage(services) {
    let msg = `Qual serviço deseja agendar?\n\nDigite o número correspondente ao serviço que deseja agendar, ou digite *voltar*:\n\n`;
    services.forEach(service => {
        msg += `*${service.id}* - ${service.name}\n`;
    });
    return msg;
}

function getPetsMessage(pets) {
    let msg = `Qual dos seus pets deseja agendar?\n\n`;
    pets.forEach((pet, index) => {
        msg += `*${index + 1}* - ${pet.name}\n`;
    });
    msg += `\n*0* - Adicionar outro pet`;
    return msg;
}

function getProfessionalsMessage(professionals) {
    let msg = `Com qual profissional deseja agendar?\n\n`;
    professionals.forEach(prof => {
        msg += `*${prof.id}* - ${prof.name}\n`;
    });
    return msg;
}

async function getAvailableDatesMessage(professionalId, serviceName) {
    if (!professionalId || !serviceName) {
        console.error('professionalId or serviceName is undefined in getAvailableDatesMessage');
        return 'Ocorreu um erro ao buscar as datas disponíveis. Por favor, tente novamente mais tarde.';
    }
    const dates = await getAvailableDates(professionalId, serviceName);
    if (dates.length === 0) {
        return 'Não há datas disponíveis para agendamento nos próximos dias. Por favor, tente mais tarde ou entre em contato.';
    }
    let msg = `Qual a data que deseja marcar?\nDigite em qual data deseja agendar, *6* para outras datas ou *voltar*:\n\n`;
    dates.forEach((date, index) => {
        msg += `*${index + 1}* - ${date.dayName}\n`;
        msg += `${date.display}\n\n`;
    });
    msg += `*6* - Data específica\nInformar outra data`;
    return msg;
}

async function getAvailableTimesMessage(date, dateDisplay, professionalId, serviceName) {
    const times = await getAvailableTimeSlots(date, professionalId, serviceName);
    if (times.length === 0) {
        return 'Não há horários disponíveis para esta data com este profissional. Por favor, escolha outra data.';
    }
    let msg = `Agendamento em: *${dateDisplay}*\nPor favor digite uma das opções de horário abaixo ou *voltar*:\n\n`;
    times.forEach((time, index) => {
        msg += `*${index + 1}* - ${time}\n`;
    });
    return msg;
}

function getConfirmationMessage(session) {
    const [year, month, day] = session.tempData.date.split('-');
    const formattedDate = `${day}/${month}/${year}`;
    return `Confirmar dados\nDATA: ${formattedDate} às ${session.tempData.time}\nServiço: ${session.tempData.service}\nPet: ${session.tempData.petName}\nTutor: ${session.tempData.ownerName}\nProfissional: ${session.tempData.professionalName}\n\n*1* - Sim\n*2* - Não`;
}

// --- Core Booking Logic ---

async function getAvailableDates(professionalId, serviceName) {
    try {
        const { rows } = await db.query('SELECT config FROM date_settings WHERE id = 1');
        if (rows.length > 0 && rows[0].config) {
            return await generateDatesFromConfig(rows[0].config, professionalId, serviceName);
        }
        // Fallback to a default if no settings are in DB
        return await generateDatesFromConfig({}, professionalId, serviceName);
    } catch (err) {
        console.error('Error loading date settings:', err);
        return await generateDatesFromConfig({}, professionalId, serviceName);
    }
}

async function generateDatesFromConfig(config, professionalId, serviceName) {
    const dates = [];
    const today = getTodayInSaoPaulo();
    const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const { daysToShow = 5, excludeWeekends = false, excludedDays = [], startFromTomorrow = true } = config;
    
    let daysAdded = 0;
    let dayOffset = startFromTomorrow ? 1 : 0;
    let safetyBreak = 0; // Avoid infinite loops

    while (daysAdded < daysToShow && safetyBreak < 60) {
        const date = new Date(today);
        date.setDate(today.getDate() + dayOffset);
        
        const dayOfWeek = getSaoPauloDay(date);
        const dateString = date.toISOString().split('T')[0];

        let shouldExclude = (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) || excludedDays.includes(dayOfWeek);
        
        if (!shouldExclude && await hasAvailableSlotsForDate(dateString, professionalId, serviceName)) {
            let dayName = days[dayOfWeek];
            if (dayOffset === 0) dayName = 'Hoje';
            if (dayOffset === 1 && startFromTomorrow) dayName = 'Amanhã';

            dates.push({
                date: dateString,
                dayName: dayName,
                display: `${date.getDate().toString().padStart(2, '0')} de ${months[date.getMonth()]} de ${date.getFullYear()}`
            });
            daysAdded++;
        }
        dayOffset++;
        safetyBreak++;
    }
    return dates;
}

async function getAvailableTimeSlots(date, professionalId, serviceName) {
    try {
        const { rows: serviceRows } = await db.query('SELECT duration FROM services WHERE name = $1', [serviceName]);
        const serviceDuration = serviceRows.length > 0 ? serviceRows[0].duration : 60;

        const { rows: settingsRows } = await db.query('SELECT config FROM time_settings WHERE id = 1');
        if (settingsRows.length > 0) {
            const config = settingsRows[0].config;
            const dayOfWeek = getSaoPauloDayFromString(date);
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayConfig = config[days[dayOfWeek]];

            if (!dayConfig) {
                return []; // Day is not configured for work
            }
            const allSlots = generateTimeSlots(dayConfig);
            return await checkAvailability(allSlots, date, professionalId, serviceDuration);
        }
        return []; // No settings found, so no slots available
    } catch (err) {
        console.error('Error in getAvailableTimeSlots:', err);
        return [];
    }
}

function generateTimeSlots(config) {
    const slots = [];
    const { startTime = '09:00', endTime = '18:00', interval = 60, lunchBreak = null } = config;
    
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    let currentTime = new Date();
    currentTime.setHours(startHour, startMinute, 0, 0);
    const endDateTime = new Date();
    endDateTime.setHours(endHour, endMinute, 0, 0);
    
    while (currentTime < endDateTime) { // Use < to ensure we don't include the endTime itself
        const timeString = currentTime.toTimeString().slice(0, 5);
        let inLunch = false;
        if (lunchBreak && lunchBreak.start && lunchBreak.end) {
            const [lunchStartHour, lunchStartMinute] = lunchBreak.start.split(':').map(Number);
            const [lunchEndHour, lunchEndMinute] = lunchBreak.end.split(':').map(Number);
            if (currentTime.getHours() * 60 + currentTime.getMinutes() >= lunchStartHour * 60 + lunchStartMinute &&
                currentTime.getHours() * 60 + currentTime.getMinutes() < lunchEndHour * 60 + lunchEndMinute) {
                inLunch = true;
            }
        }
        if (!inLunch) {
            slots.push(timeString);
        }
        currentTime.setMinutes(currentTime.getMinutes() + interval);
    }
    return slots;
}

async function checkAvailability(allSlots, date, professionalId, serviceDuration) {
    try {
        const { rows: appointments } = await db.query('SELECT time, service FROM appointments WHERE date = $1 AND professional_id = $2 AND status = $3', [date, professionalId, 'confirmed']);
        
        const bookedTimeRanges = [];
        for (const row of appointments) {
            const { rows: serviceRows } = await db.query('SELECT duration FROM services WHERE name = $1', [row.service]);
            const bookedDuration = serviceRows.length > 0 ? serviceRows[0].duration : 60;
            
            const [bookedHour, bookedMinute] = row.time.split(':').map(Number);
            const bookedStart = new Date(`${date}T${row.time}`);
            const bookedEnd = new Date(bookedStart.getTime() + bookedDuration * 60000);
            bookedTimeRanges.push({ start: bookedStart, end: bookedEnd });
        }

        const availableSlots = [];
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
        const isToday = date === now.toISOString().split('T')[0];

        for (const slot of allSlots) {
            const slotTime = new Date(`${date}T${slot}`);

            if (isToday) {
                const minTime = new Date(now.getTime() + 30 * 60000); // 30 minutes from now
                if (slotTime < minTime) continue;
            }

            const slotEnd = new Date(slotTime.getTime() + serviceDuration * 60000);
            let isAvailable = true;
            for (const bookedRange of bookedTimeRanges) {
                if (slotTime < bookedRange.end && slotEnd > bookedRange.start) {
                    isAvailable = false;
                    break;
                }
            }
            if (isAvailable) {
                availableSlots.push(slot);
            }
        }
        return availableSlots;
    } catch (err) {
        console.error('Error in checkAvailability:', err);
        return [];
    }
}

async function hasAvailableSlotsForDate(date, professionalId, serviceName) {
    const availableTimes = await getAvailableTimeSlots(date, professionalId, serviceName);
    return availableTimes.length > 0;
}

// --- State Handlers ---

async function handleServiceSelection(session, message, services, professionals) {
    const serviceId = parseInt(message);
    const service = services.find(s => s.id === serviceId);

    if (service) {
        session.tempData.service = service.name;
        session.tempData.price = service.price;
        if (session.tempData.petName) {
            session.state = 'booking_professional';
            return getProfessionalsMessage(professionals);
        } else {
            session.state = 'booking_pet_name';
            return 'Qual o nome do seu pet?';
        }
    }
    return 'Por favor, digite um número válido do serviço ou *voltar* para retornar ao menu.';
}

async function handlePetSelection(session, message, pets, services) {
    const selection = parseInt(message);
    if (selection === 0) {
        session.state = 'add_pet';
        return 'Qual o nome do novo pet?';
    }

    const pet = pets[selection - 1];

    if (pet) {
        session.tempData.petName = pet.name;
        session.state = 'booking_service';
        return getServicesMessage(services);
    }

    return 'Por favor, digite um número válido da lista de pets.';
}

async function handleNewCustomer(session, message, phone, saveCustomer) {
    session.tempData.ownerName = message;
    const customerId = await saveCustomer(phone, session.tempData.ownerName);
    session.tempData.customerId = customerId;
    session.state = 'add_pet';
    return 'Ótimo! Agora, qual o nome do seu pet?';
}

async function handleAddPet(session, message, phone, saveCustomer, savePet, services) {
    session.tempData.petName = message;
    if (!session.tempData.customerId) {
        const customerId = await saveCustomer(phone, session.tempData.ownerName);
        session.tempData.customerId = customerId;
    }
    await savePet(session.tempData.customerId, session.tempData.petName);
    session.state = 'booking_service';
    return getServicesMessage(services);
}

async function handleProfessionalSelection(session, message, professionals) {
    const professionalId = parseInt(message);
    const professional = professionals.find(p => p.id === professionalId);

    if (professional) {
        session.tempData.professionalId = professional.id;
        session.tempData.professionalName = professional.name;
        session.state = 'booking_date';
        return await getAvailableDatesMessage(session.tempData.professionalId, session.tempData.service);
    }

    return 'Por favor, digite um número válido do profissional.';
}

async function handleDateSelection(session, message) {
    const dates = await getAvailableDates(session.tempData.professionalId, session.tempData.service);
    const index = parseInt(message) - 1;

    if (message === '6') {
        session.state = 'booking_manual_date';
        return 'Por favor, informe a data desejada no formato DD/MM/AAAA:';
    }

    if (dates[index]) {
        session.tempData.date = dates[index].date;
        session.tempData.dateDisplay = `${dates[index].dayName}, ${dates[index].display}`;
        session.state = 'booking_time';
        return await getAvailableTimesMessage(session.tempData.date, session.tempData.dateDisplay, session.tempData.professionalId, session.tempData.service);
    }
    
    return 'Por favor, escolha uma data válida da lista ou digite *voltar*.';
}

async function handleManualDateInput(session, message) {
    if (message.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const parts = message.split('/');
        const [day, month, year] = parts;
        const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const date = new Date(dateString + 'T12:00:00Z');
        const today = getTodayInSaoPaulo();
        today.setHours(0, 0, 0, 0);

        if (date < today) {
            return 'Não é possível agendar para datas passadas. Por favor, escolha uma data futura no formato DD/MM/AAAA.';
        }

        // Validate that the day is not excluded
        const { rows } = await db.query('SELECT config FROM date_settings WHERE id = 1');
        if (rows.length > 0 && rows[0].config) {
            const { excludeWeekends = false, excludedDays = [] } = rows[0].config;
            const dayOfWeek = getSaoPauloDay(date);
            if ((excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) || excludedDays.includes(dayOfWeek)) {
                return 'Este dia da semana não está disponível para agendamento. Por favor, escolha outra data.';
            }
        }

        session.tempData.date = dateString;
        session.tempData.dateDisplay = message;
        session.state = 'booking_time';
        return await getAvailableTimesMessage(session.tempData.date, message, session.tempData.professionalId, session.tempData.service);
    }
    return 'Formato de data inválido. Por favor, use DD/MM/AAAA ou digite *voltar*.';
}

async function handleTimeSelection(session, message) {
    const times = await getAvailableTimeSlots(session.tempData.date, session.tempData.professionalId, session.tempData.service);
    const index = parseInt(message) - 1;

    if (times[index]) {
        session.tempData.time = times[index];
        session.state = 'booking_confirm';
        return getConfirmationMessage(session);
    }
    return 'Por favor, escolha um horário válido da lista ou digite *voltar*.';
}

async function confirmBooking(session, message, phone) {
    if (message === '1') {
        const { rows } = await saveAppointment({
            pet_name: session.tempData.petName || 'Não informado',
            owner_name: session.tempData.ownerName || 'Cliente',
            phone: phone,
            service: session.tempData.service,
            date: session.tempData.date,
            time: session.tempData.time,
            status: 'confirmed',
            professional_id: session.tempData.professionalId
        });
        const appointmentId = rows[0].id;

        const [year, month, day] = session.tempData.date.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        const confirmMessage = `✅ *Agendamento Confirmado!*\n\n📋 *Detalhes:*
📅 Data: ${formattedDate}
🕐 Horário: ${session.tempData.time}
🛁 Serviço: ${session.tempData.service}
🐾 Pet: ${session.tempData.petName}
👤 Tutor: ${session.tempData.ownerName}
💰 Valor: R$ ${session.tempData.price},00
👩‍⚕️ Profissional: ${session.tempData.professionalName}

📍 *Endereço:*
${process.env.BUSINESS_ADDRESS || 'Rua Example, 123 - Centro'}

*Código do agendamento:* #${appointmentId}

Você receberá um lembrete 1 dia antes! 📱`;

        session.state = 'menu';
        session.tempData = {};

        const customer = await getCustomerByPhone(phone);
        return confirmMessage + '\n\n' + getMenuMessage(customer);
    } else if (message === '2') {
        session.state = 'menu';
        session.tempData = {};
        const customer = await getCustomerByPhone(phone);
        return 'Agendamento cancelado. ' + getMenuMessage(customer);
    }
    return 'Por favor, digite *1* para confirmar ou *2* para cancelar.';
}

// --- Database Helpers ---

async function saveAppointment(data) {
    return db.query(
        `INSERT INTO appointments (pet_name, owner_name, phone, service, date, time, status, professional_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [data.pet_name, data.owner_name, data.phone, data.service, data.date, data.time, data.status, data.professional_id]
    );
}

async function getCustomerByPhone(phone) {
    try {
        const { rows } = await db.query('SELECT * FROM customers WHERE phone = $1', [phone]);
        return rows[0];
    } catch (err) {
        console.error('Error getting customer:', err);
    }
}

function getMenuMessage(customer) {
    return utilsGetMenuMessage(customer);
}

module.exports = {
    getServicesMessage,
    handleServiceSelection,
    getProfessionalsMessage,
    handleProfessionalSelection,
    getAvailableDatesMessage,
    handleDateSelection,
    getAvailableTimesMessage,
    handleTimeSelection,
    getConfirmationMessage,
    confirmBooking,
    getPetsMessage,
    handlePetSelection,
    handleNewCustomer,
    handleAddPet,
    handleManualDateInput
};
