#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to cleanup on exit
cleanup() {
    print_info "Cleaning up processes..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    kill $IOS_BUILD_PID 2>/dev/null
    exit 0
}

# Trap Ctrl+C and cleanup
trap cleanup SIGINT SIGTERM

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

print_info "Starting WorkoutTracker build process..."
print_info "Working directory: $SCRIPT_DIR"

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found! Please create one with OPENAI_API_KEY"
    exit 1
fi

# ============================================
# BACKEND SETUP
# ============================================
print_info "Setting up backend..."

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    print_error "Python3 is not installed. Please install Python 3.11 or higher."
    exit 1
fi

# Setup virtual environment
if [ ! -d ".venv" ]; then
    print_info "Creating Python virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install/update backend dependencies
print_info "Installing backend dependencies..."
cd backend
pip install -q --upgrade pip
pip install -q -r requirements.txt
cd ..

# Check if port 8000 is already in use
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    print_warn "Port 8000 is already in use. Attempting to kill existing process..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null
    sleep 2
fi

# Start backend server
print_info "Starting backend server on port 8000..."
cd backend
source ../.venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    print_error "Backend failed to start. Check backend.log for details."
    exit 1
fi

# Test backend health
if command -v curl &> /dev/null; then
    if curl -s http://localhost:8000/health > /dev/null; then
        print_info "Backend is running and healthy on port 8000"
    else
        print_warn "Backend may not be fully ready yet, but process is running"
    fi
else
    print_info "Backend process started (health check skipped - curl not available)"
fi

# ============================================
# FRONTEND SETUP
# ============================================
print_info "Setting up frontend..."

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js."
    cleanup
    exit 1
fi

# Install frontend dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_info "Installing frontend dependencies (this may take a while)..."
    npm install
fi

# Setup iOS dependencies (for AsyncStorage and other native modules)
if [ -d "ios" ]; then
    print_info "Setting up iOS native dependencies (CocoaPods)..."
    cd ios
    
    # Check if CocoaPods is installed
    if ! command -v pod &> /dev/null; then
        print_warn "CocoaPods is not installed. Installing..."
        sudo gem install cocoapods
    fi
    
    # Clean build folders to ensure fresh rebuild (fixes AsyncStorage linking)
    print_info "Cleaning iOS build folders..."
    rm -rf build/
    rm -rf ~/Library/Developer/Xcode/DerivedData/EasyWorkouts-*
    
    # Run pod install to link native modules (fixes AsyncStorage issue)
    print_info "Running pod install to link native modules..."
    if ! pod install --repo-update; then
        print_error "pod install failed. Please check the output above."
        cd ..
        exit 1
    fi
    
    cd ..
    print_info "iOS dependencies installed and build cleaned"
fi

# Check if port 8081 (Metro bundler default) is in use
if lsof -Pi :8081 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    print_warn "Port 8081 (Metro bundler) is already in use. Attempting to kill existing process..."
    lsof -ti:8081 | xargs kill -9 2>/dev/null
    sleep 2
fi

# Start frontend Metro bundler
print_info "Starting frontend (Expo/Metro bundler)..."
print_info "Frontend will connect to backend at http://localhost:8000"
print_info ""
print_info "✅ This project now works with Expo Go!"
print_info "   - Scan the QR code with Expo Go app on your phone"
print_info "   - Or press 'i' for iOS simulator, 'a' for Android"
print_info ""
npm start -- --reset-cache > frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for Metro bundler to be ready
print_info "Waiting for Metro bundler to start (this may take 10-15 seconds)..."
sleep 12

# Check if Metro is responding
if command -v curl &> /dev/null; then
    for i in {1..10}; do
        if curl -s http://localhost:8081/status > /dev/null 2>&1; then
            print_info "Metro bundler is ready!"
            break
        fi
        if [ $i -eq 10 ]; then
            print_warn "Metro bundler may not be fully ready, but continuing..."
        else
            sleep 1
        fi
    done
fi

# Check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    print_error "Frontend failed to start. Check frontend.log for details."
    cleanup
    exit 1
fi

# Note: With Expo Go support, native builds are optional
# Users can now use Expo Go app for faster development
print_info ""
print_info "📱 Development Options:"
print_info "   1. Use Expo Go (recommended for fast iteration):"
print_info "      - Install Expo Go app on your phone"
print_info "      - Scan the QR code that appears in the terminal"
print_info "      - Changes reload instantly, no build needed!"
print_info ""
print_info "   2. Build native app (optional, for production-like testing):"
print_info "      - Press 'i' in the Expo CLI to build for iOS simulator"
print_info "      - Or run: npm run ios"
print_info ""

# ============================================
# SUCCESS MESSAGE
# ============================================
echo ""
print_info "========================================="
print_info "✅ All services started successfully!"
print_info "========================================="
print_info "Backend:  http://localhost:8000 (PID: $BACKEND_PID)"
print_info "Frontend: Expo dev server (PID: $FRONTEND_PID)"
print_info ""
print_info "📱 Access your app:"
print_info "   - Use Expo Go app on your phone (scan QR code in terminal)"
print_info "   - Or press 'i' for iOS simulator / 'a' for Android"
print_info "   - Changes reload instantly - no build needed!"
print_info ""
print_info "Logs:"
print_info "   Backend:  tail -f backend.log"
print_info "   Frontend: tail -f frontend.log"
if [ -d "ios" ] && [[ "$OSTYPE" == "darwin"* ]]; then
    print_info "   iOS build: tail -f ios-build.log"
fi
print_info ""
print_warn "Press Ctrl+C to stop all services"
print_info "========================================="
echo ""

# Wait for user interrupt
wait

