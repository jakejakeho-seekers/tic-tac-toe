const express = require('express');
const EventSource = require('eventsource');
const app = express();
const axios = require('axios');

const arenaEndpoint = 'https://cis2021-arena.herokuapp.com';

const gameData = {};

app.use(express.json());
app.get('/', (req, res) => {
    res.send('Hello World!');
});

let battleIds = [];

app.post('/tic-tac-toe', (req, res) => {
    res.send({ success: true });
    let battleId = req.body.battleId;
    battleIds.push(battleId);
    init(battleId);

    connectSSE(req.body.battleId);
    console.log('battleIds = ', battleIds);
});

// init game data
const init = (battleId) => {
    if (!gameData[battleId]) {
        gameData[battleId] = {};
        gameData[battleId].iam = '';
        gameData[battleId].rows = [
            [{ position: 'NW', player: '' }, { position: 'N', player: '' }, { position: 'NE', player: '' }],
            [{ position: 'W', player: '' }, { position: 'C', player: '' }, { position: 'E', player: '' }],
            [{ position: 'SW', player: '' }, { position: 'S', player: '' }, { position: 'SE', player: '' }],
        ];
        gameData[battleId].logs = '';
        gameData[battleId].lastMove = 'X';
        gameData[battleId].lastMoveTime = new Date();
    }
}


const addBattleLogs = function(battleId) {
    const args = Array.from(arguments);
    let str = '';
    for (let i = 1; i < args.length; i++) {
        str += JSON.stringify(args[i]) + " ";
    }
    // console.log(str);
    gameData[battleId].logs = gameData[battleId].logs + str + "\n";
}

const printLog = (battleId) => {
    console.log('battleId: ' + battleId);
    console.log(gameData[battleId].logs);
}

let connectedSSE = [];

let connectSSE = (battleId) => {
    init(battleId);
    let timerId;
    let url = `${arenaEndpoint}/tic-tac-toe/start/${battleId}`;
    addBattleLogs(battleId, `connecting ${url}`);
    const eventSource = new EventSource(url);
    eventSource.onopen = ((open) => {
        addBattleLogs(battleId, `onOpen`);
        connectedSSE.push(battleId);
        timerId = setInterval(() => {
            let timeDiff = (new Date().getTime() - gameData[battleId].lastMoveTime.getTime()) / 1000;
            if (timeDiff > 18) {
                addBattleLogs(battleId, `timeDiff ${timeDiff} seconds`);
                flipTable(battleId);
                clearInterval(timerId);
            }
        }, 10);
    });
    eventSource.onmessage = (message) => { onMessage(message, battleId, eventSource) };
    eventSource.onerror = ((error) => {
        console.log('Battle ended ', battleId);
        printLog(battleId);
        clearInterval(timerId);
        eventSource.close();
    });
}


const onMessage = ((message, battleId = 'abc', eventSource) => {
    init(battleId);
    addBattleLogs(battleId, ` onMessage`, message);
    const data = JSON.parse(message.data);
    game(battleId, data);
    if (data.winner) {
        addBattleLogs(battleId, data.winner === "DRAW" ? "DRAW" : data.winner === gameData[battleId].iam ? "I Win" : "I Lose");
        if (eventSource)
            eventSource.close();
    }
});

const game = (battleId, data) => {
    if (data.action === '"(╯°□°)╯︵ ┻━┻"') {
        init(battleId);
    }

    if (data.youAre) {
        gameData[battleId].iam = data.youAre;
        if (gameData[battleId].iam === 'O') {
            let move = bestMove(battleId);
            putSymbol(battleId, move);
            addBattleLogs(battleId, move);
        }
    }

    if (data.action === 'putSymbol') {
        // update the map
        const player = data.player;
        const position = data.position;
        let success = saveSymbol(battleId, player, position);
        printRows(battleId, gameData[battleId].rows);

        if (success && data.player === NotIam(gameData[battleId].iam)) {
            let move = bestMove(battleId);
            putSymbol(battleId, move);
        }
    }
};

const flipTable = (battleId) => {
    let url = `${arenaEndpoint}/tic-tac-toe/play/${battleId}`;
    addBattleLogs(battleId, 'filpTable sending');
    axios.post(url, {
            "action": "(╯°□°)╯︵ ┻━┻"
        }).then(() => {
            addBattleLogs(battleId, `flipped the table success`);
        })
        .catch((error) => {
            addBattleLogs(battleId, `failed to flip the table`, error);
        });
}



const saveSymbol = (battleId, player, position) => {
    let validPosistions = gameData[battleId].rows.flatMap((row) => row.map(element => element.position));
    if (!validPosistions.includes(position) || gameData[battleId].lastMove === player || (player !== 'O' && player !== 'X')) {
        flipTable(battleId);
        return false;
    }
    let success = false;
    gameData[battleId].rows.forEach((row) => {
        row.forEach((element) => {
            if (element.position === position) {
                if (element.player === '') {
                    gameData[battleId].lastMove = player;
                    element.player = player;
                    success = true;
                    gameData[battleId].lastMoveTime = new Date((gameData[battleId].lastMoveTime.getTime() + 2000));
                }
            }
        });
    });
    if (!success) {
        flipTable(battleId);
    }
    return success;
}


const putSymbol = (battleId, position) => {
    setTimeout(() => {
        let url = `${arenaEndpoint}/tic-tac-toe/play/${battleId}`;
        addBattleLogs(battleId, 'putSymbol ', position);
        axios.post(url, {
                action: "putSymbol",
                position,
            }).then((result) => {
                addBattleLogs(battleId, 'putSymbol result = ', result.data);
            })
            .catch(() => {
                addBattleLogs(battleId, 'putSymbol Error');
            })
    }, 100);
};

const printRows = (battleId = '', rows) => {
    rows.forEach((row, i) => {
        let rowStr = '';
        row.forEach((element, j) => {
            rowStr += `${element.player === '' ? '_' :element.player} `;
        });
        addBattleLogs(battleId, rowStr);
    });
    addBattleLogs(battleId, '')
}

const bestMove = (battleId) => {
    // minimax
    let move = '';
    let iam = gameData[battleId].iam;
    let rows = gameData[battleId].rows;
    let bestScore = -Infinity;
    for (let i = 0; i < rows.length; i++) {
        for (let j = 0; j < rows.length; j++) {
            if (rows[i][j].player === '') {
                rows[i][j].player = iam;
                let score = minimax(battleId, rows, 0, false);
                if (score > bestScore) {
                    bestScore = score;
                    move = rows[i][j].position;
                }
                rows[i][j].player = '';
            }
        }
    }
    return move;
}

let scores = (battleId, player) => {
    if (gameData[battleId].iam === player) {
        return 10;
    } else if (NotIam(gameData[battleId].iam) === player) {
        return -10;
    } else {
        return 0;
    }
}

function minimax(battleId, rows, depth, isMaximizing) {
    let winner = checkWinner(rows);
    if (winner === 'O' || winner === 'X' || winner === 'tie') {
        let score = scores(battleId, winner);
        // console.log(battleId, rows, depth, isMaximizing)
        // console.log('winner = ', winner);
        // console.log('score = ', score);
        return score;
    }

    if (isMaximizing) {
        let bestScore = -Infinity;
        for (let i = 0; i < rows.length; i++) {
            for (let j = 0; j < rows.length; j++) {
                if (rows[i][j].player === '') {
                    rows[i][j].player = gameData[battleId].iam;
                    let score = minimax(battleId, rows, depth + 1, false);
                    rows[i][j].player = '';
                    bestScore = Math.max(score, bestScore);
                }
            }
        }
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (let i = 0; i < rows.length; i++) {
            // console.log('i = ', i);
            for (let j = 0; j < rows.length; j++) {
                if (rows[i][j].player === '') {
                    rows[i][j].player = NotIam(gameData[battleId].iam);
                    let score = minimax(battleId, rows, depth + 1, true);
                    rows[i][j].player = '';
                    bestScore = Math.min(score, bestScore);
                }
            }
        }
        return bestScore;
    }
}

const checkPlayerWin = (rows, player) => {
    // Check rows
    for (let i = 0; i < rows.length; i++) {
        let same = 0;
        for (let j = 0; j < rows.length; j++) {
            if (rows[i][j].player === player) {
                same++;
            }
        }
        if (same === rows.length)
            return true;
    }

    // Check Columns
    for (let j = 0; j < rows.length; j++) {
        let same = 0;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][j].player === player) {
                same++;
            }
        }
        if (same === rows.length)
            return true;
    }

    // Check diag
    let same = 0;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][i].player === player) {
            same++;
        }
        if (same === rows.length)
            return true;
    }

    // Check anti- diag
    same = 0;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][rows.length - 1 - i].player === player) {
            same++;
        }
        if (same === rows.length)
            return true;
    }
    return false;
}

const checkWinner = (rows) => {
    if (checkPlayerWin(rows, 'O')) {
        return 'O';
    }
    if (checkPlayerWin(rows, 'X')) {
        return 'X';
    }
    if (allFilled(rows)) {
        return 'tie';
    } else {
        return null;
    }
}

const allFilled = (rows) => {
    for (let i = 0; i < rows.length; i++) {
        for (let j = 0; j < rows.length; j++) {
            if (rows[i][j].player === '') {
                return false;
            }
        }
    }
    return true;
}

const NotIam = (iam) => {
    if (iam === 'O')
        return 'X';
    else if (iam === 'X')
        return 'O';
}

const port = 4000;
app.listen(port, () => {
    console.log(`Tic - tac - toe listening at http: //localhost:${port}`);
});

const test = () => {
        let messages = [{ "type": "message", "data": "{\"youAre\":\"O\",\"id\":\"d12c8c3b-c610-4e54-a29b-ac4fbe2af545\"}", "lastEventId": "", "origin": "https://cis2021-arena.herokuapp.com" },
            { "type": "message", "data": "{\"player\":\"O\",\"action\":\"putSymbol\",\"position\":\"NW\"}", "lastEventId": "", "origin": "https://cis2021-arena.herokuapp.com" },
            { "type": "message", "data": "{\"action\":\"putSymbol\",\"position\":\"\",\"player\":\"X\"}", "lastEventId": "", "origin": "https://cis2021-arena.herokuapp.com" },
            { "type": "message", "data": "{\"player\":\"O\",\"action\":\"(╯°□°)╯︵ ┻━┻\"}", "lastEventId": "", "origin": "https://cis2021-arena.herokuapp.com" },
        ];
        messages.forEach((message) => {
            onMessage(message);
        });
        printLog('abc');
    }
    // test();