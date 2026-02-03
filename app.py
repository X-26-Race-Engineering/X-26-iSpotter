"""
Main iRacing Telemetry Server
"""

from flask import Flask, render_template, send_from_directory, jsonify
from flask_socketio import SocketIO
import threading
import time
import os
import math
import json

# Import from Ingestion module
from Ingest.raceEngine import get_frame, start_stream, stop_stream, get_connection_status

# Initialize Flask
app = Flask(__name__, 
            template_folder='Overlays/Templates',
            static_folder='Overlays/Styling',
            static_url_path='/Styling')

app.config.update(
    SECRET_KEY='iracing-telemetry-secret-key',
    DEBUG=False,
    PROPAGATE_EXCEPTIONS=False
)

# Initialize Socket.IO
socketio = SocketIO(
    app, 
    cors_allowed_origins="*",
    async_mode='threading',
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e6,
    transports=['websocket']
)

# Global state for stream control
class StreamState:
    is_running = False
    telemetry_thread = None
    broadcaster_active = False
    broadcaster_thread = None
    last_iracing_status = False  # Track last known iRacing status

stream_state = StreamState()

def sanitize_frame(obj):
    """
    Recursively replace NaN and Infinity with 0.0
    Only for frame data, not Socket.IO protocol messages
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return obj
    elif isinstance(obj, dict):
        return {k: sanitize_frame(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return type(obj)(sanitize_frame(item) for item in obj)
    return obj

def telemetry_broadcaster():
    """
    Broadcasts telemetry data to all connected clients at 60Hz
    Also monitors iRacing connection status and sends updates
    """
    print("Started 60Hz telemetry broadcaster")
    last_broadcast_time = time.perf_counter()
    frame_count = 0
    last_fps_print = time.time()
    last_status_check = time.time()
    
    # Target 60Hz
    target_interval = 1.0 / 60.0  # ~16.67ms
    
    while stream_state.broadcaster_active:
        loop_start = time.perf_counter()
        
        # Get latest telemetry frame
        snapshot = get_frame()
        
        # Get current iRacing connection status
        current_iracing_status = get_connection_status()
        
        # Check if iRacing connection status changed
        now = time.time()
        if current_iracing_status != stream_state.last_iracing_status:
            stream_state.last_iracing_status = current_iracing_status
            
            if current_iracing_status:
                print(" iRacing connected!")
            else:
                print(" iRacing disconnected")
            
            # Broadcast connection status change immediately
            socketio.emit('iracing_status', {
                'connected': current_iracing_status
            })
        
        # Periodic status broadcast (every 2 seconds)
        if now - last_status_check >= 2.0:
            socketio.emit('iracing_status', {
                'connected': current_iracing_status
            })
            last_status_check = now
        
        if snapshot:
            # Add connection status to frame
            snapshot['connection'] = current_iracing_status
            try:
                import json
                test_json = json.dumps(snapshot)
                print(f"Frame OK - {len(test_json)} bytes, lap={snapshot.get('lap_times', {}).get('lap', '?')}")
            except (TypeError, ValueError) as e:
                print(f"SERIALIZATION ERROR: {e}")
                print(f"Frame structure: {list(snapshot.keys())}")

                # Find the problematic key
                for key, value in snapshot.items():
                    try:
                        json.dumps({key: value})
                    except:
                        print(f"Problem with key '{key}': {type(value)}")
                continue

            snapshot = sanitize_frame(snapshot)
            
            # Broadcast to all connected clients
            socketio.emit("frame_update", snapshot)
            frame_count += 1
        
        # Calculate sleep time to maintain 60Hz
        elapsed = time.perf_counter() - loop_start
        sleep_time = max(0, target_interval - elapsed)
        
        if sleep_time > 0:
            time.sleep(sleep_time)
        
        # Print FPS every 5 seconds for monitoring
        if now - last_fps_print >= 5.0:
            actual_fps = frame_count / (now - last_fps_print)
            iracing_status_text = "Connected" if current_iracing_status else "Disconnected"
            print(f"Broadcaster: {actual_fps:.1f} Hz | iRacing: {iracing_status_text}")
            frame_count = 0
            last_fps_print = now
    
    print("Stopped telemetry broadcaster")


# ============================================
# Routes
# ============================================

@app.route("/race_dashboard.html")
def engineer_dashboard():
    """Pitwall dashboard page"""
    return render_template("race_dashboard_v2.html")

@app.route("/car_health_dashboard.html")
def spotter_dashboard():
    """Practice/Quali helper dashboard page"""
    return render_template("car_health_dashboard.html")

@app.route("/race_screen.html")
def strategy_dashboard():
    """Room creation screen/lobby"""
    return render_template("race_screen.html")

@app.route("/Styling/<path:filename>")
def serve_styles(filename):
    """Serve CSS files"""
    styles_path = os.path.join('Overlays', 'Styling')
    return send_from_directory(styles_path, filename)

@app.route("/Scripts/<path:filename>")
def serve_scripts(filename):
    """Serve JavaScript files"""
    scripts_path = os.path.join('Overlays', 'Scripts')
    return send_from_directory(scripts_path, filename)

@app.route("/health")
def health_check():
    """Health check endpoint"""
    iracing_connected = get_connection_status()
    return jsonify({
        "status": "running",
        "server": "iRacing Telemetry",
        "port": 5000,
        "stream_active": stream_state.is_running,
        "iracing_connected": iracing_connected
    }), 200

@app.route("/api/stream/start", methods=['POST'])
def start_telemetry_stream():
    """Start the telemetry stream"""
    if stream_state.is_running:
        return jsonify({
            "status": "already_running",
            "message": "Telemetry stream is already active",
            "iracing_connected": get_connection_status()
        }), 200
    
    try:
        print("\n" + "="*60)
        print("Starting telemetry stream...")
        print("="*60)
        
        # Start telemetry collection thread
        stream_state.telemetry_thread = threading.Thread(
            target=start_stream, 
            daemon=True,
            name="TelemetryCollector"
        )
        stream_state.telemetry_thread.start()
        print("Telemetry collection thread started")
        
        # Give it a moment to initialize
        time.sleep(0.5)
        
        # Start broadcaster at 60Hz
        stream_state.broadcaster_active = True
        stream_state.broadcaster_thread = threading.Thread(
            target=telemetry_broadcaster,
            daemon=True,
            name="TelemetryBroadcaster"
        )
        stream_state.broadcaster_thread.start()
        print(" 60Hz broadcaster thread started")
        
        stream_state.is_running = True
        
        # Notify all clients that stream has started
        socketio.emit('stream_status', {
            'status': 'started',
            'iracing_connected': get_connection_status()
        })
        
        print("="*60)
        print("Telemetry stream is now active")
        print("Waiting for iRacing connection...")
        print("="*60 + "\n")
        
        return jsonify({
            "status": "success",
            "message": "Telemetry stream started at 60Hz",
            "broadcast_rate": "60Hz",
            "iracing_connected": get_connection_status()
        }), 200
        
    except Exception as e:
        print(f" Error starting stream: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route("/api/stream/stop", methods=['POST'])
def stop_telemetry_stream():
    """Stop the telemetry stream"""
    if not stream_state.is_running:
        return jsonify({
            "status": "not_running",
            "message": "Telemetry stream is not active"
        }), 200
    
    try:
        print("\n" + "="*60)
        print("Stopping telemetry stream...")
        print("="*60)
        
        # Stop broadcaster first
        stream_state.broadcaster_active = False
        print(" Broadcaster stopped")
        
        # Stop telemetry collection
        stop_stream()
        print(" Telemetry collection stopped")
        
        stream_state.is_running = False
        
        # Wait a moment for threads to finish
        time.sleep(0.2)
        
        # Notify all clients that stream has stopped
        socketio.emit('stream_status', {
            'status': 'stopped',
            'iracing_connected': False
        })
        
        print("="*60)
        print("Telemetry stream stopped")
        print("="*60 + "\n")
        
        return jsonify({
            "status": "success",
            "message": "Telemetry stream stopped"
        }), 200
        
    except Exception as e:
        print(f" Error stopping stream: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route("/api/stream/status", methods=['GET'])
def stream_status():
    """Get current stream status"""
    iracing_connected = get_connection_status()
    return jsonify({
        "is_running": stream_state.is_running,
        "status": "active" if stream_state.is_running else "inactive",
        "iracing_connected": iracing_connected,
        "broadcast_rate": "60Hz" if stream_state.is_running else "N/A"
    }), 200


# ============================================
# WebSocket Events
# ============================================

@socketio.on('connect')
def handle_connect():
    """Client connected"""
    print(f"Client connected")
    
    # Send current stream status to new client
    iracing_connected = get_connection_status()
    socketio.emit('stream_status', {
        'status': 'started' if stream_state.is_running else 'stopped',
        'iracing_connected': iracing_connected
    })
    
    # Also send iRacing status separately
    socketio.emit('iracing_status', {
        'connected': iracing_connected
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Client disconnected"""
    print(f"Client disconnected")

@socketio.on('request_status')
def handle_status_request():
    """Client requesting status update"""
    iracing_connected = get_connection_status()
    socketio.emit('stream_status', {
        'status': 'started' if stream_state.is_running else 'stopped',
        'iracing_connected': iracing_connected
    })
    socketio.emit('iracing_status', {
        'connected': iracing_connected
    })


# ============================================
# Error Handlers
# ============================================

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        "status": "error",
        "message": "Resource not found",
        "code": 404
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    print(f"Internal error: {error}")
    import traceback
    traceback.print_exc()
    return jsonify({
        "status": "error",
        "message": "Internal server error",
        "code": 500
    }), 500


# ============================================
# Startup
# ============================================

def start_server():
    """
    Start the telemetry server
    - Runs Flask-SocketIO server at 60Hz
    - Telemetry stream controlled via API
    """
    print("\n" + "=" * 70)
    print("   X-26 iSpotter - iRacing® Telemetry Assistant")
    print("=" * 70)
    print(f"  Dashboard:     http://localhost:5000")
    print(f"  Race View:     http://localhost:5000/race_dashboard.html")
    print(f"  WebSocket:     ws://localhost:5000")
    print(f"  Health Check:  http://localhost:5000/health")
    print("=" * 70)
    print("  API Endpoints:")
    print("    Start Stream:  POST http://localhost:5000/api/stream/start")
    print("    Stop Stream:   POST http://localhost:5000/api/stream/stop")
    print("    Get Status:    GET  http://localhost:5000/api/stream/status")
    print("=" * 70)
    print("  Broadcast Rate: 60Hz (when stream is active)")
    print("  Update Rate:    60 FPS in dashboard")
    print("=" * 70)
    print("  Server is ready. Use the UI to start telemetry stream.")
    print("  Press Ctrl+C to shutdown")
    print("=" * 70 + "\n")
    
    try:
        # Run server
        socketio.run(
            app, 
            host="0.0.0.0", 
            port=5000,
            use_reloader=False,
            log_output=False,
            allow_unsafe_werkzeug=True
        )
    except KeyboardInterrupt:
        print("\n" + "="*70)
        print("  Shutting down server...")
        if stream_state.is_running:
            print("  Stopping active telemetry stream...")
            stream_state.broadcaster_active = False
            stop_stream()
        print("  Server stopped. Goodbye!")
        print("="*70 + "\n")


if __name__ == '__main__':
    start_server()