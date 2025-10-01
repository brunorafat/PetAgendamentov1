
function getMenuMessage(customer) {
    return `Olá! Sou sua assistente virtual.\n\nDigite o número da opção desejada:\n\n*1* - Novo agendamento\n*2* - Cancelar Agendamento\n*3* - Falar com Atendente`;
}

function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

module.exports = { getMenuMessage, capitalizeFirstLetter };
