"""
Main iRacing Telemetry Server
Combines web serving + WebSocket streaming in one optimized server
"""

from flask import Flask, render_template, send_from_directory, jsonify
from flask_socketio import SocketIO
import threading
import time
import os

# Import from Ingestion module
from Ingest import get_frame, start_stream, stop_stream

# Initialize Flask
app = Flask(__name__, 
            template_folder='Overlays/Templates',
            static_folder='Overlays/Styling',    # Points to Styling folder
            static_url_path='/Styling')          # URL is /Styling/...

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
    max_http_buffer_size=1e6
)

# Global state for stream control
class StreamState:
    is_running = False
    telemetry_thread = None
    broadcaster_active = False
    broadcaster_thread = None

stream_state = StreamState()

def telemetry_broadcaster():
    """
    Broadcasts telemetry data to all connected clients at 20Hz
    Matches iRacing's update frequency
    """
    while stream_state.broadcaster_active:
        snapshot = get_frame()
        if snapshot:
            socketio.emit("frame_update", snapshot)
        time.sleep(1/20)  # 20Hz


# ============================================
# Routes
# ============================================

@app.route("/")
def index():
    """Home page"""
    return render_template("home_screen.html")

@app.route("/engineer_dashboard.html")
def engineer_dashboard():
    """Engineer dashboard page"""
    return render_template("race_dashboard.html")

@app.route("/spotter_dashboard.html")
def spotter_dashboard():
    """Spotter dashboard page (placeholder)"""
    return render_template("spotter_dashboard.html")

@app.route("/platform_analysis.html")
def platform_analysis():
    """Platform analysis page (placeholder)"""
    return render_template("platform_analysis.html")

@app.route("/Styling/<path:filename>")
def serve_styles(filename):
    """Serve CSS files"""
    styles_path = os.path.join('Overlays', 'Styles')
    return send_from_directory(styles_path, filename)

@app.route("/Images/<path:filename>")
def serve_images(filename):
    """Serve image files"""
    images_path = os.path.join('Overlays', 'Images')
    return send_from_directory(images_path, filename)

@app.route("/health")
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "running",
        "server": "iRacing Telemetry",
        "port": 5000,
        "stream_active": stream_state.is_running
    }), 200

@app.route("/api/stream/start", methods=['POST'])
def start_telemetry_stream():
    """Start the telemetry stream"""
    if stream_state.is_running:
        return jsonify({
            "status": "already_running",
            "message": "Telemetry stream is already active"
        }), 200
    
    try:
        # Start telemetry collection thread
        stream_state.telemetry_thread = threading.Thread(
            target=start_stream, 
            daemon=True
        )
        stream_state.telemetry_thread.start()
        
        # Start broadcaster
        stream_state.broadcaster_active = True
        stream_state.broadcaster_thread = threading.Thread(
            target=telemetry_broadcaster,
            daemon=True
        )
        stream_state.broadcaster_thread.start()
        
        stream_state.is_running = True
        
        # Notify all clients that stream has started
        socketio.emit('stream_status', {'status': 'started'})
        
        return jsonify({
            "status": "success",
            "message": "Telemetry stream started"
        }), 200
        
    except Exception as e:
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
        # Stop telemetry collection
        stop_stream()
        
        # Stop broadcaster
        stream_state.broadcaster_active = False
        stream_state.is_running = False
        
        # Wait a moment for threads to finish
        time.sleep(0.1)
        
        # Notify all clients that stream has stopped
        socketio.emit('stream_status', {'status': 'stopped'})
        
        return jsonify({
            "status": "success",
            "message": "Telemetry stream stopped"
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route("/api/stream/status", methods=['GET'])
def stream_status():
    """Get current stream status"""
    return jsonify({
        "is_running": stream_state.is_running,
        "status": "active" if stream_state.is_running else "inactive"
    }), 200


# ============================================
# WebSocket Events
# ============================================

@socketio.on('connect')
def handle_connect():
    """Client connected"""
    print(f"Client connected")
    # Send current stream status to new client
    socketio.emit('stream_status', {
        'status': 'started' if stream_state.is_running else 'stopped'
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Client disconnected"""
    print(f"Client disconnected")


# ============================================
# Startup
# ============================================

def start_server():
    """
    Start the telemetry server
    - Runs Flask-SocketIO server
    - Telemetry stream controlled via API
    """
    print("=" * 60)
    print("X-26 iSpotter iRacing(R) Assistant")
    print("=" * 60)
    print(f"Dashboard:  http://localhost:5000")
    print(f"WebSocket:  ws://localhost:5000")
    print(f"Health:     http://localhost:5000/health")
    print("=" * 60)
    print("Stream Control:")
    print("  - Start: POST /api/stream/start")
    print("  - Stop:  POST /api/stream/stop")
    print("  - Status: GET /api/stream/status")
    print("=" * 60)
    print("Telemetry stream will start when requested via UI")
    print("=" * 60)
    
    # Run server
    socketio.run(
        app, 
        host="0.0.0.0", 
        port=5000,
        use_reloader=False,
        log_output=False
    )


if __name__ == '__main__':
    start_server()