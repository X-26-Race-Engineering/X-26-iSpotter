"""
Ingestion Module
Handles iRacing SDK connection and telemetry data streaming
"""

import irsdk
import time
from .driver_stream import stream_handlers as Stream
import pandas as pd
import threading
import numpy as np
import keyboard
import math

# Global state
stored_telem = {
    'Tire Tread PCT': [],
    'Fuel Usage': [],
    'Fuel Per Hour': [],
    'Lap Times': []
}

_curr_stored_lap = {
    'sectors': [],      # Sector times (4 sectors per lap)
    'time': 0
}

frame = {}
prev_frame = {}
lock = threading.Lock()
stint_l = 0
stream_running = False
ir_instance = None
connect_status = False
stop_requested = False
last_sector = -1  # Track which sector we're in (0-3)
last_stop_time = 0.0


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


def loop(ir):
    """
    Main telemetry loop - reads and parses data from iRacing
    """
    ir.freeze_var_buffer_latest()
    frame = Stream.parse_all(ir)
    return frame


def start_stream(interrupt_act=None):
    """
    Start the telemetry streaming process
    Continuously reads data from iRacing SDK
    """
    global stream_running
    global ir_instance
    global frame
    global prev_frame
    global stored_telem
    global stop_requested
    global stint_l
    global _curr_stored_lap
    global last_sector
    
    stream_running = True
    ir_instance = irsdk.IRSDK()
    state = State()
    
    keyboard.add_hotkey("ctrl+shift+s", on_hotkey)

    while stream_running and not stop_requested:
        check_iracing(state, ir_instance)
        
        if not state.ir_connected:
            time.sleep(1/60)
            continue
        
        with lock:
            if state.ir_connected:
                prev_frame = frame.copy() if frame else {}
                frame = loop(ir_instance)
                
            frame['predictives'] = get_predictives()
            frame['connection'] = connect_status
            frame['stint_lap'] = stint_l
            
            # Ensure lap_times exists
            if 'lap_times' not in frame:
                frame['lap_times'] = {}
                
            if len(_curr_stored_lap['sectors']) > 0 and frame['lap_times']['lap_current_lap_time'] is not None and float(frame['lap_times']['lap_current_lap_time']) > 0:
                frame['lap_times']['sector_time'] = float(frame['lap_times']['lap_current_lap_time']) - sum(_curr_stored_lap['sectors'])
                frame['lap_times']['current_sector'] = last_sector + 1
                
            else:
                frame['lap_times']['sector_time'] = float(frame['lap_times']['lap_current_lap_time'])
                frame['lap_times']['current_sector'] = last_sector + 1
                        
            # Calculate live delta EVERY frame for smooth updates 
            if frame['lap_times']['lap_best_lap_time'] is not None and frame['relative_timing']['car_idx_lapdist_pct'] is not None:
                #Get current lap time
                current_lap_time = float(frame['lap_times']['lap_best_lap_time'] or 0.0)
                
                # Interpolate best lap time at current position
                lap_pct = float(frame['relative_timing']['car_idx_lapdist_pct'] or 0.0)
                estimated_best_time_at_position =  float(frame['lap_times']['lap_best_lap_time'] or 0.0) * lap_pct
                
                # Delta = current time - where best lap was at this point
                frame['lap_times']['live_delta'] = round(current_lap_time - estimated_best_time_at_position, 3)
                
            else:
                # No best lap reference yet
                frame['lap_times']['live_delta'] = 0.0
            
            # Sector tracking - check if we've crossed a 25% threshold for sector times
            if 'relative_timing' in frame and 'car_idx_lapdist_pct' in frame['relative_timing']:
                lap_pct = float(frame['relative_timing']['car_idx_lapdist_pct'] or 0.0) * 100
                current_sector = int(lap_pct // 25)  # Which 25% segment (0-3)
                
                # Only trigger when we enter a new sector
                if current_sector != last_sector and current_sector >= 0 and current_sector < 4:
                    last_sector = current_sector
                    store_sector_time(current_sector)
            
            # Detect lap completion
            if (prev_frame and 'lap_times' in prev_frame and 
                frame and 'lap_times' in frame and
                int(prev_frame['lap_times']['lap'] or 0) < 
                int(frame['lap_times']['lap'] or 0)):
                
                # Store lap data
                if frame['lap_times'].get('lap_last_lap_time'):
                    stored_telem['Lap Times'].append(frame['lap_times']['lap_last_lap_time'])
                    _curr_stored_lap['time'] = frame['lap_times']['lap_last_lap_time']
                
                if frame.get('consumables'):
                    stored_telem['Fuel Usage'].append(frame['consumables']['fuel_level'])
                    stored_telem['Fuel Per Hour'].append(frame['consumables']['fuel_use_per_hour'])
                    
                    LFWear = sum(frame['consumables']['lf_wear']) / 3
                    RFWear = sum(frame['consumables']['rf_wear']) / 3
                    LRWear = sum(frame['consumables']['lr_wear']) / 3
                    RRWear = sum(frame['consumables']['rr_wear']) / 3
                    
                    avg_wear = (LFWear + RFWear + LRWear + RRWear) / 4
                    stored_telem['Tire Tread PCT'].append(avg_wear)
                
                stint_l += 1
                
                # Reset current lap tracking
                _curr_stored_lap = {
                    'sectors': [],
                    'time': 0
                }
                last_sector = -1  # Reset sector tracking
        
        # Handle pit stop telemetry storage (outside lock to avoid issues)
        if frame and 'consumables' in frame and len(stored_telem['Fuel Usage']) > 0:
            fuel_increase = float(frame['consumables'].get('fuel_level', 0.0) or 0.0) - float(stored_telem["Fuel Usage"][-1] or 0.0)
            
            # Pit stop detected - fuel increased by more than 5 liters
            if fuel_increase > 5.0:
                print("Pit stop detected - resetting stint data")
                stored_telem['Fuel Usage'] = []
                stored_telem['Fuel Per Hour'] = []
                stored_telem['Tire Tread PCT'] = []
                stored_telem['Lap Times'] = []
                stint_l = 0
                
                # Reset lap tracking
                _curr_stored_lap = {
                    'sectors': [],
                    'time': 0
                    }
                last_sector = -1
        
        time.sleep(1/60)

    ir_instance.shutdown()
    stream_running = False
    print("Telemetry stream stopped")


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


def get_predictives():
    """
    Uses stored telemetry to predict pit stops by tire usage and fuel, 
    and predict the amount of necessary stops needed to complete the race
    """
    global stored_telem
    global frame
    
    stats = {
        'Fuel_Laps_Remaining': 0,
        'Fuel_Time_Remaining': 0,
        'Predicted_Stops_Remaining': 0,
        'Average_Pace': 999.99
    }
    
    if not frame or 'lap_times' not in frame:
        return stats
    
    stats['Fuel_Laps_Remaining'] = -1
    stats['Fuel_Time_Remaining'] = -1
    fs_remaining = 9999
    ft_remaining = 9999
    
    # Calculate fuel-based predictions
    fuel_usage = np.diff(stored_telem["Fuel Usage"])
    if len(fuel_usage) > 0:
        avg_fu = abs(sum(fuel_usage) / len(fuel_usage))  # Average fuel usage per lap
        
        if len(stored_telem["Fuel Usage"]) > 0 and avg_fu > 0:
            last_lap_fuel = stored_telem["Fuel Usage"][-1]
            stats['Fuel_Laps_Remaining'] = int(np.floor(last_lap_fuel / avg_fu))
            
            # Calculate stops needed based on laps remaining
            laps_remaining = frame.get('lap_times', {}).get('laps_remaining', 0)
            if stats['Fuel_Laps_Remaining'] > 0 and laps_remaining > 0:
                fs_remaining = math.ceil(laps_remaining / (len(stored_telem['Fuel Usage']) + stats['Fuel_Laps_Remaining']))
    
    # Calculate average fuel per hour
    fuel_hour_avg = 0
    if len(stored_telem['Fuel Per Hour']) > 0:
        fuel_hour_avg = sum(stored_telem['Fuel Per Hour']) / len(stored_telem['Fuel Per Hour'])
    
    # Calculate total time and average pace
    total_time = float(frame.get('lap_times', {}).get('lap_current_lap_time', 0.0) or 0.0) / 3600
    if len(stored_telem["Lap Times"]) > 0:
        total_time += float(sum(stored_telem["Lap Times"])) / 3600
        stats['Average_Pace'] = sum(stored_telem['Lap Times']) / len(stored_telem['Lap Times'])
    
    # Calculate time-based predictions
    time_remaining = float(frame.get('lap_times', {}).get('time_remaining', 0.0) or 0.0)
    
    if fuel_hour_avg > 0 and time_remaining > 0 and len(stored_telem["Fuel Usage"]) > 0:
        stats['Fuel_Time_Remaining'] = (stored_telem["Fuel Usage"][-1] / fuel_hour_avg) * 3600
        if total_time > 0:
            ft_remaining = math.ceil(time_remaining / (total_time + stats['Fuel_Time_Remaining']))
    
    stats['Predicted_Stops_Remaining'] = int(min(fs_remaining, ft_remaining))
    
    return stats


def store_sector_time(sector):
    """
    Store sector time when crossing 25% thresholds
    
    Args:
        sector: Sector number (1-4)
    """
    global _curr_stored_lap
    global frame
    
    if 'lap_times' not in frame:
        return
    
    current_lap_time = float(frame['lap_times'].get('lap_current_lap_time', 0.0) or 0.0)
    
    # Calculate current sector time (time since last sector)
    if len(_curr_stored_lap['sectors']) > 0:
        current_sector_time = current_lap_time - sum(_curr_stored_lap['sectors'])
    else:
        current_sector_time = current_lap_time
        
    _curr_stored_lap['sectors'].append(current_sector_time)


# Module exports
__all__ = ['get_frame', 'start_stream', 'stop_stream', 'VARS']