/**
 * Update Manager for iRacing Telemetry Dashboard
 * Pure rendering class — receives data, updates DOM. No socket logic.
 */

class UpdateManager {
    constructor() {
        // Canvas setup
        this.canvas = null;
        this.ctx = null;
        
        // Data storage
        this.maxDataPoints = 400;
        this.throttleHistory = [];
        this.brakeHistory = [];
        this.clutchHistory = [];
        
        // Cached DOM elements
        this.el = null;
        
        // Canvas throttling
        this.canvasUpdateCounter = 0;
        this.canvasUpdateInterval = 2;
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastFpsLog = Date.now();
    }

    /**
     * One-time initialization: cache DOM elements and set up canvas
     */
    init() {
        this.cacheElements();
        
        this.canvas = document.getElementById('lineChart');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d', {
                alpha: false,
                desynchronized: true
            });
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas(), { passive: true });
        }
        
        console.log('✓ UpdateManager initialized');
    }

    cacheElements() {
        this.el = {
            currentPos: document.getElementById('current-pos'),
            currentLap: document.getElementById('current-lap'),
            stintLap: document.getElementById('stint-lap'),
            currDelta: document.getElementById('curr-delta'),
            currLapTime: document.getElementById('curr-lap-time'),
            prevTime: document.getElementById('prev-time'),
            predLap: document.getElementById('pred-lap'),
            bestTime: document.getElementById('best-time'),
            ms1: document.getElementById('ms0'),
            ms2: document.getElementById('ms1'),
            ms3: document.getElementById('ms2'),
            ms4: document.getElementById('ms3'),
            ms5: document.getElementById('ms4'),
            ms6: document.getElementById('ms5'),
            ms7: document.getElementById('ms6'),
            ms8: document.getElementById('ms7'),
            ms9: document.getElementById('ms8'),
            ms10: document.getElementById('ms9'),
            gear: document.getElementById('gear'),
            rpmText: document.getElementById('rpm-text'),
            rpm: document.getElementById('rpm'),
            speed: document.getElementById('speed'),
            throttleFill: document.getElementById('throttle-fill'),
            brakeFill: document.getElementById('brake-fill'),
            clutchFill: document.getElementById('clutch-fill'),
            meterIndicator: document.getElementById('steering-bar'),
            fuel: document.getElementById('fuel'),
            avgUseLap: document.getElementById('avg-use-lap'),
            fuelLaps: document.getElementById('fuel-laps'),
            currPitStop: document.getElementById('curr-pit-stop'),
            stintAvgPace: document.getElementById('stint-avg-pace'),
            pitLoss: document.getElementById('pit-loss'),
            raceAvgPace: document.getElementById('race-avg-pace'),
            stintsCompleted: document.getElementById('stints-completed'),
            lapsPerStint: document.getElementById('laps-per-stint'),
            lapsRemaining: document.getElementById('laps-remaining'),
            timeRemaining: document.getElementById('time-remaining'),
            iracingStatus: document.getElementById('iracing-status'),
            statusText: document.getElementById('status-text')
        };
    }

    resizeCanvas() {
        if (this.canvas) {
            this.canvas.width = this.canvas.offsetWidth;
            this.canvas.height = this.canvas.offsetHeight;
        }
    }

    drawLineChart() {
        if (!this.ctx || this.throttleHistory.length < 2) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const padding = 5;
        const drawWidth = width - padding * 2;
        const drawHeight = height - padding * 2;

        this.ctx.clearRect(0, 0, width, height);

        const drawLine = (data, color) => {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            const len = data.length;
            for (let i = 0; i < len; i++) {
                const x = padding + (i / this.maxDataPoints) * drawWidth;
                const y = height - padding - data[i] * drawHeight;
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.stroke();
        };

        drawLine(this.throttleHistory, '#00ff00');
        drawLine(this.brakeHistory, '#ff3333');
        drawLine(this.clutchHistory, '#0099ff');
    }

    updateLineChart(throttle, brake, clutch) {
        this.throttleHistory.push(throttle);
        this.brakeHistory.push(brake);
        this.clutchHistory.push(clutch);

        if (this.throttleHistory.length > this.maxDataPoints) {
            this.throttleHistory.shift();
            this.brakeHistory.shift();
            this.clutchHistory.shift();
        }

        this.canvasUpdateCounter++;
        if (this.canvasUpdateCounter >= this.canvasUpdateInterval) {
            this.drawLineChart();
            this.canvasUpdateCounter = 0;
        }
    }

    updateInputBars(throttle, brake, clutch) {
        if (this.el.throttleFill) this.el.throttleFill.style.height = (throttle * 100) + '%';
        if (this.el.brakeFill) this.el.brakeFill.style.height = (brake * 100) + '%';
        if (this.el.clutchFill) this.el.clutchFill.style.height = (clutch * 100) + '%';
    }

    getStateColor(state) {
        switch (state) {
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

    /**
     * Main entry point — called by the HTML socket handler every frame
     */
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

            // Position
            if (data.relative_timing?.curr_position !== undefined) {
                const pos = data.relative_timing.curr_position;
                const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
                if (el.currentPos) el.currentPos.textContent = pos + suffix;
            }

            // Lap times
            if (data.lap_times) {
                const lt = data.lap_times;

                if (el.currentLap) el.currentLap.textContent = lt.lap || '--';
                if (el.currLapTime) el.currLapTime.textContent = this.formatTime(lt.lap_current_lap_time);
                if (el.prevTime) el.prevTime.textContent = this.formatTime(lt.lap_last_lap_time);

                const blap = lt.lap_best_lap_time;
                const p_delta = lt.live_delta || 0.0;
                const l_delta = lt.leader_delta || 0.0;

                if (blap && blap < 999999) {
                    if (el.predLap && p_delta !== undefined) el.predLap.textContent = this.formatTime(blap + p_delta);
                    if (el.bestTime) el.bestTime.textContent = this.formatTime(blap);
                }

                if (el.currDelta && lt.live_delta !== undefined) {
                    const sign = lt.live_delta >= 0 ? '+' : '';
                    el.currDelta.textContent = sign + lt.live_delta.toFixed(3);
                }

                // Sectors
                const sector = lt.current_sector || 1;
                const sectorEl = el[`ms${sector}`];

                if (sectorEl) {
                    sectorEl.textContent = this.formatTime(lt.sector_time);
                    sectorEl.style.fontSize = '14px';

                    if (p_delta <= 0 && l_delta <= 0) sectorEl.style.backgroundColor = '#d900ffff';
                    else if (p_delta <= 0) sectorEl.style.backgroundColor = '#00ff00';
                    else sectorEl.style.backgroundColor = '#ff0000';
                }

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

                if (sector > 1) {
                    const prevSectorEl = el[`ms${sector - 1}`];
                    if (prevSectorEl) prevSectorEl.style.fontSize = '10px';
                }

                if (el.timeRemaining) el.timeRemaining.textContent = this.formatTime(lt.time_remaining);
                if (el.lapsRemaining) el.lapsRemaining.textContent = lt.laps_remaining || '--';
            }

            // Stint lap
            if (data.stint_lap !== undefined && el.stintLap) {
                el.stintLap.textContent = data.stint_lap;
            }

            // Drivetrain
            if (data.drivetrain) {
                const dt = data.drivetrain;

                if (el.gear) el.gear.textContent = dt.gear || '-';
                if (el.rpmText) el.rpmText.textContent = Math.round(dt.rpm) || '----';

                const rpm = dt.rpm || 0;
                let state = 'clear';
                if (rpm >= dt.first_light && rpm < dt.last_light) state = this.getStateColor('FIRSTLIGHT');
                else if (rpm >= dt.last_light && rpm < dt.blink_light) state = this.getStateColor('LASTLIGHT');
                else if (rpm >= dt.blink_light) state = this.getStateColor('BLINKLIGHT');
                else state = this.getStateColor('CLEAR');
                if (el.rpm) el.rpm.style.borderColor = state;
            }

            // Basic forces
            if (data.basic_forces) {
                const bf = data.basic_forces;

                if (el.speed) el.speed.textContent = Math.round(bf.velo);

                const throttle = bf.throttle || 0;
                const brake = bf.brake || 0;
                const clutch = bf.clutch || 0;

                this.updateInputBars(throttle, brake, clutch);
                this.updateLineChart(throttle, brake, clutch);

                if (el.meterIndicator) {
                    const steeringPercent = (bf.steeringAngle / bf.maxSteeringAngle) * 100;
                    const clamped = Math.max(-50, Math.min(50, steeringPercent));
                    el.meterIndicator.style.left = `${50 + clamped}%`;
                }
            }

            // Fuel
            if (data.consumables && el.fuel) {
                el.fuel.textContent = data.consumables.fuel_level || '--';
            }

            // Strategy
            if (data.strat_box) {
                const sb = data.strat_box;
                if (el.currPitStop) el.currPitStop.textContent = this.formatTime(sb.curr_stop_time) || '--:--.---';
                if (el.stintAvgPace) el.stintAvgPace.textContent = this.formatTime(sb.stint_avg_pace) || '--:--.---';
                if (el.pitLoss) el.pitLoss.textContent = this.formatTime(sb.avg_stop_time) || '--:--.---';
                if (el.raceAvgPace) el.raceAvgPace.textContent = this.formatTime(sb.race_avg_pace) || '--:--.---';
                if (el.fuelLaps && sb.laps_fuel) el.fuelLaps.textContent = sb.laps_fuel || '--';
                if (el.avgUseLap && sb.avg_fuel_per_lap) el.avgUseLap.textContent = sb.avg_fuel_per_lap || '--';
                if (el.stintsCompleted) el.stintsCompleted.textContent = sb.stints_completed || '--';
                if (el.lapsPerStint) el.lapsPerStint.textContent = sb.avg_laps_per_stint || '--';
            }

            // iRacing connection status
            if (data.connection !== undefined && el.iracingStatus) {
                el.iracingStatus.textContent = data.connection ? 'Connected' : 'Disconnected';
                el.iracingStatus.style.color = data.connection ? '#00ff00' : '#ff0000';
            }

        } catch (error) {
            console.error('Error in onFrame:', error);
        }
    }

    /**
     * Clear history data (call on disconnect/stop)
     */
    reset() {
        this.throttleHistory = [];
        this.brakeHistory = [];
        this.clutchHistory = [];
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
}