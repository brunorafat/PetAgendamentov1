
const natural = require('natural');
const classifier = new natural.BayesClassifier();

// Training data
classifier.addDocument('quero agendar um horario', 'new_appointment');
classifier.addDocument('gostaria de marcar um horario', 'new_appointment');
classifier.addDocument('preciso de um agendamento', 'new_appointment');
classifier.addDocument('novo agendamento', 'new_appointment');
classifier.addDocument('agendar', 'new_appointment');

classifier.addDocument('quero cancelar um horario', 'cancel_appointment');
classifier.addDocument('gostaria de cancelar um horario', 'cancel_appointment');
classifier.addDocument('preciso cancelar um agendamento', 'cancel_appointment');
classifier.addDocument('cancelar agendamento', 'cancel_appointment');
classifier.addDocument('cancelar', 'cancel_appointment');

classifier.addDocument('falar com um atendente', 'talk_to_agent');
classifier.addDocument('falar com uma pessoa', 'talk_to_agent');
classifier.addDocument('atendente', 'talk_to_agent');

classifier.train();

function getIntent(message) {
    return classifier.classify(message);
}

module.exports = { getIntent };
