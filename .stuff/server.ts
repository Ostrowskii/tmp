const DELTA_CLOCK = Math.random() * 60_000;

function now() {
  return Date.now() + DELTA_CLOCK;
}

import { WebSocketServer, WebSocket, RawData } from 'ws';

const PORT = 8081;

const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log(`Servidor WebSocket ativo em ws://localhost:${PORT}`);
});

wss.on('connection', (socket: WebSocket) => {
  socket.on('message', (data: RawData) => {
    //setTimeout(() => {
      //....
      console.log(`Mensagem recebida: ${data.toString()}`);
      //....
    //}, 50 + Math.random() * 450);
  });
});

wss.on('error', (error: Error) => {
  console.error('Erro no servidor WebSocket:', error);
});

setInterval(() => {
  console.log(now());
}, 10);



//MENSAGENS:

//client: ["get_time"] → servidor
//server: ["inform_time", 100_000] → client


//ALGORITMO:

//CLIENT:

//de 1 em 1 segundo:
  //request_time = tempo local
  //envia get_time pro servidor

//quando receber ["inform_time", server_time] do servidor:
  //current_time = tempo local


//100_000 perguntei as horas
//100_006 servidor respondeu: 230_000
//100_015 eu recebi essa resposta



//server_time_error_ping = 5
//server_time_delta = 232_000 - 2.5



//102_000 perguntei as horas
//102_000 eu recebi essa resposta


//server_time_error_ping = 5
//server_time = 232_000 - 2.5



//server_time_delta = 132_000
//server_time_error = 5


//function server_time() {
  //return Date.now() + server_time_delta;
//}


//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
//console.log(server_time());
















