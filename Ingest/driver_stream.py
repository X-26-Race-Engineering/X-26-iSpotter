"""
Credit to following creator for iracing handler
iRacing telemetry stream: https://github.com/kutu/pyirsdk
"""   

import irsdk as ir
import math

class stream_handlers:
    
    # Color gradient from Blue (cold) → Green (optimal) → Yellow → Red (hot)
    COLOR_HEX = [
        '#0000FF', '#0011FF', '#0022FF', '#0033FF', '#0044FF',
        '#0055FF', '#0066FF', '#0077FF', '#0088FF', '#0099FF',
        '#00AAFF', '#00BBFF', '#00CCFF', '#00DDFF', '#00EEFF',
        '#00FFFF', '#00FFEE', '#00FFDD', '#00FFCC', '#00FFBB',
        '#00FFAA', '#00FF99', '#00FF88', '#00FF77', '#00FF66',
        '#00FF55', '#00FF44', '#00FF33', '#00FF22', '#00FF11',
        '#00FF00', '#11FF00', '#22FF00', '#33FF00', '#44FF00',
        '#55FF00', '#66FF00', '#77FF00', '#88FF00', '#99FF00',
        '#AAFF00', '#BBFF00', '#CCFF00', '#DDFF00', '#EEFF00',
        '#FFFF00', '#FFDD00', '#FFBB00', '#FF9900', '#FF7700',
        '#FF5500', '#FF3300', '#FF1100', '#FF0000',
    ]
    
    @staticmethod
    def temp_to_color(temp_celsius, min_temp=60, max_temp=120):
        """
        Map tire temperature (in Celsius) to a color from the gradient.
        
        Optimal tire temperature for iRacing:
        - General: 85-105°C (optimal grip)
        - GT3: 80-90°C (optimal)
        - Qualifying: ~100°C (peak grip)
        
        Args:
            temp_celsius: Current tire temperature in Celsius
            min_temp: Minimum temperature (default 60°C - too cold, maps to blue)
            max_temp: Maximum temperature (default 120°C - too hot, maps to red)
        
        Returns:
            Hex color code as string
        """
        # Clamp temperature to range
        temp = max(min_temp, min(max_temp, float(temp_celsius or 0.0)))
        
        # Normalize to 0-1 range
        normalized = (temp - min_temp) / (max_temp - min_temp)
        
        # Map to color index
        index = int(normalized * (len(stream_handlers.COLOR_HEX) - 1))
        
        return stream_handlers.COLOR_HEX[index]
    
    @staticmethod
    def temp_to_color_fahrenheit(temp, min_temp=35, max_temp=120):
        """
        Map tire temperature (in Fahrenheit) to a color from the gradient.
        
        Optimal tire temperature for iRacing (Fahrenheit):
        - General: 185-221°F (optimal grip)
        - GT3: 176-194°F (optimal)
        - Qualifying: ~212°F (peak grip)
        
        Args:
            temp_fahrenheit: Current tire temperature in Fahrenheit
            min_temp: Minimum temperature (default 140°F - too cold)
            max_temp: Maximum temperature (default 250°F - too hot)
        
        Returns:
            Hex color code as string
        """
        # Clamp temperature to range
        temp = max(min_temp, min(max_temp, temp))
        
        # Normalize to 0-1 range
        normalized = (temp - min_temp) / (max_temp - min_temp)
        
        # Map to color index
        index = int(normalized * (len(stream_handlers.COLOR_HEX) - 1))
        
        return stream_handlers.COLOR_HEX[index]
    
    @staticmethod
    def brake_temp_to_color(temp_fahrenheit, min_temp=200, max_temp=1400):
        """
        Map brake temperature (in Fahrenheit) to a color from the gradient.
        
        Racing brake rotor temperatures (Steel):
        - Cold: < 300°F (too cold, poor performance)
        - Warming: 300-500°F (getting up to temp)
        - Optimal: 500-1100°F (best performance for race pads)
        - Hot: 1100-1400°F (very hot, approaching limits)
        - Danger: > 1400°F (risk of brake fade, warping)
        
        Args:
            temp_fahrenheit: Current brake temperature in Fahrenheit
            min_temp: Minimum temperature (default 200°F - cold)
            max_temp: Maximum temperature (default 1400°F - danger zone)
        
        Returns:
            Hex color code as string
        """
        # Clamp temperature to range
        temp = max(min_temp, min(max_temp, temp_fahrenheit))
        
        # Normalize to 0-1 range
        normalized = (temp - min_temp) / (max_temp - min_temp)
        
        # Map to color index
        index = int(normalized * (len(stream_handlers.COLOR_HEX) - 1))
        
        return stream_handlers.COLOR_HEX[index]
    
    @staticmethod   
    def parse_basic_forces(stream):
        """Parse basic physics data including G-forces and vehicle dynamics"""
        return {
            'lat_g': float(stream['LatAccel'] or 0.0),
            'lon_g': float(stream['LongAccel'] or 0.0),
            'velo': float(stream['Speed'] or 0.0) * 3.6,
            'brake': float(stream['BrakeRaw'] or 0.0),
            'clutch': 1 - float(stream['ClutchRaw'] or 0.0),
            'throttle': float(stream['ThrottleRaw'] or 0.0)
        }
    """
    @staticmethod
    def parse_positionals(stream):
        "Parse positional data if it exists"
        return {
            'lat_acc': float(stream['GPSLatAcc'] or 0.0),
            'lon_acc': float(stream['GPSLonAcc'] or 0.0),
            'lat': float(stream['GPSLatitude'] or 0.0),
            'lon': float(stream['GPSLongitude'] or 0.0),
            'RFSpeed': float(stream['RFSpeed'] or 0.0),
            'LFSpeed': float(stream['LFSpeed'] or 0.0),
            'RLSpeed': float(stream['RLSpeed'] or 0.0),
            'RRSpeed': float(stream['RRSpeed'] or 0.0)
        }
    """
    
    @staticmethod
    def parse_steering(stream):
        """Parse steering data"""
        me_idx  = int(stream['PlayerCarIdx'] or 1)
        return {
            'steering_angle': float(stream['SteeringWheelAngle'] or 0.0),
            'steering_angle_max': float(stream['SteeringWheelAngleMax'] or 0.0),
            'car_idx_steer': float(stream['CarIdxSteer'][me_idx] or 0.0)
        }
    
    @staticmethod
    def parse_relative_timing(stream):
        """Parse relative timing and distance data"""
        me_idx = int(stream['PlayerCarIdx'] or 1)
        me_class = int(stream['CarIdxClass'][me_idx] or 0)
        me_pos = int(stream['CarIdxClassPosition'][me_idx] or 1)
        
        i = me_idx
        ahead_idx = max(me_idx - 1, 1)
        behind_idx = me_idx + 1
        
        while ahead_idx > 0:
            if me_class != stream['CarIdxClass'][ahead_idx]:
                ahead_idx -= 1
                continue
            
            elif me_class == stream['CarIdxClass'][ahead_idx] and me_pos > int(stream['CarIdxClassPosition'][ahead_idx] or 1):
                break
            
            else:
                ahead_idx -= 1
                continue
        try:
            while stream['CarIdxClass'][behind_idx] is not None:
                if me_class != stream['CarIdxClass'][behind_idx]:
                    behind_idx += 1
                    continue
            
                elif me_class == stream['CarIdxClass'][behind_idx] and me_pos < int(stream['CarIdxClassPosition'][behind_idx] or 1):
                    break
            
                else:
                    behind_idx += 1
                    continue
                
        except:
            behind_idx -= 1
            
        return {
            'leader_time_ahead': round(float(stream['CarIdxF2Time'][me_idx] or 0.0), 3),
            'leader_delta': round(
                float(stream['CarIdxLastLapTime'][me_idx] or 0.0)
                - float(stream['CarIdxLastLapTime'][1] or 0.0), 3),
            'car_time_ahead': round(
                abs(float(stream['CarIdxF2Time'][ahead_idx] or 0.0)
                - float(stream['CarIdxF2Time'][me_idx] or 0.0)), 3),
            'car_ahead_delta': round(
                float(stream['CarIdxLastLapTime'][ahead_idx] or 0.0)
                - float(stream['CarIdxLastLapTime'][me_idx] or 0.0), 3),
            'car_time_behind': round(
                abs(float(stream['CarIdxF2Time'][behind_idx] or 0.0)
                - float(stream['CarIdxF2Time'][me_idx] or 0.0)), 3),
            'car_behind_delta': round(
                float(stream['CarIdxLastLapTime'][behind_idx] or 0.0)
                - float(stream['CarIdxLastLapTime'][me_idx] or 0.0), 3),
            'car_idx_lapdist_pct': float(stream['CarIdxLapDistPct'][me_idx] or 0.0),
            'car_idx_position': me_pos,
            'car_idx_class': me_class,
            'car_left_right': int(stream['CarLeftRight'] or 0)
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
            'lap': int(stream['Lap'] or 0),
            'laps_remaining': int(stream['SessionLapsRemainEx'] or 0),
            'time_remaining': float(stream['SessionTimeRemain'] or 0.0),
            'session_time_total': float(stream['SessionTimeTotal'] or 0.0)
        }
    
    @staticmethod
    def parse_consumables(stream):
        """Parse fuel and tire data"""
        return {
            'fuel_level': float(stream['FuelLevel'] or 0.0),
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
    def parse_tire_temps(stream):
        """Parse tire temperature data with color mapping"""
        # Get temperature values (iRacing returns temps in FAHRENHEIT)
        lf_temps = (stream['LFtempCL'], stream['LFtempCM'], stream['LFtempCR'])
        rf_temps = (stream['RFtempCL'], stream['RFtempCM'], stream['RFtempCR'])
        lr_temps = (stream['LRtempCL'], stream['LRtempCM'], stream['LRtempCR'])
        rr_temps = (stream['RRtempCL'], stream['RRtempCM'], stream['RRtempCR'])
        
        # Map temperatures to colors using Fahrenheit function
        lf_colors = tuple(stream_handlers.temp_to_color_fahrenheit(temp) for temp in lf_temps)
        rf_colors = tuple(stream_handlers.temp_to_color_fahrenheit(temp) for temp in rf_temps)
        lr_colors = tuple(stream_handlers.temp_to_color_fahrenheit(temp) for temp in lr_temps)
        rr_colors = tuple(stream_handlers.temp_to_color_fahrenheit(temp) for temp in rr_temps)
        
        return {
            'lf_temps': lf_temps,
            'lf_temps_colors': lf_colors,
            
            'rf_temps': rf_temps,
            'rf_temps_colors': rf_colors,
            
            'lr_temps': lr_temps,
            'lr_temps_colors': lr_colors,
            
            'rr_temps': rr_temps,
            'rr_temps_colors': rr_colors,
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
            'steering': stream_handlers.parse_steering(stream),
            'relative_timing': relative_timing,
            'lap_times': stream_handlers.parse_lap_times(stream),
            'consumables': stream_handlers.parse_consumables(stream),
            'drivetrain': stream_handlers.parse_drivetrain(stream),
            'tire_temps': stream_handlers.parse_tire_temps(stream),
            'pit_status': stream['OnPitRoad'],
            #'positionals': stream_handlers.parse_positionals(stream),
            'laps': None,
            'predictives': None,
            'stint_lap': None
        }