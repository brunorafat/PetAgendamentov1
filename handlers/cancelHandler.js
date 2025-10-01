const { getFutureAppointmentsByPhone, db } = require('../database');
const fetch = require('node-fetch');

function formatDate(dateString) {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
}

async function listAppointmentsForCancellation(phone, session) {
    try {
        const appointments = await getFutureAppointmentsByPhone(phone);

        if (!appointments || appointments.length === 0) {
            session.state = 'menu';
            return 'Você não possui agendamentos futuros para cancelar.';
        }

        session.tempData.appointmentsForCancellation = appointments;
        let response = 'Qual agendamento você gostaria de cancelar?\n\n';
        appointments.forEach((appt, index) => {
            response += `*${index + 1}* - *${appt.pet_name} - ${appt.service} - ${formatDate(appt.date)} às ${appt.time}*\n`;
        });
        response += '\nDigite o número do agendamento para cancelar.';
        
        session.state = 'awaiting_cancellation_choice';
        return response;
    } catch (err) {
        console.error('Error fetching appointments for cancellation:', err);
        return '❌ Ocorreu um erro ao buscar seus agendamentos. Tente novamente mais tarde.';
    }
}

async function handleCancellationChoice(phone, session, input) {
    const choice = parseInt(input, 10) - 1;
    const appointments = session.tempData.appointmentsForCancellation;

    if (appointments && choice >= 0 && choice < appointments.length) {
        const appointment = appointments[choice];
        session.tempData.appointmentIdToCancel = appointment.id;
        session.state = 'awaiting_cancellation_confirmation';
        return `Você selecionou o agendamento *${appointment.pet_name} - ${appointment.service} - ${formatDate(appointment.date)} às ${appointment.time}*.\nDigite *1* para confirmar o cancelamento.`;
    } else {
        return 'Opção inválida. Por favor, digite o número de um dos agendamentos listados.';
    }
}

async function cancelAppointment(phone, session, input) {
    if (input !== '1') {
        session.state = 'menu';
        session.tempData = {};
        return 'Cancelamento não confirmado. Voltando ao menu.';
    }

    const appointmentId = session.tempData.appointmentIdToCancel;
    try {
        const { rows: appointments } = await db.query('SELECT * FROM appointments WHERE id = $1 AND phone = $2', [appointmentId, phone]);
        const appointment = appointments[0];

        if (!appointment) {
            return '❌ Código de agendamento não encontrado ou não pertence a você. Verifique e tente novamente.';
        }

        const result = await db.query('UPDATE appointments SET status = $1 WHERE id = $2', ['canceled', appointmentId]);

        if (result.rowCount > 0) {
            session.state = 'menu';
            session.tempData = {};

            // Send notification to frontend
            fetch('http://localhost:3333/webhook/internal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'cancellation',
                    appointment
                })
            }).catch(err => console.error('Error sending cancellation webhook:', err));

            return `✅ Agendamento *${appointment.pet_name} - ${appointment.service} - ${formatDate(appointment.date)} às ${appointment.time}* cancelado com sucesso!\n\nDigite *voltar* para retornar ao menu.`;
        } else {
            return '❌ Não foi possível cancelar o agendamento. Tente novamente.';
        }
    } catch (err) {
        console.error('Error canceling appointment:', err);
        return '❌ Ocorreu um erro ao cancelar o agendamento. Tente novamente mais tarde.';
    }
}

module.exports = { listAppointmentsForCancellation, handleCancellationChoice, cancelAppointment };
