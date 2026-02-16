/**
 * Practice/Quali Helper Manager
 * Manages 4 separate line charts for telemetry visualization
 */

class UpdateManager {
    constructor() {
        // Chart canvases
        this.speedCanvas = null;
        this.gearRpmCanvas = null;
        this.throttleBrakeCanvas = null;
        this.fuelUseCanvas = null;
        
        // Chart contexts
        this.speedCtx = null;
        this.gearRpmCtx = null;
        this.throttleBrakeCtx = null;
        this.fuelUseCtx = null;
        
        // Data storage - 20 minutes @ 60Hz = 72,000 points
        this.maxDataPoints = 72000;
        
        // X-values: lap distance percentage (0.0 - 100.0) for all charts
        this.xValues = [];
        
        // Chart 1: Speed
        this.speedHistory = [];
        
        // Chart 2: Gear and RPM
        this.gearHistory = [];
        this.rpmHistory = [];
        
        // Chart 3: Throttle and Brake
        this.throttleHistory = [];
        this.brakeHistory = [];
        
        // Chart 4: Fuel Use Per Hour
        this.fuelUseHistory = [];
        
        // Best lap ghost data (reference lap)
        this.bestLap = {
            lapNum: -1,
            xValues: [],
            speed: [],
            gear: [],
            rpm: [],
            throttle: [],
            brake: [],
            fuelUse: []
        };
        
        // Cached DOM elements
        this.el = null;
        
        // Chart update throttling (30 FPS for performance)
        this.chartUpdateCounter = 0;
        this.chartUpdateInterval = 2;
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastFpsLog = Date.now();
        
        // Lap tracking for reset (only on lap completion)
        this.lastLap = 0;
        
        // Track last X-value to prevent backwards movement
        this.lastXValue = 0;
    }

    /**
     * Initialize - cache elements and setup canvases
     */
    init() {
        this.cacheElements();
        this.setupCanvases();
        
        console.log('✓ PracticeQualiManager initialized');
    }

    cacheElements() {
        this.el = {
            // Time displays
            currentLapTime: document.getElementById('current-lap-time'),
            predictedLapTime: document.getElementById('predicted-lap-time'),
            predictedLapBox: document.getElementById('pred-box'),
            bestLapTime: document.getElementById('best-lap-time'),
            lastLapTime: document.getElementById('last-lap-time'),
            
            // Data boxes
            gear: document.getElementById('gear'),
            rpm: document.getElementById('rpm'),
            rpmBox: document.getElementById('rpm-box'),
            speed: document.getElementById('speed'),
            avgFuelLap: document.getElementById('avg-fuel-lap'),
            fuelLaps: document.getElementById('fuel-laps'),
            fuelRemaining: document.getElementById('fuel-remaining')
        };
    }

    setupCanvases() {
        // Speed chart
        this.speedCanvas = document.getElementById('speedChart');
        if (this.speedCanvas) {
            this.speedCtx = this.speedCanvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });
            this.resizeCanvas(this.speedCanvas);
        }
        
        // Gear/RPM chart
        this.gearRpmCanvas = document.getElementById('gearRpmChart');
        if (this.gearRpmCanvas) {
            this.gearRpmCtx = this.gearRpmCanvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });
            this.resizeCanvas(this.gearRpmCanvas);
        }
        
        // Throttle/Brake chart
        this.throttleBrakeCanvas = document.getElementById('throttleBrakeChart');
        if (this.throttleBrakeCanvas) {
            this.throttleBrakeCtx = this.throttleBrakeCanvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });
            this.resizeCanvas(this.throttleBrakeCanvas);
        }
        
        // Fuel Use chart
        this.fuelUseCanvas = document.getElementById('fuelUseChart');
        if (this.fuelUseCanvas) {
            this.fuelUseCtx = this.fuelUseCanvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });
            this.resizeCanvas(this.fuelUseCanvas);
        }
        
        // Setup resize listeners
        window.addEventListener('resize', () => {
            this.resizeCanvas(this.speedCanvas);
            this.resizeCanvas(this.gearRpmCanvas);
            this.resizeCanvas(this.throttleBrakeCanvas);
            this.resizeCanvas(this.fuelUseCanvas);
            
            // Redraw all charts after resize
            this.drawSpeedChart();
            this.drawGearRpmChart();
            this.drawThrottleBrakeChart();
            this.drawFuelUseChart();
        }, { passive: true });
    }

    resizeCanvas(canvas) {
        if (canvas) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }
    }

    // ==================== CHART 1: SPEED ====================
    
    drawSpeedChart() {
        if (!this.speedCtx || this.speedHistory.length < 2) return;

        const width = this.speedCanvas.width;
        const height = this.speedCanvas.height;
        const padding = 10;
        const drawWidth = width - padding * 2;
        const drawHeight = height - padding * 2;

        this.speedCtx.clearRect(0, 0, width, height);

        // Find min and max speed for scaling (include best lap data)
        let allSpeeds = [...this.speedHistory];
        if (this.bestLap.speed.length > 0) {
            allSpeeds = [...allSpeeds, ...this.bestLap.speed];
        }
        const maxSpeed = Math.max(...allSpeeds, 1);
        const minSpeed = Math.min(...allSpeeds, 0);
        const speedRange = maxSpeed - minSpeed || 1;

        // Draw best lap ghost FIRST (underneath current lap)
        if (this.bestLap.xValues.length > 1) {
            this.speedCtx.strokeStyle = 'rgba(0, 89, 255, 0.4)';  // Semi-transparent white
            this.speedCtx.lineWidth = 2;
            this.speedCtx.beginPath();
            
            const len = this.bestLap.speed.length;
            for (let i = 0; i < len; i++) {
                const x = padding + (this.bestLap.xValues[i] / 100) * drawWidth;
                const y = height - padding - ((this.bestLap.speed[i] - minSpeed) / speedRange) * drawHeight;
                if (i === 0) this.speedCtx.moveTo(x, y);
                else this.speedCtx.lineTo(x, y);
            }
            this.speedCtx.stroke();
        }

        // Draw current lap speed line (on top)
        this.speedCtx.strokeStyle = '#0044ff';
        this.speedCtx.lineWidth = 2;
        this.speedCtx.beginPath();
        
        const len = this.speedHistory.length;
        for (let i = 0; i < len; i++) {
            const x = padding + (this.xValues[i] / 100) * drawWidth;
            const y = height - padding - ((this.speedHistory[i] - minSpeed) / speedRange) * drawHeight;
            if (i === 0) this.speedCtx.moveTo(x, y);
            else this.speedCtx.lineTo(x, y);
        }
        this.speedCtx.stroke();
    }

    updateSpeedChart(xValue, speed) {
        // Only add point if X-value is greater than last recorded X-value
        if (xValue > this.lastXValue || this.xValues.length === 0) {
            this.xValues.push(xValue);
            this.speedHistory.push(speed);
            
            // Keep arrays synchronized - remove oldest if exceeding max
            if (this.xValues.length > this.maxDataPoints) {
                this.xValues.shift();
                this.speedHistory.shift();
            }
            
            this.lastXValue = xValue;
        }
    }

    // ==================== CHART 2: GEAR & RPM ====================
    
    drawGearRpmChart() {
        if (!this.gearRpmCtx || this.gearHistory.length < 2) return;

        const width = this.gearRpmCanvas.width;
        const height = this.gearRpmCanvas.height;
        const padding = 10;
        const drawWidth = width - padding * 2;
        const drawHeight = height - padding * 2;

        this.gearRpmCtx.clearRect(0, 0, width, height);

        // Find min/max for scaling (include best lap)
        let allRpm = [...this.rpmHistory];
        let allGear = [...this.gearHistory];
        if (this.bestLap.rpm.length > 0) {
            allRpm = [...allRpm, ...this.bestLap.rpm];
            allGear = [...allGear, ...this.bestLap.gear];
        }
        
        const maxRpm = Math.max(...allRpm, 1);
        const minRpm = Math.min(...allRpm, 0);
        const rpmRange = maxRpm - minRpm || 1;
        
        const maxGear = Math.max(...allGear, 1);
        const minGear = Math.min(...allGear, 0);
        const gearRange = maxGear - minGear || 1;

        // Draw best lap RPM ghost FIRST
        if (this.bestLap.xValues.length > 1) {
            this.gearRpmCtx.strokeStyle = 'rgba(4, 247, 255, 0.4)';  // Semi-transparent cyan
            this.gearRpmCtx.lineWidth = 2;
            this.gearRpmCtx.beginPath();
            
            const len = this.bestLap.rpm.length;
            for (let i = 0; i < len; i++) {
                const x = padding + (this.bestLap.xValues[i] / 100) * drawWidth;
                const y = height - padding - ((this.bestLap.rpm[i] - minRpm) / rpmRange) * drawHeight;
                if (i === 0) this.gearRpmCtx.moveTo(x, y);
                else this.gearRpmCtx.lineTo(x, y);
            }
            this.gearRpmCtx.stroke();
            
            // Draw best lap Gear ghost
            this.gearRpmCtx.strokeStyle = 'rgba(255, 187, 0, 0.4)';  // Semi-transparent yellow
            this.gearRpmCtx.lineWidth = 2;
            this.gearRpmCtx.beginPath();
            
            for (let i = 0; i < len; i++) {
                const x = padding + (this.bestLap.xValues[i] / 100) * drawWidth;
                const normalizedGear = (this.bestLap.gear[i] - minGear) / gearRange;
                const y = height - padding - (normalizedGear * drawHeight * 0.3);
                if (i === 0) this.gearRpmCtx.moveTo(x, y);
                else this.gearRpmCtx.lineTo(x, y);
            }
            this.gearRpmCtx.stroke();
        }

        const len = this.rpmHistory.length;

        // Draw current RPM line (cyan)
        this.gearRpmCtx.strokeStyle = '#04f7ff';
        this.gearRpmCtx.lineWidth = 2;
        this.gearRpmCtx.beginPath();
        
        for (let i = 0; i < len; i++) {
            const x = padding + (this.xValues[i] / 100) * drawWidth;
            const y = height - padding - ((this.rpmHistory[i] - minRpm) / rpmRange) * drawHeight;
            if (i === 0) this.gearRpmCtx.moveTo(x, y);
            else this.gearRpmCtx.lineTo(x, y);
        }
        this.gearRpmCtx.stroke();

        // Draw current Gear line (yellow)
        this.gearRpmCtx.strokeStyle = '#ffbb00';
        this.gearRpmCtx.lineWidth = 2;
        this.gearRpmCtx.beginPath();
        
        for (let i = 0; i < len; i++) {
            const x = padding + (this.xValues[i] / 100) * drawWidth;
            const normalizedGear = (this.gearHistory[i] - minGear) / gearRange;
            const y = height - padding - (normalizedGear * drawHeight * 0.3);
            if (i === 0) this.gearRpmCtx.moveTo(x, y);
            else this.gearRpmCtx.lineTo(x, y);
        }
        this.gearRpmCtx.stroke();
    }

    updateGearRpmChart(xValue, gear, rpm) {
        // Speed chart manages xValues array, just add data when it does
        if (this.gearHistory.length < this.xValues.length) {
            this.gearHistory.push(gear);
            this.rpmHistory.push(rpm);
        }
    }

    // ==================== CHART 3: THROTTLE & BRAKE ====================
    
    drawThrottleBrakeChart() {
        if (!this.throttleBrakeCtx || this.throttleHistory.length < 2) return;

        const width = this.throttleBrakeCanvas.width;
        const height = this.throttleBrakeCanvas.height;
        const padding = 10;
        const drawWidth = width - padding * 2;
        const drawHeight = height - padding * 2;

        this.throttleBrakeCtx.clearRect(0, 0, width, height);

        // Draw best lap throttle/brake ghost FIRST
        if (this.bestLap.xValues.length > 1) {
            const len = this.bestLap.throttle.length;
            
            // Best lap throttle (green ghost)
            this.throttleBrakeCtx.strokeStyle = 'rgba(0, 255, 0, 0.4)';
            this.throttleBrakeCtx.lineWidth = 2;
            this.throttleBrakeCtx.beginPath();
            
            for (let i = 0; i < len; i++) {
                const x = padding + (this.bestLap.xValues[i] / 100) * drawWidth;
                const y = height - padding - this.bestLap.throttle[i] * drawHeight;
                if (i === 0) this.throttleBrakeCtx.moveTo(x, y);
                else this.throttleBrakeCtx.lineTo(x, y);
            }
            this.throttleBrakeCtx.stroke();
            
            // Best lap brake (red ghost)
            this.throttleBrakeCtx.strokeStyle = 'rgba(255, 51, 51, 0.4)';
            this.throttleBrakeCtx.lineWidth = 2;
            this.throttleBrakeCtx.beginPath();
            
            for (let i = 0; i < len; i++) {
                const x = padding + (this.bestLap.xValues[i] / 100) * drawWidth;
                const y = height - padding - this.bestLap.brake[i] * drawHeight;
                if (i === 0) this.throttleBrakeCtx.moveTo(x, y);
                else this.throttleBrakeCtx.lineTo(x, y);
            }
            this.throttleBrakeCtx.stroke();
        }

        const len = this.throttleHistory.length;

        // Draw current throttle line (green)
        this.throttleBrakeCtx.strokeStyle = '#00ff00';
        this.throttleBrakeCtx.lineWidth = 2;
        this.throttleBrakeCtx.beginPath();
        
        for (let i = 0; i < len; i++) {
            const x = padding + (this.xValues[i] / 100) * drawWidth;
            const y = height - padding - this.throttleHistory[i] * drawHeight;
            if (i === 0) this.throttleBrakeCtx.moveTo(x, y);
            else this.throttleBrakeCtx.lineTo(x, y);
        }
        this.throttleBrakeCtx.stroke();

        // Draw current brake line (red)
        this.throttleBrakeCtx.strokeStyle = '#ff3333';
        this.throttleBrakeCtx.lineWidth = 2;
        this.throttleBrakeCtx.beginPath();
        
        for (let i = 0; i < len; i++) {
            const x = padding + (this.xValues[i] / 100) * drawWidth;
            const y = height - padding - this.brakeHistory[i] * drawHeight;
            if (i === 0) this.throttleBrakeCtx.moveTo(x, y);
            else this.throttleBrakeCtx.lineTo(x, y);
        }
        this.throttleBrakeCtx.stroke();
    }

    updateThrottleBrakeChart(xValue, throttle, brake) {
        // Speed chart manages xValues array, just add data when it does
        if (this.throttleHistory.length < this.xValues.length) {
            // Clamp throttle and brake to 0-1 range
            const clampedThrottle = Math.max(0, Math.min(1, throttle));
            const clampedBrake = Math.max(0, Math.min(1, brake));
            
            this.throttleHistory.push(clampedThrottle);
            this.brakeHistory.push(clampedBrake);
        }
    }

    // ==================== CHART 4: FUEL USE ====================
    
    drawFuelUseChart() {
        if (!this.fuelUseCtx || this.fuelUseHistory.length < 2) return;

        const width = this.fuelUseCanvas.width;
        const height = this.fuelUseCanvas.height;
        const padding = 10;
        const drawWidth = width - padding * 2;
        const drawHeight = height - padding * 2;

        this.fuelUseCtx.clearRect(0, 0, width, height);

        // Find min and max fuel use for scaling (include best lap)
        let allFuelUse = [...this.fuelUseHistory];
        if (this.bestLap.fuelUse.length > 0) {
            allFuelUse = [...allFuelUse, ...this.bestLap.fuelUse];
        }
        const maxFuelUse = Math.max(...allFuelUse, 1);
        const minFuelUse = Math.min(...allFuelUse, 0);
        const fuelUseRange = maxFuelUse - minFuelUse || 1;

        // Draw best lap fuel use ghost FIRST
        if (this.bestLap.xValues.length > 1) {
            this.fuelUseCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';  // Semi-transparent white
            this.fuelUseCtx.lineWidth = 2;
            this.fuelUseCtx.beginPath();
            
            const len = this.bestLap.fuelUse.length;
            for (let i = 0; i < len; i++) {
                const x = padding + (this.bestLap.xValues[i] / 100) * drawWidth;
                const y = height - padding - ((this.bestLap.fuelUse[i] - minFuelUse) / fuelUseRange) * drawHeight;
                if (i === 0) this.fuelUseCtx.moveTo(x, y);
                else this.fuelUseCtx.lineTo(x, y);
            }
            this.fuelUseCtx.stroke();
        }

        // Draw current fuel use line (white)
        this.fuelUseCtx.strokeStyle = '#ffffff';
        this.fuelUseCtx.lineWidth = 2;
        this.fuelUseCtx.beginPath();
        
        const len = this.fuelUseHistory.length;
        for (let i = 0; i < len; i++) {
            const x = padding + (this.xValues[i] / 100) * drawWidth;
            const y = height - padding - ((this.fuelUseHistory[i] - minFuelUse) / fuelUseRange) * drawHeight;
            if (i === 0) this.fuelUseCtx.moveTo(x, y);
            else this.fuelUseCtx.lineTo(x, y);
        }
        this.fuelUseCtx.stroke();
    }

    updateFuelUseChart(xValue, fuelUsePerHour) {
        // Speed chart manages xValues array, just add data when it does
        if (this.fuelUseHistory.length < this.xValues.length) {
            this.fuelUseHistory.push(fuelUsePerHour);
        }
    }

    // ==================== UTILITIES ====================
    
    /**
     * Reset all charts (called ONLY on lap completion)
     */
    resetCharts() {
        console.log('🏁 Lap completed - resetting charts');
        
        // Clear all history arrays including X-values
        this.xValues = [];
        this.speedHistory = [];
        this.gearHistory = [];
        this.rpmHistory = [];
        this.throttleHistory = [];
        this.brakeHistory = [];
        this.fuelUseHistory = [];
        
        // Reset last X-value
        this.lastXValue = 0;
        
        // Clear all canvases immediately
        if (this.speedCtx && this.speedCanvas) {
            this.speedCtx.clearRect(0, 0, this.speedCanvas.width, this.speedCanvas.height);
        }
        if (this.gearRpmCtx && this.gearRpmCanvas) {
            this.gearRpmCtx.clearRect(0, 0, this.gearRpmCanvas.width, this.gearRpmCanvas.height);
        }
        if (this.throttleBrakeCtx && this.throttleBrakeCanvas) {
            this.throttleBrakeCtx.clearRect(0, 0, this.throttleBrakeCanvas.width, this.throttleBrakeCanvas.height);
        }
        if (this.fuelUseCtx && this.fuelUseCanvas) {
            this.fuelUseCtx.clearRect(0, 0, this.fuelUseCanvas.width, this.fuelUseCanvas.height);
        }
    }
    
    /**
     * Update best lap ghost data (called when server sends new best lap)
     * @param {Object} bestLapData - Object containing arrays of best lap data
     */
    updateBestLap(bestLapData) {
        console.log('📊 Updating best lap ghost data');
        
        // Store best lap data
        this.bestLap.xValues = bestLapData.xVals || [];
        if (this.bestLap.xValues && this.bestLap.xValues != []) this.bestLap.xValues = this.bestLap.xValues.map(x => x * 100);
        this.bestLap.speed = bestLapData.velos || [];
        this.bestLap.gear = bestLapData.gear || [];
        this.bestLap.rpm = bestLapData.rpm || [];
        this.bestLap.throttle = bestLapData.throttle || [];
        this.bestLap.brake = bestLapData.brake || [];
        this.bestLap.fuelUse = bestLapData.fuelUse || [];
        
        console.log(`✓ Best lap loaded: ${this.bestLap.xValues.length} points`);
        
        // Force immediate redraw to show ghost
        this.drawSpeedChart();
        this.drawGearRpmChart();
        this.drawThrottleBrakeChart();
        this.drawFuelUseChart();
    }
    
    formatTime(seconds) {
        if (!seconds || seconds <= 0 || seconds >= 999999) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(3);
        return `${mins}:${secs.padStart(6, '0')}`;
    }
    
    getStateColor(state) {
        switch (state) {
            case 'BLINKLIGHT': return '#ff0000';
            case 'LASTLIGHT': return '#04f7ff';
            case 'FIRSTLIGHT': return '#ffbb00';
            default: return '#03bd00';
        }
    }

    // ==================== MAIN UPDATE ====================
    
    onFrame(data) {
        try {
            // Performance monitoring
            this.frameCount++;
            const now = Date.now();
            if (now - this.lastFpsLog >= 5000) {
                console.log(`Render rate: ${(this.frameCount / 5).toFixed(1)} Hz`);
                this.frameCount = 0;
                this.lastFpsLog = now;
            }

            const el = this.el;

            // ==================== GET LAP DISTANCE (X-VALUE) ====================
            // Get current lap distance percentage (0.0 - 1.0), convert to 0-100
            const lapDistPct = data.relative_timing?.lap_dist || data.lap_dist_pct || 0;
            const xValue = lapDistPct * 100;  // Convert to 0-100 range

            // ==================== LAP COMPLETION CHECK ====================
            // Check for lap completion marker or lap number change
            if (data.lapMarker === true || 
                (data.lap_times && data.lap_times.lap > this.lastLap && this.lastLap > 0)) {
                this.resetCharts();
            }

            // ==================== BEST LAP UPDATE CHECK ====================
            // Check if server is sending new best lap data
            if (data.bestLap && (data.bestLap.lapNum != this.bestLap.lapNum || this.bestLap.lapNum == -1)) {
                this.updateBestLap(data.bestLap);
            }
            
            // Update last lap number
            if (data.lap_times && data.lap_times.lap !== undefined) {
                this.lastLap = data.lap_times.lap;
            }

            // Update lap times
            if (data.lap_times) {
                const lt = data.lap_times;
                
                if (el.currentLapTime) el.currentLapTime.textContent = this.formatTime(lt.lap_current_lap_time);
                if (el.lastLapTime) el.lastLapTime.textContent = this.formatTime(lt.lap_last_lap_time);
                if (el.bestLapTime) el.bestLapTime.textContent = this.formatTime(lt.lap_best_lap_time);
                
                // Predicted lap time
                const blap = lt.lap_best_lap_time;
                const p_delta = lt.live_delta || 0.0;
                if (blap && blap < 999999 && el.predictedLapTime && p_delta !== undefined) {
                    el.predictedLapTime.textContent = this.formatTime(blap + p_delta);
                }

                const color = p_delta >= 0 ? '#ff3333' : '#00ff00';
                if (el.predictedLapBox) el.predictedLapBox.borderColor = color;
            }

            // Update drivetrain data
            if (data.drivetrain) {
                const dt = data.drivetrain;
                
                if (el.gear) el.gear.textContent = dt.gear || '-';
                if (el.rpm) el.rpm.textContent = Math.round(dt.rpm) || '----';

                const rpm = dt.rpm || 0;
                let state = 'clear';
                if (rpm >= dt.first_light && rpm < dt.last_light) state = this.getStateColor('FIRSTLIGHT');
                else if (rpm >= dt.last_light && rpm < dt.blink_light) state = this.getStateColor('LASTLIGHT');
                else if (rpm >= dt.blink_light) state = this.getStateColor('BLINKLIGHT');
                else state = this.getStateColor('CLEAR');
                if (el.rpmBox) el.rpmBox.style.borderColor = state;
            }

            // Update basic forces (speed, throttle, brake)
            if (data.basic_forces) {
                const bf = data.basic_forces;
                
                if (el.speed) el.speed.textContent = Math.round(bf.velo);
            }

            // Update fuel data
            if (data.consumables) {
                const cons = data.consumables;
                
                if (el.fuelRemaining) el.fuelRemaining.textContent = cons.fuel_level || '--';
            }

            // ==================== UPDATE ALL CHARTS TOGETHER ====================
            // Collect all data first, then update charts in correct order
            if (data.basic_forces && data.drivetrain && data.consumables) {
                const speed = data.basic_forces.velo || 0;
                const throttle = data.basic_forces.throttle || 0;
                const brake = data.basic_forces.brake || 0;
                const gear = data.drivetrain.gear || 0;
                const rpm = data.drivetrain.rpm || 0;
                const fuelUse = data.consumables.fuel_use_per_hour || 0;

                
                // Then update other charts (they sync to X-values length)
                this.updateGearRpmChart(xValue, gear, rpm);
                this.updateThrottleBrakeChart(xValue, throttle, brake);
                this.updateFuelUseChart(xValue, fuelUse);
                this.updateSpeedChart(xValue, speed);
            }

            // Update strategy box data
            if (data.strat_box) {
                const sb = data.strat_box;
                
                if (el.fuelLaps) el.fuelLaps.textContent = sb.laps_fuel || '--';
                if (el.avgFuelLap) el.avgFuelLap.textContent = sb.avg_fuel_per_lap || '--';
            }

            // Throttle chart updates (30 FPS)
            this.chartUpdateCounter++;
            if (this.chartUpdateCounter >= this.chartUpdateInterval) {
                this.drawSpeedChart();
                this.drawGearRpmChart();
                this.drawThrottleBrakeChart();
                this.drawFuelUseChart();
                this.chartUpdateCounter = 0;
            }

        } catch (error) {
            console.error('Error in onFrame:', error);
        }
    }

    /**
     * Clear all data (call on disconnect/stop)
     */
    reset() {
        // Clear all history
        this.speedHistory = [];
        this.gearHistory = [];
        this.rpmHistory = [];
        this.throttleHistory = [];
        this.brakeHistory = [];
        this.fuelUseHistory = [];
        
        // Clear all canvases
        if (this.speedCtx && this.speedCanvas) {
            this.speedCtx.clearRect(0, 0, this.speedCanvas.width, this.speedCanvas.height);
        }
        if (this.gearRpmCtx && this.gearRpmCanvas) {
            this.gearRpmCtx.clearRect(0, 0, this.gearRpmCanvas.width, this.gearRpmCanvas.height);
        }
        if (this.throttleBrakeCtx && this.throttleBrakeCanvas) {
            this.throttleBrakeCtx.clearRect(0, 0, this.throttleBrakeCanvas.width, this.throttleBrakeCanvas.height);
        }
        if (this.fuelUseCtx && this.fuelUseCanvas) {
            this.fuelUseCtx.clearRect(0, 0, this.fuelUseCanvas.width, this.fuelUseCanvas.height);
        }
    }
}