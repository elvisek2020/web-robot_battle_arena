// WebSocket connection
let ws = null;
let playerId = null;
let token = null;
let currentGameState = null;
let seedData = null;

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    // Load version info
    fetch('/static/version.json')
        .then(response => response.json())
        .then(data => {
            const versionInfo = document.getElementById('version-info');
            if (versionInfo && data.version) {
                versionInfo.textContent = data.version;
            }
        })
        .catch(err => {
            console.error('Failed to load version:', err);
        });
    
    // Main title click handler
    const mainTitle = document.getElementById('main-title');
    if (mainTitle) {
        mainTitle.addEventListener('click', () => {
            window.location.reload();
        });
    }
    
    // Load session data
    token = sessionStorage.getItem('token');
    playerId = sessionStorage.getItem('player_id');
    
    const savedPlayerName = sessionStorage.getItem('player_name');
    const nameInput = document.getElementById('player-name');
    if (savedPlayerName && nameInput) {
        nameInput.value = savedPlayerName;
    }
    
    // Load saved robot and weapon selection
    const savedRobotId = sessionStorage.getItem('selected_robot_id');
    const savedWeaponId = sessionStorage.getItem('selected_weapon_id');
    
    // Join button
    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', handleJoin);
    }
    
    // Enter key in name input
    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinBtn.click();
            }
        });
    }
    
    // Ready button
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
        readyBtn.addEventListener('click', handleReady);
    }
    
    // Leave button
    const leaveBtn = document.getElementById('leave-btn');
    if (leaveBtn) {
        leaveBtn.addEventListener('click', handleLeave);
    }
    
    // Robot and weapon selects
    const robotSelect = document.getElementById('robot-select');
    const weaponSelect = document.getElementById('weapon-select');
    
    if (robotSelect) {
        robotSelect.addEventListener('change', handleLoadoutChange);
    }
    if (weaponSelect) {
        weaponSelect.addEventListener('change', handleLoadoutChange);
    }
    
    // End turn button
    const endTurnBtn = document.getElementById('end-turn-btn');
    if (endTurnBtn) {
        endTurnBtn.addEventListener('click', handleEndTurn);
    }
    
    // Try reconnect if we have token
    if (token && playerId) {
        connectWebSocket();
    }
});

function handleJoin() {
    const nameInput = document.getElementById('player-name');
    if (!nameInput) return;
    
    const name = nameInput.value.trim();
    
    if (!name) {
        showError('Zadej jméno');
        return;
    }
    
    // Clear old token if joining with new name
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('player_id');
    token = null;
    playerId = null;
    
    sessionStorage.setItem('player_name', name);
    window.pendingJoinName = name;
    
    // Close existing connection
    if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
    }
    
    connectWebSocket();
    
    // Wait for connection
    let attempts = 0;
    const maxAttempts = 50;
    const checkInterval = setInterval(() => {
        attempts++;
        if (sendJoinMessage(name)) {
            clearInterval(checkInterval);
            delete window.pendingJoinName;
        } else if (ws && (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING)) {
            clearInterval(checkInterval);
            showError('Připojení se nezdařilo. Zkus to znovu.');
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            showError('Timeout při připojování. Zkus to znovu.');
        }
    }, 100);
}

function sendJoinMessage(name) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const joinMessage = { type: 'join', name: name };
        try {
            ws.send(JSON.stringify(joinMessage));
            return true;
        } catch (error) {
            console.error('Chyba při odesílání join zprávy:', error);
            return false;
        }
    }
    return false;
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        if (token) {
            ws.send(JSON.stringify({ type: 'reconnect', token: token }));
        } else if (window.pendingJoinName) {
            const name = window.pendingJoinName;
            const joinMessage = { type: 'join', name: name };
            ws.send(JSON.stringify(joinMessage));
            delete window.pendingJoinName;
        }
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showError('Chyba připojení');
    };
    
    ws.onclose = (event) => {
        // If game is active, end it and return to login
        if (currentGameState && currentGameState.status === 'playing') {
            currentGameState.status = 'waiting';
            // Clear session data
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('player_id');
            token = null;
            playerId = null;
            currentGameState = null;
            showScreen('login-screen');
            showError('Ztráta připojení k serveru. Hra byla ukončena. Prosím přihlaste se znovu.');
        } else if (token) {
            // If in lobby, try to reconnect
            setTimeout(() => {
                if (token) {
                    connectWebSocket();
                }
            }, 1000);
        }
    };
}

function handleMessage(message) {
    switch (message.type) {
        case 'join_ok':
            playerId = message.player_id;
            token = message.token;
            sessionStorage.setItem('player_id', playerId);
            sessionStorage.setItem('token', token);
            showScreen('lobby-screen');
            break;
        
        case 'reconnect_ok':
            playerId = message.player_id;
            showScreen('lobby-screen');
            break;
        
        case 'seed':
            seedData = message;
            window.seedData = message; // Make available to arena.js
            populateLoadoutSelects();
            break;
        
        case 'lobby_state':
            // Store lobby state for ready button logic
            if (!currentGameState || currentGameState.status !== 'playing') {
                currentGameState = {
                    status: message.status || 'waiting',
                    players: message.players || []
                };
            } else {
                // Merge lobby state into current game state
                if (message.players) {
                    currentGameState.players = message.players;
                }
                if (message.status) {
                    currentGameState.status = message.status;
                }
            }
            // If game is finished and we receive lobby_state, switch back to lobby
            if (message.status === 'waiting' && currentGameState.status === 'finished') {
                currentGameState.status = 'waiting';
                showScreen('lobby-screen');
            }
            updateLobby(message);
            break;
        
        case 'game_state':
            currentGameState = message;
            showScreen('game-screen');
            // Initialize audio when game starts
            if (window.audioManager && message.status === 'playing') {
                window.audioManager.initializeAudio();
            }
            // Reset previousHp when game state updates
            if (message.players) {
                message.players.forEach(player => {
                    previousHp[player.player_id] = player.hp || 0;
                });
            }
            updateGame(message);
            break;
        
        case 'action_rejected':
            handleActionRejected(message);
            break;
        
        case 'traps_state':
            updateTraps(message.traps_state || {});
            break;
        
        case 'game_over':
            handleGameOver(message);
            break;
        
        case 'error':
            showError(message.message || 'Nastala chyba');
            break;
    }
}

function populateLoadoutSelects() {
    if (!seedData) return;
    
    const robotSelect = document.getElementById('robot-select');
    const weaponSelect = document.getElementById('weapon-select');
    
    // Load saved selections
    const savedRobotId = sessionStorage.getItem('selected_robot_id');
    const savedWeaponId = sessionStorage.getItem('selected_weapon_id');
    
    if (robotSelect && seedData.robots) {
        robotSelect.innerHTML = '<option value="">-- Vyber robota --</option>';
        seedData.robots.forEach(robot => {
            const option = document.createElement('option');
            option.value = robot.id;
            option.textContent = `${robot.name} (HP: ${robot.hpMax})`;
            if (robot.id === savedRobotId) {
                option.selected = true;
            }
            robotSelect.appendChild(option);
        });
    }
    
    if (weaponSelect && seedData.weapons) {
        weaponSelect.innerHTML = '<option value="">-- Vyber zbraň --</option>';
        seedData.weapons.forEach(weapon => {
            const option = document.createElement('option');
            option.value = weapon.id;
            option.textContent = `${weapon.name} (Dosah: ${weapon.range}, Poškození: ${weapon.damage})`;
            if (weapon.id === savedWeaponId) {
                option.selected = true;
            }
            weaponSelect.appendChild(option);
        });
    }
    
    // Restore robot icon if robot was selected
    if (savedRobotId) {
        const robotIcon = document.getElementById('robot-icon');
        if (robotIcon) {
            robotIcon.src = `/static/images/robots/${savedRobotId}.png`;
            robotIcon.alt = seedData?.robots?.find(r => r.id === savedRobotId)?.name || '';
            robotIcon.style.display = 'block';
            updateRobotTooltip(savedRobotId);
        }
    }
    
    // If both robot and weapon are selected, enable ready button and send loadout
    if (savedRobotId && savedWeaponId && ws && ws.readyState === WebSocket.OPEN) {
        const readyBtn = document.getElementById('ready-btn');
        if (readyBtn) {
            readyBtn.disabled = false;
        }
        // Send loadout to server
        ws.send(JSON.stringify({
            type: 'select_loadout',
            robot_id: savedRobotId,
            weapon_id: savedWeaponId
        }));
    }
}

function updateRobotTooltip(robotId) {
    if (!seedData || !robotId) return;
    
    const robot = seedData.robots.find(r => r.id === robotId);
    const tooltip = document.getElementById('robot-tooltip');
    if (!tooltip || !robot) return;
    
    // Get selected weapon info
    const weaponSelect = document.getElementById('weapon-select');
    let weaponInfo = '';
    if (weaponSelect && weaponSelect.value) {
        const weapon = seedData.weapons.find(w => w.id === weaponSelect.value);
        if (weapon) {
            weaponInfo = `\n\nZbraň: ${weapon.name}\nDosah: ${weapon.range}\nPoškození: ${weapon.damage}`;
        }
    }
    
    tooltip.textContent = `Robot: ${robot.name}\nHP: ${robot.hpMax}${weaponInfo}`;
}

function handleLoadoutChange() {
    const robotSelect = document.getElementById('robot-select');
    const weaponSelect = document.getElementById('weapon-select');
    const robotIcon = document.getElementById('robot-icon');
    
    if (!robotSelect || !weaponSelect) return;
    
    const robotId = robotSelect.value;
    const weaponId = weaponSelect.value;
    
    // Update robot icon
    if (robotIcon) {
        if (robotId) {
            robotIcon.src = `/static/images/robots/${robotId}.png`;
            robotIcon.alt = seedData?.robots?.find(r => r.id === robotId)?.name || '';
            robotIcon.style.display = 'block';
            updateRobotTooltip(robotId);
        } else {
            robotIcon.style.display = 'none';
            const tooltip = document.getElementById('robot-tooltip');
            if (tooltip) {
                tooltip.textContent = '';
            }
        }
    }
    
    // Update tooltip when weapon changes
    if (robotId) {
        updateRobotTooltip(robotId);
    }
    
    // Save selections to sessionStorage
    if (robotId) {
        sessionStorage.setItem('selected_robot_id', robotId);
    } else {
        sessionStorage.removeItem('selected_robot_id');
    }
    
    if (weaponId) {
        sessionStorage.setItem('selected_weapon_id', weaponId);
    } else {
        sessionStorage.removeItem('selected_weapon_id');
    }
    
    // Enable/disable ready button based on selections
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
        if (robotId && weaponId) {
            readyBtn.disabled = false;
        } else {
            readyBtn.disabled = true;
        }
    }
    
    // Send loadout to server if both selected and WebSocket is open
    if (robotId && weaponId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'select_loadout',
            robot_id: robotId,
            weapon_id: weaponId
        }));
    }
}

function handleReady() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showError('Není připojení k serveru');
        return;
    }
    
    // Get current ready state from game state or button text
    let isReady = false;
    if (currentGameState && currentGameState.players) {
        const myPlayer = currentGameState.players.find(p => p.player_id === playerId);
        if (myPlayer) {
            isReady = myPlayer.ready || false;
        }
    } else {
        // Fallback: check button text
        const readyBtn = document.getElementById('ready-btn');
        isReady = readyBtn && readyBtn.textContent === 'Zrušit';
    }
    
    ws.send(JSON.stringify({
        type: 'set_ready',
        ready: !isReady
    }));
}

function handleLeave() {
    // Clear session data (but keep player_name, selected_robot_id, selected_weapon_id)
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('player_id');
    token = null;
    playerId = null;
    currentGameState = null;
    
    // Close WebSocket
    if (ws) {
        ws.onclose = null; // Prevent reconnect
        ws.close();
        ws = null;
    }
    
    // Switch to login screen
    showScreen('login-screen');
}

function updateLobby(state) {
    const playersList = document.getElementById('players-list');
    if (!playersList) return;
    
    playersList.innerHTML = '';
    
    state.players.forEach(player => {
        const div = document.createElement('div');
        div.className = `player-item ${player.ready ? 'ready' : ''}`;
        
        const statusText = player.ready ? '✓ Připraven' : 'Čeká...';
        
        div.innerHTML = `
            <span class="player-name">${escapeHtml(player.name)}</span>
            <span class="ready-status">${statusText}</span>
        `;
        
        playersList.appendChild(div);
    });
    
    // Update status message
    const statusDiv = document.getElementById('lobby-status');
    if (statusDiv) {
        if (state.can_start) {
            statusDiv.textContent = 'Všichni jsou připraveni! Hra začne automaticky...';
            statusDiv.className = 'status-message ready';
        } else {
            statusDiv.textContent = `Čekám na soupeře... (${state.players.length}/2)`;
            statusDiv.className = 'status-message waiting';
        }
    }
    
    // Update ready button
    const myPlayer = state.players.find(p => p.player_id === playerId);
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn && myPlayer) {
        readyBtn.textContent = myPlayer.ready ? 'Zrušit' : 'Připraven';
    }
    
    // Update robot icon if player has selected a robot
    const robotSelect = document.getElementById('robot-select');
    const robotIcon = document.getElementById('robot-icon');
    if (robotSelect && robotIcon && robotSelect.value) {
        robotIcon.src = `/static/images/robots/${robotSelect.value}.png`;
        robotIcon.alt = seedData?.robots?.find(r => r.id === robotSelect.value)?.name || '';
        robotIcon.style.display = 'block';
    }
}

function updateGame(state) {
    // Update player info
    updatePlayerInfo(state);
    
    // Force reload robot icons if they're missing (fixes reconnect issue)
    if (state.players && window.seedData && window.loadRobotIcon) {
        state.players.forEach(player => {
            if (player.robot_id) {
                // Check if icon is missing or broken
                const cachedIcon = window.robotIcons && window.robotIcons[player.robot_id];
                if (!cachedIcon || !cachedIcon.complete || cachedIcon.naturalWidth === 0) {
                    // Clear and reload
                    if (window.robotIcons && window.robotIcons[player.robot_id]) {
                        delete window.robotIcons[player.robot_id];
                    }
                    window.loadRobotIcon(player.robot_id, (img) => {
                        if (img && window.updateArena) {
                            // Redraw arena when icon loads
                            setTimeout(() => {
                                if (currentGameState) {
                                    window.updateArena(currentGameState);
                                }
                            }, 100);
                        }
                    });
                }
            }
        });
    }
    
    // Update arena
    if (window.updateArena) {
        window.updateArena(state);
    }
    
    // Auto-end turn when AP reaches 0
    if (state.turn_player_id === playerId && state.ap_remaining <= 0 && state.ap_remaining !== undefined) {
        // Automatically end turn when all AP are used
        setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'end_turn'
                }));
            }
        }, 500); // Small delay to allow last action to complete
    }
}

function handleEndTurn() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showError('Není připojení k serveru');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'end_turn'
    }));
}

// Store previous HP to detect damage
let previousHp = {};

function updatePlayerInfo(state) {
    const players = state.players || [];
    
    // Initialize previousHp if not set
    players.forEach(player => {
        if (previousHp[player.player_id] === undefined) {
            previousHp[player.player_id] = player.hp || 0;
        }
    });
    
    // Player colors based on spawn position (index 0 = blue, index 1 = red)
    const playerColors = [
        { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', shadow: 'rgba(59, 130, 246, 0.8)' }, // Blue for player 0
        { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', shadow: 'rgba(239, 68, 68, 0.8)' }  // Red for player 1
    ];
    
    // Player A (first player)
    if (players.length > 0) {
        const playerA = players[0];
        const playerAInfo = document.getElementById('player-a-info');
        const playerAName = document.getElementById('player-a-name');
        const playerAHealthFill = document.getElementById('player-a-health-fill');
        const playerAIcon = document.getElementById('player-a-icon');
        
        // Set player color (blue for player 0)
        if (playerAInfo) {
            const color = playerColors[0];
            playerAInfo.style.backgroundColor = color.bg;
            // Only set border color if not current turn (current turn has white border via CSS)
            if (state.turn_player_id !== playerA.player_id) {
                playerAInfo.style.borderColor = color.border;
            } else {
                playerAInfo.style.borderColor = '#ffffff';
            }
            playerAInfo.dataset.playerColor = 'blue';
        }
        
        if (playerAName) {
            const robot = seedData?.robots?.find(r => r.id === playerA.robot_id);
            const weapon = seedData?.weapons?.find(w => w.id === playerA.weapon_id);
            const robotName = robot?.name || 'Nevybrán';
            const weaponName = weapon?.name || 'Nevybrána';
            
            // Check if game is over and this player is winner
            let turnIndicator = '';
            if (state.status === 'finished' && state.winner_id === playerA.player_id) {
                turnIndicator = ' VÍTĚZ';
            } else if (state.turn_player_id === playerA.player_id && state.status === 'playing') {
                turnIndicator = ' → Na tahu';
            }
            
            playerAName.textContent = `${playerA.name} (${robotName}, ${weaponName})${turnIndicator}`;
        }
        
        // Update robot icon
        if (playerAIcon && playerA.robot_id) {
            playerAIcon.src = `/static/images/robots/${playerA.robot_id}.png`;
            playerAIcon.alt = seedData?.robots?.find(r => r.id === playerA.robot_id)?.name || '';
            playerAIcon.style.display = 'block';
        } else if (playerAIcon) {
            playerAIcon.style.display = 'none';
        }
        
        // Check for damage and trigger hit effect
        const prevHp = previousHp[playerA.player_id];
        const currentHp = playerA.hp || 0;
        
        // Only check for damage if we have previous HP value
        if (prevHp !== undefined && prevHp > 0 && currentHp < prevHp) {
            // Player took damage - check if from trap or weapon
            const damageAmount = prevHp - currentHp;
            
            // Play appropriate sound based on damage amount
            if (window.audioManager && damageAmount > 0) {
                try {
                    if (damageAmount >= 10) {
                        // Significant damage - likely from trap
                        window.audioManager.play('trap_hit');
                    } else {
                        // Small damage - likely from weapon
                        window.audioManager.play('weapon_hit');
                    }
                } catch (err) {
                    console.debug('Failed to play sound:', err);
                }
            }
            
            // Trigger hit effect
            triggerHitEffect(playerAInfo, playerAIcon);
        }
        
        // Always update previousHp
        previousHp[playerA.player_id] = currentHp;
        
        // Update health bar
        if (playerAHealthFill) {
            const robot = seedData?.robots?.find(r => r.id === playerA.robot_id);
            const maxHp = robot?.hpMax || 100;
            const hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
            
            playerAHealthFill.style.width = `${hpPercent}%`;
            
            // Update health bar color
            playerAHealthFill.classList.remove('low', 'medium');
            if (hpPercent < 30) {
                playerAHealthFill.classList.add('low');
            } else if (hpPercent < 60) {
                playerAHealthFill.classList.add('medium');
            }
        }
        
        // Update health text
        const playerAHealthText = document.getElementById('player-a-health-text');
        if (playerAHealthText) {
            const robot = seedData?.robots?.find(r => r.id === playerA.robot_id);
            const maxHp = robot?.hpMax || 100;
            const hpPercent = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
            playerAHealthText.textContent = `${Math.round(hpPercent)}%`;
        }
        
        // Update current turn indicator and my-player class
        if (playerAInfo) {
            // Mark as my player
            if (playerA.player_id === playerId) {
                playerAInfo.classList.add('my-player');
            } else {
                playerAInfo.classList.remove('my-player');
            }
            
            // Mark as current turn
            if (state.turn_player_id === playerA.player_id) {
                playerAInfo.classList.add('current-turn');
                playerAInfo.style.borderColor = '#ffffff';
            } else {
                playerAInfo.classList.remove('current-turn');
                // Restore player color border
                const color = playerColors[0];
                playerAInfo.style.borderColor = color.border;
            }
        }
    }
    
    // Player B (second player)
    if (players.length > 1) {
        const playerB = players[1];
        const playerBInfo = document.getElementById('player-b-info');
        const playerBName = document.getElementById('player-b-name');
        const playerBHealthFill = document.getElementById('player-b-health-fill');
        const playerBIcon = document.getElementById('player-b-icon');
        
        // Set player color (red for player 1)
        if (playerBInfo) {
            const color = playerColors[1];
            playerBInfo.style.backgroundColor = color.bg;
            // Only set border color if not current turn (current turn has white border via CSS)
            if (state.turn_player_id !== playerB.player_id) {
                playerBInfo.style.borderColor = color.border;
            } else {
                playerBInfo.style.borderColor = '#ffffff';
            }
            playerBInfo.dataset.playerColor = 'red';
        }
        
        if (playerBName) {
            const robot = seedData?.robots?.find(r => r.id === playerB.robot_id);
            const weapon = seedData?.weapons?.find(w => w.id === playerB.weapon_id);
            const robotName = robot?.name || 'Nevybrán';
            const weaponName = weapon?.name || 'Nevybrána';
            
            // Check if game is over and this player is winner
            let turnIndicator = '';
            if (state.status === 'finished' && state.winner_id === playerB.player_id) {
                turnIndicator = ' VÍTĚZ';
            } else if (state.turn_player_id === playerB.player_id && state.status === 'playing') {
                turnIndicator = ' → Na tahu';
            }
            
            playerBName.textContent = `${playerB.name} (${robotName}, ${weaponName})${turnIndicator}`;
        }
        
        // Update robot icon
        if (playerBIcon && playerB.robot_id) {
            playerBIcon.src = `/static/images/robots/${playerB.robot_id}.png`;
            playerBIcon.alt = seedData?.robots?.find(r => r.id === playerB.robot_id)?.name || '';
            playerBIcon.style.display = 'block';
        } else if (playerBIcon) {
            playerBIcon.style.display = 'none';
        }
        
        // Check for damage and trigger hit effect
        const prevHpB = previousHp[playerB.player_id];
        const currentHpB = playerB.hp || 0;
        
        // Only check for damage if we have previous HP value
        if (prevHpB !== undefined && prevHpB > 0 && currentHpB < prevHpB) {
            // Player took damage - check if from trap or weapon
            const damageAmount = prevHpB - currentHpB;
            
            // Play appropriate sound based on damage amount
            if (window.audioManager && damageAmount > 0) {
                try {
                    if (damageAmount >= 10) {
                        // Significant damage - likely from trap
                        window.audioManager.play('trap_hit');
                    } else {
                        // Small damage - likely from weapon
                        window.audioManager.play('weapon_hit');
                    }
                } catch (err) {
                    console.debug('Failed to play sound:', err);
                }
            }
            
            // Trigger hit effect
            triggerHitEffect(playerBInfo, playerBIcon);
        }
        
        // Always update previousHp
        previousHp[playerB.player_id] = currentHpB;
        
        // Update health bar
        if (playerBHealthFill) {
            const robot = seedData?.robots?.find(r => r.id === playerB.robot_id);
            const maxHp = robot?.hpMax || 100;
            const hpPercent = Math.max(0, Math.min(100, (currentHpB / maxHp) * 100));
            
            playerBHealthFill.style.width = `${hpPercent}%`;
            
            // Update health bar color
            playerBHealthFill.classList.remove('low', 'medium');
            if (hpPercent < 30) {
                playerBHealthFill.classList.add('low');
            } else if (hpPercent < 60) {
                playerBHealthFill.classList.add('medium');
            }
        }
        
        // Update health text
        const playerBHealthText = document.getElementById('player-b-health-text');
        if (playerBHealthText) {
            const robot = seedData?.robots?.find(r => r.id === playerB.robot_id);
            const maxHp = robot?.hpMax || 100;
            const hpPercent = Math.max(0, Math.min(100, (currentHpB / maxHp) * 100));
            playerBHealthText.textContent = `${Math.round(hpPercent)}%`;
        }
        
        // Update current turn indicator and my-player class
        if (playerBInfo) {
            // Mark as my player
            if (playerB.player_id === playerId) {
                playerBInfo.classList.add('my-player');
            } else {
                playerBInfo.classList.remove('my-player');
            }
            
            // Mark as current turn
            if (state.turn_player_id === playerB.player_id) {
                playerBInfo.classList.add('current-turn');
                playerBInfo.style.borderColor = '#ffffff';
            } else {
                playerBInfo.classList.remove('current-turn');
                // Restore player color border
                const color = playerColors[1];
                playerBInfo.style.borderColor = color.border;
            }
        }
    }
}

function triggerHitEffect(playerInfoBox, playerIcon) {
    if (!playerInfoBox) return;
    
    // Add hit effect class
    playerInfoBox.classList.add('hit-effect');
    
    // Trigger red flash on icon if available
    if (playerIcon) {
        playerIcon.classList.add('hit-flash');
        setTimeout(() => {
            playerIcon.classList.remove('hit-flash');
        }, 500);
    }
    
    // Remove hit effect class after animation
    setTimeout(() => {
        playerInfoBox.classList.remove('hit-effect');
    }, 500);
}

function handleActionRejected(message) {
    // Rollback optimistic movement
    if (window.rollbackMovement) {
        window.rollbackMovement(message.authoritative_pos);
    }
    showError(message.reason || 'Akce byla zamítnuta');
}

function handleGameOver(message) {
    // Play explosion sound
    if (window.audioManager) {
        window.audioManager.play('robot_explode');
    }
    
    const players = currentGameState?.players || [];
    const winnerId = message.winner_id;
    
    // Find winner and loser
    players.forEach((player, index) => {
        const playerInfo = index === 0 ? document.getElementById('player-a-info') : document.getElementById('player-b-info');
        const playerName = index === 0 ? document.getElementById('player-a-name') : document.getElementById('player-b-name');
        
        if (!playerInfo || !playerName) return;
        
        if (player.player_id === winnerId) {
            // Winner - add blinking animation
            playerName.classList.add('winner-blink');
            playerInfo.classList.add('winner');
        } else {
            // Loser - make name transparent
            playerName.style.opacity = '0.3';
            playerName.style.color = '#999';
            playerInfo.style.opacity = '0.5';
        }
    });
}

function updateTraps(trapsState) {
    if (window.updateTrapsDisplay) {
        window.updateTrapsDisplay(trapsState);
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
    }
}

function showError(message) {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
        setTimeout(() => {
            errorDiv.classList.remove('show');
        }, 5000);
    } else {
        alert(message);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export for other scripts
window.ws = () => ws;
window.playerId = () => playerId;
window.sendAction = (action) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(action));
    }
};

