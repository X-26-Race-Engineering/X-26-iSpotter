export class updateManager {
    constructor(url) {
        this.socket = null;
        this.socketUrl = url;
    }

    // Line Chart Setup
    canvas = document.getElementById('lineChart');
    ctx = canvas.getContext('2d');

    // Set canvas size
    resizeCanvas() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }

    // Data storage for line chart (input history)
    maxDataPoints = 100;
    throttleHistory = [];
    brakeHistory = [];
    clutchHistory = [];

    drawLineChart() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (throttleHistory.length < 2) return;

        const width = canvas.width;
        const height = canvas.height;
        const padding = 5;

        // Draw throttle line (green)
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < throttleHistory.length; i++) {
            const x = padding + (i / maxDataPoints) * (width - padding * 2);
            const y = height - padding - (throttleHistory[i]) * (height - padding * 2);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw brake line (red)
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < brakeHistory.length; i++) {
            const x = padding + (i / maxDataPoints) * (width - padding * 2);
            const y = height - padding - (brakeHistory[i]) * (height - padding * 2);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw clutch line (blue)
        ctx.strokeStyle = '#0099ff';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < clutchHistory.length; i++) {
            const x = padding + (i / maxDataPoints) * (width - padding * 2);
            const y = height - padding - (clutchHistory[i]) * (height - padding * 2);

        if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }

    // Update line chart with throttle, brake, clutch data
    updateLineChart(throttle, brake, clutch) {
        throttleHistory.push(throttle);
        brakeHistory.push(brake);
        clutchHistory.push(clutch);

        if (throttleHistory.length > maxDataPoints) {
            throttleHistory.shift();
            brakeHistory.shift();
            clutchHistory.shift();
        }

        drawLineChart();
    }

    // Update input bars
    updateInputBars(throttle, brake, clutch) {
        document.getElementById('throttle-fill').style.height = (throttle * 100) + '%';
        document.getElementById('brake-fill').style.height = (brake * 100) + '%';
        document.getElementById('clutch-fill').style.height = (clutch * 100) + '%';
    }

    getStateColor(state) {
        switch(state) {
            case 'BLINKLIGHT': return '#ff0000';
            case 'LASTLIGHT': return '#04f7ff';
            case 'FIRSTLIGHT': return '#ffbb00';
            default: return '#03bd00';
        }
    }

    // Format time as MM:SS.SSS
    formatTime(seconds) {
        if (!seconds || seconds <= 0) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(3);
        return `${mins}:${secs.padStart(6, '0')}`;
    }

    connect(){
        this.socket = io(this.socketUrl);
        //Set up line chart
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Handle incoming telemetry data
        this.socket.on('frame_update', (data) => {
            console.log('Received frame:', data);

            // Update header info
            if (data.relative_timing && data.relative_timing.curr_position) {
                const position = data.relative_timing.curr_position || '--';
                const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
                document.getElementById('current-pos').textContent = position + suffix;
            }
            //Update header and wizard(s) info
            if (data.lap_times) {
                document.getElementById('current-lap').textContent = data.lap_times.lap || '--';
                document.getElementById('curr-lap-time').textContent = formatTime(data.lap_times.lap_current_lap_time);
                const blap = data.lap_times.lap_best_lap_time;
                const p_delta = data.lap_times.live_delta || 0.0;
                const l_delta = data.lap_times.leader_delta || 0.0;

                if (blap && p_delta){
                    document.getElementById('pred-lap').textContent = formatTime(blap + p_delta);
                }

                document.getElementById('best-time').textContent = formatTime(data.lap_times.lap_best_lap_time ?? 9999.99);
                document.getElementById('curr-delta').textContent = data.lap_times.live_delta ?? 0;

                const sector = data.lap_times.current_sector || 1;
                document.getElementById(`ms${sector}`).textContent = formatTime(data.lap_times.sector_time);
                document.getElementById(`ms${sector}`).style.fontSize = '14px';

                if (sector == 1) {
                    for (let i = 2; i < 10; i++) {
                        document.getElementById(`ms${i}`).style.fontSize = '10px';
                        document.getElementById(`ms${i}`).textContent = '--:--';
                        document.getElementById(`ms${i}`).style.backgroundColor = '#2a2a2a';
                    }
                }
                if (sector > 1) {
                    document.getElementById(`ms${sector - 1}`).style.fontSize = '10px';
                }

                if (p_delta && l_delta) {
                    if (p_delta <= 0 && l_delta <= 0) {
                        document.getElementById(`ms${sector}`).style.backgroundColor = '#d900ffff';
                    } else if (p_delta <= 0) {
                        document.getElementById(`ms${sector}`).style.backgroundColor = '#00ff00';
                    } else {
                        document.getElementById(`ms${sector}`).style.backgroundColor = '#ff0000';
                    }

                    }
                }
            //Update header stint lap info
            if (data.stint_lap){
                document.getElementById('stint-lap').textContent = data.stint_lap;
            }

            // Update car info in center panel
            if (data.drivetrain) {
                document.getElementById('gear').textContent = data.drivetrain.gear || '-';
                document.getElementById('rpm-text').textContent = Math.round(data.drivetrain.rpm) || '----';
                const state = "clear";
                
                if (rpm >= data.drivetrain.first_light && rpm < data.drivetrain.last_light) {
                    state = getStateColor("FIRSTLIGHT");
                } else if (rpm >= data.drivetrain.last_light && rpm < data.drivetrain.blink_light) {
                    state = getStateColor("LASTLIGHT");
                } else if (rpm >= data.drivetrain.blinklight) {
                    state = getStateColor("BLINKLIGHT");
                } else {
                    state = "clear";
                }

                document.getElementById('rpm').style.borderColor = state;

            }
            //Update car info and trace
            if (data.basic_forces) {
                const speed = Math.round(data.basic_forces.velo * 0.621371); // Convert km/h to mph
                document.getElementById('speed').textContent = speed;
                const throttle = data.basic_forces.throttle || 0;
                const brake = data.basic_forces.brake || 0;
                const clutch = data.basic_forces.clutch || 0;

                // Update the vertical bars
                updateInputBars(throttle, brake, clutch);

                // Update the line chart (showing input history)
                updateLineChart(throttle, brake, clutch);

                const steeringAngleDeg = data.basic_forces.steeringAngle * (180 / Math.PI);
                const steeringPercent = (steeringAngleDeg / 360) * 100;
                const steeringClampedPercent = Math.max(-50, Math.min(50, steeringPercent));

                // Position the steering bar
                const steeringBar = document.getElementById("meter-indicator");
                steeringBar.style.left = `${50 + steeringClampedPercent}%`;
            }
            //Update car info fuel
            if (data.consumables){
                document.getElementById("fuel").textContent = data.consumables.fuel_level || '--';
            }

            //Update strategy hot tools
            if (data.strat_box) {
                document.getElementyById("curr-pit-stop").textContent = formatTime(data.strat_box.current_stop_time) || '--:--.---';
                document.getElementById("stint-avg-pace").textContent = formatTime(data.strat_box.stint_average_pace) || '--:--.---';
                document.getElementById("pit-loss").textContent = formatTime(data.strat_box.avg_stop_time) || '--:--.---';
                document.getElementById("race-avg-pace").textContent = formatTime(data.strat_box.race_average_pace) || '--:--.---';
                document.getElementById("fuel-laps").textContent = data.strat_box.laps_fuel || '--';
                document.getElementById("avg-use-lap").textContent = data.strat_box.avg_fuel_per_lap || '--';
                document.getElementById("stints-completed").textContent = data.strat_box.stints_completed || '--';
                document.getElementById("laps-per-stint").textContent = data.strat_box.avg_laps_per_stint || '--';
                document.getElementById("laps-remaining").textContent = (1 - data.strat_box.laps_completed) || '--';
            }

            //Update relative timing
            //TODO: Update to use raceEngine
            if (data.relative_timing) {
                
            }

        });

        // Connection status
        this.socket.on('connect', () => {
            console.log('Connected to telemetry server');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from telemetry server');
        });
    }
}