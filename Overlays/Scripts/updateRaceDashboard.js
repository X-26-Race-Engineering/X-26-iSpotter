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
            positionTable: document.getElementById('position-table'),
            currentPos: document.getElementById('current-pos'),
            currentLap: document.getElementById('current-lap'),
            stintLap: document.getElementById('stint-lap'),
            currDelta: document.getElementById('curr-delta'),
            currLapTime: document.getElementById('curr-lap-time'),
            prevTime: document.getElementById('prev-time'),
            predLap: document.getElementById('pred-lap'),
            bestTime: document.getElementById('best-time'),
            flag: document.getElementById('flag'),
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
            stintAvgPace: document.getElementById('stint-avg-pace'),
            pitLoss: document.getElementById('pit-loss'),
            raceAvgPace: document.getElementById('race-avg-pace'),
            stintsCompleted: document.getElementById('stints-completed'),
            lapsPerStint: document.getElementById('laps-per-stint'),
            lapsRemaining: document.getElementById('laps-remaining'),
            timeRemaining: document.getElementById('time-remaining'),
            iracingStatus: document.getElementById('iracing-status'),
            statusText: document.getElementById('status-text'),
            driverMarkers: document.getElementById('driver-markers')
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

    // ==================== CIRCLE OF DOOM ====================

    /**
     * Converts a lap distance percentage (0.0 - 1.0) to x,y coordinates
     * on the circle. 0.0 = top (12 o'clock), increasing clockwise.
     */
    lapDistToXY(lapDistPct, radius = 180) {
        const cx = 200;
        const cy = 200;
        const angle = (lapDistPct * 2 * Math.PI) - (Math.PI / 2);
        return {
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle)
        };
    }

    updatePositionMarker(id, name, position, classPosition, gap, classColor) {
        let marker = document.getElementById(id);

        if (!marker){
            marker = document.createElement("div");
            marker.classList.add("position-row");
            marker.id = id;
            marker.style.backgroundColor = classColor;
            marker.style.color = '#ffffff';

            this.el.positionTable.appendChild(marker);
        }

        marker.replaceChildren(
            Object.assign(document.createElement("div"), { textContent: position }),
            Object.assign(document.createElement("div"), { textContent: classPosition }),
            Object.assign(document.createElement("div"), { textContent: name }),
            Object.assign(document.createElement("div"), { textContent: this.formatTime(gap) })
        );

    }
    /**
     * Creates or updates a single driver marker on the circle.
     * Creates on first call for a given id, then just moves it on subsequent calls.
     */
    updateDriverMarker(id, lapDistPct, name, lap, position, classPosition, refLap, classColor, pitStatus) {
        if (!this.el.driverMarkers) return;

        let marker = document.getElementById(id);

        let color = '#ffffff';
            if (lap > refLap) {
                color = '#ff0000';
            }
            if (lap < refLap) {
                color = '#00f7ff';
            }
        
            let opacity = 1;
            if (pitStatus) {
                opacity = 0.75;
            }

        if (!marker) {
            marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            marker.setAttribute('id', id);

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('class', 'marker-dot');
            dot.setAttribute('r', '6');
            dot.setAttribute('fill', color);
            dot.setAttribute('stroke', '#000000');
            dot.setAttribute('stroke-width', '2');
            dot.setAttribute('fill-opacity', `${opacity}`);

            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            badge.setAttribute('class', 'marker-badge');
            badge.setAttribute('r', '10');
            badge.setAttribute('fill', classColor);
            badge.setAttribute('stroke', '#ffffff');
            badge.setAttribute('stroke-width', '1.5');

            const posText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            posText.setAttribute('class', 'marker-pos-text');
            posText.setAttribute('text-anchor', 'middle');
            posText.setAttribute('dominant-baseline', 'central');
            posText.setAttribute('fill', '#ffffff');
            posText.setAttribute('font-weight', 'bold');
            posText.setAttribute('font-size', '9');
            posText.setAttribute('font-family', 'Arial');

            const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            tooltip.setAttribute('class', 'marker-tooltip');
            tooltip.setAttribute('visibility', 'hidden');

            const tooltipBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            tooltipBg.setAttribute('width', '90');
            tooltipBg.setAttribute('height', '52');
            tooltipBg.setAttribute('rx', '4');
            tooltipBg.setAttribute('fill', '#1e2035');
            tooltipBg.setAttribute('stroke', '#ffffff');
            tooltipBg.setAttribute('stroke-width', '1');

            const tooltipName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltipName.setAttribute('class', 'marker-tooltip-name');
            tooltipName.setAttribute('font-size', '8');
            tooltipName.setAttribute('font-family', 'Arial');
            tooltipName.setAttribute('font-weight', 'bold');
            tooltipName.setAttribute('fill', '#ffffff');

            const tooltipLap = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltipLap.setAttribute('class', 'marker-tooltip-lap');
            tooltipLap.setAttribute('font-size', '7');
            tooltipLap.setAttribute('font-family', 'Arial');
            tooltipLap.setAttribute('fill', '#999999');

            const tooltipPos = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltipPos.setAttribute('class', 'marker-tooltip-pos');
            tooltipPos.setAttribute('font-size', '7');
            tooltipPos.setAttribute('font-family', 'Arial');
            tooltipPos.setAttribute('fill', '#999999');

            const tooltipClassPos = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltipClassPos.setAttribute('class', 'marker-tooltip-classpos');
            tooltipClassPos.setAttribute('font-size', '7');
            tooltipClassPos.setAttribute('font-family', 'Arial');
            tooltipClassPos.setAttribute('fill', '#999999');

            tooltip.appendChild(tooltipBg);
            tooltip.appendChild(tooltipName);
            tooltip.appendChild(tooltipLap);
            tooltip.appendChild(tooltipPos);
            tooltip.appendChild(tooltipClassPos);

            marker.appendChild(dot);
            marker.appendChild(badge);
            marker.appendChild(posText);
            marker.appendChild(tooltip);

            marker.addEventListener('mouseenter', () => {
                tooltip.setAttribute('visibility', 'visible');
            });
            marker.addEventListener('mouseleave', () => {
                tooltip.setAttribute('visibility', 'hidden');
            });

            this.el.driverMarkers.appendChild(marker);
        }

        // Update positions
        const dotPos = this.lapDistToXY(lapDistPct, 180);
        marker.querySelector('.marker-dot').setAttribute('cx', dotPos.x);
        marker.querySelector('.marker-dot').setAttribute('cy', dotPos.y);

        const badgePos = this.lapDistToXY(lapDistPct, 200);
        marker.querySelector('.marker-badge').setAttribute('cx', badgePos.x);
        marker.querySelector('.marker-badge').setAttribute('cy', badgePos.y);

        const posTextEl = marker.querySelector('.marker-pos-text');
        posTextEl.setAttribute('x', badgePos.x);
        posTextEl.setAttribute('y', badgePos.y);
        posTextEl.textContent = classPosition;

        const tooltipAnchor = this.lapDistToXY(lapDistPct, 230);
        const tooltip = marker.querySelector('.marker-tooltip');
        tooltip.setAttribute('transform', `translate(${tooltipAnchor.x - 45}, ${tooltipAnchor.y - 26})`);

        marker.querySelector('.marker-tooltip-name').setAttribute('x', 6);
        marker.querySelector('.marker-tooltip-name').setAttribute('y', 12);
        marker.querySelector('.marker-tooltip-name').textContent = name;

        marker.querySelector('.marker-tooltip-lap').setAttribute('x', 6);
        marker.querySelector('.marker-tooltip-lap').setAttribute('y', 24);
        marker.querySelector('.marker-tooltip-lap').textContent = `Lap: ${lap}`;

        marker.querySelector('.marker-tooltip-pos').setAttribute('x', 6);
        marker.querySelector('.marker-tooltip-pos').setAttribute('y', 35);
        marker.querySelector('.marker-tooltip-pos').textContent = `Pos: P${position}`;

        marker.querySelector('.marker-tooltip-classpos').setAttribute('x', 6);
        marker.querySelector('.marker-tooltip-classpos').setAttribute('y', 46);
        marker.querySelector('.marker-tooltip-classpos').textContent = `Class: P${classPosition}`;
    }

    /**
     * Updates the player's own marker. Visually distinct (green, larger),
     * always renders on top. No car_idx dependency.
     */
    updatePlayerMarker(lapDistPct, name, lap, position, classPosition, classColor, pitStatus) {
        const id = 'driver_player';
        if (!this.el.driverMarkers) return;

        let marker = document.getElementById(id);

        if (!marker) {
            marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            marker.setAttribute('id', id);

            let opacity = 1;

            if (pitStatus) {
                opacity = 0.75;
            }

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('class', 'marker-dot');
            dot.setAttribute('r', '8');
            dot.setAttribute('fill', '#00ff00');
            dot.setAttribute('stroke', '#0d0f1d');
            dot.setAttribute('stroke-width', '2.5');
            dot.setAttribute('fill-opacity', `${opacity}`);

            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            badge.setAttribute('class', 'marker-badge');
            badge.setAttribute('r', '12');
            badge.setAttribute('fill', classColor);
            badge.setAttribute('stroke', '#ffffff');
            badge.setAttribute('stroke-width', '2');

            const posText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            posText.setAttribute('class', 'marker-pos-text');
            posText.setAttribute('text-anchor', 'middle');
            posText.setAttribute('dominant-baseline', 'central');
            posText.setAttribute('fill', '#ffffff');
            posText.setAttribute('font-size', '10');
            posText.setAttribute('font-weight', 'bold');
            posText.setAttribute('font-family', 'Arial');

            const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            tooltip.setAttribute('class', 'marker-tooltip');
            tooltip.setAttribute('visibility', 'hidden');

            const tooltipBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            tooltipBg.setAttribute('width', '90');
            tooltipBg.setAttribute('height', '52');
            tooltipBg.setAttribute('rx', '4');
            tooltipBg.setAttribute('fill', '#0a2a0a');
            tooltipBg.setAttribute('stroke', '#00ff00');
            tooltipBg.setAttribute('stroke-width', '1.5');

            const tooltipName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltipName.setAttribute('class', 'marker-tooltip-name');
            tooltipName.setAttribute('font-size', '8');
            tooltipName.setAttribute('font-family', 'Arial');
            tooltipName.setAttribute('font-weight', 'bold');
            tooltipName.setAttribute('fill', '#00ff00');

            const tooltipLap = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltipLap.setAttribute('class', 'marker-tooltip-lap');
            tooltipLap.setAttribute('font-size', '7');
            tooltipLap.setAttribute('font-family', 'Arial');
            tooltipLap.setAttribute('fill', '#999999');

            const tooltipPos = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltipPos.setAttribute('class', 'marker-tooltip-pos');
            tooltipPos.setAttribute('font-size', '7');
            tooltipPos.setAttribute('font-family', 'Arial');
            tooltipPos.setAttribute('fill', '#999999');

            const tooltipClassPos = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tooltipClassPos.setAttribute('class', 'marker-tooltip-classpos');
            tooltipClassPos.setAttribute('font-size', '7');
            tooltipClassPos.setAttribute('font-family', 'Arial');
            tooltipClassPos.setAttribute('fill', '#999999');

            tooltip.appendChild(tooltipBg);
            tooltip.appendChild(tooltipName);
            tooltip.appendChild(tooltipLap);
            tooltip.appendChild(tooltipPos);
            tooltip.appendChild(tooltipClassPos);

            marker.appendChild(dot);
            marker.appendChild(badge);
            marker.appendChild(posText);
            marker.appendChild(tooltip);

            marker.addEventListener('mouseenter', () => {
                tooltip.setAttribute('visibility', 'visible');
            });
            marker.addEventListener('mouseleave', () => {
                tooltip.setAttribute('visibility', 'hidden');
            });

            this.el.driverMarkers.appendChild(marker);
        }

        // Update positions
        const dotPos = this.lapDistToXY(lapDistPct, 180);
        marker.querySelector('.marker-dot').setAttribute('cx', dotPos.x);
        marker.querySelector('.marker-dot').setAttribute('cy', dotPos.y);

        const badgePos = this.lapDistToXY(lapDistPct, 200);
        marker.querySelector('.marker-badge').setAttribute('cx', badgePos.x);
        marker.querySelector('.marker-badge').setAttribute('cy', badgePos.y);

        const posTextEl = marker.querySelector('.marker-pos-text');
        posTextEl.setAttribute('x', badgePos.x);
        posTextEl.setAttribute('y', badgePos.y);
        posTextEl.textContent = classPosition;

        const tooltipAnchor = this.lapDistToXY(lapDistPct, 230);
        const tooltip = marker.querySelector('.marker-tooltip');
        tooltip.setAttribute('transform', `translate(${tooltipAnchor.x - 45}, ${tooltipAnchor.y - 26})`);

        marker.querySelector('.marker-tooltip-name').setAttribute('x', 6);
        marker.querySelector('.marker-tooltip-name').setAttribute('y', 12);
        marker.querySelector('.marker-tooltip-name').textContent = name;

        marker.querySelector('.marker-tooltip-lap').setAttribute('x', 6);
        marker.querySelector('.marker-tooltip-lap').setAttribute('y', 24);
        marker.querySelector('.marker-tooltip-lap').textContent = `Lap: ${lap}`;

        marker.querySelector('.marker-tooltip-pos').setAttribute('x', 6);
        marker.querySelector('.marker-tooltip-pos').setAttribute('y', 35);
        marker.querySelector('.marker-tooltip-pos').textContent = `Pos: P${position}`;

        marker.querySelector('.marker-tooltip-classpos').setAttribute('x', 6);
        marker.querySelector('.marker-tooltip-classpos').setAttribute('y', 46);
        marker.querySelector('.marker-tooltip-classpos').textContent = `Class: P${classPosition}`;

        // Re-append so player marker always renders on top
        this.el.driverMarkers.appendChild(marker);
    }

    /**
     * Removes a marker by id
     */
    removeDriverMarker(id) {
        const marker = document.getElementById(id);
        if (marker) marker.remove();
    }

    /**
     * Clears all markers from the circle
     */
    clearDriverMarkers() {
        if (this.el.driverMarkers) this.el.driverMarkers.innerHTML = '';
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
            if (data.relative_timing?.curr_class_position !== undefined) {
                const pos = data.relative_timing.curr_class_position;
                const suffix = pos.toString().slice(-1) == '1' ? 'st' : pos.toString().slice(-1) == 2 ? 'nd' : pos.toString().slice(-1) == 3 ? 'rd' : 'th';
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
                const sector = lt.current_sector || 0;
                const sectorEl = el[`ms${sector}`];

                if (sectorEl) {
                    sectorEl.textContent = this.formatTime(lt.sector_time);
                    sectorEl.style.fontSize = '12px';

                    if (l_delta <= 0) sectorEl.style.backgroundColor = '#00ff00';
                    else sectorEl.style.backgroundColor = '#ff0000';
                }

                if (sector === 0) {
                    for (let i = 1; i <= 9; i++) {
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

            // Circle of Doom — other drivers
            if (data.relative_timing?.cars_by_pos) {
                data.relative_timing.cars_by_pos.forEach((driver) => {
                    this.updateDriverMarker(
                        'driver_' + driver.CarIdx,
                        driver.Lap_Dist,
                        driver.Driver_Name,
                        driver.Lap_Started,
                        driver.Position,
                        driver.Class_Pos,
                        data.relative_timing.lap,
                        driver.Class_Color,
                        driver.Pit_Status
                    );

                    this.updatePositionMarker(
                        'driver_' + driver.CarIdx + '_pos',
                        driver.Driver_Name,
                        driver.Position,
                        driver.Class_Pos,
                        driver.Gap_To_Leader,
                        driver.Class_Color
                    );
                });
            }

            // Circle of Doom — player (separate values, no car_idx)
            if (data.relative_timing.lap_dist !== undefined) {
                this.updatePlayerMarker(
                    data.relative_timing.lap_dist,
                    'You',
                    data.relative_timing.lap,
                    data.relative_timing.curr_position,
                    data.relative_timing.curr_class_position,
                    data.relative_timing.class_color ?? '#000000',
                    data.relative_timing.pit_status
                );
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
        this.clearDriverMarkers();
    }
}