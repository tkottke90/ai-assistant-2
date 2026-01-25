import uvicorn
from src.config.manager import ConfigManager

if __name__ == "__main__":
    # Initialize config manager and get server config
    config_manager = ConfigManager()
    server_config = config_manager.get_config("server")

    uvicorn.run(
        "src.server:app",
        host=server_config.host,
        port=server_config.port,
        reload=server_config.reload,
        workers=server_config.workers,
        log_config=None
    )
