import irsdk
import time
import threading
import numpy as np
import keyboard
import math
from .sessionInfoParser import sessionInfoParsers as sip
import json

#Global vars
frame = {}
prev_frame = {}
lock = threading.Lock()
stream_running = False
ir_instance = None
connect_status = False
stop_requested = False
stop_times = []
curr_stop_time = 0.0
session = {}
cars = []
stint_total_time = 0.0
total_time = 0.0
stint_n = 0
stint_l = 0
last_pit_lap = 0
fuel_start = 0.0
pit_status = False
last_avg_fuel = 0.0

class stream_handlers:
    
    @staticmethod   
    def parse_basic_forces(stream):
        """Parse basic physics data including G-forces and vehicle dynamics"""
        me_idx = int(stream['PlayerCarIdx'] or 1)
        return {
            'velo': float(stream['Speed'] or 0.0) * 2.23694,
            'brake': float(stream['BrakeRaw'] or 0.0),
            'clutch': 1 - float(stream['ClutchRaw'] or 0.0),
            'throttle': float(stream['ThrottleRaw'] or 0.0),
            'steeringAngle': float(stream['CarIdxSteer'][me_idx] or 0.0)
        }
        
    @staticmethod
    def parse_relative_timing(stream, cars):
        """Parse relative timing and distance data"""
        
        me_idx = int(stream['PlayerCarIdx'] or 1)
        me_pos = int(stream['CarIdxPosition'][me_idx] or 1)
        me_class_pos = int(stream['CarIdxClassPosition'][me_idx] or 1)

        if cars == None or cars == []:
            return {'curr_position': me_pos,
            'curr_class_position': me_class_pos}
        
        for i in range(len(cars)):
            cars[i]['Position'] = int(stream['CarIdxPosition'][cars[i]['CarIdx']] or 1)
            cars[i]['Class_Pos'] = stream['CarIdxClassPosition'][cars[i]['CarIdx']]
            cars[i]['Lap_Started'] = stream['CarIdxLap'][cars[i]['CarIdx']]
            cars[i]['Pit_Status'] = stream['CarIdxOnPitRoad'][cars[i]['CarIdx']]
            cars[i]['Gap_To_Leader'] = stream['CarIdxF2Time'][cars[i]['CarIdx']]
            cars[i]['Lap_Dist'] = stream['CarIdxLapDistPct'][cars[i]['CarIdx']]
            cars[i]['Relative_Gap'] = round(float(stream['CarIdxEstTime'][cars[i]['CarIdx']] or 0.0) - float(stream['CarIdxEstTime'][me_idx] or 0.0), 2)
        
        pos_cars = sorted(cars, key=lambda x: x['Position'])
        return {
            'curr_position': me_pos,
            'curr_class_position': me_class_pos,
            'cars_by_pos': pos_cars,
            'cars_by_rel': None
        }

    
    @staticmethod  
    def parse_lap_times(stream):
        """Parse lap timing data"""
        me_idx = int(stream['PlayerCarIdx'] or 1)
        
        current_lap_time = float(stream['LapCurrentLapTime'] or 0.0)
        best_lap_time = float(stream['CarIdxBestLapTime'][me_idx] or np.inf)
        lap_pct = float(stream['CarIdxLapDistPct'][me_idx] or 0.0)
                
        NUM_SECTORS = 10  # Easy to change: 4, 9, 16, etc.
        current_sector = int((lap_pct * 100) // (100 / NUM_SECTORS))  # 0-9 for 10 sectors
                
        if best_lap_time > 0 and current_lap_time > 0:
            # Estimate time at start of current sector
            sector_start_time = best_lap_time * (current_sector / NUM_SECTORS)
            # Time spent in current sector
            sector_time = current_lap_time - sector_start_time
            current_sector = current_sector + 1  # Display + 1 from index
        else:
            # No best lap yet, show current lap time
            sector_time = current_lap_time
            current_sector = current_sector + 1
            
        return {
            'lap_best_lap_time': float(stream['CarIdxBestLapTime'][me_idx] or np.inf),
            'lap_last_lap_time': float(stream['CarIdxLastLapTime'][me_idx] or 0.0),
            'lap_current_lap_time': float(stream['LapCurrentLapTime'] or 0.0),
            'lap_best_lap': int(stream['CarIdxBestLapNum'][me_idx] or 1),
            'live_delta': float(stream['LapDeltaToBestLap'] or 0.0),
            'leader_delta': float(stream['LapDeltaToSessionBestLap'] or 0.0),
            'lap': int(stream['CarIdxLap'][me_idx] or 0),
            'laps_remaining': int(stream['SessionLapsRemainEx'] or 0),
            'time_remaining': float(stream['SessionTimeRemain'] or 0.0),
            'session_time_total': float(stream['SessionTimeTotal'] or 0.0),
            'current_sector': current_sector,
            'sector_time': sector_time
        }
    
    @staticmethod
    def parse_consumables(stream):
        """Parse fuel and tire data"""
        me_idx = int(stream['PlayerCarIdx'] or 1)
        return {
            'fuel_level': round(float(stream['FuelLevel'] or 0.0), 1),
            'fuel_level_pct': round(float(stream['FuelLevelPct'] or 0.0), 1),
            'fuel_use_per_hour': float(stream['FuelUsePerHour'] or 0.0),
            'pit_status': float(stream['CarIdxOnPitRoad'][me_idx] or False)
        }
    
    @staticmethod
    def parse_drivetrain(stream):
        """Parse RPM and gear data"""
        return {
            'rpm': int(stream['RPM'] or 0),
            'gear': int(stream['Gear'] or 0),
            'first_light': float(stream['PlayerCarSLFirstRPM'] or np.inf),
            'last_light': float(stream['PlayerCarSLLastRPM'] or np.inf),
            'blink_light': float(stream['PlayerCarSLBlinkRPM'] or np.inf)
        }
        
    @staticmethod
    def get_hotbox(stream):
        me_idx = int(stream['PlayerCarIdx'] or 1)
        
        if stint_n > 1:
            avg_lps = last_pit_lap / stint_n
        else:
            avg_lps = 0
            
        if stream['CarIdxLapCompleted'][me_idx] > 0:
            avg_fpl = (fuel_start - float(stream['FuelLevel'] or 0.0)) / max(stream['CarIdxLapCompleted'][me_idx] - last_pit_lap, 1)
        else:
            avg_fpl = 0
            
        lf = float(stream['FuelLevel'] or 0.0) / max(avg_fpl, 1)
        
        return {
            'stint_avg_pace': min(float(stream['LapCurrentLapTime'] or 0.0), stint_total_time / max(stint_l, 0.000000001)),
            'race_avg_pace': total_time / int(stream['CarIdxLap'][me_idx] or 1),
            'laps_completed': int(stream['CarIdxLapCompleted'][me_idx] or 1),
            'avg_laps_per_stint': avg_lps,
            'stints_completed': stint_n,
            'avg_fuel_per_lap': max(round(avg_fpl, 1), 1),
            'laps_fuel': max(round(lf, 1), 1),
            'avg_stop_time': sum(stop_times) / max(1, len(stop_times)),
            'curr_stop_time': curr_stop_time
        }
    
    @staticmethod
    def parse_all(stream, cars):
        """Parse all telemetry data for current tick"""
        return {
            'basic_forces': stream_handlers.parse_basic_forces(stream),
            'relative_timing': stream_handlers.parse_relative_timing(stream, cars),
            'lap_times': stream_handlers.parse_lap_times(stream),
            'consumables': stream_handlers.parse_consumables(stream),
            'drivetrain': stream_handlers.parse_drivetrain(stream),
            'strat_box': stream_handlers.get_hotbox(stream),
            'laps': None, #Initialize for init
            'stint_lap': stint_l
        }
        
class State:
    """iRacing connection state"""
    ir_connected = False


def on_hotkey():
    global stop_requested
    stop_requested = True


def check_iracing(state, ir):
    """Check and manage iRacing connection"""
    global connect_status
    if state.ir_connected and not (ir.is_initialized and ir.is_connected):
        state.ir_connected = False
        connect_status = False
        ir.shutdown()
        print('iRacing disconnected')
    elif not state.ir_connected and ir.startup() and ir.is_initialized and ir.is_connected:
        state.ir_connected = True
        connect_status = True
        print('iRacing connected!')

def get_connection_status():
    """
    Get current iRacing connection status
    Thread-safe access to global connection state
    Wrapper for above method
    
    Returns:
        bool: True if connected to iRacing, False otherwise
    """
    global connect_status
    return connect_status


def loop(ir):
    """
    Main telemetry loop - reads and parses data from iRacing
    """
    global cars
    
    ir.freeze_var_buffer_latest()
    frame = stream_handlers.parse_all(ir, cars)
    return frame

def get_all_info(ir):
    """
    Gets weekend and session info
    """
    global session_info
    global ids
    
    #session_info = sip.get_all(ir)
    #cars = session_info['all_cars']

def stop_stream():
    """
    Stop the telemetry streaming process
    """
    global stream_running
    global ir_instance
    
    stream_running = False
    if ir_instance:
        try:
            ir_instance.shutdown()
        except:
            pass
    print("Stopping telemetry stream...")


def get_frame():
    """
    Get the current telemetry frame
    Thread-safe access to global frame data
    
    Returns:
        dict: Current telemetry data snapshot
    """
    with lock:
        return frame.copy() if frame else {}
    

def start_stream(interrupt_act=None):
    """
    Start the telemetry streaming process
    Continuously reads data from iRacing SDK
    """
    global stream_running
    global ir_instance
    global frame
    global prev_frame
    global session
    global stop_requested
    global stint_l
    global curr_stop_time
    global stop_times
    global stint_total_time
    global total_time
    global pit_status
    global fuel_start
    global last_pit_lap
    global cars
    global stint_n
    
    stream_running = True
    ir_instance = irsdk.IRSDK()
    state = State()
    
    keyboard.add_hotkey("ctrl+shift+s", on_hotkey)

    #cars = sip.get_all_cars(ir_instance)

    while stream_running and not stop_requested:
        check_iracing(state, ir_instance)
        
        if not state.ir_connected:
            time.sleep(1/60)
            continue
        
        with lock:
            if state.ir_connected:
                if session == {}:
                    session = get_all_info(ir_instance)
                    
                prev_frame = frame.copy() if frame else {}
                frame = loop(ir_instance)
            
            frame['connection'] = connect_status
            frame['stint_lap'] = stint_l
            
            if prev_frame and prev_frame['lap_times']['lap'] < frame['lap_times']['lap']:
                stint_total_time += frame['lap_times']['lap_last_lap_time']
                total_time += frame['lap_times']['lap_last_lap_time']
                
            if (frame['consumables']['pit_status']):
                if (pit_status):
                    curr_stop_time += 1/60
                else:
                    stint_l = 0
                    stint_n += 1
                    pit_status = True
                    fuel_start = frame['consumables']['fuel_level']
                    stop_times.append(curr_stop_time)
                    curr_stop_time = 0
                    last_pit_lap = frame['lap_times']['lap']
                    
            else:
                pit_status = False