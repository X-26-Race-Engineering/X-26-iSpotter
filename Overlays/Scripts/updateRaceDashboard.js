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
        
        console.log('UpdateManager created with URL:', url);
    }

    resizeCanvas() {
        if (this.canvas) {
            this.canvas.width = this.canvas.offsetWidth;
            this.canvas.height = this.canvas.offsetHeight;
        }
    }

    drawLineChart() {
        if (!this.ctx || this.throttleHistory.length < 2) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const width = this.canvas.width;
        const height = this.canvas.height;
        const padding = 5;

        // Draw throttle line (green)
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        for (let i = 0; i < this.throttleHistory.length; i++) {
            const x = padding + (i / this.maxDataPoints) * (width - padding * 2);
            const y = height - padding - (this.throttleHistory[i]) * (height - padding * 2);

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();

        // Draw brake line (red)
        this.ctx.strokeStyle = '#ff3333';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        for (let i = 0; i < this.brakeHistory.length; i++) {
            const x = padding + (i / this.maxDataPoints) * (width - padding * 2);
            const y = height - padding - (this.brakeHistory[i]) * (height - padding * 2);

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();

        // Draw clutch line (blue)
        this.ctx.strokeStyle = '#0099ff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        for (let i = 0; i < this.clutchHistory.length; i++) {
            const x = padding + (i / this.maxDataPoints) * (width - padding * 2);
            const y = height - padding - (this.clutchHistory[i]) * (height - padding * 2);

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.stroke();
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

        this.drawLineChart();
    }

    updateInputBars(throttle, brake, clutch) {
        const throttleFill = document.getElementById('throttle-fill');
        const brakeFill = document.getElementById('brake-fill');
        const clutchFill = document.getElementById('clutch-fill');
        
        if (throttleFill) throttleFill.style.height = (throttle * 100) + '%';
        if (brakeFill) brakeFill.style.height = (brake * 100) + '%';
        if (clutchFill) clutchFill.style.height = (clutch * 100) + '%';
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
        
        // Initialize canvas
        this.canvas = document.getElementById('lineChart');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
            console.log('Canvas initialized');
        } else {
            console.warn('Canvas element not found');
        }

        // Connect to Socket.IO
        console.log('Connecting to Socket.IO at', this.socketUrl);
        this.socket = io(this.socketUrl);

        // Handle incoming telemetry data
        this.socket.on('frame_update', (data) => {
            try {
                // Update header info
                if (data.relative_timing && data.relative_timing.curr_position !== undefined) {
                    const position = data.relative_timing.curr_position;
                    const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
                    const posElement = document.getElementById('current-pos');
                    if (posElement) posElement.textContent = position + suffix;
                }

                // Update lap times
                if (data.lap_times) {
                    const lapElement = document.getElementById('current-lap');
                    if (lapElement) lapElement.textContent = data.lap_times.lap || '--';
                    
                    const currLapTime = document.getElementById('curr-lap-time');
                    if (currLapTime) currLapTime.textContent = this.formatTime(data.lap_times.lap_current_lap_time);
                    
                    // Add prev-time update
                    const prevTime = document.getElementById('prev-time');
                    if (prevTime) prevTime.textContent = this.formatTime(data.lap_times.lap_last_lap_time);
                    
                    const blap = data.lap_times.lap_best_lap_time;
                    const p_delta = data.lap_times.live_delta || 0.0;

                    if (blap && blap < 999999 && p_delta !== undefined) {
                        const predLap = document.getElementById('pred-lap');
                        if (predLap) predLap.textContent = this.formatTime(blap + p_delta);
                    }

                    const bestTime = document.getElementById('best-time');
                    if (bestTime) {
                        if (blap && blap < 999999) {
                            bestTime.textContent = this.formatTime(blap);
                        } else {
                            bestTime.textContent = '--:--';
                        }
                    }
                    
                    const currDelta = document.getElementById('curr-delta');
                    if (currDelta) {
                        const delta = data.lap_times.live_delta ?? 0;
                        const sign = delta >= 0 ? '+' : '';
                        currDelta.textContent = sign + delta.toFixed(3);
                    }

                    // Update sectors
                    const sector = data.lap_times.current_sector || 1;
                    const sectorElement = document.getElementById(`ms${sector}`);
                    if (sectorElement) {
                        sectorElement.textContent = this.formatTime(data.lap_times.sector_time);
                        sectorElement.style.fontSize = '14px';
                    }

                    if (sector === 1) {
                        for (let i = 2; i <= 10; i++) {
                            const msElement = document.getElementById(`ms${i}`);
                            if (msElement) {
                                msElement.style.fontSize = '10px';
                                msElement.textContent = '--:--';
                                msElement.style.backgroundColor = '#2a2a2a';
                            }
                        }
                    }
                    
                    if (sector > 1) {
                        const prevSector = document.getElementById(`ms${sector - 1}`);
                        if (prevSector) prevSector.style.fontSize = '10px';
                    }

                    const l_delta = data.lap_times.leader_delta || 0.0;
                    if (p_delta !== undefined && l_delta !== undefined && sectorElement) {
                        if (p_delta <= 0 && l_delta <= 0) {
                            sectorElement.style.backgroundColor = '#d900ffff';
                        } else if (p_delta <= 0) {
                            sectorElement.style.backgroundColor = '#00ff00';
                        } else {
                            sectorElement.style.backgroundColor = '#ff0000';
                        }
                    }
                    
                    // Update time remaining
                    const timeRemaining = document.getElementById('time-remaining');
                    if (timeRemaining) {
                        timeRemaining.textContent = this.formatTime(data.lap_times.time_remaining);
                    }
                    
                    // Update laps remaining
                    const lapsRemaining = document.getElementById('laps-remaining');
                    if (lapsRemaining) {
                        lapsRemaining.textContent = data.lap_times.laps_remaining || '--';
                    }
                }

                // Update stint lap
                if (data.stint_lap !== undefined) {
                    const stintLap = document.getElementById('stint-lap');
                    if (stintLap) stintLap.textContent = data.stint_lap;
                }

                // Update drivetrain
                if (data.drivetrain) {
                    const gear = document.getElementById('gear');
                    if (gear) gear.textContent = data.drivetrain.gear || '-';
                    
                    const rpmText = document.getElementById('rpm-text');
                    if (rpmText) rpmText.textContent = Math.round(data.drivetrain.rpm) || '----';
                    
                    const rpm = data.drivetrain.rpm || 0;
                    let state = 'clear';
                    
                    if (rpm >= data.drivetrain.first_light && rpm < data.drivetrain.last_light) {
                        state = this.getStateColor('FIRSTLIGHT');
                    } else if (rpm >= data.drivetrain.last_light && rpm < data.drivetrain.blink_light) {
                        state = this.getStateColor('LASTLIGHT');
                    } else if (rpm >= data.drivetrain.blink_light) {
                        state = this.getStateColor('BLINKLIGHT');
                    }

                    const rpmElement = document.getElementById('rpm');
                    if (rpmElement) rpmElement.style.borderColor = state;
                }

                // Update basic forces
                if (data.basic_forces) {
                    const speed = Math.round(data.basic_forces.velo);
                    const speedElement = document.getElementById('speed');
                    if (speedElement) speedElement.textContent = speed;
                    
                    const throttle = data.basic_forces.throttle || 0;
                    const brake = data.basic_forces.brake || 0;
                    const clutch = data.basic_forces.clutch || 0;

                    this.updateInputBars(throttle, brake, clutch);
                    this.updateLineChart(throttle, brake, clutch);

                    const steeringAngleDeg = data.basic_forces.steeringAngle * (180 / Math.PI);
                    const steeringPercent = (steeringAngleDeg / 360) * 100;
                    const steeringClampedPercent = Math.max(-50, Math.min(50, steeringPercent));

                    const steeringBar = document.getElementById('meter-indicator');
                    if (steeringBar) {
                        steeringBar.style.left = `${50 + steeringClampedPercent}%`;
                    }
                }

                // Update fuel
                if (data.consumables) {
                    const fuel = document.getElementById('fuel');
                    if (fuel) fuel.textContent = data.consumables.fuel_level || '--';
                }

                // Update strategy box
                if (data.strat_box) {
                    const currPitStop = document.getElementById('curr-pit-stop');
                    if (currPitStop) currPitStop.textContent = this.formatTime(data.strat_box.curr_stop_time) || '--:--.---';
                    
                    const stintAvgPace = document.getElementById('stint-avg-pace');
                    if (stintAvgPace) stintAvgPace.textContent = this.formatTime(data.strat_box.stint_avg_pace) || '--:--.---';
                    
                    const pitLoss = document.getElementById('pit-loss');
                    if (pitLoss) pitLoss.textContent = this.formatTime(data.strat_box.avg_stop_time) || '--:--.---';
                    
                    const raceAvgPace = document.getElementById('race-avg-pace');
                    if (raceAvgPace) raceAvgPace.textContent = this.formatTime(data.strat_box.race_avg_pace) || '--:--.---';
                    
                    const fuelLaps = document.getElementById('fuel-laps');
                    if (fuelLaps) fuelLaps.textContent = data.strat_box.laps_fuel || '--';
                    
                    const avgUseLap = document.getElementById('avg-use-lap');
                    if (avgUseLap) avgUseLap.textContent = data.strat_box.avg_fuel_per_lap || '--';
                    
                    const stintsCompleted = document.getElementById('stints-completed');
                    if (stintsCompleted) stintsCompleted.textContent = data.strat_box.stints_completed || '--';
                    
                    const lapsPerStint = document.getElementById('laps-per-stint');
                    if (lapsPerStint) lapsPerStint.textContent = data.strat_box.avg_laps_per_stint || '--';
                }

                // Update iRacing connection status from frame data
                if (data.connection !== undefined) {
                    const iracingStatus = document.getElementById('iracing-status');
                    if (iracingStatus) {
                        if (data.connection) {
                            iracingStatus.textContent = 'Connected';
                            iracingStatus.style.color = '#00ff00';
                        } else {
                            iracingStatus.textContent = 'Disconnected';
                            iracingStatus.style.color = '#ff0000';
                        }
                    }
                }

            } catch (error) {
                console.error('Error updating dashboard:', error);
            }
        });

        // Listen for iRacing connection status updates
        this.socket.on('iracing_status', (data) => {
            console.log('iRacing status update:', data);
            
            const iracingStatus = document.getElementById('iracing-status');
            if (iracingStatus) {
                if (data.connected) {
                    iracingStatus.textContent = 'Connected';
                    iracingStatus.style.color = '#00ff00';
                } else {
                    iracingStatus.textContent = 'Disconnected';
                    iracingStatus.style.color = '#ff0000';
                }
            }
        });

        // Listen for stream status updates
        this.socket.on('stream_status', (data) => {
            console.log('Stream status update:', data);
            
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
    }
    
    disconnect() {
        console.log('UpdateManager.disconnect() called');
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}