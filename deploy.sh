#!/bin/bash
# IT Asset Platform - Deployment Helper

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║  IT Asset Management Platform - Deployment Helper      ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker is not installed. Please install Docker first."
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    echo "✓ Docker & Docker Compose found"
}

# Check if .env exists
check_env() {
    if [ ! -f .env ]; then
        echo "❌ .env file not found!"
        echo "   Please copy .env.example to .env and update with your settings:"
        echo "   $ cp .env.example .env"
        echo "   $ nano .env"
        exit 1
    fi
    echo "✓ .env file exists"
}

# Validate required env vars
validate_env() {
    local required_vars=(
        "POSTGRES_PASSWORD"
        "AD_URL"
        "AD_BIND_DN"
        "AD_BIND_PASSWORD"
        "FILESERVER_HOST"
    )
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" .env; then
            echo "⚠️  Warning: ${var} not set in .env"
        fi
    done
    echo "✓ Environment validated"
}

# Build & start containers
deploy() {
    echo ""
    echo "Starting deployment..."
    echo ""
    
    echo "📦 Building containers..."
    docker-compose build --no-cache
    
    echo ""
    echo "🚀 Starting services..."
    docker-compose up -d
    
    # Wait for services
    echo ""
    echo "⏳ Waiting for services to be healthy..."
    sleep 5
    
    # Check backend health
    for i in {1..30}; do
        if curl -s http://localhost:3000/api/docs > /dev/null; then
            echo "✓ Backend is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "❌ Backend failed to start"
            docker logs itam_backend
            exit 1
        fi
        sleep 1
    done
    
    echo ""
    echo "✓ Deployment complete!"
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║  Access Points                                         ║"
    echo "╠════════════════════════════════════════════════════════╣"
    echo "║  Frontend:  http://localhost:5173                      ║"
    echo "║  API Docs:  http://localhost:3000/api/docs             ║"
    echo "║  pgAdmin:   http://localhost:5050 (with --profile tools)║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    echo "Next steps:"
    echo "  1. Open http://localhost:5173 in your browser"
    echo "  2. Configure Active Directory: click 'Sync' button"
    echo "  3. Discover file server departments"
    echo "  4. Test inventory collection from a client"
    echo ""
}

# Show logs
show_logs() {
    echo ""
    echo "Showing backend logs (Ctrl+C to exit)..."
    docker logs -f itam_backend
}

# Main menu
main() {
    check_docker
    check_env
    validate_env
    
    echo ""
    echo "What would you like to do?"
    echo "  1) Deploy (build & start containers)"
    echo "  2) Show logs"
    echo "  3) Stop containers"
    echo "  4) Check status"
    echo ""
    read -p "Enter choice (1-4): " choice
    
    case $choice in
        1) deploy ;;
        2) show_logs ;;
        3) 
            echo "Stopping containers..."
            docker-compose down
            echo "✓ Stopped"
            ;;
        4)
            echo ""
            echo "Container status:"
            docker-compose ps
            ;;
        *)
            echo "Invalid choice"
            exit 1
            ;;
    esac
}

main
