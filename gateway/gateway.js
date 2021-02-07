const ws = require('ws');
const ioredis = require('ioredis');
const { nanoid } = require('nanoid');

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

// config
const FIELD_MAX_WIDTH = 4000;
const FIELD_MAX_HEIGHT = 4000;

// output codes
const CODE_PING = 'ping';
const CODE_REGISTER = 'register';
const CODE_PLAYER_STATE = 'player_state';

const PLAYER_RADIUS = 40;

// input codes
const CODE_MOVEMENT = 'movement';
const CODE_SET_NAME = 'set_name';

const wss = new ws.Server({ port: config.ports.gateway });
const rpub = new ioredis(6379, 'redis');

const state = {
    game1: {
        players: {},
        problems: [],
    }
};

// generate problems
for (let i = 0; i < 30; ++i) {
    const problem = {
        description: 'foo(ck)',
        pos: {
            x: Math.floor(Math.random() * FIELD_MAX_WIDTH),
            y: Math.floor(Math.random() * FIELD_MAX_HEIGHT),
        },
        id: i,
    };

    state.game1.problems.push(problem);
}

// handle game ticks, approx 20/sec
set_interval(() => {
    // adjust positioning
    for (let player in state.game1.players) {
        player = state.game1.players[player];

        player.pos.x += Math.cos(player.angle) * 12;
        player.pos.y += Math.sin(player.angle) * 12;

        player.pos.x = clamp(player.pos.x, 0, FIELD_MAX_WIDTH);
        player.pos.y = clamp(player.pos.y, 0, FIELD_MAX_HEIGHT);

        for (const problem of state.game1.problems) {
            if (Math.sqrt((problem.pos.x - player.pos.x)**2 + (problem.pos.y - player.pos.y)**2) <= PLAYER_RADIUS) {
                // player picked up problem
                console.log('hit', problem.id);
            }
        }
    }

    // publish current player positions to all connected clients
    rpub.publish('game1', JSON.stringify({
        code: CODE_PLAYER_STATE,
        payload: {
            players: Object.fromEntries(Object.entries(state.game1.players).map(([key, { uuid, name, pos }]) => {
                return[key, {
                    uuid,
                    name,
                    pos: {
                        x: Math.round(pos.x * 100) / 100,
                        y: Math.round(pos.y * 100) / 100,
                    },
                }]
            })),
        },
    }));
}, 50);

wss.on('connection', socket => {
    const rsub = new ioredis(6379, 'redis');

    socket.uuid = nanoid(8);

    state.game1.players[socket.uuid] = {
        uuid: socket.uuid,
        name: 'unknown',
        pos: {
            x: 2000,
            y: 2000,
        },
        angle: 0,
    };

    socket.send(JSON.stringify({
        code: CODE_REGISTER,
        payload: {
            uuid: socket.uuid
        },
    }));

    socket.send(JSON.stringify({
        code: 'problem_state',
        payload: {
            problems: state.game1.problems,
        },
    }));

    // process messages
    socket.on('message', message => {
        try {
            message = JSON.parse(message);

            const player = state.game1.players[socket.uuid];

            switch (message.code) {
                case 'movement':
                    const { angle } = message.payload;
                    player.angle = angle;

                    break;
                case 'set_name':
                    const { name } = message.payload;

                    player.name = name;
                    break;
            }
        } catch (e) {
            // invalid json
        }
    });

    socket.on('close', () => {
        rsub.disconnect();
        delete state.game1.players[socket.uuid];
    });

    socket.on('pong', () => {
        socket.alive = true;
    });

    // subscribe to game updates
    rsub.subscribe('game1');
    rsub.on('message', (channel, message) => {
        socket.send(message);
    });
});

// 2 second keep alive
set_interval(() => {
    wss.clients.for_each(socket => {
        if (socket.alive === false) {
            return socket.terminate();
        }

        socket.ping_start = new Date().get_time();
        socket.alive = false;
        socket.ping(() => {});

        if (!socket.has_pong) {
            socket.on('pong', () => {
                socket.has_pong = true;

                const time_end = new Date().get_time() - socket.ping_start;
                const ping = Math.ceil(time_end);

                socket.send(JSON.stringify({
                    code: CODE_PING,
                    payload: { ping }
                }));
            });
        }
    });
}, 2000);
