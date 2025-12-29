// Arena and grid management
const GRID_COLS = 18;
const GRID_ROWS = 12;
const CELL_WIDTH = 60; // Based on SVG size (1080/18 = 60)
const CELL_HEIGHT = 60; // Based on SVG size (720/12 = 60)

let arenaSvg = null;
let gridCanvas = null;
let gridCtx = null;
let currentPlayerPos = null;
let optimisticPos = null;
let robotIcons = {}; // Cache for robot icons

// Initialize arena
function initArena() {
    arenaSvg = document.getElementById('arena-svg');
    gridCanvas = document.getElementById('grid-overlay');
    
    if (!arenaSvg || !gridCanvas) return;
    
    gridCtx = gridCanvas.getContext('2d');
    
    // Load SVG
    loadArenaSvg();
    
    // Setup grid overlay
    setupGridOverlay();
}

function loadArenaSvg() {
    // SVG is loaded via <object> tag, no need to load manually
    // This function is kept for potential future enhancements
}

function loadRobotIcon(robotId, callback) {
    // Check cache first - but verify it's actually loaded
    if (robotIcons[robotId] && robotIcons[robotId].complete && robotIcons[robotId].naturalWidth > 0) {
        callback(robotIcons[robotId]);
        return;
    }
    
    const img = new Image();
    img.onload = () => {
        robotIcons[robotId] = img;
        callback(img);
    };
    img.onerror = () => {
        // If image fails to load, use null (will draw circle instead)
        robotIcons[robotId] = null;
        callback(null);
    };
    img.src = `/static/images/robots/${robotId}.png`;
}

function setupGridOverlay() {
    if (!gridCanvas || !gridCtx) return;
    
    const container = document.getElementById('arena-container');
    if (!container) return;
    
    // Resize canvas to match container
    const resizeCanvas = () => {
        if (!container || !gridCanvas) return;
        
        // Get arena box dimensions (parent of container)
        const arenaBox = container.parentElement;
        if (!arenaBox) return;
        
        // Wait for arena box to have dimensions
        const boxWidth = arenaBox.clientWidth;
        const boxHeight = arenaBox.clientHeight;
        
        if (boxWidth === 0 || boxHeight === 0) {
            // Container not ready yet, retry
            setTimeout(resizeCanvas, 100);
            return;
        }
        
        // Calculate size with 2px padding on each side (4px total)
        const availableWidth = boxWidth - 4;
        const availableHeight = boxHeight - 4;
        
        // Calculate scale to fit SVG aspect ratio (1080x720 = 3:2)
        const svgAspectRatio = 1080 / 720;
        const availableAspectRatio = availableWidth / availableHeight;
        
        let width, height, scale;
        if (availableAspectRatio > svgAspectRatio) {
            // Available space is wider - fit to height
            height = availableHeight;
            width = height * svgAspectRatio;
            scale = height / 720;
        } else {
            // Available space is taller - fit to width
            width = availableWidth;
            height = width / svgAspectRatio;
            scale = width / 1080;
        }
        
        // Set container size
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        
        // Set canvas size to match container
        gridCanvas.width = width;
        gridCanvas.height = height;
        
        // Update SVG size to match container
        const arenaSvg = document.getElementById('arena-svg');
        if (arenaSvg) {
            arenaSvg.setAttribute('width', width);
            arenaSvg.setAttribute('height', height);
        }
        
        drawGrid(scale);
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Click handler
    gridCanvas.addEventListener('click', handleGridClick);
    
    // Keyboard handler for arrow keys
    setupKeyboardControls();
}

// Cache for grid background
let gridBackgroundCanvas = null;
let lastGridSize = { width: 0, height: 0 };

function drawGrid(scale = 1) {
    if (!gridCtx || !gridCanvas) return;
    
    const cellW = (gridCanvas.width / GRID_COLS);
    const cellH = (gridCanvas.height / GRID_ROWS);
    
    // Recreate background canvas if size changed
    if (!gridBackgroundCanvas || 
        lastGridSize.width !== gridCanvas.width || 
        lastGridSize.height !== gridCanvas.height) {
        
        gridBackgroundCanvas = document.createElement('canvas');
        gridBackgroundCanvas.width = gridCanvas.width;
        gridBackgroundCanvas.height = gridCanvas.height;
        const bgCtx = gridBackgroundCanvas.getContext('2d');
        
        // Draw grid lines on background canvas
        bgCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        bgCtx.lineWidth = 1;
        
        for (let x = 0; x <= GRID_COLS; x++) {
            bgCtx.beginPath();
            bgCtx.moveTo(x * cellW, 0);
            bgCtx.lineTo(x * cellW, gridCanvas.height);
            bgCtx.stroke();
        }
        
        for (let y = 0; y <= GRID_ROWS; y++) {
            bgCtx.beginPath();
            bgCtx.moveTo(0, y * cellH);
            bgCtx.lineTo(gridCanvas.width, y * cellH);
            bgCtx.stroke();
        }
        
        lastGridSize = { width: gridCanvas.width, height: gridCanvas.height };
    }
    
    // Clear and draw background
    gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    if (gridBackgroundCanvas) {
        gridCtx.drawImage(gridBackgroundCanvas, 0, 0);
    }
    
    // Draw player positions
    if (currentGameState && currentGameState.players) {
        currentGameState.players.forEach((player, index) => {
            const pos = optimisticPos && player.player_id === window.playerId() ? optimisticPos : player.pos;
            if (pos && pos.x !== undefined && pos.y !== undefined) {
                const x = pos.x * cellW + cellW / 2;
                const y = pos.y * cellH + cellH / 2;
                
                const iconSize = Math.min(cellW, cellH) * 0.8; // 80% of cell size
                
                // Get robot ID from player
                const robotId = player.robot_id;
                
                if (robotId && window.seedData) {
                    // Check if icon is already loaded
                    const icon = robotIcons[robotId];
                    
                    if (icon && icon.complete && icon.naturalWidth > 0) {
                        // Check if this is the active player (on turn)
                        const isActivePlayer = currentGameState.turn_player_id === player.player_id;
                        
                        // Calculate blink effect for active player - more visible on dark background
                        const now = performance.now();
                        const blinkSpeed = 1000; // milliseconds per blink cycle
                        const blinkPhase = (now % blinkSpeed) / blinkSpeed;
                        const blinkIntensity = isActivePlayer ? 0.6 + Math.sin(blinkPhase * Math.PI * 2) * 0.4 : 0.5;
                        
                        // Draw icon synchronously
                        const iconX = x - iconSize / 2;
                        const iconY = y - iconSize / 2;
                        
                        // Get player color (blue for index 0, red for index 1)
                        const playerColor = index === 0 
                            ? { r: 59, g: 130, b: 246 }  // Blue
                            : { r: 239, g: 68, b: 68 };  // Red
                        
                        // Draw player color aura/shadow under robot
                        gridCtx.shadowColor = `rgba(${playerColor.r}, ${playerColor.g}, ${playerColor.b}, 0.6)`;
                        gridCtx.shadowBlur = 20;
                        gridCtx.shadowOffsetX = 0;
                        gridCtx.shadowOffsetY = iconSize * 0.3; // Shadow below robot
                        
                        // Draw glow effect for active player - brighter and more visible
                        if (isActivePlayer) {
                            // Use bright cyan/white glow for better visibility on dark background
                            gridCtx.shadowColor = `rgba(135, 206, 250, ${blinkIntensity})`; // Light blue
                            gridCtx.shadowBlur = 30;
                            gridCtx.shadowOffsetX = 0;
                            gridCtx.shadowOffsetY = 0;
                            // Draw additional white glow for extra visibility
                            gridCtx.globalAlpha = blinkIntensity * 0.3;
                            gridCtx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                            gridCtx.shadowBlur = 15;
                            gridCtx.drawImage(icon, iconX, iconY, iconSize, iconSize);
                            gridCtx.globalAlpha = 1.0;
                            // Reset shadow for player color aura
                            gridCtx.shadowColor = `rgba(${playerColor.r}, ${playerColor.g}, ${playerColor.b}, 0.6)`;
                            gridCtx.shadowBlur = 20;
                            gridCtx.shadowOffsetX = 0;
                            gridCtx.shadowOffsetY = iconSize * 0.3;
                        }
                        
                        gridCtx.drawImage(icon, iconX, iconY, iconSize, iconSize);
                        
                        // Reset shadow and alpha
                        gridCtx.shadowColor = 'transparent';
                        gridCtx.shadowBlur = 0;
                        gridCtx.shadowOffsetX = 0;
                        gridCtx.shadowOffsetY = 0;
                        gridCtx.globalAlpha = 1.0;
                    } else {
                        // Icon not loaded yet - draw fallback and trigger load
                        const isActivePlayer = currentGameState.turn_player_id === player.player_id;
                        
                        // Get player color
                        const playerColor = index === 0 
                            ? { r: 59, g: 130, b: 246 }  // Blue
                            : { r: 239, g: 68, b: 68 };  // Red
                        
                        // Calculate blink effect for active player
                        const now = performance.now();
                        const blinkSpeed = 1000;
                        const blinkPhase = (now % blinkSpeed) / blinkSpeed;
                        const blinkOpacity = isActivePlayer ? 0.4 + Math.sin(blinkPhase * Math.PI * 2) * 0.3 : 1.0;
                        
                        // Draw player color shadow/aura
                        gridCtx.shadowColor = `rgba(${playerColor.r}, ${playerColor.g}, ${playerColor.b}, 0.6)`;
                        gridCtx.shadowBlur = 20;
                        gridCtx.shadowOffsetX = 0;
                        gridCtx.shadowOffsetY = iconSize * 0.3;
                        
                        gridCtx.fillStyle = `rgba(${playerColor.r}, ${playerColor.g}, ${playerColor.b}, ${blinkOpacity})`;
                        gridCtx.beginPath();
                        gridCtx.arc(x, y, iconSize * 0.4, 0, Math.PI * 2);
                        gridCtx.fill();
                        
                        // Reset shadow
                        gridCtx.shadowColor = 'transparent';
                        gridCtx.shadowBlur = 0;
                        gridCtx.shadowOffsetX = 0;
                        gridCtx.shadowOffsetY = 0;
                        
                        // Load icon asynchronously and redraw when ready
                        loadRobotIcon(robotId, (img) => {
                            if (img) {
                                drawGrid(scale); // Redraw when icon loads
                            }
                        });
                    }
                } else {
                    // Fallback: draw colored circle if no robot selected
                    const isActivePlayer = currentGameState.turn_player_id === player.player_id;
                    
                    // Get player color
                    const playerColor = index === 0 
                        ? { r: 59, g: 130, b: 246 }  // Blue
                        : { r: 239, g: 68, b: 68 };  // Red
                    
                    // Calculate blink effect for active player
                    const now = performance.now();
                    const blinkSpeed = 1000;
                    const blinkPhase = (now % blinkSpeed) / blinkSpeed;
                    const blinkOpacity = isActivePlayer ? 0.4 + Math.sin(blinkPhase * Math.PI * 2) * 0.3 : 1.0;
                    
                    // Draw player color shadow/aura
                    gridCtx.shadowColor = `rgba(${playerColor.r}, ${playerColor.g}, ${playerColor.b}, 0.6)`;
                    gridCtx.shadowBlur = 20;
                    gridCtx.shadowOffsetX = 0;
                    gridCtx.shadowOffsetY = iconSize * 0.3;
                    
                    gridCtx.fillStyle = `rgba(${playerColor.r}, ${playerColor.g}, ${playerColor.b}, ${blinkOpacity})`;
                    gridCtx.beginPath();
                    gridCtx.arc(x, y, iconSize * 0.4, 0, Math.PI * 2);
                    gridCtx.fill();
                    
                    // Reset shadow
                    gridCtx.shadowColor = 'transparent';
                    gridCtx.shadowBlur = 0;
                    gridCtx.shadowOffsetX = 0;
                    gridCtx.shadowOffsetY = 0;
                }
            }
        });
    }
}

// Draw only player icons (for animation, without redrawing grid)
function drawPlayerIconsOnly() {
    if (!gridCtx || !currentGameState || !currentGameState.players) return;
    
    const cellW = (gridCanvas.width / GRID_COLS);
    const cellH = (gridCanvas.height / GRID_ROWS);
    
    // Clear and redraw only player icon areas
    currentGameState.players.forEach((player, index) => {
        const pos = optimisticPos && player.player_id === window.playerId() ? optimisticPos : player.pos;
        if (pos && pos.x !== undefined && pos.y !== undefined) {
            const x = pos.x * cellW + cellW / 2;
            const y = pos.y * cellH + cellH / 2;
            const iconSize = Math.min(cellW, cellH) * 0.8;
            const clearSize = iconSize * 1.5; // Clear slightly larger area
            
            // Clear area around icon
            gridCtx.clearRect(x - clearSize/2, y - clearSize/2, clearSize, clearSize);
            
            // Redraw background from cache
            if (gridBackgroundCanvas) {
                gridCtx.drawImage(gridBackgroundCanvas, 
                    pos.x * cellW, pos.y * cellH, cellW, cellH,
                    pos.x * cellW, pos.y * cellH, cellW, cellH);
            }
            
            // Draw icon
            const robotId = player.robot_id;
            if (robotId && window.seedData) {
                const icon = robotIcons[robotId];
                
                if (icon && icon.complete && icon.naturalWidth > 0) {
                    const isActivePlayer = currentGameState.turn_player_id === player.player_id;
                    const now = performance.now();
                    const blinkSpeed = 1000;
                    const blinkPhase = (now % blinkSpeed) / blinkSpeed;
                    const blinkIntensity = isActivePlayer ? 0.6 + Math.sin(blinkPhase * Math.PI * 2) * 0.4 : 0.5;
                    
                    const iconX = x - iconSize / 2;
                    const iconY = y - iconSize / 2;
                    
                    const playerColor = index === 0 
                        ? { r: 59, g: 130, b: 246 }
                        : { r: 239, g: 68, b: 68 };
                    
                    // Draw player color aura
                    gridCtx.shadowColor = `rgba(${playerColor.r}, ${playerColor.g}, ${playerColor.b}, 0.6)`;
                    gridCtx.shadowBlur = 20;
                    gridCtx.shadowOffsetX = 0;
                    gridCtx.shadowOffsetY = iconSize * 0.3;
                    
                    // Draw glow for active player
                    if (isActivePlayer) {
                        gridCtx.shadowColor = `rgba(135, 206, 250, ${blinkIntensity})`;
                        gridCtx.shadowBlur = 30;
                        gridCtx.shadowOffsetX = 0;
                        gridCtx.shadowOffsetY = 0;
                        gridCtx.globalAlpha = blinkIntensity * 0.3;
                        gridCtx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                        gridCtx.shadowBlur = 15;
                        gridCtx.drawImage(icon, iconX, iconY, iconSize, iconSize);
                        gridCtx.globalAlpha = 1.0;
                        gridCtx.shadowColor = `rgba(${playerColor.r}, ${playerColor.g}, ${playerColor.b}, 0.6)`;
                        gridCtx.shadowBlur = 20;
                        gridCtx.shadowOffsetX = 0;
                        gridCtx.shadowOffsetY = iconSize * 0.3;
                    }
                    
                    gridCtx.drawImage(icon, iconX, iconY, iconSize, iconSize);
                    
                    // Reset shadow
                    gridCtx.shadowColor = 'transparent';
                    gridCtx.shadowBlur = 0;
                    gridCtx.shadowOffsetX = 0;
                    gridCtx.shadowOffsetY = 0;
                    gridCtx.globalAlpha = 1.0;
                }
            }
        }
    });
}

function handleGridClick(event) {
    if (!gridCanvas || !currentGameState) return;
    
    const rect = gridCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const cellW = gridCanvas.width / GRID_COLS;
    const cellH = gridCanvas.height / GRID_ROWS;
    
    const gridX = Math.floor(x / cellW);
    const gridY = Math.floor(y / cellH);
    
    // Check if it's our turn
    if (currentGameState.turn_player_id !== window.playerId()) {
        return;
    }
    
    if (currentGameState.ap_remaining <= 0) {
        return;
    }
    
    // Get current player
    const currentPlayer = currentGameState.players.find(p => p.player_id === window.playerId());
    if (!currentPlayer) return;
    
    const currentPos = optimisticPos || currentPlayer.pos;
    
    // Check if clicked on another player (attack)
    const targetPlayer = currentGameState.players.find(p => 
        p.player_id !== window.playerId() && 
        p.pos.x === gridX && 
        p.pos.y === gridY
    );
    
    if (targetPlayer) {
        // Attack
        const clientActionId = 'action_' + Date.now();
        window.sendAction({
            type: 'action_attack',
            target_player_id: targetPlayer.player_id,
            client_action_id: clientActionId
        });
    } else {
        // Move
        const dx = Math.abs(gridX - currentPos.x);
        const dy = Math.abs(gridY - currentPos.y);
        
        // Check if adjacent (8-directional)
        if (dx <= 1 && dy <= 1 && (dx > 0 || dy > 0)) {
            // Optimistic movement
            optimisticPos = { x: gridX, y: gridY };
            drawGrid();
            
            const clientActionId = 'action_' + Date.now();
            window.sendAction({
                type: 'action_move',
                to_x: gridX,
                to_y: gridY,
                client_action_id: clientActionId
            });
        }
    }
}

function setupKeyboardControls() {
    // Handle arrow key presses
    document.addEventListener('keydown', (event) => {
        // Only process arrow keys
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            return;
        }
        
        // Check if game screen is visible
        const gameScreen = document.getElementById('game-screen');
        if (!gameScreen || gameScreen.classList.contains('hidden') || gameScreen.style.display === 'none') {
            return;
        }
        
        // Prevent default scrolling
        event.preventDefault();
        
        // Check if it's our turn and we have AP
        if (!currentGameState) return;
        if (currentGameState.turn_player_id !== window.playerId()) return;
        if (currentGameState.ap_remaining <= 0) return;
        
        // Get current player
        const currentPlayer = currentGameState.players.find(p => p.player_id === window.playerId());
        if (!currentPlayer) return;
        
        const currentPos = optimisticPos || currentPlayer.pos;
        
        // Calculate new position based on arrow key
        let newX = currentPos.x;
        let newY = currentPos.y;
        
        switch (event.key) {
            case 'ArrowUp':
                newY = Math.max(0, currentPos.y - 1);
                break;
            case 'ArrowDown':
                newY = Math.min(GRID_ROWS - 1, currentPos.y + 1);
                break;
            case 'ArrowLeft':
                newX = Math.max(0, currentPos.x - 1);
                break;
            case 'ArrowRight':
                newX = Math.min(GRID_COLS - 1, currentPos.x + 1);
                break;
        }
        
        // Check if position changed
        if (newX === currentPos.x && newY === currentPos.y) {
            return; // No movement
        }
        
        // Check if new position is occupied by another player
        const occupiedBy = currentGameState.players.find(p => 
            p.player_id !== window.playerId() && 
            p.pos.x === newX && 
            p.pos.y === newY
        );
        
        if (occupiedBy) {
            // Attack instead of move
            const clientActionId = 'action_' + Date.now();
            window.sendAction({
                type: 'action_attack',
                target_player_id: occupiedBy.player_id,
                client_action_id: clientActionId
            });
        } else {
            // Move to new position
            // Optimistic movement
            optimisticPos = { x: newX, y: newY };
            drawGrid();
            
            const clientActionId = 'action_' + Date.now();
            window.sendAction({
                type: 'action_move',
                to_x: newX,
                to_y: newY,
                client_action_id: clientActionId
            });
        }
    });
}

let blinkAnimationId = null;

function updateArena(state) {
    currentGameState = state;
    
    // Reset optimistic position
    optimisticPos = null;
    
    // Update current player position
    const currentPlayer = state.players.find(p => p.player_id === window.playerId());
    if (currentPlayer) {
        currentPlayerPos = currentPlayer.pos;
    }
    
    // Preload robot icons for all players - ensure they're loaded even on reconnect
    if (state.players && window.seedData) {
        state.players.forEach(player => {
            if (player.robot_id) {
                // Always try to load, even if already in cache (in case of reconnect)
                // Check if icon exists and is properly loaded
                const cachedIcon = robotIcons[player.robot_id];
                if (!cachedIcon || !cachedIcon.complete || cachedIcon.naturalWidth === 0) {
                    // Clear potentially broken cache entry
                    if (cachedIcon) {
                        delete robotIcons[player.robot_id];
                    }
                    // Load fresh
                    loadRobotIcon(player.robot_id, (img) => {
                        if (img) {
                            drawGrid(); // Redraw when icon loads
                        }
                    });
                }
            }
        });
    }
    
    // Enable/disable grid overlay based on turn
    if (gridCanvas) {
        if (state.turn_player_id === window.playerId() && state.ap_remaining > 0) {
            gridCanvas.classList.add('active');
        } else {
            gridCanvas.classList.remove('active');
        }
    }
    
    // Start/stop blinking animation for active player
    if (blinkAnimationId) {
        cancelAnimationFrame(blinkAnimationId);
        blinkAnimationId = null;
    }
    
    // Start blinking animation if there's an active player
    if (state.turn_player_id) {
        const animateBlink = () => {
            if (currentGameState && currentGameState.turn_player_id) {
                drawGrid();
                blinkAnimationId = requestAnimationFrame(animateBlink);
            }
        };
        blinkAnimationId = requestAnimationFrame(animateBlink);
    }
    
    drawGrid();
}

function rollbackMovement(authoritativePos) {
    optimisticPos = null;
    if (currentGameState) {
        const currentPlayer = currentGameState.players.find(p => p.player_id === window.playerId());
        if (currentPlayer) {
            currentPlayer.pos = authoritativePos;
        }
    }
    drawGrid();
}

function updateTrapsDisplay(trapsState) {
    // TODO: Update trap visual states based on trapsState
    // For now, placeholder
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    initArena();
});

// Export functions
window.updateArena = updateArena;
window.rollbackMovement = rollbackMovement;
window.updateTrapsDisplay = updateTrapsDisplay;
window.loadRobotIcon = loadRobotIcon;
// Make robotIcons accessible globally
Object.defineProperty(window, 'robotIcons', {
    get: () => robotIcons,
    set: (value) => { robotIcons = value; }
});

