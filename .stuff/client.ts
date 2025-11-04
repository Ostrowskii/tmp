import WebSocket from 'ws';

const [, , rawMessage] = process.argv;

if (!rawMessage) {
  console.error('Uso: node client.ts "mensagem"');
  process.exit(1);
}

const socket = new WebSocket('ws://127.0.0.1:8081');

socket.once('open', () => {
  socket.send(rawMessage, (error?: Error) => {
    if (error) {
      console.error('Erro ao enviar mensagem:', error);
      process.exit(1);
      return;
    }

    console.log('Mensagem enviada com sucesso.');
    socket.close();
  });
});

socket.once('error', (error: Error) => {
  console.error('Falha ao conectar com o servidor WebSocket:', error);
  process.exitCode = 1;
});

setInterval(() => {
  console.log(Date.now());
}, 10);



