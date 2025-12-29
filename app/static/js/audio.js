// Simple audio playback function - creates new Audio object each time
// This avoids issues with audio context and autoplay policies
function playSound(soundPath, volume = 0.5) {
    try {
        const audio = new Audio(soundPath);
        audio.volume = volume;
        audio.play().catch(err => {
            console.debug('Audio play failed:', err);
        });
    } catch (err) {
        console.debug('Audio creation failed:', err);
    }
}

// Sound paths
const SOUNDS = {
    weapon_hit: '/static/sfx/weapons/hit_01.mp3',
    trap_hit: '/static/sfx/traps/trap_hit_01.mp3',
    robot_explode: '/static/sfx/explosion/robot_explode_01.mp3'
};

// Simple audio manager interface
const audioManager = {
    enabled: false, // Disabled by default
    play: function(soundName) {
        if (!this.enabled) return;
        const soundPath = SOUNDS[soundName];
        if (soundPath) {
            playSound(soundPath, 0.5);
        }
    },
    setEnabled: function(enabled) {
        this.enabled = enabled;
    },
    initializeAudio: function() {
        // Try to unlock audio context by playing a silent sound
        try {
            const silentAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGWi77+efTRAMUKfj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUqgc7y2Yk2CBlou+/nn00QDFCn4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC');
            silentAudio.volume = 0.001;
            silentAudio.play().then(() => {
                silentAudio.pause();
            }).catch(() => {});
        } catch (err) {
            console.debug('Audio unlock failed:', err);
        }
    }
};

// Initialize audio on first user interaction
let audioInitialized = false;
function initializeAudioOnInteraction() {
    if (audioInitialized) return;
    audioInitialized = true;
    audioManager.initializeAudio();
}

// Initialize on any user interaction
document.addEventListener('click', initializeAudioOnInteraction, { once: true });
document.addEventListener('keydown', initializeAudioOnInteraction, { once: true });
document.addEventListener('touchstart', initializeAudioOnInteraction, { once: true });

// Export
window.audioManager = audioManager;

