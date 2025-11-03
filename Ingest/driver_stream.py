"""
Credit to following creator for iracing handler
iRacing telemetry stream: https://github.com/kutu/pyirsdk
"""   

import irsdk as ir
import numpy as np

class stream_handlers:
    
    # Smoothing variables for parse_dynamics
    _balance_ema = 0.0
    _alpha = 0.25
    _prev_state = 'NEUTRAL'
    
    @staticmethod   
    def parse_basic_forces(stream):
        """Parse basic physics data including G-forces and vehicle dynamics"""
        return {
            'velo': float(stream['Speed'] or 0.0) * 3.6 * 0.621371,
            'brake': float(stream['BrakeRaw'] or 0.0),
            'clutch': 1 - float(stream['ClutchRaw'] or 0.0),
            'throttle': float(stream['ThrottleRaw'] or 0.0)
        }
    
    @staticmethod
    def parse_dynamics(stream):
        """Parse steering data and calculate understeer/oversteer balance"""
        me_idx = int(stream['PlayerCarIdx'] or 1)
        
        # Initialize smoothing (only runs once)
        if not hasattr(stream_handlers, '_balance_ema'):
            stream_handlers._balance_ema = 0.0
            stream_handlers._alpha = 0.25  # Tunable: 0.1-0.5
            stream_handlers._prev_state = 'NEUTRAL'
        
        # Color gradients
        green_gradient = [
            "#f1f8e9", "#d4ead1", "#b7dcb9", "#9acea1", "#7dc089",
            "#60b271", "#43a459", "#269641", "#098829", "#029000"
        ]
        red_gradient = [
            "#ffebee", "#ffd1d6", "#ffb7be", "#ff9da6", "#ff838e",
            "#ff6976", "#f94f5e", "#e33546", "#cd1b2e", "#d70000"
        ]

        # Get raw telemetry data
        lat_accel_raw = float(stream['LatAccel'] or 0.0)
        lon_accel_raw = float(stream['LongAccel'] or 0.0)
        roll = float(stream['Roll'] or 0.0)
        pitch = float(stream['Pitch'] or 0.0)
        roll_rate = float(stream['RollRate'] or 0.0)
        pitch_rate = float(stream['PitchRate'] or 0.0)
        yaw_rate = float(stream['YawRate'] or 0.0)
        speed_ms = float(stream['Speed'] or 0.0)
        steerAngle = float(stream['CarIdxSteer'][me_idx] or 0.0)
        
        # Convert forces to g-forces excluding gravity
        g = 9.81
        lat_accel_true = lat_accel_raw - (g * np.sin(roll))
        lon_accel_true = lon_accel_raw - (g * np.sin(pitch))
        
        # Thresholds to dictate transient or steady state turning
        roll_rate_thresh = 0.075
        pitch_rate_thresh = 0.075
        
        is_transient_lateral = abs(roll_rate) > roll_rate_thresh
        is_transient_longitudinal = abs(pitch_rate) > pitch_rate_thresh
        is_transient = is_transient_lateral or is_transient_longitudinal
        
        # Calculate understeer/oversteer balance
        min_speed = 13.4
        bal = 0.0
        conf = 0.0
        color = "#808080"
        bal_disp = 0.0
        is_valid = False
        
        if speed_ms >= min_speed and abs(yaw_rate) >= 0.01:
            lat_accel_neutral = speed_ms * yaw_rate
            
            if abs(lat_accel_neutral) >= 0.1:
                
                bal_raw = ((lat_accel_true - lat_accel_neutral) / abs(lat_accel_neutral)) * 100
                bal = bal_raw * np.sign(yaw_rate)
                
                if is_transient:
                    conf = 0.5
                else:
                    conf = 1.0
                    
                is_valid = True
                abs_bal = abs(bal)
                color_idx = min(int(abs_bal / 10), 9)
            
                # Calculate raw display value
                bal_disp_raw = -bal_raw * np.sign(yaw_rate)
                
                # EMA smoothing
                stream_handlers._balance_ema = (
                    stream_handlers._alpha * bal_disp_raw + 
                    (1 - stream_handlers._alpha) * stream_handlers._balance_ema
                )
                bal_disp = stream_handlers._balance_ema
                
                # Determine color based on smoothed value
                if bal_disp * np.sign(yaw_rate) < 0:
                    color = green_gradient[color_idx]  # Oversteer
                else:
                    color = red_gradient[color_idx]    # Understeer
        else:
            # Decay toward zero when invalid
            stream_handlers._balance_ema *= 0.95
            bal_disp = stream_handlers._balance_ema
        
        bal_clamped = max(-100, min(100, bal_disp))
        
        # State determination with hysteresis
        if not is_valid:
            state = 'INVALID'
        elif is_transient:
            state = 'TRANSIENT'
        else:
            if abs(bal) < 8:
                state = 'NEUTRAL'
            elif bal > 12:
                state = 'UNDERSTEER'
                stream_handlers._prev_state = 'UNDERSTEER'
            elif bal < -12:
                state = 'OVERSTEER'
                stream_handlers._prev_state = 'OVERSTEER'
            else:
                state = stream_handlers._prev_state
        
        return {
            'lat_g': lat_accel_true / g,
            'lon_g': lon_accel_true / g,
            'steering_angle': float(stream['SteeringWheelAngle'] or 0.0),
            'car_idx_steer': steerAngle,
            'state': state,
            'color': color,
            'confidence': conf,
            'is_transient': is_transient,
            'balance': round(bal_disp, 1),
            'balance_clamped': round(bal_clamped, 1),
            'is_valid': is_valid
        }
    
    @staticmethod
    def parse_relative_timing(stream):
        """Parse relative timing and distance data"""
        me_idx = int(stream['PlayerCarIdx'] or 1)
        me_class = stream['CarIdxClass'][me_idx]
        me_pos = int(stream['CarIdxClassPosition'][me_idx] or 1)
        leader_idx = 1
        
        ahead_idx = me_idx - 1
        behind_idx = me_idx + 1
        
        gaps = [0.0]
        deltas = [0.0]
        
        while ahead_idx >= 1 or behind_idx <= 100:
            if ahead_idx > 0 and (int(stream['CarIdxClassPosition'][ahead_idx] or 100) < me_pos) and stream['CarIdxClass'][ahead_idx] == me_class:
                gap = round(abs(float(stream['CarIdxF2Time'][ahead_idx] or 0.0)
                    - float(stream['CarIdxF2Time'][me_idx] or 0.0)), 1)
                gaps.insert(0, gap)
                
                delta = round(
                float(stream['CarIdxLastLapTime'][ahead_idx] or 0.0)
                    - float(stream['CarIdxLastLapTime'][me_idx] or 0.0), 3)
                deltas.insert(0, delta)
                
                if stream['CarIdxClassPosition'][ahead_idx] == 1:
                    leader_idx = ahead_idx
                
            try:
                if behind_idx < 101 and (int(stream['CarIdxClassPosition'][behind_idx] or 1) > me_pos) and stream['CarIdxClass'][behind_idx] != None and stream['CarIdxClass'][behind_idx] == me_class:
                    gap = round(abs(float(stream['CarIdxF2Time'][behind_idx] or 0.0)
                    - float(stream['CarIdxF2Time'][me_idx] or 0.0)), 1)
                    gaps.append(gap)
                    
                    delta = round(
                    float(stream['CarIdxLastLapTime'][behind_idx] or 0.0)
                    - float(stream['CarIdxLastLapTime'][me_idx] or 0.0), 3)
                    deltas.append(delta)
            except:
                pass
            
            ahead_idx -= 1
            behind_idx += 1
            
        return {
            'deltas': deltas,
            'gaps': gaps,
            'car_idx_lapdist_pct': float(stream['CarIdxLapDistPct'][me_idx] or 0.0),
            'car_idx_position': me_pos,
            'car_idx_class': me_class,
            'best_class_time': float(stream['CarIdxBestLapTime'][leader_idx] or 0.0)
            }

    
    @staticmethod  
    def parse_lap_times(stream):
        """Parse lap timing data"""
        me_idx  = int(stream['PlayerCarIdx'])
        return {
            'lap_best_lap_time': float(stream['LapBestLapTime'] or 0.0),
            'lap_last_lap_time': float(stream['LapLastLapTime'] or 0.0),
            'lap_current_lap_time': float(stream['LapCurrentLapTime'] or 0.0),
            'lap_best_lap': int(stream['LapBestLap'] or 1),
            'live_delta': 0.0,
            'leader_delta': 0.0,
            'lap': int(stream['Lap'] or 0),
            'laps_remaining': int(stream['SessionLapsRemainEx'] or 0),
            'time_remaining': float(stream['SessionTimeRemain'] or 0.0),
            'session_time_total': float(stream['SessionTimeTotal'] or 0.0)
        }
    
    @staticmethod
    def parse_consumables(stream):
        """Parse fuel and tire data"""
        return {
            'fuel_level': round(float(stream['FuelLevel'] or 0.0), 1),
            'fuel_level_pct': float(stream['FuelLevelPct'] or 0.0),
            'fuel_use_per_hour': float(stream['FuelUsePerHour'] or 0.0),
            'lf_wear': (float(stream['LFwearL'] or 0.0), float(stream['LFwearM'] or 0.0), float(stream['LFwearR'] or 0.0)),
            'rf_wear': (float(stream['RFwearL'] or 0.0), float(stream['RFwearM'] or 0.0), float(stream['RFwearR'] or 0.0)),
            'lr_wear': (float(stream['LRwearL'] or 0.0), float(stream['LRwearM'] or 0.0), float(stream['LRwearR'] or 0.0)),
            'rr_wear': (float(stream['RRwearL'] or 0.0), float(stream['RRwearM'] or 0.0), float(stream['RRwearR'] or 0.0)),
            'tire_sets_used': stream['TireSetsUsed'],
            'tire_sets_available': stream['TireSetsAvailable']
        }
    
    @staticmethod
    def parse_drivetrain(stream):
        """Parse RPM and gear data"""
        return {
            'rpm': int(stream['RPM'] or 0),
            'gear': int(stream['Gear'] or 0),
        }
    
    @staticmethod
    def parse_all(stream):
        """Parse all telemetry data for current tick"""
        # Get basic forces data once (includes throttle, brake, clutch)
        basic_forces = stream_handlers.parse_basic_forces(stream)
        
        # Get timing data once (combines previous timing and radar methods)
        relative_timing = stream_handlers.parse_relative_timing(stream)
        
        return {
            'basic_forces': basic_forces,
            'relative_timing': relative_timing,
            'lap_times': stream_handlers.parse_lap_times(stream),
            'consumables': stream_handlers.parse_consumables(stream),
            'drivetrain': stream_handlers.parse_drivetrain(stream),
            'dynamics': stream_handlers.parse_dynamics(stream),
            'pit_status': stream['OnPitRoad'],
            'laps': None,
            'predictives': None,
            'stint_lap': None
        }