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
    'Fuel Usage': [],
    'Fuel Per Hour': [],
    'Lap Times': []
}

frame = {}
prev_frame = {}
lock = threading.Lock()
stint_l = 0
stream_running = False
ir_instance = None
connect_status = False
stop_requested = False
stop_times = []
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
    global last_stop_time
    global stop_times
    
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
                        
            # Calculate live delta EVERY frame for smooth updates 
            if frame['lap_times']['lap_best_lap_time'] is not None and frame['relative_timing']['car_idx_lapdist_pct'] is not None:
                #Get current lap time
                current_lap_time = float(frame['lap_times']['lap_best_lap_time'] or 0.0)
                
                # Interpolate best lap time at current position
                lap_pct = float(frame['relative_timing']['car_idx_lapdist_pct'] or 0.0)
                estimated_best_time_at_position =  float(frame['lap_times']['lap_best_lap_time'] or 0.0) * lap_pct
                estimated_leader_time_at_position = float(frame['relative_timing']['best_class_time'] or 0.0) *lap_pct
                
                # Delta = current time - where best lap was at this point
                frame['lap_times']['live_delta'] = round(current_lap_time - estimated_best_time_at_position, 3)
                frame['lap_times']['leader_delta'] = round(current_lap_time - estimated_leader_time_at_position, 3)
                
            else:
                # No best lap reference yet
                frame['lap_times']['live_delta'] = 0.0
            
            # Calculate current sector time using estimation (no storage needed)
            if 'lap_times' in frame and 'relative_timing' in frame:
                current_lap_time = float(frame['lap_times'].get('lap_current_lap_time', 0.0) or 0.0)
                best_lap_time = float(frame['lap_times'].get('lap_best_lap_time', 0.0) or 0.0)
                lap_pct = float(frame['relative_timing'].get('car_idx_lapdist_pct', 0.0) or 0.0)
                
                NUM_SECTORS = 9  # Easy to change: 4, 9, 16, etc.
                current_sector = int((lap_pct * 100) // (100 / NUM_SECTORS))  # 0-8 for 9 sectors
                
                if best_lap_time > 0 and current_lap_time > 0:
                    # Estimate time at start of current sector
                    sector_start_time = best_lap_time * (current_sector / NUM_SECTORS)
                    # Time spent in current sector
                    frame['lap_times']['sector_time'] = current_lap_time - sector_start_time
                    frame['lap_times']['current_sector'] = current_sector + 1  # Display as 1-9
                else:
                    # No best lap yet - just show current lap time
                    frame['lap_times']['sector_time'] = current_lap_time
                    frame['lap_times']['current_sector'] = current_sector + 1
            
            # Detect lap completion - store lap data and reset tracking
            if (prev_frame and 'lap_times' in prev_frame and 
                frame and 'lap_times' in frame and
                int(prev_frame['lap_times']['lap'] or 0) < 
                int(frame['lap_times']['lap'] or 0)):
                
                if frame['lap_times'].get('lap_last_lap_time'):
                    stored_telem['Lap Times'].append(frame['lap_times']['lap_last_lap_time'])
                
                if frame.get('consumables'):
                    stored_telem['Fuel Usage'].append(frame['consumables']['fuel_level'])
                    stored_telem['Fuel Per Hour'].append(frame['consumables']['fuel_use_per_hour'])
                
                stint_l += 1
        
        # Handle pit stop telemetry storage (outside lock to avoid issues)
        if frame['pit_status'] == 1:

            if stored_telem['Fuel Usage'] != []:
                print("Pit stop detected - resetting stint data")
                stored_telem['Fuel Usage'] = []
                stored_telem['Fuel Per Hour'] = []
                stored_telem['Lap Times'] = []
                stint_l = 0
                
                #Adding last pit stop to pit stop time list
                stop_times.append(last_stop_time)
                
                #Resetting timer
                last_stop_time = 0.0
                
            #Time pit stop
            last_stop_time += (1/60)
        
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
    global stop_times
    
    stats = {
        'Fuel_Laps_Remaining': 0,
        'Fuel_Time_Remaining': 0,
        'Predicted_Stops_Remaining': 0,
        'Average_Pace': 999.99,
        'Predicted_Stop': 999.99
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
    
    if len(stop_times) > 0:
        stats['Predicted_Stop'] = pred_stop = float((sum(stop_times) / len(stop_times)) or 0.0)
        
        deltas = frame['relative_timing']['deltas']
        
        idx = int(frame['relative_timing']['car_idx_position'] or 1) 
        
        stats['Position_At_Pit_Exit'] = idx
        
        stats['Delta_To_Next'] = 0.0
        
        while idx < len(deltas):
            
            if float(deltas[idx] or 0.0) > pred_stop:
                #Position at pit exit assigned as position ahead of idx
                stats['Position_At_Pit_Exit'] = idx - 1
                
                stats['Delta_To_Next'] = round(float(deltas[idx] or 0.0) - pred_stop, 3)
                break
            
            idx += 1
            
    
    return stats



# Module exports
__all__ = ['get_frame', 'start_stream', 'stop_stream', 'VARS']