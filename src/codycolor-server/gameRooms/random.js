/*
 * random.js: file per la gestione dell'array gameRoom ad accoppiamento random
 */
(function () {
    let broker = require("../communication/broker");
    let logs = require("../communication/logs");
    let utils = require("./gameRoomsUtils");

    let gameRooms = [];
    let callbacks = {};


    /* -------------------------------------------------------------------------------------------- *
    * EXPORTED UTILITIES: metodi che forniscono funzioni utili per monitorare lo stato della
    * gameRoom dall'esterno del modulo.
    * -------------------------------------------------------------------------------------------- */

    // stampa a console lo stato attuale delle game room
    module.exports.printGameRooms = function() {
        logs.printLog('New random game room configuration:');

        if (gameRooms.length <= 0) {
            logs.printLog('empty');

        } else {
            let gameRoomString = '';
            for (let gameRoomIndex = 0; gameRoomIndex < gameRooms.length; gameRoomIndex++) {
                gameRoomString += gameRoomIndex.toString() + '[';
                for (let playerIndex = 0; playerIndex < gameRooms[gameRoomIndex].players.length; playerIndex++) {
                    gameRoomString += (gameRooms[gameRoomIndex].players[playerIndex].occupiedSlot ? 'x' : 'o');
                }
                gameRoomString += '] ';
                if ((gameRoomIndex + 1) % 4 === 0) {
                    logs.printLog(gameRoomString);
                    gameRoomString = '';
                }
            }
            if (gameRoomString !== '')
                logs.printLog(gameRoomString);
        }
    };


    // restituisce il numero di giocatori validati presenti
    module.exports.getConnectedPlayers = function () {
        let connectedPlayers = 0;
        for (let i = 0; i < gameRooms.length; i++) {
            for (let j = 0; j < gameRooms[i].players.length; j++)
                if (gameRooms[i].players[j].occupiedSlot)
                    connectedPlayers++;
        }
        return connectedPlayers;
    };


    // fornisce il conteggio dei giocatori in attesa di un avversario
    module.exports.getWaitingPlayers = function () {
        let waitingPlayers = 0;
        for (let i = 0; i < gameRooms.length; i++) {
            if (gameRooms[i].players[0].occupiedSlot && !gameRooms[i].players[1].occupiedSlot)
                waitingPlayers++;
        }
        return waitingPlayers;
    };


    // inizializza callback utilizzati dal modulo
    module.exports.setCallbacks = function (newCallbacks) {
        callbacks = newCallbacks;
    };


    /* -------------------------------------------------------------------------------------------- *
     * HANDLE METHODS: metodi che permettono di reagire all'arrivo di determinati messaggi. Si
     * compongono di una struttura comune:
     *  - Un oggetto 'result' di appoggio viene creato all'inizio della funzione. Questo raccoglie
     *    dati che verranno utilizzati per la generazione dell'output finale della stessa;
     *  - Viene modificato il contenuto dell'array gameRooms, a seconda dello scopo della funzione;
     *  - Ogni funzione di handle restituisce infine l'oggetto result, comprensivo di un array di
     *    messaggi, poi inviati tramite Rabbit ai rispettivi destinatari.
     * -------------------------------------------------------------------------------------------- */

    // aggiunge un riferimento all'utente nel primo slot valido dell'array game room.
    module.exports.handleGameRequest = function (message) {
        let result = {
            success: false,
            gameRoomId: undefined,
            playerId: undefined,
            messages: []
        };
        // success === true: game room trovata/generata

        // dà la precedenza alle gameRoom con giocatori in attesa di avversari
        for (let gRoomIndex = 0; gRoomIndex < gameRooms.length; gRoomIndex++) {
            if (gameRooms[gRoomIndex].players[0].occupiedSlot &&
                !gameRooms[gRoomIndex].players[1].occupiedSlot && !result.success) {
                result.gameRoomId = gRoomIndex;
                result.playerId = 1;
                result.success = true;
            }
        }

        // cerca il primo slot organizzatore libero
        if (!result.success) {
            for (let gRoomIndex = 0; gRoomIndex < gameRooms.length; gRoomIndex++) {
                if (!gameRooms[gRoomIndex].players[0].occupiedSlot && !result.success) {
                    result.gameRoomId = gRoomIndex;
                    result.playerId = 0;
                    result.success = true;
                    gameRooms[gRoomIndex] = generateGameRoom(result.gameRoomId, utils.states.mmaking);
                }
            }
        }

        // non c'è uno slot libero: crea una nuova game room
        if (!result.success) {
            result.gameRoomId = gameRooms.length;
            result.playerId = 0;
            result.success = true;

            gameRooms.push(
                generateGameRoom(result.gameRoomId, utils.states.mmaking)
            );
        }

        // inserisci il giocatore nella game room
        gameRooms[result.gameRoomId].players[result.playerId]
            = generateOccupiedSlot(result.gameRoomId, result.playerId, message.userId);

        // valida giocatore, se possibile
        if (message.user.nickname !== undefined && message.user.nickname !== "Anonymous") {
            gameRooms[result.gameRoomId].players[result.playerId].gameData.nickname = message.user.nickname;
            gameRooms[result.gameRoomId].players[result.playerId].gameData.validated = true;
        }

        // aggiorna gameData
        if (result.gameRoomId !== undefined) {
            gameRooms[result.gameRoomId].gameData.gameRoomId = result.gameRoomId;
        }

        if (result.playerId !== undefined) {
            gameRooms[result.gameRoomId].players[result.playerId].gameData.playerId = result.playerId;
        }

        if (result.playerId === 0) {
            gameRooms[result.gameRoomId].players[0].gameData.organizer = true;
        }

        // crea i messaggi di risposta
        result.success = true;
        result.messages.push({
            msgType: broker.messageTypes.s_gameResponse,
            gameType: utils.gameTypes.random,
            gameRoomId: result.gameRoomId,
            playerId: result.playerId,
            correlationId: message.correlationId,
            general: utils.getGeneralData(gameRooms, result.gameRoomId),
            user: utils.getPlayerData(gameRooms, result.gameRoomId, result.playerId),
            enemy: utils.getPlayerData(gameRooms, result.gameRoomId, result.playerId === 0 ? 1 : 0)
        });

        if (gameRooms[result.gameRoomId].players[result.playerId].gameData.validated) {
            result.messages.push({
                msgType: broker.messageTypes.s_playerAdded,
                gameType: utils.gameTypes.random,
                gameRoomId: result.gameRoomId,
                addedPlayerId: result.playerId,
                addedPlayer: utils.getPlayerData(gameRooms, result.gameRoomId, result.playerId)
            });
        }

        callbacks.onGameRoomsUpdated();
        return result;
    };


    // valida un giocatore, cioe' setta il nickname di questo a seguito della ricezione di un messaggio
    // di validazione. Viene quindi notificato che un nuovo giocatore è ora ufficialmente entrato
    // a far parte della partita.
    module.exports.handleValidation = function (message) {
        let result = {
            success: false,
            messages: []
        };
        // success === true: il giocatore valida il proprio nickname

        // controllo preliminare messaggio: se lo slot non è occupied, non esiste, è validato, o non si è in mmaking,
        // fai uscire il giocatore dalla game room, notificandolo eventualmente all'avversario
        if (!slotExists(message.gameRoomId, message.playerId) ||
            !gameRooms[message.gameRoomId].players[message.playerId].occupiedSlot ||
            gameRooms[message.gameRoomId].players[message.playerId].gameData.validated ||
            gameRooms[message.gameRoomId].gameData.state !== utils.states.mmaking)  {
            result = module.exports.handlePlayerQuit(message);
            result.success = false;
            return result;
        }

        gameRooms[message.gameRoomId].players[message.playerId].gameData.validated = true;
        gameRooms[message.gameRoomId].players[message.playerId].gameData.nickname = message.nickname;
        result.success = true;

        result.messages.push({
            msgType: broker.messageTypes.s_playerAdded,
            gameType: utils.gameTypes.random,
            gameRoomId: message.gameRoomId,
            addedPlayerId: message.playerId,
            addedPlayer: utils.getPlayerData(gameRooms, message.gameRoomId, message.playerId)
        });

        return result;
    };


    // all'arrivo di un messaggio playerQuit da un client, o della scadenza di un heartbeat,
    // viene rimosso il giocatore dalla gameRoom e notificato l'abbandono agli altri client in ascolto
    module.exports.handlePlayerQuit = function (message) {
        let result = {
            success: false,
            messages: []
        };
        // success === true: il giocatore esce e chiude la partita

        // pulisci in maniera 'safe' lo slot giocatore, fermando i vari timer attivi
        clearGameRoom(message.gameRoomId);
        result.success = true;
        result.messages.push({
            msgType: broker.messageTypes.s_gameQuit,
            gameRoomId: message.gameRoomId,
            gameType: utils.gameTypes.random,
        });

        callbacks.onGameRoomsUpdated();
        return result;
    };


    // All'arrivo di un messaggio di heartbeat da un client, viene resettato il timer corrispondente
    // nello slot della gameRoom. Se tale timer non viene aggiornato, il giocatore viene rimosso
    // automaticamente
    module.exports.handleHeartbeat = function (message) {
        let result = {
            success: false,
            messages: []
        };
        // success === true: il giocatore rinnova l'heartbeat

        // controllo preliminare messaggio
        if (!slotExists(message.gameRoomId, message.playerId) ||
            !gameRooms[message.gameRoomId].players[message.playerId].occupiedSlot) {
            result = module.exports.handlePlayerQuit(message);
            result.success = false;
            return result;
        }

        // heartbeat valido; resetta timer
        clearTimeout(gameRooms[message.gameRoomId].players[message.playerId].heartBeatTimer);
        gameRooms[message.gameRoomId].players[message.playerId].heartBeatTimer
            = generateHeartbeatTimer(message.gameRoomId, message.playerId);
        result.success = true;

        return result;
    };


    // un messaggio di ready indica che un client è pronto ad iniziare una nuova partita. Al realizzarsi
    // di determinati criteri, legati allo stato ready dei client collegati alla game room, viene inviato
    // il segnale di via libera per l'inizio di un nuovo match
    module.exports.handleReadyMessage = function (message) {
        let result = {
            success: false,
            messages: []
        };
        // success === true: avvia un nuovo match

        // controllo preliminare messaggio: se lo slot non è occupied, non esiste, non è validato,
        // si è in playing, fai uscire il giocatore dalla game room, notificandolo eventualmente all'avversario
        if (!slotExists(message.gameRoomId, message.playerId) ||
            !gameRooms[message.gameRoomId].players[message.playerId].occupiedSlot ||
            !gameRooms[message.gameRoomId].players[message.playerId].gameData.validated ||
            gameRooms[message.gameRoomId].gameData.state === utils.states.playing)  {
            result = module.exports.handlePlayerQuit(message);
            result.success = false;
            return result;
        }

        gameRooms[message.gameRoomId].players[message.playerId].gameData.ready = true;
        result.success = startMatchCheck(message.gameRoomId);

        // va avviato un nuovo match
        if (result.success) {
            for (let i = 0; i < gameRooms[message.gameRoomId].players.length; i++) {
                gameRooms[message.gameRoomId].players[i].gameData.match = generateEmptyPlayerMatch();
                gameRooms[message.gameRoomId].players[i].gameData.ready = false;
            }
            gameRooms[message.gameRoomId].gameData.state = utils.states.playing;
            gameRooms[message.gameRoomId].gameData.tiles = utils.generateTiles();
            result.messages.push({
                msgType: broker.messageTypes.s_startMatch,
                gameRoomId: message.gameRoomId,
                gameType: utils.gameTypes.random,
                tiles: gameRooms[message.gameRoomId].gameData.tiles
            });

            if (gameRooms[message.gameRoomId].gameData.matchCount === 0) {
                // si è al primo match della sessione: salva i dati sessione nel db
                callbacks.createDbGameSession(gameRooms[message.gameRoomId]);
            }
        }

        return result;
    };


    // un messaggio positioned indica che, nel corso di un match, il giocatore ha appena posizionato
    // il proprio Roby. Aggiorna quindi l'oggetto di gioco e notifica il fatto agli avversari. In caso
    // tutti i Roby siano stati posizionati, avvia l'animazione dei robottini
    module.exports.handlePositionedMessage = function (message) {
        let result = {
            success: false,
            messages: []
        };
        // success === true: avvia l'animazione

        // controllo preliminare messaggio: se lo slot non è occupied, non esiste, non è validato,
        // si è in playing, fai uscire il giocatore dalla game room, notificandolo eventualmente all'avversario
        if (!slotExists(message.gameRoomId, message.playerId) ||
            !gameRooms[message.gameRoomId].players[message.playerId].occupiedSlot ||
            !gameRooms[message.gameRoomId].players[message.playerId].gameData.validated ||
            gameRooms[message.gameRoomId].gameData.state !== utils.states.playing)  {
            result = module.exports.handlePlayerQuit(message);
            result.success = false;
            return result;
        }

        // setta dati partita dell'utente e calcola i risultati del suo match
        gameRooms[message.gameRoomId].players[message.playerId].gameData.match.positioned = true;
        gameRooms[message.gameRoomId].players[message.playerId].gameData.match.time = message.matchTime;
        gameRooms[message.gameRoomId].players[message.playerId].gameData.match.startPosition.side = message.side;
        gameRooms[message.gameRoomId].players[message.playerId].gameData.match.startPosition.distance = message.distance;

        let playerResult = utils.calculatePlayerResult(
            gameRooms[message.gameRoomId].players[message.playerId].gameData.match.startPosition,
            gameRooms[message.gameRoomId].players[message.playerId].gameData.match.time,
            gameRooms[message.gameRoomId].gameData.tiles,
            gameRooms[message.gameRoomId].gameData.timerSetting
        );

        gameRooms[message.gameRoomId].players[message.playerId].gameData.match.points = playerResult.points;
        gameRooms[message.gameRoomId].players[message.playerId].gameData.match.pathLength = playerResult.pathLength;

        result.success = startAnimationCheck(message.gameRoomId);

        if (result.success) {
            gameRooms[message.gameRoomId].gameData.animationStarted = true;

            // aggiusta i punteggi: il giocatore che ha perso non riceve nessun punto
            let winnerId = utils.getMatchRanking(gameRooms, message.gameRoomId)[0].playerId;
            let loserId = winnerId === 0 ? 1 : 0;

            // il vincitore riceve dei punti bonus calcolati sul tempo di esecuzione
            gameRooms[message.gameRoomId].players[winnerId].gameData.match.points
                += utils.calculateWinnerBonusPoints(
                    gameRooms[message.gameRoomId].players[winnerId].gameData.match.time,
                    gameRooms[message.gameRoomId].gameData.timerSetting
                );

            if (!utils.isDraw(gameRooms, message.gameRoomId)) {
                gameRooms[message.gameRoomId].players[winnerId].gameData.match.winner = true;
                gameRooms[message.gameRoomId].players[winnerId].gameData.wonMatches++;
            }

            gameRooms[message.gameRoomId].players[loserId].gameData.match.points = 0;
            gameRooms[message.gameRoomId].players[winnerId].gameData.points
                += gameRooms[message.gameRoomId].players[winnerId].gameData.match.points;

            result.messages.push({
                msgType: broker.messageTypes.s_startAnimation,
                gameRoomId: message.gameRoomId,
                startPositions: utils.getStartPositions(gameRooms, message.gameRoomId),
                gameType: utils.gameTypes.random
            });
        }

        return result;
    };


    // il messaggio indica che un client ha concluso di mostrare l'animazione dei robottini. Quando tutti
    // hanno concluso, invia un segnale per concludere il match
    module.exports.handleEndAnimationMessage = function (message) {
        let result = {
            success: false,
            messages: []
        };
        // success === true: termina il match

        // controllo preliminare messaggio: se lo slot non è occupied, non esiste, non è validato,
        // si è in playing, fai uscire il giocatore dalla game room, notificandolo eventualmente all'avversario
        if (!slotExists(message.gameRoomId, message.playerId) ||
            !gameRooms[message.gameRoomId].players[message.playerId].occupiedSlot ||
            !gameRooms[message.gameRoomId].players[message.playerId].gameData.validated ||
            gameRooms[message.gameRoomId].gameData.state !== utils.states.playing)  {
            result = module.exports.handlePlayerQuit(message);
            result.success = false;
            return result;
        }

        gameRooms[message.gameRoomId].players[message.playerId].gameData.match.animationEnded = true;
        result.success = endMatchCheck(message.gameRoomId);

        if (result.success) {
            gameRooms[message.gameRoomId].gameData.state = utils.states.aftermatch;
            gameRooms[message.gameRoomId].gameData.matchCount++;

            result.messages.push({
                msgType: broker.messageTypes.s_endMatch,
                gameRoomId: message.gameRoomId,
                gameType: utils.gameTypes.random,
                matchRanking: utils.getMatchRanking(gameRooms, message.gameRoomId),
                globalRanking: utils.getGlobalRanking(gameRooms, message.gameRoomId),
                winnerId: utils.getWinnerId(gameRooms, message.gameRoomId),
                aggregated: utils.getAggregatedData(gameRooms, message.gameRoomId)
            });

            callbacks.createDbGameMatch(gameRooms[message.gameRoomId]);
        }

        return result;
    };


    /* -------------------------------------------------------------------------------------------- *
     * UTILITIES: metodi interni di appoggio, utilizzato nei vari Handle Methods.
     * -------------------------------------------------------------------------------------------- */

    let clearGameRoom = function(gameRoomId) {
        // pulisci in maniera 'safe' lo slot giocatore, fermando i vari timer attivi
        if (gameRoomExists(gameRoomId)) {
            for (let j = 0; j < gameRooms[gameRoomId].players.length; j++) {
                if (gameRooms[gameRoomId].players[j].heartBeatTimer !== undefined)
                    clearTimeout(gameRooms[gameRoomId].players[j].heartBeatTimer);
            }

            gameRooms[gameRoomId] = generateGameRoom(gameRoomId);
        }

        // rimuovi se presenti le gameRoom vuote consecutive in fondo all'array
        for (let i = gameRooms.length - 1; i >= 0; i--) {
            if (gameRooms[i].gameData.state === utils.states.free)
                gameRooms.splice(i, 1);
            else
                break;
        }
    };

    let slotExists = function (gameRoomId, playerId) {
        return gameRooms[gameRoomId] !== undefined
            && gameRooms[gameRoomId].players[playerId] !== undefined;
    };


    let gameRoomExists = function (gameRoomId) {
        return gameRooms[gameRoomId] !== undefined;
    };


    let generateGameRoom = function (gameRoomId, state) {
        return {
            players: [generateFreeSlot(), generateFreeSlot()],
            sessionId: undefined,
            gameData: generateGeneralGameData(gameRoomId, state)
        };
    };


    let generateFreeSlot = function () {
        return {
            occupiedSlot: false,
            id: undefined,
            heartBeatTimer: undefined,
            gameData: generatePlayerGameData()
        };
    };


    let generateOccupiedSlot = function (gameRoomId, playerId, userId) {
        return {
            occupiedSlot: true,
            userId: userId,
            heartBeatTimer: generateHeartbeatTimer(gameRoomId, playerId),
            gameData: generatePlayerGameData(gameRoomId, playerId)
        };
    };


    let generateHeartbeatTimer = function (gameRoomId, playerId) {
        return setTimeout(function () {
            callbacks.onHeartbeatExpired(gameRoomId, playerId, utils.gameTypes.random)
        }, 15000);
    };


    let startMatchCheck = function (gameRoomId) {
        if (!gameRoomExists(gameRoomId)) {
            return;
        }

        let allReady = true;
        for (let i = 0; i < gameRooms[gameRoomId].players.length; i++) {
            if (gameRooms[gameRoomId].players[i].occupiedSlot &&
                !gameRooms[gameRoomId].players[i].gameData.ready) {
                allReady = false;
                break;
            }
        }

        return allReady;
    };


    let startAnimationCheck = function (gameRoomId) {
        if (!gameRoomExists(gameRoomId)) {
            return;
        }

        let allPositioned = true;
        for (let i = 0; i < gameRooms[gameRoomId].players.length; i++) {
            if (gameRooms[gameRoomId].players[i].occupiedSlot &&
                !gameRooms[gameRoomId].players[i].gameData.match.positioned) {
                allPositioned = false;
                break;
            }
        }

        return allPositioned;
    };


    let endMatchCheck = function (gameRoomId) {
        if (!gameRoomExists(gameRoomId)) {
            return;
        }

        let allAnimationFinished = true;
        for (let i = 0; i < gameRooms[gameRoomId].players.length; i++) {
            if (gameRooms[gameRoomId].players[i].occupiedSlot &&
                !gameRooms[gameRoomId].players[i].gameData.match.animationEnded) {
                allAnimationFinished = false;
                break;
            }
        }

        return allAnimationFinished;
    };


    /* -------------------------------------------------------------------------------------------- *
     * INITIALIZERS: metodi interni che restituiscono un oggetto dati di gioco 'pulito', nel
     * momento in cui sia necessario resettarla.
     * -------------------------------------------------------------------------------------------- */

    let generateEmptyPlayerMatch = function () {
        return {
            time: -1,
            points: 0,
            pathLength: 0,
            winner: false,
            animationEnded: false,
            positioned: false,
            startPosition: {
                side: -1,
                distance: -1
            },
        };
    };


    let generatePlayerGameData = function (gameRoomId, playerId) {
        return {
            nickname: 'Anonymous',
            points: 0,
            wonMatches: 0,
            playerId: (playerId !== undefined) ? playerId : -1,
            ready: false,
            validated: false,
            organizer: playerId === 0,
            match: generateEmptyPlayerMatch()
        }
    };


    let generateGeneralGameData = function (gameRoomId, state) {
        return {
            gameRoomId: (gameRoomId !== undefined) ? gameRoomId : -1,
            matchCount: 0,
            tiles: undefined,
            state: (state !== undefined) ? state : utils.states.free,
            timerSetting: 30000,
            gameType: utils.gameTypes.random
        }
    };
}());