/**
 * Update Manager for iRacing Telemetry Dashboard
 * Optimized for sustained 60Hz performance without memory leaks
 */

class UpdateManager {
    constructor(url) {
        this.socket = null;
        this.socketUrl = url;
        
        // Canvas setup
        this.canvas = null;
        this.ctx = null;
        
        // Data storage
        this.maxDataPoints = 400;
        this.throttleHistory = [];
        this.brakeHistory = [];
        this.clutchHistory = [];
        
        // **FIX #1: Cache DOM elements to prevent repeated lookups**
        this.cachedElements = null;
        
        // **FIX #2: Throttle canvas updates**
        this.canvasUpdateCounter = 0;
        this.canvasUpdateInterval = 2; // Update canvas every 2 frames (30Hz)
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastFpsLog = Date.now();
        
        console.log('UpdateManager created with URL:', url);
    }

    /**
     * **FIX #1: Cache all DOM elements once on initialization**
     */
    cacheElements() {
        console.log('Caching DOM elements to prevent memory leaks...');
        
        this.cachedElements = {
            // Header
            currentPos: document.getElementById('current-pos'),
            currentLap: document.getElementById('current-lap'),
            stintLap: document.getElementById('stint-lap'),
            currDelta: document.getElementById('curr-delta'),
            currLapTime: document.getElementById('curr-lap-time'),
            prevTime: document.getElementById('prev-time'),
            
            // Lap times
            predLap: document.getElementById('pred-lap'),
            bestTime: document.getElementById('best-time'),
            
            // Sectors - cache all 10 at once
            ms1: document.getElementById('ms1'),
            ms2: document.getElementById('ms2'),
            ms3: document.getElementById('ms3'),
            ms4: document.getElementById('ms4'),
            ms5: document.getElementById('ms5'),
            ms6: document.getElementById('ms6'),
            ms7: document.getElementById('ms7'),
            ms8: document.getElementById('ms8'),
            ms9: document.getElementById('ms9'),
            ms10: document.getElementById('ms10'),
            
            // Drivetrain
            gear: document.getElementById('gear'),
            rpmText: document.getElementById('rpm-text'),
            rpm: document.getElementById('rpm'),
            speed: document.getElementById('speed'),
            
            // Input bars
            throttleFill: document.getElementById('throttle-fill'),
            brakeFill: document.getElementById('brake-fill'),
            clutchFill: document.getElementById('clutch-fill'),
            
            // Steering
            meterIndicator: document.getElementById('meter-indicator'),
            
            // Fuel
            fuel: document.getElementById('fuel'),
            avgUseLap: document.getElementById('avg-use-lap'),
            fuelLaps: document.getElementById('fuel-laps'),
            
            // Strategy
            currPitStop: document.getElementById('curr-pit-stop'),
            stintAvgPace: document.getElementById('stint-avg-pace'),
            pitLoss: document.getElementById('pit-loss'),
            raceAvgPace: document.getElementById('race-avg-pace'),
            stintsCompleted: document.getElementById('stints-completed'),
            lapsPerStint: document.getElementById('laps-per-stint'),
            lapsRemaining: document.getElementById('laps-remaining'),
            timeRemaining: document.getElementById('time-remaining'),
            
            // Status
            iracingStatus: document.getElementById('iracing-status')
        };
        
        console.log('✓ All DOM elements cached');
    }

    resizeCanvas() {
        if (this.canvas) {
            this.canvas.width = this.canvas.offsetWidth;
            this.canvas.height = this.canvas.offsetHeight;
        }
    }

    /**
     * **FIX #2: Optimized canvas drawing**
     */
    drawLineChart() {
        if (!this.ctx || this.throttleHistory.length < 2) return;
        
        // Clear canvas once
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const width = this.canvas.width;
        const height = this.canvas.height;
        const padding = 5;
        const availableHeight = height - padding * 2;
        const availableWidth = width - padding * 2;
        
        // **Optimized drawing function**
        const drawLine = (data, color) => {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();

            const len = data.length;
            for (let i = 0; i < len; i++) {
                const x = padding + (i / this.maxDataPoints) * availableWidth;
                const y = height - padding - data[i] * availableHeight;

                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.stroke();
        };

        // Draw all three lines
        drawLine(this.throttleHistory, '#00ff00');
        drawLine(this.brakeHistory, '#ff3333');
        drawLine(this.clutchHistory, '#0099ff');
    }

    updateLineChart(throttle, brake, clutch) {
        // Add new data points
        this.throttleHistory.push(throttle);
        this.brakeHistory.push(brake);
        this.clutchHistory.push(clutch);

        // Remove old data points
        if (this.throttleHistory.length > this.maxDataPoints) {
            this.throttleHistory.shift();
            this.brakeHistory.shift();
            this.clutchHistory.shift();
        }

        // **FIX #2: Only redraw canvas every N frames (reduces from 60Hz to 30Hz)**
        this.canvasUpdateCounter++;
        if (this.canvasUpdateCounter >= this.canvasUpdateInterval) {
            this.drawLineChart();
            this.canvasUpdateCounter = 0;
        }
    }

    updateInputBars(throttle, brake, clutch) {
        // **Use cached elements instead of getElementById**
        const el = this.cachedElements;
        if (el.throttleFill) el.throttleFill.style.height = (throttle * 100) + '%';
        if (el.brakeFill) el.brakeFill.style.height = (brake * 100) + '%';
        if (el.clutchFill) el.clutchFill.style.height = (clutch * 100) + '%';
    }

    getStateColor(state) {
        switch(state) {
            case 'BLINKLIGHT': return '#ff0000';
            case 'LASTLIGHT': return '#04f7ff';
            case 'FIRSTLIGHT': return '#ffbb00';
            default: return '#03bd00';
        }
    }

    formatTime(seconds) {
        if (!seconds || seconds <= 0 || seconds >= 999999) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(3);
        return `${mins}:${secs.padStart(6, '0')}`;
    }

    connect() {
        console.log('UpdateManager.connect() called');
        
        // **Cache all elements once**
        this.cacheElements();
        
        // Initialize canvas with performance optimizations
        this.canvas = document.getElementById('lineChart');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d', {
                alpha: false,        // Disable transparency for better performance
                desynchronized: true // Allow async rendering
            });
            this.resizeCanvas();
            
            // Use passive event listener
            window.addEventListener('resize', () => this.resizeCanvas(), { passive: true });
            console.log('✓ Canvas initialized with performance settings');
        }

        // Connect to Socket.IO
        console.log('Connecting to Socket.IO at', this.socketUrl);
        this.socket = io(this.socketUrl);

        // Handle incoming telemetry data
        this.socket.on('frame_update', (data) => {
            try {
                // Performance monitoring
                this.frameCount++;
                const now = Date.now();
                if (now - this.lastFpsLog >= 5000) {
                    const fps = (this.frameCount / 5).toFixed(1);
                    console.log(`Update rate: ${fps} Hz | History: ${this.throttleHistory.length} points`);
                    this.frameCount = 0;
                    this.lastFpsLog = now;
                }

                // **Use cached elements throughout**
                const el = this.cachedElements;

                // Update position
                if (data.relative_timing?.curr_position !== undefined) {
                    const pos = data.relative_timing.curr_position;
                    const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
                    if (el.currentPos) el.currentPos.textContent = pos + suffix;
                }

                // Update lap times
                if (data.lap_times) {
                    const lt = data.lap_times;
                    
                    if (el.currentLap) el.currentLap.textContent = lt.lap || '--';
                    if (el.currLapTime) el.currLapTime.textContent = this.formatTime(lt.lap_current_lap_time);
                    if (el.prevTime) el.prevTime.textContent = this.formatTime(lt.lap_last_lap_time);
                    
                    const blap = lt.lap_best_lap_time;
                    const p_delta = lt.live_delta || 0.0;
                    const l_delta = lt.leader_delta || 0.0;

                    if (blap && blap < 999999) {
                        if (el.predLap && p_delta !== undefined) {
                            el.predLap.textContent = this.formatTime(blap + p_delta);
                        }
                        if (el.bestTime) el.bestTime.textContent = this.formatTime(blap);
                    }
                    
                    if (el.currDelta && lt.live_delta !== undefined) {
                        const sign = lt.live_delta >= 0 ? '+' : '';
                        el.currDelta.textContent = sign + lt.live_delta.toFixed(3);
                    }

                    // Update sectors using cached elements
                    const sector = lt.current_sector || 1;
                    const sectorKey = `ms${sector}`;
                    const sectorEl = el[sectorKey];
                    
                    if (sectorEl) {
                        sectorEl.textContent = this.formatTime(lt.sector_time);
                        sectorEl.style.fontSize = '14px';
                        
                        // Color code sector
                        if (p_delta <= 0 && l_delta <= 0) {
                            sectorEl.style.backgroundColor = '#d900ffff';
                        } else if (p_delta <= 0) {
                            sectorEl.style.backgroundColor = '#00ff00';
                        } else {
                            sectorEl.style.backgroundColor = '#ff0000';
                        }
                    }

                    // Reset sectors on new lap
                    if (sector === 1) {
                        for (let i = 2; i <= 10; i++) {
                            const msEl = el[`ms${i}`];
                            if (msEl) {
                                msEl.style.fontSize = '10px';
                                msEl.textContent = '--:--';
                                msEl.style.backgroundColor = '#2a2a2a';
                            }
                        }
                    }
                    
                    // Shrink previous sector
                    if (sector > 1) {
                        const prevSectorEl = el[`ms${sector - 1}`];
                        if (prevSectorEl) prevSectorEl.style.fontSize = '10px';
                    }
                    
                    // Time/laps remaining
                    if (el.timeRemaining) el.timeRemaining.textContent = this.formatTime(lt.time_remaining);
                    if (el.lapsRemaining) el.lapsRemaining.textContent = lt.laps_remaining || '--';
                }

                // Update stint lap
                if (data.stint_lap !== undefined && el.stintLap) {
                    el.stintLap.textContent = data.stint_lap;
                }

                // Update drivetrain
                if (data.drivetrain) {
                    const dt = data.drivetrain;
                    
                    if (el.gear) el.gear.textContent = dt.gear || '-';
                    if (el.rpmText) el.rpmText.textContent = Math.round(dt.rpm) || '----';
                    
                    // RPM indicator
                    const rpm = dt.rpm || 0;
                    let state = 'clear';
                    
                    if (rpm >= dt.first_light && rpm < dt.last_light) {
                        state = this.getStateColor('FIRSTLIGHT');
                    } else if (rpm >= dt.last_light && rpm < dt.blink_light) {
                        state = this.getStateColor('LASTLIGHT');
                    } else if (rpm >= dt.blink_light) {
                        state = this.getStateColor('BLINKLIGHT');
                    }

                    if (el.rpm) el.rpm.style.borderColor = state;
                }

                // Update basic forces
                if (data.basic_forces) {
                    const bf = data.basic_forces;
                    
                    if (el.speed) el.speed.textContent = Math.round(bf.velo);
                    
                    const throttle = bf.throttle || 0;
                    const brake = bf.brake || 0;
                    const clutch = bf.clutch || 0;

                    this.updateInputBars(throttle, brake, clutch);
                    this.updateLineChart(throttle, brake, clutch);

                    // Steering
                    if (el.meterIndicator) {
                        const steeringAngleDeg = bf.steeringAngle * (180 / Math.PI);
                        const steeringPercent = (steeringAngleDeg / 360) * 100;
                        const clampedPercent = Math.max(-50, Math.min(50, steeringPercent));
                        el.meterIndicator.style.left = `${50 + clampedPercent}%`;
                    }
                }

                // Update fuel
                if (data.consumables && el.fuel) {
                    el.fuel.textContent = data.consumables.fuel_level || '--';
                }

                // Update strategy box
                if (data.strat_box) {
                    const sb = data.strat_box;
                    
                    if (el.currPitStop) el.currPitStop.textContent = this.formatTime(sb.curr_stop_time) || '--:--.---';
                    if (el.stintAvgPace) el.stintAvgPace.textContent = this.formatTime(sb.stint_avg_pace) || '--:--.---';
                    if (el.pitLoss) el.pitLoss.textContent = this.formatTime(sb.avg_stop_time) || '--:--.---';
                    if (el.raceAvgPace) el.raceAvgPace.textContent = this.formatTime(sb.race_avg_pace) || '--:--.---';
                    if (el.fuelLaps) el.fuelLaps.textContent = sb.laps_fuel || '--';
                    if (el.avgUseLap) el.avgUseLap.textContent = sb.avg_fuel_per_lap || '--';
                    if (el.stintsCompleted) el.stintsCompleted.textContent = sb.stints_completed || '--';
                    if (el.lapsPerStint) el.lapsPerStint.textContent = sb.avg_laps_per_stint || '--';
                }

                // Update iRacing connection from frame
                if (data.connection !== undefined && el.iracingStatus) {
                    if (data.connection) {
                        el.iracingStatus.textContent = 'Connected';
                        el.iracingStatus.style.color = '#00ff00';
                    } else {
                        el.iracingStatus.textContent = 'Disconnected';
                        el.iracingStatus.style.color = '#ff0000';
                    }
                }

            } catch (error) {
                console.error('Error updating dashboard:', error);
            }
        });

        // Listen for iRacing status updates
        this.socket.on('iracing_status', (data) => {
            const el = this.cachedElements;
            if (el.iracingStatus) {
                if (data.connected) {
                    el.iracingStatus.textContent = 'Connected';
                    el.iracingStatus.style.color = '#00ff00';
                } else {
                    el.iracingStatus.textContent = 'Disconnected';
                    el.iracingStatus.style.color = '#ff0000';
                }
            }
        });

        // Listen for stream status updates
        this.socket.on('stream_status', (data) => {
            const statusText = document.getElementById('status-text');
            if (statusText) {
                if (data.status === 'started') {
                    statusText.textContent = 'Active';
                    statusText.style.color = '#00ff00';
                } else {
                    statusText.textContent = 'Inactive';
                    statusText.style.color = '#ff0000';
                }
            }
        });

        this.socket.on('connect', () => {
            console.log('✓ Connected to telemetry server');
        });

        this.socket.on('disconnect', () => {
            console.log('✗ Disconnected from telemetry server');
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket.IO error:', error);
        });
    }
    
    disconnect() {
        console.log('UpdateManager.disconnect() called');
        
        // Clean up
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        // Clear data arrays to free memory
        this.throttleHistory = [];
        this.brakeHistory = [];
        this.clutchHistory = [];
        
        console.log('✓ Disconnected and cleaned up');
    }
}