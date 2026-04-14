const TOTAL_SLOTS = 8;

// Main slot status array: 0 = available, 1 = occupied
let slotStatus = new Array(TOTAL_SLOTS).fill(0);

// Track order of occupation for FIFO exit
let occupationOrder = [];

// Bluetooth packet counter
let btPacketCount = 0;

// Auto simulation state
let autoSimInterval = null;
let isAutoRunning = false;

// ======================== INITIALIZATION ========================

document.addEventListener('DOMContentLoaded', () => {
    buildParkingGrid();
    buildArrayDisplay();
    updateStats();
    updateCodeOutput();

    // Speed slider
    const speedSlider = document.getElementById('sim-speed');
    const speedDisplay = document.getElementById('speed-display');
    speedSlider.addEventListener('input', () => {
        const val = parseInt(speedSlider.value);
        speedDisplay.textContent = (val / 1000).toFixed(1) + 's';
        // If auto sim is running, restart with new speed
        if (isAutoRunning) {
            clearInterval(autoSimInterval);
            autoSimInterval = setInterval(autoSimulationStep, val);
        }
    });
});

// ======================== BUILD UI ========================

function buildParkingGrid() {
    const grid = document.getElementById('parking-grid');
    grid.innerHTML = '';

    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const slot = document.createElement('div');
        slot.className = 'parking-slot available';
        slot.id = `slot-${i}`;
        slot.onclick = () => toggleSlotManual(i);
        slot.innerHTML = `
            <div class="slot-pir"></div>
            <span class="slot-id">Slot ${i + 1}</span>
            <span class="slot-icon">🅿️</span>
            <span class="slot-status-text">Available</span>
        `;
        grid.appendChild(slot);
    }
}

function buildArrayDisplay() {
    const container = document.getElementById('array-display');
    container.innerHTML = '';

    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const cell = document.createElement('div');
        cell.className = 'array-cell val-0';
        cell.id = `cell-${i}`;
        cell.innerHTML = `
            <span class="cell-index">[${i}]</span>
            <span class="cell-value">0</span>
        `;
        container.appendChild(cell);
    }
}

// ======================== CORE LOGIC ========================

/**
 * If-else based decision logic for entry:
 * - IF all slots are full → reject entry
 * - ELSE → find first available slot → set slotStatus[i] = 1
 * - Trigger PIR entry animation
 * - Transmit updated array via Bluetooth
 */
function simulateEntry() {
    // Check: if all slots occupied, deny entry
    const freeIndex = findFirstFreeSlot();

    if (freeIndex === -1) {
        // All slots full — no entry allowed
        addBtLog('⚠️ Entry DENIED — All slots occupied. No free slot available.', 'bt-exit-type');
        flashGate('gate-entry');
        return;
    }

    // PIR sensor at entry gate detects vehicle
    flashGate('gate-entry');
    addBtLog(`🔍 PIR-E triggered: Vehicle detected at ENTRY gate.`, 'bt-entry-type');

    // Occupy the slot
    slotStatus[freeIndex] = 1;
    occupationOrder.push(freeIndex);

    // Update all visuals
    updateSlotVisual(freeIndex);
    updateArrayCell(freeIndex);
    updateStats();
    updateCodeOutput();

    addBtLog(`✅ Slot ${freeIndex + 1} occupied. slotStatus[${freeIndex}] = 1`, 'bt-entry-type');

    // Transmit via Bluetooth
    transmitBluetooth('ENTRY', freeIndex);
}

/**
 * If-else based decision logic for exit:
 * - IF no vehicles parked → nothing to do
 * - ELSE → free the oldest occupied slot (FIFO) → set slotStatus[i] = 0
 * - Trigger PIR exit animation
 * - Transmit updated array via Bluetooth
 */
function simulateExit() {
    // Check: if no vehicles, deny exit
    if (occupationOrder.length === 0) {
        addBtLog('⚠️ Exit DENIED — No vehicles currently parked.', 'bt-exit-type');
        flashGate('gate-exit');
        return;
    }

    // PIR sensor at exit gate detects vehicle
    flashGate('gate-exit');
    addBtLog(`🔍 PIR-X triggered: Vehicle detected at EXIT gate.`, 'bt-exit-type');

    // Free oldest occupied slot (FIFO order)
    const exitIndex = occupationOrder.shift();
    slotStatus[exitIndex] = 0;

    // Update visuals
    updateSlotVisual(exitIndex);
    updateArrayCell(exitIndex);
    updateStats();
    updateCodeOutput();

    addBtLog(`🚗 Slot ${exitIndex + 1} freed. slotStatus[${exitIndex}] = 0`, 'bt-exit-type');

    // Transmit via Bluetooth
    transmitBluetooth('EXIT', exitIndex);
}

/**
 * Find first available slot using simple if-else / loop
 * Returns index of first free slot, or -1 if all occupied
 */
function findFirstFreeSlot() {
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        if (slotStatus[i] === 0) {
            return i;
        }
    }
    return -1; // All full
}

/**
 * Toggle individual slot manually (click on grid)
 */
function toggleSlotManual(index) {
    if (slotStatus[index] === 0) {
        // Occupy
        slotStatus[index] = 1;
        occupationOrder.push(index);
        addBtLog(`🖱️ Manual: Slot ${index + 1} set to OCCUPIED.`, 'bt-send');
    } else {
        // Free
        slotStatus[index] = 0;
        occupationOrder = occupationOrder.filter(i => i !== index);
        addBtLog(`🖱️ Manual: Slot ${index + 1} set to AVAILABLE.`, 'bt-send');
    }

    updateSlotVisual(index);
    updateArrayCell(index);
    updateStats();
    updateCodeOutput();
    transmitBluetooth('MANUAL', index);
}

// ======================== BLUETOOTH TRANSMISSION ========================

/**
 * Simulate Bluetooth (HC-05) data transmission.
 * In real hardware, this sends the slotStatus array as a byte stream
 * over UART → HC-05 → receiving device.
 *
 * Packet format: "PKT:<count>|TYPE:<type>|SLOT:<id>|DATA:[0,1,0,...]"
 */
function transmitBluetooth(eventType, slotIndex) {
    btPacketCount++;
    document.getElementById('bt-packets').textContent = btPacketCount;

    const arrayStr = '[' + slotStatus.join(',') + ']';
    const packet = `PKT:${btPacketCount}|TYPE:${eventType}|SLOT:${slotIndex}|DATA:${arrayStr}`;

    addBtLog(
        `📡 BT TX → <span class="bt-data">${packet}</span>`,
        'bt-send'
    );
}

// ======================== UI UPDATES ========================

function updateSlotVisual(index) {
    const slot = document.getElementById(`slot-${index}`);
    if (!slot) return;

    // Add sensor flash animation
    slot.classList.add('sensor-flash');
    setTimeout(() => slot.classList.remove('sensor-flash'), 600);

    if (slotStatus[index] === 1) {
        slot.className = 'parking-slot occupied';
        slot.querySelector('.slot-icon').textContent = '🚗';
        slot.querySelector('.slot-status-text').textContent = 'Occupied';
    } else {
        slot.className = 'parking-slot available';
        slot.querySelector('.slot-icon').textContent = '🅿️';
        slot.querySelector('.slot-status-text').textContent = 'Available';
    }

    // Keep PIR indicator
    if (!slot.querySelector('.slot-pir')) {
        const pir = document.createElement('div');
        pir.className = 'slot-pir';
        slot.prepend(pir);
    }
}

function updateArrayCell(index) {
    const cell = document.getElementById(`cell-${index}`);
    if (!cell) return;

    cell.classList.add('flash');
    setTimeout(() => cell.classList.remove('flash'), 500);

    const val = slotStatus[index];
    cell.className = `array-cell val-${val}`;
    cell.querySelector('.cell-value').textContent = val;
    // Re-add flash class
    cell.id = `cell-${index}`;
}

function updateStats() {
    const occupied = slotStatus.filter(s => s === 1).length;
    const available = TOTAL_SLOTS - occupied;

    document.getElementById('available-count').textContent = available;
    document.getElementById('occupied-count').textContent = occupied;
}

function updateCodeOutput() {
    const codeEl = document.getElementById('code-output');
    const arr = slotStatus.map((v, i) => `slotStatus[${i}] = ${v};`).join('\n');
    const occupied = slotStatus.filter(s => s === 1).length;
    const available = TOTAL_SLOTS - occupied;

    codeEl.innerHTML =
`<span style="color:#6b7280">// --- Slot Status Array (updated by PIR sensor) ---</span>
<span style="color:#c084fc">int</span> slotStatus[${TOTAL_SLOTS}] = {${slotStatus.join(', ')}};

<span style="color:#6b7280">// --- Summary ---</span>
<span style="color:#c084fc">int</span> totalSlots  = <span style="color:#22c55e">${TOTAL_SLOTS}</span>;
<span style="color:#c084fc">int</span> occupied    = <span style="color:#ef4444">${occupied}</span>;
<span style="color:#c084fc">int</span> available   = <span style="color:#22c55e">${available}</span>;

<span style="color:#6b7280">// --- Bluetooth Packet ---</span>
Serial.println(<span style="color:#38bdf8">"DATA:[${slotStatus.join(',')}]"</span>);`;
}

function flashGate(gateId) {
    const gate = document.getElementById(gateId);
    if (!gate) return;

    gate.classList.add('active');
    setTimeout(() => gate.classList.remove('active'), 1200);
}

// ======================== BLUETOOTH LOG ========================

function addBtLog(message, cssClass = '') {
    const log = document.getElementById('bt-log');
    const entry = document.createElement('div');
    entry.className = `bt-entry ${cssClass}`;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    entry.innerHTML = `
        <span class="bt-time">${timeStr}</span>
        <span class="bt-msg">${message}</span>
    `;

    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

// ======================== AUTO SIMULATION ========================

function toggleAutoSimulation() {
    const btn = document.getElementById('btn-auto');
    const label = document.getElementById('auto-label');

    if (isAutoRunning) {
        // Stop
        clearInterval(autoSimInterval);
        isAutoRunning = false;
        btn.classList.remove('active');
        label.textContent = 'Start Auto Simulation';
        addBtLog('⏸️ Auto simulation stopped.', 'bt-system');
    } else {
        // Start
        const speed = parseInt(document.getElementById('sim-speed').value);
        isAutoRunning = true;
        btn.classList.add('active');
        label.textContent = 'Stop Auto Simulation';
        addBtLog('▶️ Auto simulation started.', 'bt-system');
        autoSimInterval = setInterval(autoSimulationStep, speed);
    }
}

function autoSimulationStep() {
    const occupied = slotStatus.filter(s => s === 1).length;
    const available = TOTAL_SLOTS - occupied;

    // Decision logic for auto simulation:
    if (available === 0) {
        // If lot is full, force an exit
        simulateExit();
    } else if (occupied === 0) {
        // If lot is empty, force an entry
        simulateEntry();
    } else {
        // Randomly choose entry (60%) or exit (40%)
        if (Math.random() < 0.6) {
            simulateEntry();
        } else {
            simulateExit();
        }
    }
}

// ======================== RESET ========================

function resetAll() {
    // Stop auto sim if running
    if (isAutoRunning) {
        toggleAutoSimulation();
    }

    // Reset state
    slotStatus = new Array(TOTAL_SLOTS).fill(0);
    occupationOrder = [];
    btPacketCount = 0;

    // Reset UI
    document.getElementById('bt-packets').textContent = '0';
    buildParkingGrid();
    buildArrayDisplay();
    updateStats();
    updateCodeOutput();

    // Clear BT log and add reset message
    const log = document.getElementById('bt-log');
    log.innerHTML = '';
    addBtLog('🔄 System reset. All slots cleared. Awaiting PIR triggers...', 'bt-system');
}
