
const { getMenuMessage } = require('../utils');

async function handleMenu(session, message, customer) {
    if (customer) {
        session.state = 'booking_existing_customer';
        return getMenuMessage(customer);
    }

    switch (message) {
        case '1':
            session.state = 'booking_service';
            return 'Qual serviço deseja agendar?';
        case '2':
            session.state = 'cancel_code';
            return 'Por favor, informe o código do agendamento que deseja cancelar:';
        case '3':
            return '📞 Um atendente entrará em contato em breve!\n\nNosso horário de atendimento:\n🕐 Seg-Sex: 8h às 18h\n🕐 Sábado: 8h às 12h';
        default:
            return 'Por favor, digite 1, 2 ou 3 para escolher uma opção.';
    }
}

async function handleExistingCustomer(session, message, customer) {
    switch (message) {
        case '1':
            session.tempData.petName = customer.pet_name;
            session.tempData.ownerName = customer.owner_name;
            session.state = 'booking_service';
            return 'Qual serviço deseja agendar?';
        case '2':
            session.state = 'booking_pet_name';
            return 'Qual o nome do outro pet?';
        case '3':
            session.state = 'cancel_code';
            return 'Por favor, informe o código do agendamento que deseja cancelar:';
        case '4':
            return '📞 Um atendente entrará em contato em breve!\n\nNosso horário de atendimento:\n🕐 Seg-Sex: 8h às 18h\n🕐 Sábado: 8h às 12h';
        default:
            return 'Por favor, digite uma opção válida.';
    }
}

module.exports = { handleMenu, handleExistingCustomer };
